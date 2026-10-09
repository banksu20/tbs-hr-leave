import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import loadTS from './load-ts.cjs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=['001_request_safety','002_history_and_conflicts','003_year_rollover','004_line_decisions','005_sync_outbox','006_employee_submission','007_sheet_employee_links','008_quota_safety','009_linked_employee_accounts','011_employee_cancellation','012_line_cancellation','013_leave_result_flex','014_cancellation_result_cards','015_delivery_reliability','016_sick_notifications','017_paid_sick_rollover','018_sick_acknowledgements','019_ceo_sick_notices','020_retire_sheet_sync','023_dashboard_accounts'];
for(const f of files)await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const call=async(operation,payload={},sessionHash='a'.repeat(64))=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({...payload,operation,sessionHash})]))[0].r;
const hash='scrypt:'+ 'a'.repeat(32)+':'+ 'b'.repeat(128);
await call('bootstrap',{passwordHash:hash});
const admin=(await q("SELECT * FROM tbs_dashboard_accounts WHERE username='admin'"))[0];
await call('login-finish',{id:admin.id,version:admin.version});
await call('account-save',{username:'hr',role:'hr',active:true,passwordHash:hash});
await call('account-save',{username:'ceo-user',role:'ceo',active:true,passwordHash:hash});
const hr=(await q("SELECT * FROM tbs_dashboard_accounts WHERE role='hr'"))[0];
const ceo=(await q("SELECT * FROM tbs_dashboard_accounts WHERE role='ceo'"))[0];
await call('login-finish',{id:hr.id,version:hr.version},'b'.repeat(64));
await call('login-finish',{id:ceo.id,version:ceo.version},'c'.repeat(64));
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,status) VALUES('staff',5,'Staff','active'),('intern',6,'Intern','active')");
await call('employee-type',{userId:'intern',type:'intern'});
test('anonymous, expired and tampered sessions fail closed',async()=>{
 assert.equal((await call('session',{},'d'.repeat(64))).statusCode,401);
 assert.equal((await call('session')).session.role,'admin');
 await q("UPDATE tbs_dashboard_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",['c'.repeat(64)]);
 assert.equal((await call('session',{},'c'.repeat(64))).statusCode,401);
 await q("UPDATE tbs_dashboard_sessions SET expires_at=now()+interval '1 hour' WHERE token_hash=$1",['c'.repeat(64)]);
});
test('HR sees only interns, and cannot list accounts or full-time records',async()=>{
 const r=await call('data',{year:2026,cohort:'intern'},'b'.repeat(64));assert.equal(r.ok,true);assert.deepEqual(r.employees.map(e=>e.user_id),['intern']);
 assert.equal((await call('data',{year:2026,cohort:'employee'},'b'.repeat(64))).statusCode,403);
 assert.equal((await call('accounts-list',{},'b'.repeat(64))).statusCode,403);
 assert.equal((await call('employee-type',{userId:'staff',type:'intern'},'b'.repeat(64))).statusCode,403);
});
test('Admin and CEO can switch groups without merging data',async()=>{
 for(const token of ['a','c'])for(const cohort of ['employee','intern']){
  const r=await call('data',{year:2026,cohort},token.repeat(64));assert.equal(r.ok,true);assert.ok(r.employees.every(e=>e.employment_type===cohort));
 }
 assert.equal((await call('accounts-list',{},'c'.repeat(64))).statusCode,403);
});
test('HR cannot mutate full-time leave by guessing an id; intern approval uses the existing guards',async()=>{
 const r=(await q("INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,reason,status) VALUES('staff','Staff','sick',1,'2026-10-08','2026-10-08','2026-10-08','Ill','Pending') RETURNING *,md5(to_jsonb(leave_requests)::text) revision"))[0];
 assert.equal((await call('leave-update',{body:{id:r.id,action:'approve',expectedRevision:r.revision}},'b'.repeat(64))).statusCode,403);
 await call('employee-type',{userId:'staff',type:'intern'});
 const result=await call('leave-update',{body:{id:r.id,action:'approve',expectedRevision:r.revision}},'b'.repeat(64));assert.equal(result.ok,true);
 await call('employee-type',{userId:'staff',type:'employee'});
});
test('intern code remains stable and new requests cannot inherit full-time policy',async()=>{
 const before=(await q("SELECT intern_number FROM tbs_employees WHERE user_id='intern'"))[0].intern_number;
 await call('employee-type',{userId:'intern',type:'employee'});await call('employee-type',{userId:'intern',type:'intern'});
 assert.equal((await q("SELECT intern_number FROM tbs_employees WHERE user_id='intern'"))[0].intern_number,before);
 await assert.rejects(()=>q("SELECT tbs_employee_request($1::jsonb)",[JSON.stringify({userId:'intern',leaveType:'sick',leaveDays:1,selectedDates:['2099-01-05'],reason:'Ill',approverIds:['boss']})]),/not (?:been )?configured/);
});
test('password reset revokes sessions and admin cannot demote itself',async()=>{
 assert.equal((await call('account-save',{id:admin.id,username:'admin',role:'hr',active:true})).statusCode,409);
 assert.equal((await call('account-save',{id:hr.id,username:'hr',role:'hr',active:true,passwordHash:hash})).ok,true);
 assert.equal((await call('session',{},'b'.repeat(64))).statusCode,401);
 assert.ok((await call('accounts-list')).accounts.every(a=>!('password_hash' in a)));
});
test('login attempts are limited durably',async()=>{
 for(let n=0;n<5;n++)assert.equal((await call('login-start',{username:'missing-user',ipHash:'test-ip'})).ok,true);
 assert.equal((await call('login-start',{username:'missing-user',ipHash:'test-ip'})).statusCode,429);
});
test('password hashes are salted and verified without plaintext storage',()=>{
 const {hashPassword,verifyHash}=loadTS()('api/_lib/dashboardAuth.ts');const a=hashPassword('a strong test password');const b=hashPassword('a strong test password');
 assert.notEqual(a,b);assert.equal(verifyHash('a strong test password',a),true);assert.equal(verifyHash('wrong',a),false);
});
test.after(()=>db.close());
test('archive and restore preserve intern history and code; HR cannot archive full-time staff',async()=>{
 await call('login-finish',{id:hr.id,version:(await q('SELECT version FROM tbs_dashboard_accounts WHERE id=$1',[hr.id]))[0].version},'e'.repeat(64));
 assert.equal((await call('intern-archive',{body:{userId:'staff'}},'e'.repeat(64))).statusCode,403);
 const n=(await q("SELECT intern_number FROM tbs_employees WHERE user_id='intern'"))[0].intern_number;
 assert.equal((await call('intern-archive',{body:{userId:'intern'}},'e'.repeat(64))).ok,true);
 assert.equal((await q("SELECT status FROM tbs_employees WHERE user_id='intern'"))[0].status,'inactive');
 assert.equal((await call('intern-restore',{body:{userId:'intern'}},'e'.repeat(64))).ok,true);
 assert.equal((await q("SELECT intern_number FROM tbs_employees WHERE user_id='intern'"))[0].intern_number,n);
});
test('migration reapply preserves accounts and does not reopen public access',async()=>{
 await db.exec(readFileSync('n8n/sql/023_dashboard_accounts.sql','utf8'));
 assert.equal((await call('accounts-list')).accounts.length,3);
 assert.equal((await call('data',{year:2026,cohort:'intern'},'f'.repeat(64))).statusCode,401);
});
