import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import loadTS from './load-ts.cjs';
const db=new PGlite();
await db.exec(`CREATE TABLE tbs_employees(user_id text PRIMARY KEY,tbs_id int,first_name text,last_name text,nickname text,department text,status text,start_date date);
CREATE TABLE leave_quotas(user_id text,year int,annual_total numeric,sick_total numeric,personal_total numeric,carried_over numeric,note text,updated_at timestamptz,UNIQUE(user_id,year));
CREATE TABLE leave_requests(id serial PRIMARY KEY,user_id text,user_name text,department text,leave_type text,leave_days numeric,start_date date,end_date date,selected_dates text,reason text,status text,source text);`);
for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql','011_employee_cancellation.sql','012_line_cancellation.sql','013_leave_result_flex.sql','014_cancellation_result_cards.sql','015_delivery_reliability.sql'])await db.exec(readFileSync('n8n/sql/'+file,'utf8'));
await db.exec(`INSERT INTO tbs_employees VALUES('primary',30,'Test','Employee','Test','IT','active',NULL),('alias',33,'Test','Alias','Alias','IT','inactive',NULL),('other',1,'Other','Employee','Other','IT','active',NULL);
INSERT INTO tbs_employee_accounts(account_user_id,employee_user_id) VALUES('alias','primary');`);
const call=async(operation,payload)=>(await db.query('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)])).rows[0].r;
const create=async(id,status='Approved',days=2,dates='2099-10-01,2099-10-02')=>{await db.query(`INSERT INTO leave_requests(id,user_id,leave_type,leave_days,start_date,end_date,selected_dates,status,half_day_period) VALUES($1,'primary','annual',$2,$3,$4,$5,$6,$7)`,[id,days,dates.split(',')[0],dates.split(',').at(-1),dates,status,days===1?'afternoon':null]);return snapshot(id);};
const snapshot=async id=>(await db.query('SELECT *,md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[id])).rows[0];
const request=async(r,dates,accountId='primary')=>call('request',{id:r.id,revision:r.revision,dates,accountId});
test.beforeEach(async()=>{await db.exec("TRUNCATE leave_requests RESTART IDENTITY CASCADE; DELETE FROM tbs_change_history; DELETE FROM tbs_sync_jobs; UPDATE tbs_cancellation_line_settings SET enabled=false");});
test('approved request does not alter leave, quota source or queues; rejection preserves leave; alias resolves ownership',async()=>{
 const r=await create(1);const jobs=(await db.query('SELECT count(*)::int n FROM tbs_sync_jobs')).rows[0].n;
 const c=await request(r,['2099-10-01'],'alias');assert.equal(c.ok,true);const bossList=await call('admin-list',{});assert.equal(bossList.ok,true);assert.equal(bossList.requests.length,1);assert.equal(bossList.requests[0].request_id,1);assert.deepEqual(bossList.requests[0].dates,['2099-10-01']);assert.equal(c.status,'Pending');assert.deepEqual(await snapshot(1),r);
 assert.equal((await db.query('SELECT count(*)::int n FROM tbs_sync_jobs')).rows[0].n,jobs+1);
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
test('ownership, stale snapshots, invalid dates fail closed; past approved leave is refused',async()=>{
 const r=await create(3,'Approved',2,'2099-12-01,2099-12-02');
 assert.equal((await request(r,['2099-12-01'],'other')).statusCode,404);
 for(const dates of [[],['2099-12-03'],['2099-12-01','2099-12-01'],['2099-02-30']])assert.equal((await request(r,dates)).ok,false);
 const c=await request(r,['2099-12-01']);await db.exec("UPDATE leave_requests SET reason='Changed' WHERE id=3");
 assert.equal((await call('approve',{id:c.id})).statusCode,409);
 assert.equal((await db.query('SELECT status FROM tbs_cancellation_requests WHERE id=$1',[c.id])).rows[0].status,'Expired');
 assert.equal((await request(r,['2099-12-02'])).statusCode,409);
 const past=await create(4,'Approved',2,'2020-01-01,2020-01-02');assert.equal((await request(past,['2020-01-01'])).statusCode,422);assert.deepEqual(await snapshot(4),past);
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
test('CEO LINE decisions verify account and token; first decision wins across channels',async()=>{
 await db.exec("UPDATE tbs_cancellation_line_settings SET enabled=true,ceo_account_id='ceo'");
 const line=async(operation,payload)=>(await db.query('SELECT tbs_line_cancellation($1,$2::jsonb) result',[operation,JSON.stringify(payload)])).rows[0].result;
 const r=await create(6,'Approved',2,'2099-08-01,2099-08-02');const c=await request(r,['2099-08-01']);
 const message=(await db.query('SELECT * FROM tbs_cancellation_line_messages WHERE cancellation_id=$1',[c.id])).rows[0];
 const payload={id:c.id,token:message.decision_token,accountId:'ceo'};
 assert.equal((await line('line-review',{...payload,accountId:'other'})).statusCode,404);
 assert.equal((await line('line-approve',{...payload,token:'wrong'})).statusCode,404);
 assert.equal((await line('line-review',payload)).request.name,null);
 assert.deepEqual(await snapshot(6),r);
 assert.equal((await line('line-approve',payload)).ok,true);
 assert.equal((await snapshot(6)).selected_dates,'2099-08-02');
 assert.equal((await call('reject',{id:c.id})).statusCode,409);
 assert.equal((await line('line-reject',payload)).statusCode,409);
 const r2=await create(7,'Approved',2,'2099-09-01,2099-09-02');const c2=await request(r2,['2099-09-01']);
 const m2=(await db.query('SELECT * FROM tbs_cancellation_line_messages WHERE cancellation_id=$1',[c2.id])).rows[0];
 const p2={id:c2.id,token:m2.decision_token,accountId:'ceo'};
 assert.equal((await call('reject',{id:c2.id})).ok,true);
 assert.equal((await line('line-approve',p2)).statusCode,409);assert.deepEqual(await snapshot(7),r2);
 const jobs=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE id=$1",[message.job_id])).rows[0].payload;
 assert.equal(jobs.to,'ceo');assert.equal(jobs.messages[0].contents.footer.contents.length,2);
 assert.match(jobs.messages[0].contents.footer.contents[0].action.uri,/cancel-decision/);
 assert.equal((await db.query('SELECT tbs_queue_cancellation_line($1) queued',[c2.id])).rows[0].queued,false);
 assert.ok(!JSON.stringify(await call('employee-list',{accountId:'primary'})).includes(message.decision_token));
 assert.ok(!JSON.stringify(await call('admin-list',{})).includes(message.decision_token));
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
test('history sorts by leave date, includes rejected history, and only latest entry accepts cancellation',async()=>{
 const latest=await create(10,'Approved',2,'2099-12-01,2099-12-02');
 const older=await create(99,'Pending',2,'2099-01-01,2099-01-02');
 const past=await create(100,'Rejected',2,'2025-01-01,2025-01-02');
 const history=await call('employee-list',{accountId:'primary'});
 assert.deepEqual(history.requests.map(r=>r.id),[10,99,100]);
 assert.equal(history.requests[2].status,'Rejected');
 assert.equal((await request(older,['2099-01-01'])).statusCode,409);
 assert.equal((await request(latest,['2099-12-01'])).status,'Pending');
 assert.deepEqual(await snapshot(99),older);assert.deepEqual(await snapshot(100),past);
});

test('leave decisions queue one Flex result, retain linked recipient and avoid duplicate notifications',async()=>{
 const r=await create(200,'Pending',0.5,'2099-12-01');
 await db.exec("INSERT INTO tbs_request_accounts(request_id,account_user_id) VALUES(200,'alias')");
 await db.exec("UPDATE leave_requests SET status='Approved',half_day_period='afternoon' WHERE id=200");
 let jobs=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line'")).rows;
 assert.equal(jobs.length,1);assert.equal(jobs[0].payload.to,'alias');
 const message=jobs[0].payload.messages[0];assert.equal(message.type,'flex');assert.equal(message.contents.type,'bubble');
 assert.match(JSON.stringify(message),/01 Dec 2099/);assert.match(JSON.stringify(message),/Afternoon/);assert.match(JSON.stringify(message),/Approved/);
 await db.exec("UPDATE leave_requests SET reason='Changed reason only' WHERE id=200");
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'")).rows[0].n,1);
 await db.exec("UPDATE leave_requests SET status='Rejected',rejection_reason='Schedule changed' WHERE id=200");
 jobs=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line'")).rows;
 assert.equal(jobs.length,2);const rejected=jobs.map(j=>j.payload.messages[0]).find(m=>m.altText.includes('Leave rejected'));
 assert.equal(rejected.type,'flex');assert.match(JSON.stringify(rejected),/Schedule changed/);
 assert.ok(Buffer.byteLength(JSON.stringify(rejected.contents))<30000);
});

test('cancellation receipts and decisions each send one targeted Flex card, including partial and declined',async()=>{
 const r=await create(300,'Approved',2,'2099-12-01,2099-12-02');
 const c=await request(r,['2099-12-01'],'alias');
 const messages=async()=>(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line' ORDER BY created_at,id")).rows.map(j=>j.payload);
 assert.equal((await messages()).length,1);assert.equal((await messages())[0].to,'alias');
 assert.equal((await call('approve',{id:c.id,reason:'Agreed'})).ok,true);
 let ms=await messages();assert.equal(ms.length,2);assert.ok(ms.every(m=>m.to==='alias'&&m.messages[0].type==='flex'));
 assert.match(JSON.stringify(ms),/Partial cancellation approved/);assert.match(JSON.stringify(ms),/02 Dec 2099/);
 assert.equal((await call('approve',{id:c.id})).statusCode,409);assert.equal((await messages()).length,2);
 const c2=await request(await snapshot(300),['2099-12-02'],'alias');
 await call('reject',{id:c2.id,reason:'Keep this day'});ms=await messages();assert.equal(ms.length,4);assert.match(JSON.stringify(ms),/Cancellation declined/);assert.match(JSON.stringify(ms),/Keep this day/);
 const c3=await request(await snapshot(300),['2099-12-02'],'alias');await call('approve',{id:c3.id});
 ms=await messages();assert.equal(ms.length,6);assert.match(JSON.stringify(ms),/Cancellation approved/);
 assert.ok(!JSON.stringify(ms).includes('Rejected / Cancelled'));
});
test('pending cancellation sends one employee result without a CEO message or generic duplicate',async()=>{
 const r=await create(301,'Pending',1,'2099-12-03');
 await request(r,['2099-12-03'],'alias');
 const jobs=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line'")).rows;
 assert.equal(jobs.length,1);assert.equal(jobs[0].payload.to,'alias');assert.match(JSON.stringify(jobs),/Request cancelled/);
});

test('cancelled and past rows cannot block latest eligible future leave; history still stays date ordered',async()=>{
 const older=await create(400,'Approved',1,'2099-11-01');const latest=await create(401,'Pending',1,'2099-12-01');
 await request(latest,['2099-12-01']);
 const list=await call('employee-list',{accountId:'primary'});assert.equal(list.requests[0].id,401);assert.equal(list.requests[0].status,'Rejected');
 assert.equal((await request(older,['2099-11-01'])).ok,true);
});
test('editing leave expires cancellation and queues one notice each to employee and notified CEO',async()=>{
 await db.exec("UPDATE tbs_cancellation_line_settings SET enabled=true,ceo_account_id='ceo'");
 const r=await create(402,'Approved',1,'2099-12-01');await request(r,['2099-12-01'],'alias');
 await db.exec("DELETE FROM tbs_sync_jobs WHERE kind='line'; UPDATE leave_requests SET reason='Changed' WHERE id=402");
 const jobs=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line'")).rows;
 assert.equal(jobs.length,2);assert.deepEqual(jobs.map(j=>j.payload.to).sort(),['alias','ceo']);
 assert.ok(jobs.every(j=>j.payload.messages[0].altText.includes('Cancellation expired')));
 await db.exec("UPDATE leave_requests SET reason='Changed again' WHERE id=402");assert.equal((await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'")).rows[0].n,2);
});
test('LINE worker batches independent recipients and holds a failed predecessor before later messages',async()=>{
 const enqueue=async to=>(await db.query("INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','primary',jsonb_build_object('to',$1::text,'messages','[]'::jsonb)) RETURNING id",[to])).rows[0].id;
 const first=await enqueue('a'),second=await enqueue('a'),other=await enqueue('b');
 let claimed=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;
 assert.deepEqual(claimed.map(j=>j.id).sort(),[first,other].sort());
 const one=claimed.find(j=>j.id===first);await db.query('SELECT tbs_finish_sync($1,$2,$3,$4)',[one.id,one.lease_token,one.generation,'Temporary failure']);
 assert.equal((await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows.length,0);
 await db.query("UPDATE tbs_sync_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[first]);
 claimed=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;assert.equal(claimed[0].id,first);
 await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[first,claimed[0].lease_token,claimed[0].generation]);
 assert.equal((await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows[0].id,second);
 // Expired retry windows fail visibly and retain per-recipient ordering.
 await db.query("UPDATE tbs_sync_jobs SET first_attempt_at=now()-interval '24 hours',lease_until=NULL WHERE id=$1",[second]);
 await enqueue('a');await db.query("SELECT * FROM tbs_claim_line_batch('line')");
 const status=(await db.query('SELECT tbs_delivery_status() r')).rows[0].r;
 assert.equal(status.failed,1);assert.ok(status.jobs.some(j=>j.blocked));assert.ok(!JSON.stringify(status).includes('messages'));
});
test('long cards state omitted dates; cancellation and rejection use distinct labels',async()=>{
 const row={id:403,user_id:'primary',user_name:'Test',status:'Rejected',leave_type:'annual',leave_days:366,start_date:'2096-01-01',end_date:'2096-12-31'};
 const dates=(await db.query("SELECT array_agg(d::date) dates FROM generate_series('2096-01-01'::date,'2096-12-31'::date,interval '1 day')d")).rows[0].dates;
 row.selected_dates=dates.join(',');
 const card=async extra=>(await db.query('SELECT tbs_leave_result_flex($1::jsonb) r',[JSON.stringify({...row,...extra})])).rows[0].r;
 assert.match(JSON.stringify(await card({})),/358 more dates/);
 assert.match((await card({})).altText,/Leave rejected/);
 assert.match((await card({decision_kind:'cancel'})).altText,/Leave cancelled/);
 const r=await create(404,'Approved',1,'2099-12-01');
 await db.query("SELECT tbs_dashboard_request_v2('delete',$1::jsonb)",[JSON.stringify({id:404,scope:'request',expectedDates:['2099-12-01'],expectedRevision:r.revision})]);
 const job=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line'")).rows[0];assert.match(job.payload.messages[0].altText,/Leave cancelled/);
});
test('LINE multicast preserves overlapping-recipient order and a poll is bounded to twenty jobs',async()=>{
 await db.exec(`INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','primary','{"to":["a","b"]}'),('line','primary','{"to":"b"}');`);
 for(let i=0;i<25;i++)await db.query("INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','primary',jsonb_build_object('to',$1::text))",['independent-'+i]);
 const jobs=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;
 assert.equal(jobs.length,20);assert.ok(jobs.some(j=>Array.isArray(j.payload.to)));assert.ok(!jobs.some(j=>j.payload.to==='b'));
 const next=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;assert.equal(next.length,6);assert.ok(!next.some(j=>j.payload.to==='b'));
});
