import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import loadTS from './load-ts.cjs';
const db=new PGlite();
await db.exec(`CREATE TABLE tbs_employees(user_id text PRIMARY KEY,tbs_id int,first_name text,last_name text,nickname text,department text,status text,start_date date);
CREATE TABLE leave_quotas(user_id text,year int,annual_total numeric,sick_total numeric,personal_total numeric,carried_over numeric,note text,updated_at timestamptz,UNIQUE(user_id,year));
CREATE TABLE leave_requests(id serial PRIMARY KEY,user_id text,user_name text,department text,leave_type text,leave_days numeric,start_date date,end_date date,selected_dates text,reason text,status text,source text);`);
for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql','011_employee_cancellation.sql'])await db.exec(readFileSync('n8n/sql/'+file,'utf8'));
await db.exec(`INSERT INTO tbs_employees VALUES('primary',30,'Test','Employee','Test','IT','active',NULL),('alias',33,'Test','Alias','Alias','IT','inactive',NULL),('other',1,'Other','Employee','Other','IT','active',NULL);
INSERT INTO tbs_employee_accounts(account_user_id,employee_user_id) VALUES('alias','primary');`);
const call=async(operation,payload)=>(await db.query('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)])).rows[0].r;
const create=async(id,status='Approved',days=2,dates='2099-10-01,2099-10-02')=>{await db.query(`INSERT INTO leave_requests(id,user_id,leave_type,leave_days,start_date,end_date,selected_dates,status,half_day_period) VALUES($1,'primary','annual',$2,$3,$4,$5,$6,$7)`,[id,days,dates.split(',')[0],dates.split(',').at(-1),dates,status,days===1?'afternoon':null]);return snapshot(id);};
const snapshot=async id=>(await db.query('SELECT *,md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[id])).rows[0];
const request=async(r,dates,accountId='primary')=>call('request',{id:r.id,revision:r.revision,dates,accountId});
test('approved request does not alter leave, quota source or queues; rejection preserves leave; alias resolves ownership',async()=>{
 const r=await create(1);const jobs=(await db.query('SELECT count(*)::int n FROM tbs_sync_jobs')).rows[0].n;
 const c=await request(r,['2099-10-01'],'alias');assert.equal(c.ok,true);assert.equal(c.status,'Pending');assert.deepEqual(await snapshot(1),r);
 assert.equal((await db.query('SELECT count(*)::int n FROM tbs_sync_jobs')).rows[0].n,jobs);
 assert.equal((await request(r,['2099-10-02'])).statusCode,409);
 assert.equal((await call('employee-list',{accountId:'alias'})).requests[0].cancellation.status,'Pending');
 assert.equal((await call('reject',{id:c.id,reason:'Please retain leave'})).ok,true);assert.deepEqual(await snapshot(1),r);
 assert.equal((await call('approve',{id:c.id})).statusCode,409);
 const next=await request(r,['2099-10-01']);assert.equal(next.ok,true);
 assert.equal((await call('approve',{id:next.id})).ok,true);
 const partial=await snapshot(1);assert.equal(partial.selected_dates,'2099-10-02');assert.equal(Number(partial.leave_days),1);assert.equal(partial.status,'Approved');
 assert.equal((await call('approve',{id:next.id})).statusCode,409);
});
test('pending cancels selected dates immediately; complete cancellation is audited and excluded from usage',async()=>{
 const r=await create(2,'Pending',1,'2099-11-01,2099-11-02');
 assert.equal((await request(r,['2099-11-01'])).ok,true);const partial=await snapshot(2);
 assert.equal(partial.half_day_period,'afternoon');assert.equal(Number(partial.leave_days),0.5);assert.equal(partial.status,'Pending');
 assert.equal((await request(partial,['2099-11-02'])).ok,true);assert.equal((await snapshot(2)).status,'Rejected');
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_change_history WHERE entity='employee_cancellation' AND record_id='2'")).rows[0].n,2);
});
test('ownership, stale snapshots, invalid dates fail closed; past approved leave still needs boss approval',async()=>{
 const r=await create(3,'Approved',2,'2099-12-01,2099-12-02');
 assert.equal((await request(r,['2099-12-01'],'other')).statusCode,404);
 for(const dates of [[],['2099-12-03'],['2099-12-01','2099-12-01'],['2099-02-30']])assert.equal((await request(r,dates)).ok,false);
 const c=await request(r,['2099-12-01']);await db.exec("UPDATE leave_requests SET reason='Changed' WHERE id=3");
 assert.equal((await call('approve',{id:c.id})).statusCode,409);
 assert.equal((await db.query('SELECT status FROM tbs_cancellation_requests WHERE id=$1',[c.id])).rows[0].status,'Expired');
 assert.equal((await request(r,['2099-12-02'])).statusCode,409);
 const past=await create(4,'Approved',2,'2020-01-01,2020-01-02');const pastCancellation=await request(past,['2020-01-01']);assert.equal(pastCancellation.status,'Pending');assert.deepEqual(await snapshot(4),past);assert.equal((await call('approve',{id:pastCancellation.id})).ok,true);assert.equal((await snapshot(4)).selected_dates,'2020-01-02');
});
test('full approval cancels original leave and queues existing sheet and LINE sync',async()=>{
 const r=await create(5,'Approved',2,'2099-09-01,2099-09-02');const c=await request(r,['2099-09-01','2099-09-02']);
 assert.equal((await call('approve',{id:c.id})).ok,true);assert.equal((await snapshot(5)).status,'Rejected');
 assert.ok((await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'")).rows[0].n>0);
});
test('LINE identity checks channel, expiry and server profile; missing tokens never reach LINE',async()=>{
 const {verifyLineIdentity}=loadTS()('api/_lib/lineIdentity.ts');const original=global.fetch;let calls=[];
 try {
 global.fetch=async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('verify')?{client_id:'wrong',expires_in:100}:{userId:'U'+'a'.repeat(32)}));};
 await assert.rejects(verifyLineIdentity(undefined));assert.equal(calls.length,0);
 await assert.rejects(verifyLineIdentity('Bearer test'));assert.equal(calls.length,1);
 for(const expiry of [0,-1]){global.fetch=async()=>new Response(JSON.stringify({client_id:'2008617589',expires_in:expiry}));await assert.rejects(verifyLineIdentity('Bearer test'));}
 global.fetch=async url=>new Response(JSON.stringify(url.includes('verify')?{client_id:'2008617589',expires_in:100}:{userId:'U'+'a'.repeat(32)}));assert.equal(await verifyLineIdentity('Bearer test'),'U'+'a'.repeat(32));
 }finally{global.fetch=original;}
});
test.after(()=>db.close());
test('employee API ignores forged identity and action; failed authentication cannot reach n8n',async()=>{
 const path=await import('node:path');let seen=[];let authFails=false;
 const handler=loadTS({[path.resolve('api/_lib/lineIdentity.ts')]:{verifyLineIdentity:async()=>{if(authFails)throw Error('invalid');return 'verified-account';}},[path.resolve('api/_lib/n8nClient.ts')]:{n8nPost:async(endpoint,body)=>{seen.push(body);return {ok:true};},N8nMutationError:class extends Error{}}})('api/cancellations.ts').default;
 const res={code:0,body:null,status(n){this.code=n;return this;},setHeader(){return this;},send(s){this.body=JSON.parse(s);}};
 await handler({method:'POST',query:{},headers:{authorization:'Bearer fake'},body:{id:1,revision:'a'.repeat(32),dates:['2099-01-01'],accountId:'victim',userId:'victim',action:'approve',operation:'approve'}},res);
 assert.equal(res.code,200);assert.equal(seen[0].operation,'request');assert.equal(seen[0].payload.accountId,'verified-account');assert.equal(seen[0].payload.action,undefined);
 authFails=true;await handler({method:'GET',query:{},headers:{}},res);assert.equal(res.code,401);assert.equal(seen.length,1);
});
