import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import loadTS from './load-ts.cjs';
const {internAllowance}=loadTS()('src/lib/internAllowance.ts');
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'048_intern_sick_allowance_revision','050_date_based_intern_allowances','050_date_based_intern_allowances'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec("INSERT INTO tbs_employees(user_id,tbs_id,first_name,status,employment_type,intern_number) VALUES('date-intern',501,'Intern','active','intern',501)");
test('UI and database agree for full months, partial months, leap years and month-end dates',async()=>{
 for(const [start,end,expected] of [['2026-01-01','2026-01-31',1],['2026-01-01','2026-02-28',2],['2026-01-01','2026-04-30',4],['2026-01-01','2026-06-30',6],['2026-01-01','2026-01-15',0.48],['2028-02-01','2028-02-29',1],['2026-01-31','2026-02-27',1],['2026-12-15','2027-01-14',1],['2026-10-20','2026-10-20',0.03]]){
  const a=internAllowance(start,end);assert.equal(a.months,expected,`${start}/${end}`);
  await q("INSERT INTO tbs_intern_terms(user_id,start_date,end_date) VALUES('date-intern',$1,$2) ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date",[start,end]);
  for(const kind of ['sick','annual','personal']){
   const b=(await q("SELECT tbs_leave_balance('date-intern',2026,$1) b",[kind]))[0].b;
   assert.equal(b.total,a[kind],`${start}/${end}/${kind}`);
  }
 }
 assert.equal(internAllowance('2026-02-30','2026-03-01'),null);
 assert.equal(internAllowance('2026-03-02','2026-03-01'),null);
});
test('legacy months cannot override date-based quotas; over-quota and outside-term requests stay blocked',async()=>{
 await q("UPDATE tbs_intern_terms SET start_date='2026-01-01',end_date='2026-01-31',months=6 WHERE user_id='date-intern'");
 assert.equal(Number((await q("SELECT months FROM tbs_intern_terms WHERE user_id='date-intern'"))[0].months),1);
 const b=async(date,amount)=>(await q("SELECT tbs_leave_balance('date-intern',2026,'annual',ARRAY[$1::date],$2) b",[date,amount]))[0].b;
 assert.equal((await b('2026-01-20',0.5)).allowed,true);
 assert.equal((await b('2026-01-20',1)).allowed,false);
 assert.equal((await b('2026-02-02',0.5)).allowed,false);
});
test('HR activates and updates internship dates without a programme field',async()=>{
 const hash='scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128),sessionHash='b'.repeat(64);
 await q("INSERT INTO tbs_dashboard_accounts(username,role,password_hash) VALUES('date-hr','hr',$1)",[hash]);
 const account=(await q("SELECT * FROM tbs_dashboard_accounts WHERE username='date-hr'"))[0];
 const rpc=async(fn,p)=>(await q(`SELECT ${fn}($1::jsonb) r`,[JSON.stringify(p)]))[0].r;
 await rpc('tbs_dashboard_auth',{operation:'login-finish',id:account.id,version:account.version,sessionHash});
 assert.equal((await rpc('tbs_registration',{action:'submit',accountId:'new-date-intern',firstName:'Test',lastName:'Intern',department:'AI',employmentType:'intern'})).pending,true);
 const activated=await rpc('tbs_registration',{action:'activate',sessionHash,userId:'new-date-intern',startDate:'2026-11-01',endDate:'2026-11-30'});
 assert.equal(activated.ok,true,JSON.stringify(activated));
 const saved=await rpc('tbs_policy_admin',{action:'save',sessionHash,userId:'new-date-intern',startDate:'2026-11-01',endDate:'2026-12-31'});
 assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.equal(Number((await q("SELECT months FROM tbs_intern_terms WHERE user_id='new-date-intern'"))[0].months),2);
 assert.equal((await rpc('tbs_registration',{action:'activate',userId:'new-date-intern',startDate:'2026-11-01',endDate:'2026-12-31'})).statusCode,401);
});
test.after(()=>db.close());
