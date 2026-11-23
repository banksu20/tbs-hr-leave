import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-7]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32);
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,status,employment_type) VALUES($1,61,'Anan','An','active','employee'),($2,62,'Boon','Bee','active','employee'),($3,63,'Chai','Cee','inactive','employee')",[A,B,C]);

test('dashboard needs a session and seeds the data rules document',async()=>{
 assert.equal((await dash('hr-sops',{},'z')).statusCode,401);
 const r=await dash('hr-sops');
 assert.equal(r.ok,true);assert.equal(r.sops.length,1);assert.equal(r.sops[0].titleEn,'Data rules');
 assert.deepEqual(r.sops[0].missing,['An','Bee']);
});

test('employees accept the current version and a changed document asks again',async()=>{
 assert.equal((await emp('sop-list',{accountId:C})).statusCode,403);
 let list=await emp('sop-list',{accountId:A});
 const doc=list.docs[0];assert.equal(doc.acceptedAt,null);
 assert.equal((await emp('sop-accept',{accountId:A,docId:doc.id,version:doc.version+1})).statusCode,409);
 list=await emp('sop-accept',{accountId:A,docId:doc.id,version:doc.version});
 assert.ok(list.docs[0].acceptedAt);
 const same=await dash('hr-sop-save',{id:doc.id,version:1,titleEn:'Data rules',titleTh:'กติกาข้อมูล',body:doc.body,notify:true});
 assert.equal(same.version,1);assert.equal(same.notified,0);
 const before=(await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n;
 const edit=await dash('hr-sop-save',{id:doc.id,version:1,titleEn:'Data rules',titleTh:'กติกาข้อมูล',body:doc.body+'\n8. New rule',notify:true});
 assert.equal(edit.version,2);assert.equal(edit.notified,2);
 const jobs=await q("SELECT payload,completed_generation<generation open FROM tbs_sync_jobs WHERE kind='line' ORDER BY delivery_order DESC LIMIT 2");
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n,before+2);
 assert.ok(jobs.every(j=>j.open),'SOP notices pass the LINE allowlist');
 assert.match(jobs[0].payload.messages[0].contents.footer.contents[0].action.uri,/\/sops$/);
 list=await emp('sop-list',{accountId:A});
 assert.equal(list.docs[0].acceptedAt,null);assert.equal(list.docs[0].acceptedBefore,true);
 assert.equal((await dash('hr-sop-save',{id:doc.id,version:1,titleEn:'X',body:'Y'})).statusCode,409);
});

test('new SOPs, archiving and role time shares',async()=>{
 const created=await dash('hr-sop-save',{titleEn:'Waste sorting',titleTh:'การแยกขยะ',body:'Sort recycling.',notify:false});
 assert.equal(created.notified,0);assert.equal(created.sops.filter(s=>s.active).length,2);
 const archived=await dash('hr-sop-active',{id:created.id,active:false});
 assert.equal(archived.sops.find(s=>s.id===created.id).active,false);
 assert.equal((await emp('sop-list',{accountId:B})).docs.length,1);
 assert.equal((await dash('hr-people-save',{userId:A,careerLevel:'manager',roles:[{role:'CM',timeShare:60},{role:'Head',timeShare:30}]})).statusCode,422);
 assert.equal((await dash('hr-people-save',{userId:A,managerId:A,roles:[]})).statusCode,422);
 assert.equal((await dash('hr-people-save',{userId:A,careerLevel:'boss',roles:[]})).statusCode,422);
 const saved=await dash('hr-people-save',{userId:A,careerLevel:'manager',managerId:B,roles:[{role:'CM',timeShare:60},{role:'Head',timeShare:40}]});
 const a=saved.people.find(p=>p.id===A);
 assert.equal(a.careerLevel,'manager');assert.equal(a.managerId,B);assert.deepEqual(a.roles.map(r=>[r.role,Number(r.timeShare)]),[['CM',60],['Head',40]]);
 assert.equal(saved.people.some(p=>p.id===C),false);
 const audit=await q("SELECT action FROM tbs_dashboard_account_audit ORDER BY id");
 assert.ok(audit.some(r=>r.action==='hr-people-save')&&audit.some(r=>r.action==='hr-sop-archive'));
});

test('other dashboard and employee operations still reach the earlier handlers',async()=>{
 assert.equal((await dash('session')).session.username,'hr');
 assert.notEqual((await emp('email-decision',{id:1,token:'00000000-0000-4000-8000-000000000000',action:'review'})).ok,undefined);
});

test('SOP and HR admin endpoints are routed and the API stays within 12 functions',()=>{
 const read=f=>readFileSync(f,'utf8');
 assert.match(JSON.parse(read('vercel.json')).routes[0].src,/\|sop\|hr-admin[|)]/);
 assert.match(read('api/[policy].ts'),/registration,sop,'hr-admin':hrAdmin,/);
 assert.match(read('vite-api-plugin.ts'),/'email-decision','sop','hr-admin'/);
 assert.match(read('api/_handlers/sop.ts'),/verifyLineIdentity/);
 assert.match(read('api/_handlers/hr-admin.ts'),/dashboardSession\(req\)/);
 assert.match(read('api/_handlers/hr-admin.ts'),/sameOrigin\(req\)/);
 assert.ok(readdirSync('api').filter(f=>/\.ts$/.test(f)).length<=12);
 assert.match(read('src/App.tsx'),/path="\/sops"/);
});
