import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'050_date_based_intern_allowances','051_calendar_day_deadlines','052_intern_university_total','052_intern_university_total'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern'),('employee',91,'active','employee'); INSERT INTO tbs_work_calendar(day,working,note) VALUES('2026-10-23',false,'Holiday') ON CONFLICT(day) DO UPDATE SET working=false;");
test('whole internship university usage spans years and excludes pending and rejected requests',async()=>{
 await db.exec("INSERT INTO tbs_intern_terms(user_id,start_date,end_date) VALUES('intern','2099-12-01','2100-02-28'); INSERT INTO tbs_calendar_years(year) VALUES(2099),(2100) ON CONFLICT DO NOTHING;");
 for(const [date,days,status] of [['2099-12-01',1,'Approved'],['2100-01-05',0.5,'Approved'],['2100-01-06',1,'Pending'],['2100-01-07',1,'Rejected']]){
 const f=(await q("INSERT INTO tbs_leave_evidence(user_id,filename,mime,content,document_type) VALUES('intern','activity.pdf','application/pdf',decode('JVBERi0=','base64'),'activity') RETURNING id"))[0];
 const r=(await q('SELECT tbs_employee_request($1::jsonb) r',[JSON.stringify({userId:'intern',leaveType:'university',selectedDates:[date],leaveDays:days,halfDayPeriod:days===0.5?'morning':null,reason:'Activity',evidenceIds:[f.id]})]))[0].r;
 assert.equal(r.ok,true,JSON.stringify(r));
 await q('UPDATE leave_requests SET status=$1 WHERE id=$2',[status,r.id]);
 }
 for(const year of [2099,2100])assert.equal((await q("SELECT tbs_leave_balance('intern',$1,'university') b",[year]))[0].b.approved,1.5);
 const def=(await q("SELECT pg_get_functiondef('tbs_policy_admin(jsonb)'::regprocedure) d"))[0].d;
 assert.match(def,/universityApproved/);assert.match(def,/tbs_leave_balance\(t.user_id/);
});
test.after(async()=>{await db.close();});
