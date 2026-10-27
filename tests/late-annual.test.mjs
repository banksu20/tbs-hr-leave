import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','044_optional_personal_reason','045_intern_sick_allowance','046_clear_stale_decision','047_employee_cancellation_identity','048_intern_sick_allowance_revision','049_pending_cancellation_notice','050_date_based_intern_allowances','051_calendar_day_deadlines','052_intern_university_total','053_bilingual_approval_labels','054_optional_annual_reason','055_required_personal_reason','056_late_annual_requests','056_late_annual_requests'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec(`INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('staff',51,'Staff','active','employee',NULL),('intern',52,'Intern','active','intern',501);
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('staff',2099,10,30,3,0);
INSERT INTO tbs_calendar_years(year) VALUES(2099);
INSERT INTO tbs_intern_terms(user_id,months,start_date,end_date) VALUES('intern',6,'2099-01-01','2099-06-30');`);
const submit=async(uid,kind,explanation,date='2099-02-02')=>(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:uid,leaveType:kind,reason:explanation||'',emergencyReason:explanation,selectedDates:[date],leaveDays:1}]))[0].r;
// Force the notice deadline to have passed without using past leave dates.
await db.exec("CREATE OR REPLACE FUNCTION tbs_policy_deadline(uid text,kind text,d date) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now()-interval '1 minute' $$");
test('late annual requires an explanation and stays pending for both cohorts',async()=>{
 for(const uid of ['staff','intern']){
  for(const reason of ['',undefined,'   '])assert.equal((await submit(uid,'annual',reason)).ok,false);
  const r=await submit(uid,'annual','Forgot to submit in time');assert.equal(r.ok,true,JSON.stringify(r));
  const row=(await q('SELECT status,reason,emergency_reason FROM leave_requests WHERE id=$1',[r.id]))[0];
  assert.equal(row.status,'Pending');assert.match(row.reason,/Late annual request/);assert.equal(row.reason.split('Forgot to submit in time').length-1,1);assert.equal(row.emergency_reason,'Forgot to submit in time');
  assert.equal((await submit(uid,'annual','Late duplicate')).ok,false,'overlap blocked');
  await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[r.id]);
 }
});
test('late requests retain quota, internship dates, past-date and university guards',async()=>{
 assert.equal((await submit('intern','annual','Late','2099-07-02')).ok,false);
 assert.equal((await submit('intern','annual','Late','2001-01-01')).ok,false);
 assert.equal((await submit('intern','university','Late','2099-03-02')).ok,false);
 for(const date of ['2099-02-03','2099-02-04'])assert.equal((await submit('intern','vacation','Late',date)).ok,true);
 assert.equal((await submit('intern','annual','Late','2099-02-05')).ok,false,'pending plus approved quota enforced');
});
test('one emergency explanation is stored once for sick and personal',async()=>{
 for(const uid of ['staff','intern'])for(const [kind,date] of [['sick','2099-03-02'],['personal','2099-03-03']]){
 const r=await submit(uid,kind,'Urgent family issue',date);assert.equal(r.ok,true,JSON.stringify(r));
 const row=(await q('SELECT reason FROM leave_requests WHERE id=$1',[r.id]))[0];assert.match(row.reason,/Emergency:/);assert.equal(row.reason.split('Urgent family issue').length-1,1);
 }
});
test.after(()=>db.close());
