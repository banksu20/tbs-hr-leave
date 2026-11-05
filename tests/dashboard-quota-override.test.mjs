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
test('authorized dashboard can exceed quota; scope, dates, overlap, reasons and employee limits still apply',async()=>{
 for(const uid of ['intern','staff'])for(let i=1;i<=3;i++)assert.equal((await create(uid,`2099-02-0${i}`)).ok,true);
 for(const [token,date] of [['1','04'],['2','05'],['3','06']])assert.equal((await create('intern',`2099-02-${date}`,token)).ok,true);
 assert.equal((await create('staff','2099-02-04','2')).ok,true);
 assert.equal((await create('staff','2099-02-05','3')).statusCode,403);
 assert.equal((await create('intern','2099-02-07','9')).statusCode,401);
 assert.equal((await create('intern','2099-07-01')).ok,false);
 assert.equal((await create('intern','2099-02-04')).ok,false);
 const b=(await q("SELECT tbs_leave_balance('intern',2099,'personal') b"))[0].b;assert.equal(b.total,3);assert.equal(b.approved,6);assert.equal(b.available,0);
 assert.equal((await q("SELECT count(*)::int n FROM leave_requests WHERE quota_override"))[0].n,4);
 const r=(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:'intern',leaveType:'personal',selectedDates:['2099-03-01'],leaveDays:1,reason:'Employee',quotaOverride:true}]))[0].r;assert.equal(r.ok,false);
 assert.equal((await q("SELECT current_setting('app.tbs_quota_override_uid',true) v"))[0].v,'');
});
test('all authorized roles can move an over-quota intern entry to another date',async()=>{
 for(const [token,oldDay,newDay] of [['1','04','14'],['2','05','15'],['3','06','16']]){
  const row=(await q("SELECT id,md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE user_id='intern' AND start_date=$1",[`2099-02-${oldDay}`]))[0];
  const result=(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[{operation:'leave-update',sessionHash:token.repeat(64),body:{id:String(row.id),scope:'request',expectedDates:[`2099-02-${oldDay}`],expectedRevision:row.revision,leaveDates:[`2099-02-${newDay}`],leaveType:'personal',leaveDays:1,halfDayPeriod:null,reason:'Correct date',status:'Approved'}}]))[0].r;
  assert.equal(result.ok,true,JSON.stringify(result));
 }
 assert.equal((await q("SELECT tbs_leave_balance('intern',2099,'personal') b"))[0].b.approved,6);
});
test.after(()=>db.close());
