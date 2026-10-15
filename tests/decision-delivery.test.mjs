import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','047_employee_cancellation_identity'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const call=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),...body})]))[0].r;
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('admin','test','admin'),('hr','test','hr'),('ceo','test','ceo')");
for(const [name,token] of [['admin','a'],['hr','b'],['ceo','c']])await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username=$2",[token.repeat(64),name]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,status,employment_type,intern_number) VALUES('staff',50,'Staff','','active','employee',NULL),('intern',51,'Intern','','active','intern',501),('boss',52,'Daniel','Dan','active','employee',NULL)");
const insert=async()=>(await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('staff','Staff','sick',1,'2026-10-01','2026-10-01','2026-10-01','Ill','Pending') RETURNING *,md5(to_jsonb(leave_requests)::text) revision"))[0];
test('authenticated dashboard identity, decision time and reason survive in history; no context leak',async()=>{
 let r=await insert();assert.equal((await call('leave-update',{body:{id:r.id,action:'reject',expectedRevision:r.revision,rejectionReason:'Please choose another day'}})).ok,true);
 let h=(await call('history')).events.find(e=>e.action==='reject');assert.equal(h.actor,'Dale (admin) · Dashboard');assert.equal(h.after.rejection_reason,'Please choose another day');assert.ok(h.changedAt);assert.equal(h.after.decision_token,undefined);
 await q("UPDATE leave_requests SET reason='Changed' WHERE id=$1",[r.id]);h=(await call('history')).events[0];assert.match(h.actor,/not identified/);
});
test('LINE identity is resolved, and stale second decisions create no extra history',async()=>{
 let r=await insert();const payload={id:r.id,userId:'staff',accountId:'boss',decisionToken:r.decision_token,expectedRevision:r.revision,rejectionReason:'Conflict'};
 const decide=async()=>(await q("SELECT tbs_line_decision('reject',$1) r",[payload]))[0].r;
 assert.equal((await decide()).ok,true);assert.equal((await decide()).ok,false);
 assert.equal((await q("SELECT actor FROM tbs_change_history WHERE record_id=$1 AND action='reject'",[String(r.id)]))[0].actor,'Dan · LINE');
});
test('HR history remains intern-only, delivery controls reject HR and anonymous users',async()=>{
 assert.equal((await call('history',{},'b')).statusCode,403);assert.equal((await call('history',{cohort:'intern'},'b')).ok,true);
 for(const op of ['delivery-status','delivery-retry']){assert.equal((await call(op,{},'b')).statusCode,403);assert.equal((await call(op,{},'d')).statusCode,401);}
 assert.equal((await call('delivery-status',{},'c')).ok,true);
});
test('LINE failure alerts Dale once, never recursively alerts on its own failure; retry preserves key',async()=>{
 const j=(await q("INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','staff','{\"to\":\"staff\",\"messages\":[]}'::jsonb) RETURNING *"))[0];
 for(let i=0;i<2;i++)await q("UPDATE tbs_sync_jobs SET last_error='Failure',first_attempt_at=now() WHERE id=$1",[j.id]);
 const incidents=await q('SELECT * FROM tbs_delivery_incidents WHERE source=$1',[j.id]);assert.equal(incidents.length,1);
 const alert=(await q('SELECT * FROM tbs_sync_jobs WHERE id=$1',[incidents[0].alert_job]))[0];assert.equal(alert.payload.to,'U102590590d02874df5cac949938eb141');
 await q("UPDATE tbs_sync_jobs SET last_error='LINE down' WHERE id=$1",[alert.id]);assert.equal((await q('SELECT count(*)::int n FROM tbs_delivery_incidents WHERE source=$1',[alert.id]))[0].n,0);
 assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id}})).ok,true);
 assert.equal((await q('SELECT count(*)::int n FROM tbs_sync_jobs WHERE id=$1',[j.id]))[0].n,1);
 await q("UPDATE tbs_sync_jobs SET lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' WHERE id=$1",[j.id]);assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id}})).statusCode,409);
 await q('UPDATE tbs_sync_jobs SET completed_generation=generation WHERE id=$1',[j.id]);assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id}})).statusCode,409);
 assert.ok((await q('SELECT resolved_at FROM tbs_delivery_incidents WHERE source=$1',[j.id]))[0].resolved_at);
});
test('an outage groups LINE failure alerts instead of sending one per employee',async()=>{
 const before=(await q('SELECT count(*)::int n FROM tbs_delivery_incidents WHERE alert_job IS NOT NULL'))[0].n;
 for(let i=0;i<10;i++){const j=(await q("INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','staff','{}') RETURNING id"))[0];await q("UPDATE tbs_sync_jobs SET last_error='Outage' WHERE id=$1",[j.id]);}
 assert.equal((await q('SELECT count(*)::int n FROM tbs_delivery_incidents WHERE alert_job IS NOT NULL'))[0].n,before);
});
test('cancellation rejection records the actual dashboard actor and note',async()=>{
 const r=(await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('staff','Staff','sick',1,'2099-01-01','2099-01-01','2099-01-01','Ill','Approved') RETURNING *,md5(to_jsonb(leave_requests)::text) revision"))[0];
 const c=(await q("SELECT tbs_cancellation('request',$1) r",[{accountId:'staff',id:r.id,revision:r.revision,dates:['2099-01-01'],reason:'Change of plan'}]))[0].r;assert.equal(c.ok,true);
 assert.equal((await call('cancel-reject',{body:{id:c.id,reason:'Still needed'}})).ok,true);
 const h=(await call('history')).events.find(e=>e.action==='reject cancellation');assert.equal(h.actor,'Dale (admin) · Dashboard');assert.equal(h.after.decision_reason,'Still needed');
});
test('expired LINE retry requires explicit duplicate confirmation and does not replay completed jobs',async()=>{
 const j=(await q("INSERT INTO tbs_sync_jobs(kind,user_id,payload,first_attempt_at,last_error) VALUES('line','staff','{\"to\":\"staff\",\"messages\":[]}',now()-interval '25 hours','Failure') RETURNING *"))[0];
 assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id}})).statusCode,409);
 assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id,confirmResend:true}})).ok,true);
 assert.equal((await call('delivery-retry',{body:{kind:'line',id:j.id,confirmResend:true}})).statusCode,409);
});
test('calendar claims serialize, repeated failures alert once, recovery clears incident and stale finishes are ignored',async()=>{
 const s=(await q('SELECT * FROM tbs_claim_calendar_sync()'))[0];assert.ok(s.run_token);assert.equal((await q('SELECT * FROM tbs_claim_calendar_sync()')).length,0);
 assert.equal((await call('delivery-retry',{body:{kind:'calendar'}})).statusCode,409);
 assert.equal((await q("SELECT tbs_finish_calendar_sync($1,'Failure') ok",[s.run_token]))[0].ok,true);
 assert.equal((await q('SELECT tbs_finish_calendar_sync($1,NULL) ok',[s.run_token]))[0].ok,false);
 await call('delivery-retry',{body:{kind:'calendar'}});let next=(await q('SELECT * FROM tbs_claim_calendar_sync()'))[0];await q("SELECT tbs_finish_calendar_sync($1,'Failure')",[next.run_token]);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_delivery_incidents WHERE source='calendar'"))[0].n,1);
 await call('delivery-retry',{body:{kind:'calendar'}});next=(await q('SELECT * FROM tbs_claim_calendar_sync()'))[0];await q('SELECT tbs_finish_calendar_sync($1,NULL)',[next.run_token]);
 const state=(await call('delivery-status')).calendar;assert.equal(state.error,null);assert.ok(state.lastSuccess);
});
test('migration reapplies without changing alerts or actor wrapper targets',async()=>{await db.exec(readFileSync('n8n/sql/043_decision_history_delivery.sql','utf8'));assert.equal((await call('delivery-status')).ok,true);});
test.after(()=>db.close());


test('employee cancellation names the verified employee in both history records and restores actor context',async()=>{
 await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type) VALUES('staff-alias',53,'Alias','inactive','employee')");
 await q("INSERT INTO tbs_employee_accounts(account_user_id,employee_user_id) VALUES('staff-alias','staff') ON CONFLICT DO NOTHING");
 const r=(await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('staff','Staff','sick',1,'2099-12-01','2099-12-01','2099-12-01','Ill','Pending') RETURNING *,md5(to_jsonb(leave_requests)::text) revision"))[0];
 const result=(await q("SELECT tbs_cancellation('request',$1) r",[{accountId:'staff-alias',id:r.id,revision:r.revision,dates:['2099-12-01']}]))[0].r;
 assert.equal(result.ok,true);
 const events=(await call('history')).events.filter(e=>e.recordId===String(r.id)&&e.action==='cancel');
 assert.equal(events.length,2);assert.ok(events.every(e=>e.actor==='Staff · LINE'));
 await q("UPDATE leave_requests SET reason='After cancellation' WHERE id=$1",[r.id]);
 assert.match((await call('history')).events[0].actor,/not identified/);
 // Simulate old generic labels, then verify a repeatable evidence-backed backfill.
 await q("UPDATE tbs_change_history SET actor=CASE WHEN entity='employee_cancellation' THEN 'Verified LINE employee' ELSE 'Dashboard — user not identified' END WHERE record_id=$1 AND action='cancel'",[String(r.id)]);
 await db.exec(readFileSync('n8n/sql/047_employee_cancellation_identity.sql','utf8'));
 const restored=(await call('history')).events.filter(e=>e.recordId===String(r.id)&&e.action==='cancel');
 assert.ok(restored.every(e=>e.actor==='Staff · LINE'));
 assert.match((await call('history')).events[0].actor,/not identified/);
});
