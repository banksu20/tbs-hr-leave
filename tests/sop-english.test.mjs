import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32),C='U'+'c'.repeat(32);
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,status,employment_type) VALUES($1,61,'Anan','An','active','employee'),($2,62,'Boon','Bee','active','employee'),($3,63,'Chai','Cee','inactive','employee')",[A,B,C]);
const doc=async()=>(await dash('hr-sops')).sops[0];

test('an English text can be added and staff get it alongside the Thai',async()=>{
 const d=await doc();
 assert.equal(d.bodyEn,'');
 const saved=await dash('hr-sop-save',{id:d.id,version:d.version,titleEn:d.titleEn,titleTh:d.titleTh,body:d.body,bodyEn:'  English rules  ',notify:false});
 assert.equal(saved.ok,true);assert.equal(saved.version,d.version+1);assert.equal(saved.notified,0);
 const list=await emp('sop-list',{accountId:A});
 assert.equal(list.docs[0].bodyEn,'English rules');assert.equal(list.docs[0].body,d.body);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n,0);
});

test('saving with no change keeps the version and old saves without English still work',async()=>{
 const d=await doc();
 assert.equal((await dash('hr-sop-save',{id:d.id,version:d.version,titleEn:d.titleEn,titleTh:d.titleTh,body:d.body,bodyEn:d.bodyEn})).version,d.version);
 const cleared=await dash('hr-sop-save',{id:d.id,version:d.version,titleEn:d.titleEn,titleTh:d.titleTh,body:d.body});
 assert.equal(cleared.version,d.version+1);assert.equal(cleared.sops[0].bodyEn,'');
 const made=await dash('hr-sop-save',{titleEn:'Dress code',body:'แต่งกายสุภาพ',bodyEn:'Dress smartly',notify:false});
 assert.equal(made.sops.find(s=>s.id===made.id).bodyEn,'Dress smartly');
 assert.equal((await dash('hr-sop-save',{titleEn:'Long',body:'x',bodyEn:'y'.repeat(20001)})).statusCode,422);
});

test('accounting and signed-out users cannot save SOPs',async()=>{
 await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('acc','test','accounting')");
 await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='acc'",['e'.repeat(64)]);
 const d=await doc();
 assert.equal((await dash('hr-sop-save',{id:d.id,version:d.version,titleEn:'X',body:'Y'},'e')).statusCode,403);
 assert.equal((await dash('hr-sop-save',{titleEn:'X',body:'Y'},'z')).statusCode,401);
 assert.equal((await doc()).titleEn,'Data rules');
});
