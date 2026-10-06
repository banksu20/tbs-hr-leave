import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
const fixture=readFileSync('tests/employee-cancellation.test.mjs','utf8');
await db.exec(fixture.match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql','011_employee_cancellation.sql','012_line_cancellation.sql','013_leave_result_flex.sql','014_cancellation_result_cards.sql','015_delivery_reliability.sql','016_sick_notifications.sql','017_paid_sick_rollover.sql','018_sick_acknowledgements.sql','019_ceo_sick_notices.sql'])await db.exec(readFileSync('n8n/sql/'+file,'utf8').replaceAll("(now() AT TIME ZONE 'Asia/Bangkok')::date","'2026-10-06'::date"));
await db.exec("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,status) VALUES('emp',1,'Sample','Employee','active'),('alias',2,'Alias','Employee','inactive'); INSERT INTO tbs_employee_accounts VALUES('alias','emp',now()); UPDATE tbs_cancellation_line_settings SET ceo_account_id='U00000000000000000000000000000000'");
const today='2026-10-06';
let offset=0;
const add=async(days,status='Approved',dates)=>{if(!dates){dates=Array.from({length:days*4},()=>{const d=new Date(today.slice(0,4)+'-01-01T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset++);return d.toISOString().slice(0,10);}).join(',');}return db.query("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,status) VALUES('emp','Sample Employee','sick',$1,$2,$3,$4,$5)",[days,dates.split(',')[0],dates.split(',').at(-1),dates,status]);};
const check=async()=> (await db.query("SELECT tbs_check_sick_daily() n")).rows[0].n;
const jobs=async()=> (await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line' ORDER BY delivery_order")).rows.map(r=>r.payload);
test.beforeEach(async()=>{offset=0;await db.exec("TRUNCATE leave_requests RESTART IDENTITY CASCADE; DELETE FROM tbs_sync_jobs; DELETE FROM tbs_sick_alert_jobs; DELETE FROM tbs_sick_alerts; DELETE FROM tbs_sick_milestones; DELETE FROM tbs_sick_language; DELETE FROM leave_quotas; UPDATE tbs_sick_notification_settings SET enabled=false,activated_at=NULL,last_daily_date=NULL");});
test('installation is silent; activation queues only the highest reached threshold per audience',async()=>{
 await add(13);assert.equal((await jobs()).length,0);
 await db.query('SELECT tbs_activate_sick_notifications()');assert.equal((await jobs()).length,2);
 assert.deepEqual((await db.query('SELECT threshold FROM tbs_sick_alerts ORDER BY audience')).rows.map(r=>r.threshold),[10,10]);
 assert.match(JSON.stringify((await jobs())[0]),/13 days/);
 assert.equal(await check(),0);
 await db.query('SELECT tbs_activate_sick_notifications()');assert.equal((await jobs()).length,2);
});
test('fractional crossing triggers once; cancelled then restored leave does not repeat',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(4.5);assert.equal((await jobs()).length,0);await add(0.5);
 assert.equal((await jobs()).length,1);assert.equal(await check(),0);
 await db.exec("UPDATE leave_requests SET status='Rejected'");await db.exec("DELETE FROM tbs_sync_jobs");
 await db.exec("UPDATE leave_requests SET status='Approved'");
 // Existing approval-result notifications may be queued, but no repeated sick milestone.
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_sick_milestones WHERE NOT baseline")).rows[0].n,1);
});
test('pending/future/prior-year leave excluded; daily check picks up arrival date; aliases share totals',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10,'Pending');await add(10,'Approved','2099-01-02');await add(10,'Approved','2020-01-02');assert.equal((await jobs()).length,0);
 assert.equal(Number((await db.query("SELECT tbs_sick_used('alias','2099-01-01') n")).rows[0].n),0);
 await db.query("SELECT tbs_check_sick_daily('2099-01-02')");assert.equal((await jobs()).length,2);
 assert.equal(Number((await db.query("SELECT tbs_sick_used('alias','2099-01-02') n")).rows[0].n),10);
});
test('all thresholds route correctly and all cards are English only',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');
 for(const [days,recipients] of [[5,['emp']],[5,['emp','U00000000000000000000000000000000']],[10,['emp']],[5,['emp']],[5,['emp','U00000000000000000000000000000000']]]){
 await db.exec('DELETE FROM tbs_sync_jobs');await add(days);const j=await jobs();assert.deepEqual(j.map(x=>x.to),recipients);
 for(const p of j){assert.equal(p.messages[0].type,'flex');assert.doesNotMatch(JSON.stringify(p),/[\u0E00-\u0E7F]/);}
 }
 assert.equal(await check(),0);
});
test('multiple crossed thresholds combine into one card per audience with actual remaining balance',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(27);const j=await jobs();assert.equal(j.length,2);
 assert.match(JSON.stringify(j[0]),/3 \/ 30/);assert.match(JSON.stringify(j[0]),/27/);
 assert.equal((await db.query('SELECT count(*)::int n FROM tbs_sick_milestones')).rows[0].n,5);
});
test('cross-year request apportions fractional days to their own calendar years',async()=>{
 await add(1,'Approved','2098-12-31,2099-01-01');
 for(const d of ['2098-12-31','2099-01-01'])assert.equal(Number((await db.query("SELECT tbs_sick_used('emp',$1::date) n",[d])).rows[0].n),0.5);
});

test('activation fixes current and future paid quotas while preserving earlier years',async()=>{
 await db.exec("INSERT INTO leave_quotas(user_id,year,sick_total,annual_total,personal_total,carried_over) VALUES('emp',2025,NULL,10,3,0),('emp',2026,NULL,10,3,0),('emp',2027,50,10,3,0)");
 await db.query('SELECT tbs_activate_sick_notifications()');
 assert.deepEqual((await db.query("SELECT sick_total FROM leave_quotas ORDER BY year")).rows.map(r=>r.sick_total),[null,'30','30']);
 await db.exec("UPDATE leave_quotas SET sick_total=NULL WHERE year=2027");assert.equal((await db.query('SELECT sick_total FROM leave_quotas WHERE year=2027')).rows[0].sick_total,'30');
 const preview=(await db.query("SELECT tbs_rollover($1::jsonb) r",[JSON.stringify({action:'preview',sourceYear:2025,expiresOn:'2026-03-31'})])).rows[0].r;
 assert.equal(preview.rows[0].sickTotal,30);
});
test('failed delivery reuses one milestone job rather than generating another reminder',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 const job=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows[0];
 await db.query("SELECT tbs_finish_sync($1,$2,$3,'Temporary delivery error')",[job.id,job.lease_token,job.generation]);
 assert.equal(await check(),0);assert.equal((await jobs()).length,1);
 await db.exec("UPDATE tbs_sync_jobs SET lease_until=now()-interval '1 second'");
 const retry=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows[0];assert.equal(retry.id,job.id);
});
test('daily clock uses Bangkok 08:30, catches up after downtime, and runs once per date',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');
 assert.equal((await db.query("SELECT tbs_run_sick_daily('2026-10-06T01:29:00Z') n")).rows[0].n,0);
 assert.equal((await db.query('SELECT last_daily_date FROM tbs_sick_notification_settings')).rows[0].last_daily_date,null);
 await db.query("SELECT tbs_run_sick_daily('2026-10-06T01:30:00Z')");
 assert.equal((await db.query('SELECT last_daily_date::text d FROM tbs_sick_notification_settings')).rows[0].d,'2026-10-06');
 assert.equal((await db.query("SELECT tbs_run_sick_daily('2026-10-06T04:00:00Z') n")).rows[0].n,0);
 await db.query("SELECT tbs_run_sick_daily('2026-10-07T08:00:00Z')");
 assert.equal((await db.query('SELECT last_daily_date::text d FROM tbs_sick_notification_settings')).rows[0].d,'2026-10-07');
});
test('employee cards follow saved app language while CEO stays English; aliases share preference',async()=>{
 await db.query('SELECT tbs_set_sick_language($1::jsonb)',[JSON.stringify({accountId:'alias',language:'th'})]);
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10);
 const j=await jobs();assert.match(JSON.stringify(j[0]),/[\u0E00-\u0E7F]/);assert.doesNotMatch(JSON.stringify(j[1]),/[\u0E00-\u0E7F]/);
 await db.query('SELECT tbs_set_sick_language($1::jsonb)',[JSON.stringify({accountId:'emp',language:'en'})]);await db.exec('DELETE FROM tbs_sync_jobs');await add(10);
 assert.doesNotMatch(JSON.stringify(await jobs()),/[\u0E00-\u0E7F]/);
});
test.after(async()=>{await db.close();});
const alert=async audience=>(await db.query('SELECT * FROM tbs_sick_alerts WHERE audience=$1',[audience])).rows[0];
const acknowledge=async(a,accountId,operation='sick-acknowledge')=>(await db.query('SELECT tbs_sick_acknowledge($1,$2::jsonb) r',[operation,JSON.stringify({id:a.id,token:a.token,accountId})])).rows[0].r;
const finishAll=()=>db.exec('UPDATE tbs_sync_jobs SET completed_generation=generation,lease_until=NULL');
const outstanding=async()=>(await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation")).rows[0].n;
test('delivered cards never repeat, even without acknowledgement, while higher thresholds still notify',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10);
 for(const j of (await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows)await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[j.id,j.lease_token,j.generation]);
 for(const day of ['2026-10-07','2026-10-08','2027-01-01']){
  await db.query('SELECT tbs_run_sick_daily($1::timestamptz)',[day+'T01:30:00Z']);assert.equal(await outstanding(),0);
 }
 const emp=await alert('employee');assert.equal(emp.acknowledged_at,null);
 assert.equal((await acknowledge(emp,'alias')).ok,true);
 await add(10);assert.equal(await outstanding(),1);assert.equal((await alert('employee')).threshold,20);
 assert.doesNotMatch(JSON.stringify(await jobs()),/Daily reminder|แจ้งเตือนทุกวัน/);
});
test('review never acknowledges, wrong identities/tokens fail and repeat clicks are safe',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10);const emp=await alert('employee'),boss=await alert('ceo');
 assert.equal((await acknowledge(emp,'emp','sick-review')).acknowledged,false);
 assert.equal((await alert('employee')).acknowledged_at,null);
 assert.equal((await acknowledge(emp,'stranger')).statusCode,403);
 assert.equal((await acknowledge(boss,'emp')).statusCode,403);
 assert.equal((await acknowledge({...emp,token:boss.token},'emp')).statusCode,409);
 assert.equal((await acknowledge(emp,'emp')).acknowledged,true);assert.equal((await acknowledge(emp,'alias')).acknowledged,true);
});
test('higher threshold supersedes old reminders and old button cannot clear the new alert',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);const old=await alert('employee');
 await add(5);assert.equal(await outstanding(),2);
 assert.equal((await acknowledge(old,'emp')).statusCode,409);assert.equal((await alert('employee')).acknowledged_at,null);
 assert.equal((await acknowledge(await alert('employee'),'emp')).ok,true);
});
test('failed or blocked delivery does not accumulate a fresh message each morning',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 await db.exec("UPDATE tbs_sync_jobs SET blocked=true,last_error='Needs review'");
 await db.query("SELECT tbs_run_sick_daily('2026-10-07T01:30:00Z')");
 await db.query("SELECT tbs_run_sick_daily('2026-10-08T01:30:00Z')");assert.equal((await jobs()).length,1);
 assert.equal((await acknowledge(await alert('employee'),'emp')).ok,true);assert.equal(await outstanding(),0);
});
test('correction below threshold suppresses the unsent card; above threshold refreshes its total',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(7);
 await db.exec('UPDATE leave_requests SET leave_days=6');
 const claimed=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;
 assert.equal(claimed.length,1);assert.match(JSON.stringify(claimed[0].payload),/6 days/);
 await db.exec("UPDATE tbs_sync_jobs SET lease_until=now()-interval '1 second'; UPDATE leave_requests SET leave_days=2");
 assert.equal((await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows.length,0);
 assert.equal((await acknowledge(await alert('employee'),'emp')).statusCode,409);
});
test('missing CEO recipient cannot roll back approval, and recovery queues its pending alert',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');
 await db.exec("UPDATE tbs_cancellation_line_settings SET ceo_account_id=''");
 try{
  await add(10);assert.equal((await jobs()).length,1);assert.equal((await alert('ceo')).last_sent_date,null);
  await db.exec("UPDATE tbs_cancellation_line_settings SET ceo_account_id='U00000000000000000000000000000000'");
  await db.query("SELECT tbs_run_sick_daily('2026-10-06T01:30:00Z')");assert.equal(await outstanding(),2);
 }finally{await db.exec("UPDATE tbs_cancellation_line_settings SET ceo_account_id='U00000000000000000000000000000000'");}
});
test('undelivered year-end notices remain deliverable with their original year',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 await db.query("SELECT tbs_run_sick_daily('2027-01-01T01:30:00Z')");assert.equal(await outstanding(),1);
 const p=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation")).rows[0].payload;
 assert.match(JSON.stringify(p),/2026/);assert.match(JSON.stringify(p),/5 days/);
});
test('restoring a corrected threshold resumes the reminder without resurrecting an acknowledged alert',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 await db.exec('UPDATE leave_requests SET leave_days=2;SELECT tbs_refresh_sick_jobs();UPDATE leave_requests SET leave_days=5');
 await db.query("SELECT tbs_run_sick_daily('2026-10-07T01:30:00Z')");assert.equal(await outstanding(),1);
 assert.equal((await alert('employee')).retired_at,null);
 await acknowledge(await alert('employee'),'emp');
 await db.exec('UPDATE leave_requests SET leave_days=2;SELECT tbs_refresh_sick_jobs();UPDATE leave_requests SET leave_days=5');
 await db.query("SELECT tbs_run_sick_daily('2026-10-08T01:30:00Z')");assert.equal(await outstanding(),0);
});
test('pause blocks queued sick cards but lets unrelated employee messages through; resume preserves reminders',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 await db.exec("UPDATE tbs_sick_notification_settings SET enabled=false; INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line','emp','{\"to\":\"emp\",\"messages\":[{\"type\":\"text\",\"text\":\"Other result\"}]}')");
 const other=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;assert.equal(other.length,1);assert.equal(other[0].payload.messages[0].text,'Other result');
 await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[other[0].id,other[0].lease_token,other[0].generation]);
 assert.equal((await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows.length,0);
 await db.exec('UPDATE tbs_sick_notification_settings SET enabled=true');
 assert.equal((await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows.length,1);
});
test('changing CEO recipient revokes the old button and routes the replacement only to the new CEO',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10);const old=await alert('ceo');
 await db.exec("UPDATE tbs_cancellation_line_settings SET ceo_account_id='U11111111111111111111111111111111'");
 try{
  assert.equal((await acknowledge(old,'U00000000000000000000000000000000')).statusCode,409);
  await db.query("SELECT tbs_run_sick_daily('2026-10-07T01:30:00Z')");
  const jobs=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows;
  assert.ok(jobs.some(j=>j.payload.to==='U11111111111111111111111111111111'));
  assert.ok(jobs.every(j=>j.payload.to!=='U00000000000000000000000000000000'));
 }finally{await db.exec("UPDATE tbs_cancellation_line_settings SET ceo_account_id='U00000000000000000000000000000000'");}
});
test('successful delivery is recorded separately and prevents a second daily reminder after a delayed delivery',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(5);
 const job=(await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows[0];
 await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[job.id,job.lease_token,job.generation]);
 assert.ok((await db.query('SELECT delivered_at FROM tbs_sick_alert_jobs WHERE job_id=$1',[job.id])).rows[0].delivered_at);
 await db.query("UPDATE tbs_sick_alert_jobs SET delivered_at='2026-10-07T01:15:00Z' WHERE job_id=$1",[job.id]);
 await db.query("SELECT tbs_run_sick_daily('2026-10-07T01:30:00Z')");assert.equal(await outstanding(),0);
 await db.query("SELECT tbs_run_sick_daily('2026-10-08T01:30:00Z')");assert.equal(await outstanding(),0);
});
test('late preference retries cannot overwrite a newer employee language',async()=>{
 const stamp=Date.now()-60000;
 for(const [language,changedAt] of [['th',stamp+100],['en',stamp]])await db.query('SELECT tbs_set_sick_language($1::jsonb)',[JSON.stringify({accountId:'emp',language,changedAt})]);
 assert.equal((await db.query("SELECT language FROM tbs_sick_language WHERE user_id='emp'")).rows[0].language,'th');
});
test('activation selects only the highest reached threshold at fractional boundaries',async()=>{
 for(const [days,employee,ceo] of [[4.75,null,null],[5,5,null],[9.75,5,null],[10,10,10],[19.75,10,10],[20,20,10],[24.75,20,10],[25,25,10],[29.75,25,10],[30,30,30],[31,30,30]]){
  offset=0;
  await db.exec('TRUNCATE leave_requests RESTART IDENTITY CASCADE;DELETE FROM tbs_sync_jobs;DELETE FROM tbs_sick_alert_jobs;DELETE FROM tbs_sick_alerts;DELETE FROM tbs_sick_milestones;UPDATE tbs_sick_notification_settings SET enabled=false,activated_at=NULL,last_daily_date=NULL');
  await add(days);await db.query('SELECT tbs_activate_sick_notifications()');
  const actual=(await db.query('SELECT audience,threshold FROM tbs_sick_alerts ORDER BY audience')).rows;
  const expected=[...(ceo?[{audience:'ceo',threshold:ceo}]:[]),...(employee?[{audience:'employee',threshold:employee}]:[])];
  assert.deepEqual(actual,expected,`${days} approved days`);
  assert.equal((await jobs()).length,expected.length,`${days}: no lower milestone spam`);
 }
});

test('isolated delivery cards authenticate only their recipient, expire, and never alter real totals or queue reminders',async()=>{
 const a=(await db.query("INSERT INTO tbs_sick_delivery_tests(recipient,threshold,audience,total,year) VALUES('emp',30,'ceo',30,2026) RETURNING *")).rows[0];
 assert.equal((await acknowledge(a,'U00000000000000000000000000000000')).statusCode,403);
 assert.equal((await acknowledge({...a,token:'00000000-0000-0000-0000-000000000000'},'emp')).statusCode,409);
 const review=await acknowledge(a,'emp','sick-review'); assert.equal(review.acknowledged,false); assert.equal(review.isolatedTest,true); assert.equal(Number(review.total),30);
 assert.equal((await acknowledge(a,'emp')).acknowledged,true);
 assert.equal((await acknowledge(a,'emp')).acknowledged,true);
 assert.equal(Number((await db.query("SELECT tbs_sick_used('emp','2026-10-06') n")).rows[0].n),0);
 assert.equal((await jobs()).length,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM tbs_sick_milestones')).rows[0].n,0);
 await db.query("UPDATE tbs_sick_delivery_tests SET expires_at=now()-interval '1 second' WHERE id=$1",[a.id]);
 assert.equal((await acknowledge(a,'emp')).statusCode,409);
});

test('CEO notices have no acknowledgement and stop after delivery; employees retain acknowledgement and CEO 30 still sends',async()=>{
 await db.query('SELECT tbs_activate_sick_notifications()');await add(10);
 const initial=await jobs();const ceo=initial.find(j=>j.to!=='emp'),emp=initial.find(j=>j.to==='emp');
 assert.equal(ceo.messages[0].contents.footer,undefined);assert.doesNotMatch(JSON.stringify(ceo),/Acknowledge|Daily reminder/);
 assert.match(JSON.stringify(emp),/Acknowledge/);
 for(const j of (await db.query("SELECT * FROM tbs_claim_line_batch('line')")).rows)await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[j.id,j.lease_token,j.generation]);
 await db.query("SELECT tbs_run_sick_daily('2026-10-07T01:30:00Z')");
 const pending=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line' AND completed_generation<generation")).rows;
 assert.equal(pending.length,0);
 await add(20);const boss=await alert('ceo');assert.equal(boss.threshold,30);
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE completed_generation<generation AND payload->>'to'<>'emp'")).rows[0].n,1);
});
