import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','044_optional_personal_reason','045_intern_sick_allowance','046_clear_stale_decision','047_employee_cancellation_identity','048_intern_sick_allowance_revision','049_pending_cancellation_notice','050_date_based_intern_allowances','051_calendar_day_deadlines','052_intern_university_total','053_bilingual_approval_labels','054_optional_annual_reason','055_required_personal_reason','055_required_personal_reason'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec(`INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('staff',51,'Staff','active','employee',NULL),('intern',52,'Intern','active','intern',501);
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('staff',2099,10,30,3,0);
INSERT INTO tbs_calendar_years(year) VALUES(2099);
INSERT INTO tbs_intern_terms(user_id,months,start_date,end_date) VALUES('intern',6,'2099-01-01','2099-06-30');`);
const submit=async(uid,kind,reason,date)=>(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:uid,leaveType:kind,reason,selectedDates:[date],leaveDays:1}]))[0].r;
test('annual and vacation allow empty or omitted reasons for both cohorts through approval',async()=>{
 for(const uid of ['staff','intern'])for(const [kind,reason,date] of [['annual','','2099-02-02'],['vacation',undefined,'2099-02-03'],['annual','   ','2099-02-04']]){
 const r=await submit(uid,kind,reason,date);assert.equal(r.ok,true,JSON.stringify(r));
 await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[r.id]);
 assert.equal((await q('SELECT reason FROM leave_requests WHERE id=$1',[r.id]))[0].reason,'');
 await assert.rejects(q("UPDATE leave_requests SET leave_type='sick' WHERE id=$1",[r.id]),/reason/);
 }
 assert.equal((await submit('intern','annual','','2099-02-05')).ok,false,'Intern annual quota must still block excess leave');
});
test('personal, sick and university require a reason',async()=>{
 for(const uid of ['staff','intern'])for(const kind of ['personal','sick','university'])for(const reason of ['',undefined,'   '])assert.equal((await submit(uid,kind,reason,'2099-03-02')).ok,false);
 for(const uid of ['staff','intern']){const r=await submit(uid,'personal','Family appointment','2099-03-03');assert.equal(r.ok,true,JSON.stringify(r));await assert.rejects(q("UPDATE leave_requests SET reason='' WHERE id=$1",[r.id]),/reason/);}
});
test.after(()=>db.close());
