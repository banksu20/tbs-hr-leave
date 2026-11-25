import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import loadTS from './load-ts.cjs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const call=async(operation,payload={},sessionHash='a'.repeat(64))=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({...payload,operation,sessionHash})]))[0].r;
const hash='scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128);
await call('bootstrap',{passwordHash:hash});
const admin=(await q("SELECT * FROM tbs_dashboard_accounts WHERE username='admin'"))[0];
await call('login-finish',{id:admin.id,version:admin.version});
const S='U'+'9'.repeat(32);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,department,status,employment_type) VALUES($1,95,'Pim','Pim','Sale','active','employee')",[S]);
const trip=async(status,paper)=>{
 const id=(await q("INSERT INTO tbs_trips(user_id,trip_date,purpose,mode,start_from,rate,status) VALUES($1,'2026-11-05','care','car','office',7,$2) RETURNING id",[S,status]))[0].id;
 await q("INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,amount,needs_original) VALUES($1,'toll','image/png',$2,40,$3)",[id,Buffer.from('acc-'+id),paper]);return id;
};

test('an accounting login only reaches travel claims',async()=>{
 assert.equal((await call('account-save',{username:'acc',role:'accounting',active:true,passwordHash:hash})).ok,true);
 const acc=(await q("SELECT * FROM tbs_dashboard_accounts WHERE username='acc'"))[0];
 await call('login-finish',{id:acc.id,version:acc.version},'e'.repeat(64));
 const as=(op,body={})=>call(op,{body},'e'.repeat(64));
 assert.equal((await call('session',{},'e'.repeat(64))).session.role,'accounting');
 const flagged=await trip('flagged',false),held=await trip('submitted',true);
 assert.equal((await as('travel-trips',{status:''})).trips.length,2);
 assert.equal((await as('travel-trip',{id:held})).ok,true);
 assert.equal((await as('travel-payout',{month:'2026-11'})).ok,true);
 assert.equal((await as('travel-mark',{id:held,action:'received'})).ok,true);
 assert.equal((await as('travel-payout-paid',{month:'2026-11'})).marked,1);
 for(const [op,body] of [['travel-decide',{id:flagged,action:'approve'}],['travel-settings',{}],['travel-settings-save',{rate:9}],['travel-access-save',{userId:S,allowed:true}],['data',{}],['accounts-list',{}],['hr-people',{}],['hr-sops',{}]])
  assert.equal((await as(op,body)).statusCode,403,op);
 assert.equal((await q('SELECT status FROM tbs_trips WHERE id=$1',[flagged]))[0].status,'flagged');
 assert.equal((await q('SELECT car_rate FROM tbs_travel_settings'))[0].car_rate,'7.00');
 assert.equal((await call('travel-settings')).ok,true);
 assert.equal((await call('account-save',{username:'bad',role:'boss',active:true,passwordHash:hash})).statusCode,422);
});

test('the API only lets an accounting session through to travel claims',async()=>{
 let role='accounting';
 const auth=loadTS({'./n8nClient.js':{n8nPost:async()=>({session:{id:'1',username:'acc',role}})}})('api/_lib/dashboardAuth.ts');
 const req=(method,url,body)=>({method,url,query:Object.fromEntries(new URL(url,'https://x').searchParams),body,headers:{cookie:'tbs_dashboard='+'f'.repeat(64)}});
 const ok=async r=>!!await auth.dashboardSession(r);
 assert.equal(await ok(req('GET','/api/auth')),true);
 assert.equal(await ok(req('GET','/api/hr-admin?view=payout&month=2026-11')),true);
 assert.equal(await ok(req('GET','/api/hr-admin?view=receipt&id=x')),true);
 assert.equal(await ok(req('POST','/api/hr-admin',{action:'travel-payout-paid',month:'2026-11'})),true);
 assert.equal(await ok(req('GET','/api/hr-admin?view=form&month=2026-11&userId=x')),true);
 assert.equal(await ok(req('POST','/api/hr-admin',{action:'travel-form-save',month:'2026-11',userId:'x',data:{}})),true);
 assert.equal(await ok(req('POST','/api/hr-admin',{action:'travel-decide',id:1})),false);
 assert.equal(await ok(req('GET','/api/hr-admin?view=travel')),false);
 assert.equal(await ok(req('GET','/api/hr-admin?view=people')),false);
 for(const u of ['/api/employees','/api/history','/api/quota','/api/interns','/api/cancellations','/api/registration','/api/company-holidays'])assert.equal(await ok(req('GET',u)),false,u);
 role='hr';
 assert.equal(await ok(req('GET','/api/employees')),true);
});
