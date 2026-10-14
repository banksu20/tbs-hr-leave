import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','044_optional_personal_reason','044_optional_personal_reason'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec(`INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('staff',51,'Staff','active','employee',NULL),('intern',52,'Intern','active','intern',501);
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('staff',2099,10,30,3,0);
INSERT INTO tbs_calendar_years(year) VALUES(2099);
INSERT INTO tbs_intern_terms(user_id,months,start_date,end_date) VALUES('intern',6,'2099-01-01','2099-06-30');`);
const submit=async(uid,kind,reason,date)=>(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:uid,leaveType:kind,reason,selectedDates:[date],leaveDays:1}]))[0].r;
test('both cohorts submit personal leave without reasons and approval keeps it blank',async()=>{
 for(const [uid,date] of [['staff','2099-02-02'],['intern','2099-02-03']]){
 const result=await submit(uid,'personal','',date);assert.equal(result.ok,true,JSON.stringify(result));
 await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[result.id]);
 assert.equal((await q('SELECT reason FROM leave_requests WHERE id=$1',[result.id]))[0].reason,'');
 await assert.rejects(q("UPDATE leave_requests SET leave_type='sick' WHERE id=$1",[result.id]),/reason/);
 }
});
test('other leave types still require reasons',async()=>{
 for(const kind of ['sick','annual','university']) assert.equal((await submit('intern',kind,'   ','2099-03-02')).ok,false);
});
test('omitted personal reason is normalized, and quotas still block excess leave',async()=>{
 const result=await submit('staff','personal',undefined,'2099-02-04');assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal((await submit('staff','personal','', '2099-02-05')).ok,true);
 assert.equal((await submit('staff','personal','', '2099-02-06')).ok,false);
});
test.after(()=>db.close());
