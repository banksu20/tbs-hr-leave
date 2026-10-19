import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','044_optional_personal_reason','045_intern_sick_allowance','048_intern_sick_allowance_revision','048_intern_sick_allowance_revision'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec(`INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('staff',51,'Staff','active','employee',NULL),('intern',52,'Intern','active','intern',501);
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('staff',2099,10,30,3,0);
INSERT INTO tbs_calendar_years(year) VALUES(2099);
INSERT INTO tbs_intern_terms(user_id,months,start_date,end_date) VALUES('intern',6,'2099-01-01','2099-06-30');`);

const balance=async(uid,kind,days=0)=>(await q("SELECT tbs_leave_balance($1,2099,$2,ARRAY['2099-02-02'::date],$3) r",[uid,kind,days]))[0].r;
test('intern sick allowances are 4/6; annual and personal stay 2/3 and 3',async()=>{
 for(const [months,sick,annual] of [[4,4,2],[6,6,3]]){
  await q('UPDATE tbs_intern_terms SET months=$1 WHERE user_id=$2',[months,'intern']);
  assert.equal((await balance('intern','sick')).total,sick);
  assert.equal((await balance('intern','sick',sick)).allowed,true);
  assert.equal((await balance('intern','sick',sick+0.5)).allowed,false);
  assert.equal((await balance('intern','annual')).total,annual);
  assert.equal((await balance('intern','personal')).total,3);
 }
 assert.equal((await balance('staff','sick')).total,30);
});
test('existing approved and pending sick days consume the revised allowance',async()=>{
 await q("UPDATE tbs_intern_terms SET months=4 WHERE user_id='intern'");
 await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('intern','Intern','sick',1,'2099-01-02','2099-01-02','2099-01-02','Ill','Approved'),('intern','Intern','sick',1,'2099-01-03','2099-01-03','2099-01-03','Ill','Pending')");
 const b=await balance('intern','sick');assert.equal(b.approved,1);assert.equal(b.pending,1);assert.equal(b.available,2);
 assert.equal((await balance('intern','sick',2)).allowed,true);
 assert.equal((await balance('intern','sick',2.5)).allowed,false);
});
test('intern sick usage does not consume personal or annual allowance; overlapping types are blocked',async()=>{
 assert.equal((await balance('intern','personal',1)).available,3);
 assert.equal((await balance('intern','personal',1)).allowed,true);
 assert.equal((await balance('intern','annual',1)).available,2);
 assert.equal((await balance('intern','annual',1)).allowed,true);
 await assert.rejects(q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('intern','Intern','personal',1,'2099-01-02','2099-01-02','2099-01-02','Appointment','Pending')"),/Overlapping leave/);
});
test('exhausted sick allowance still permits other leave on eligible different dates',async()=>{
 await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('intern','Intern','sick',2,'2099-01-05','2099-01-06','2099-01-05,2099-01-06','Ill','Approved')");
 assert.equal((await balance('intern','sick')).available,0);
 for(const [kind,date] of [['personal','2099-02-02'],['annual','2099-02-03']]){
  const preview=(await q("SELECT tbs_leave_policy_preview($1::jsonb) r",[JSON.stringify({accountId:'intern',type:kind,dates:[date],daysPerDate:1})]))[0].r;
  assert.equal(preview.balances[0].allowed,true);assert.equal(preview.late,false);
  await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('intern','Intern',$1,1,$2::date,$2::date,$2::text,'Appointment','Pending')",[kind,date]);
 }
 const outside=(await q("SELECT tbs_leave_balance('intern',2099,'annual',ARRAY['2099-07-01'::date],1) r"))[0].r;
 assert.equal(outside.available,1);assert.equal(outside.allowed,false);
});
test.after(()=>db.close());
