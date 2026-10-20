import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
for(const f of [...files,'050_date_based_intern_allowances','051_calendar_day_deadlines','051_calendar_day_deadlines'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
await db.exec("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern'),('employee',91,'active','employee'); INSERT INTO tbs_work_calendar(day,working,note) VALUES('2026-10-23',false,'Holiday') ON CONFLICT(day) DO UPDATE SET working=false;");
const deadline=async(uid,kind,date)=>(await q("SELECT to_char(tbs_policy_deadline($1,$2,$3::date) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI') d",[uid,kind,date]))[0].d;
test('calendar notice includes weekends, holidays and year boundaries for both employee types',async()=>{
 for(const uid of ['intern','employee'])for(const kind of ['personal','university']){
  assert.equal(await deadline(uid,kind,'2026-10-26'),'2026-10-25 16:30');
  assert.equal(await deadline(uid,kind,'2026-10-24'),'2026-10-23 16:30');
  assert.equal(await deadline(uid,kind,'2027-01-01'),'2026-12-31 16:30');
 }
 assert.equal(await deadline('intern','annual','2026-10-26'),'2026-10-23 16:30');
 assert.equal(await deadline('employee','annual','2026-10-26'),'2026-10-25 16:30');
 assert.equal(await deadline('intern','sick','2026-10-26'),'2026-10-26 08:30');
});
test('university cutoff is enforced by submission and preview, with no emergency bypass',async()=>{
 await db.exec("INSERT INTO tbs_intern_terms(user_id,start_date,end_date) VALUES('intern','2000-01-01','2100-12-31'); INSERT INTO tbs_calendar_years(year) SELECT generate_series(2000,2100) ON CONFLICT DO NOTHING;");
 const payload={userId:'intern',leaveType:'university',selectedDates:['2001-02-05'],leaveDays:1,reason:'University activity'};
 const submit=async(p)=>(await q('SELECT tbs_employee_request($1::jsonb) r',[JSON.stringify(p)]))[0].r;
 assert.equal((await submit(payload)).ok,false);
 assert.equal((await submit({...payload,emergencyReason:'Testing'})).ok,false);
 const r=(await q('SELECT tbs_leave_policy_preview($1::jsonb) r',[JSON.stringify({accountId:'intern',type:'university',dates:['2001-02-05'],daysPerDate:1})]))[0].r;
 assert.equal(r.late,true);assert.ok(r.deadline);
 const boundary=(await q("SELECT '2026-10-25 16:29:59+07'::timestamptz < tbs_policy_deadline('intern','university','2026-10-26') before, '2026-10-25 16:30:00+07'::timestamptz >= tbs_policy_deadline('intern','university','2026-10-26') at_cutoff"))[0];
 assert.equal(boundary.before,true);assert.equal(boundary.at_cutoff,true);
});

test.after(async()=>{await db.close();});
