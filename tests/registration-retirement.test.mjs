import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'043_decision_history_delivery','044_optional_personal_reason','050_date_based_intern_allowances','054_optional_annual_reason','055_required_personal_reason','057_dashboard_quota_override','057_dashboard_quota_override'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec(`INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('staff',51,'Staff','active','employee',NULL),('intern',52,'Intern','active','intern',501);
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('staff',2099,1,30,3,0);
INSERT INTO tbs_calendar_years(year) VALUES(2099);
INSERT INTO tbs_intern_terms(user_id,months,start_date,end_date) VALUES('intern',6,'2099-01-01','2099-06-30');`);
for(const [i,role] of ['admin','ceo','hr'].entries())await q(`WITH a AS (INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES($1,'test',$1) RETURNING *) INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $2,id,version FROM a`,[role,String(i+1).repeat(64)]);
const create=async(uid,date,token='1',kind='personal')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[{operation:'leave-create',sessionHash:token.repeat(64),body:{userId:uid,leaveDate:date,leaveType:kind,leaveDays:1,reason:'Approved exception',status:'Approved'}}]))[0].r;

for(const f of ['058_dashboard_university_evidence','059_optional_dashboard_university_details','060_line_rejection_confirmation','061_registration_review','062_employee_retirement','061_registration_review','062_employee_retirement'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const reg=async p=>(await q('SELECT tbs_registration($1::jsonb) r',[p]))[0].r;
const manage=async(action,userId,token='1',confirmation)=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[{operation:action,sessionHash:token.repeat(64),body:{userId,confirmation}}]))[0].r;
await db.exec("UPDATE tbs_policy_routing SET hr_line_id='nam'; UPDATE tbs_cancellation_line_settings SET ceo_account_id='dan'; INSERT INTO tbs_delivery_admin(singleton,line_id) VALUES(true,'dale') ON CONFLICT(singleton) DO UPDATE SET line_id='dale'");
test('registration requires one reviewer, sends only one card to each approver, and saves start date',async()=>{
 for(const [uid,kind,token] of [['new-staff','employee','3'],['new-intern','intern','2']]){
  const body={action:'submit',accountId:uid,firstName:'Test',lastName:'Person',nickname:'Test',department:'AI',employmentType:kind};
  assert.equal((await reg(body)).pending,true);assert.equal((await reg(body)).pending,true);
  assert.equal((await q('SELECT count(*)::int n FROM tbs_employees WHERE user_id=$1',[uid]))[0].n,0);
  const jobs=await q("SELECT payload FROM tbs_sync_jobs WHERE user_id=$1 AND kind='line'",[uid]);assert.equal(jobs.length,2);assert.deepEqual(jobs.map(j=>j.payload.to).sort(),['dan','nam']);
  assert.equal((await reg({action:'activate',userId:uid,startDate:'2026-11-01'})).statusCode,401);
  const activate={action:'activate',userId:uid,sessionHash:token.repeat(64),startDate:'2026-11-01',...(kind==='intern'?{endDate:'2026-12-31'}:{})};
  assert.equal((await reg(activate)).ok,true);assert.equal((await reg(activate)).ok,true);
  assert.equal((await q('SELECT start_date::text d FROM tbs_employees WHERE user_id=$1',[uid]))[0].d,'2026-11-01');
  assert.equal((await reg({action:'status',accountId:uid})).found,true);
 }
});
test('HR can retire employees; active records, wrong code, protected accounts and pending leave are blocked',async()=>{
 const uid='new-staff',code='TBS-'+String((await q('SELECT tbs_id FROM tbs_employees WHERE user_id=$1',[uid]))[0].tbs_id).padStart(3,'0');
 assert.equal((await manage('employee-permanent-delete',uid,'3',code)).statusCode,409);
 assert.equal((await manage('employee-retirement-archive',uid,'9')).statusCode,401);
 await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES($1,'Test','sick',1,'2026-01-10','2026-01-10','2026-01-10','Ill','Pending')",[uid]);
 assert.equal((await manage('employee-retirement-archive',uid,'3')).ok,true);
 assert.equal((await manage('employee-permanent-delete',uid,'3',code)).statusCode,409);
 await q("UPDATE leave_requests SET status='Rejected' WHERE user_id=$1",[uid]);

 assert.equal((await manage('employee-permanent-delete',uid,'3','TBS-000')).statusCode,422);
 await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type) VALUES('dan',999,'Dan','active','employee')");
 assert.equal((await manage('employee-retirement-archive','dan','3')).statusCode,409);
 assert.equal((await manage('employee-permanent-delete',uid,'3',code)).ok,true);
 assert.equal((await q('SELECT count(*)::int n FROM tbs_employees WHERE user_id=$1',[uid]))[0].n,0);
 assert.equal((await reg({action:'submit',accountId:uid,firstName:'Test',lastName:'Person',department:'AI',employmentType:'employee'})).statusCode,403);
 assert.equal((await q('SELECT count(*)::int n FROM tbs_retired_employee_codes WHERE user_id=$1',[uid]))[0].n,1);
});
test('correction can return inactive intern to review without losing its account or code',async()=>{
 await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,status,employment_type,intern_number) VALUES('correction',1001,'Test','Correction','inactive','intern',801)");
 await q("INSERT INTO tbs_registrations(user_id,first_name,last_name,department,employment_type,correction_pending) VALUES('correction','Test','Correction','AI','intern',true)");
 assert.equal((await reg({action:'status',accountId:'correction'})).pending,true);
 const result=await reg({action:'activate',sessionHash:'3'.repeat(64),userId:'correction',startDate:'2026-11-01',endDate:'2027-02-28'});assert.equal(result.ok,true,JSON.stringify(result));
 const e=(await q("SELECT tbs_id,intern_number,status FROM tbs_employees WHERE user_id='correction'"))[0];assert.deepEqual(e,{tbs_id:1001,intern_number:801,status:'active'});
 assert.equal(Number((await q("SELECT months FROM tbs_intern_terms WHERE user_id='correction'"))[0].months),4);
});
test.after(()=>db.close());
