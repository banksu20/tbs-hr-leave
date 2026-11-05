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
test('dashboard university creation binds evidence atomically and preserves permissions and guards',async()=>{
 await db.exec(readFileSync('n8n/sql/058_dashboard_university_evidence.sql','utf8'));
 await db.exec(readFileSync('n8n/sql/058_dashboard_university_evidence.sql','utf8'));
 const doc={filename:'activity.pdf',mime:'application/pdf',content:Buffer.from('%PDF-1.4 test').toString('base64')};
 const save=async(uid,date,token='3',evidence=doc)=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[{operation:'leave-create',sessionHash:token.repeat(64),body:{userId:uid,leaveDate:date,leaveType:'university',leaveDays:1,reason:'University activity',status:'Approved',evidence}}]))[0].r;
 assert.equal((await save('intern','2099-02-01','9')).statusCode,401);
 assert.equal((await save('staff','2099-02-01')).statusCode,403);
 assert.equal((await save('intern','2099-02-01','3',{...doc,content:Buffer.from('bad').toString('base64')})).statusCode,422);
 assert.equal((await save('intern','2099-02-01','3',null)).ok,false);
 assert.equal((await save('intern','2099-02-01')).ok,true);
 const rows=await q("SELECT e.document_type,e.user_id,r.leave_type FROM tbs_leave_evidence e JOIN leave_requests r ON r.id=e.request_id");
 assert.deepEqual(rows,[{document_type:'activity',user_id:'intern',leave_type:'university'}]);
 assert.equal((await save('intern','2099-02-01')).ok,false);
 assert.equal((await save('intern','2099-07-01')).ok,false);
 assert.equal((await q('SELECT count(*)::int n FROM tbs_leave_evidence'))[0].n,1);
 assert.equal((await q("SELECT current_setting('app.tbs_evidence_ids',true) v"))[0].v,'');
 for(const [token,date] of [['1','02'],['2','03']])assert.equal((await save('intern',`2099-02-${date}`,token)).ok,true);
});
test('dashboard university details are optional; employee requirements remain enforced',async()=>{
 await db.exec(readFileSync('n8n/sql/059_optional_dashboard_university_details.sql','utf8'));
 await db.exec(readFileSync('n8n/sql/059_optional_dashboard_university_details.sql','utf8'));
 for(const [token,day] of [['1','10'],['2','11'],['3','12']]){
 const r=(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[{operation:'leave-create',sessionHash:token.repeat(64),body:{userId:'intern',leaveDate:`2099-02-${day}`,leaveType:'university',leaveDays:1,reason:'',status:'Approved'}}]))[0].r;
 assert.equal(r.ok,true,JSON.stringify(r));
 }
 assert.equal((await q("SELECT count(*)::int n FROM leave_requests WHERE university_dashboard_entry AND reason=''"))[0].n,3);
 const r=(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:'intern',leaveType:'university',selectedDates:['2099-03-01'],leaveDays:1,reason:'Event',university_dashboard_entry:true}]))[0].r;
 assert.equal(r.ok,false);
 const missingReason=(await q('SELECT tbs_employee_request($1::jsonb) r',[{userId:'intern',leaveType:'university',selectedDates:['2099-03-02'],leaveDays:1,reason:''}]))[0].r;
 assert.equal(missingReason.ok,false);
 await db.exec("UPDATE leave_requests SET status='Rejected' WHERE university_dashboard_entry");
});
test.after(()=>db.close());
