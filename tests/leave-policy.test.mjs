import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import loadTS from './load-ts.cjs';

const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=['001_request_safety','002_history_and_conflicts','003_year_rollover','004_line_decisions','005_sync_outbox','006_employee_submission','007_sheet_employee_links','008_quota_safety','009_linked_employee_accounts','011_employee_cancellation','012_line_cancellation','013_leave_result_flex','014_cancellation_result_cards','015_delivery_reliability','016_sick_notifications','017_paid_sick_rollover','018_sick_acknowledgements','019_ceo_sick_notices','020_retire_sheet_sync','023_dashboard_accounts','021_leave_policy','022_personal_notifications','024_intern_policy','025_registration','026_policy_delivery','027_company_calendar','028_intern_personal_notices','029_evidence_guards','030_bilingual_calendar','031_confirm_2026_holidays','032_review_labels'];
for(const f of files)await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const submit=async(body)=> (await query('SELECT tbs_employee_request($1::jsonb) r',[JSON.stringify({userId:'employee',leaveType:'personal',selectedDates:['2099-10-01'],leaveDays:1,reason:'Appointment',approverIds:['boss'],...body})]))[0].r;
const add=async({type='personal',days=1,dates='2099-10-01',status='Approved',uid='employee',reason='Appointment',period=null}={})=>(await query(`INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,status,reason,half_day_period) VALUES($1,'Employee',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[uid,type,days,dates.split(',')[0],dates.split(',').at(-1),dates,status,reason,period]))[0];
const decide=async(row,operation='approve')=>(await query('SELECT tbs_dashboard_request_v2($1,$2::jsonb) r',[operation,JSON.stringify({id:row.id,expectedRevision:(await query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[row.id]))[0].revision})]))[0].r;
test.beforeEach(async()=>{
 await db.exec("INSERT INTO tbs_calendar_years(year) SELECT generate_series(2000,2100) ON CONFLICT DO NOTHING");
 await db.exec(`TRUNCATE leave_requests RESTART IDENTITY CASCADE; DELETE FROM tbs_personal_alerts; DELETE FROM tbs_sync_jobs; DELETE FROM tbs_sick_alerts; DELETE FROM tbs_sick_milestones; DELETE FROM leave_quotas; DELETE FROM tbs_work_calendar; UPDATE tbs_leave_policy_settings SET personal_notifications_enabled=false,last_personal_date=NULL; UPDATE tbs_sick_notification_settings SET enabled=false;
 INSERT INTO tbs_employees(user_id,tbs_id,first_name,status) VALUES('employee',5,'Employee','active'),('unlimited',0,'Dan','active') ON CONFLICT DO NOTHING;
 INSERT INTO tbs_leave_exemptions VALUES('unlimited') ON CONFLICT DO NOTHING;
 INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('employee',2099,10,30,3,0),('employee',2100,10,30,3,0);`);
});
test('migration can be reapplied without replacing originals or enabling notices',async()=>{
 for(const f of ['021_leave_policy','022_personal_notifications','024_intern_policy','025_registration','026_policy_delivery','027_company_calendar','028_intern_personal_notices','029_evidence_guards','030_bilingual_calendar','031_confirm_2026_holidays','032_review_labels'])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
 assert.equal((await query('SELECT personal_notifications_enabled e FROM tbs_leave_policy_settings'))[0].e,false);
});
test('all employee leave types reject blank/space-only reasons before inserts or messages',async()=>{
 for(const leaveType of ['personal','vacation','sick'])for(const reason of ['', ' \n\t ',null])assert.equal((await submit({leaveType,reason})).ok,false);
 assert.equal((await query('SELECT count(*)::int n FROM leave_requests'))[0].n,0);
 assert.equal((await query('SELECT count(*)::int n FROM tbs_sync_jobs'))[0].n,0);
});
test('personal approved and pending days reserve three days; cancellation releases reservation',async()=>{
 await add({days:2,dates:'2099-09-01,2099-09-02'});
 const r=await submit({});assert.equal(r.ok,true);
 assert.equal((await submit({selectedDates:['2099-10-02']})).statusCode,409);
 await query("UPDATE leave_requests SET status='Rejected' WHERE id=$1",[r.id]);
 assert.equal((await submit({selectedDates:['2099-10-02']})).ok,true);
});
test('fractional personal days count by duration, not requests',async()=>{
 await add({days:.5,period:'morning',dates:'2099-09-01'});await add({days:.5,period:'morning',dates:'2099-09-02'});
 const b=(await query("SELECT tbs_leave_balance('employee',2099,'personal') b"))[0].b;
 assert.equal(b.approved,1);assert.equal(b.available,2);
});
test('approval revalidates changed quota and excludes its own reservation',async()=>{
 const r=await submit({leaveType:'annual',leaveDays:2,selectedDates:['2099-10-01','2099-10-02']});assert.equal(r.ok,true);
 await query("UPDATE leave_quotas SET annual_total=1 WHERE user_id='employee' AND year=2099");
 assert.equal((await decide(r)).statusCode,409);
 assert.equal((await query('SELECT status FROM leave_requests WHERE id=$1',[r.id]))[0].status,'Pending');
 await query("UPDATE leave_quotas SET annual_total=2 WHERE user_id='employee' AND year=2099");assert.equal((await decide(r)).ok,true);
});
test('LINE approval shares quota guard and stale revision checks',async()=>{
 const r=await submit({leaveType:'annual'});await query("UPDATE leave_quotas SET annual_total=0 WHERE user_id='employee' AND year=2099");
 const result=(await query("SELECT tbs_line_decision('approve',$1::jsonb) r",[JSON.stringify({id:r.id,userId:r.user_id,decisionToken:r.decision_token,expectedRevision:(await query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[r.id]))[0].revision})]))[0].r;
 assert.equal(result.statusCode,409);
});
test('cross-year request checks each year and rolls back all if a quota is missing',async()=>{
 await query("DELETE FROM leave_quotas WHERE year=2100");
 assert.equal((await submit({leaveType:'annual',selectedDates:['2099-12-31','2100-01-04'],leaveDays:2})).statusCode,409);
 assert.equal((await query('SELECT count(*)::int n FROM leave_requests'))[0].n,0);
});
test('carryover cannot fund dates after expiry',async()=>{
 await query("UPDATE leave_quotas SET annual_total=0,carried_over=2,carryover_expires_on='2099-03-31' WHERE year=2099");
 assert.equal((await submit({leaveType:'annual'})).ok,false);
 assert.equal((await submit({leaveType:'annual',selectedDates:['2099-03-01']})).ok,true);
});
test('16:30 Bangkok annual cutoff is strict and late sick needs an emergency',async()=>{
 assert.equal((await submit({selectedDates:['2020-01-01']})).statusCode,422);
 assert.equal((await submit({leaveType:'sick',selectedDates:['2020-01-01'],emergencyReason:'Unexpected illness'})).ok,true);
 const cutoff=(await query("SELECT tbs_leave_deadline('2026-10-12') d"))[0].d;assert.equal(new Date(cutoff).toISOString(),'2026-10-11T09:30:00.000Z');
});
test('unlimited employees need no quota row and sick remains requestable above thirty',async()=>{
 assert.equal((await submit({userId:'unlimited',leaveDays:4,selectedDates:['2099-10-01','2099-10-02','2099-10-03','2099-10-04']})).ok,true);
 await add({type:'sick',days:31,dates:Array.from({length:31},(_,i)=>'2099-01-'+String(i+1).padStart(2,'0')).join(',')});
 assert.equal((await submit({leaveType:'sick'})).ok,true);
 assert.equal((await query("SELECT tbs_check_sick_employee('unlimited') n"))[0].n,0);
});
test('medical reminder joins separate half-day requests across weekends/holiday and ignores rejected leave',async()=>{
 // 2026-10-09 Friday, Monday 12, Tuesday 13.
 await add({type:'sick',days:.5,period:'morning',dates:'2026-10-09'});await add({type:'sick',days:.5,period:'morning',dates:'2026-10-12',status:'Pending'});
 assert.equal((await query("SELECT tbs_medical_certificate('employee',ARRAY['2026-10-13'::date],0.5) r"))[0].r,true);
 await query("UPDATE leave_requests SET status='Rejected' WHERE selected_dates='2026-10-12'");
 assert.equal((await query("SELECT tbs_medical_certificate('employee',ARRAY['2026-10-13'::date],0.5) r"))[0].r,false);
 await query("INSERT INTO tbs_work_calendar VALUES('2026-10-12',false,'Company holiday')");
 await add({type:'sick',days:.5,period:'morning',dates:'2026-10-13'});
 assert.equal((await submit({leaveType:'sick',selectedDates:['2026-10-14'],leaveDays:.5,halfDayPeriod:'afternoon'})).medicalCertificateRequired,true);
});
test('personal notice crosses two days once, waits for 08:30, shows live balance and supports safe acknowledgement',async()=>{
 await add({days:1.5,dates:'2099-01-01,2099-01-02,2099-01-03',period:'morning'});
 await query('UPDATE tbs_leave_policy_settings SET personal_notifications_enabled=true');
 assert.equal((await query("SELECT tbs_run_personal_daily('2099-01-04T01:30:00Z') n"))[0].n,0);
 await add({dates:'2099-01-04'});
 assert.equal((await query("SELECT tbs_run_personal_daily('2099-01-05T01:29:59Z') n"))[0].n,0);
 assert.equal((await query("SELECT tbs_run_personal_daily('2099-01-05T01:30:00Z') n"))[0].n,1);
 assert.equal((await query("SELECT tbs_run_personal_daily('2099-01-06T01:30:00Z') n"))[0].n,0);
 const a=(await query('SELECT * FROM tbs_personal_alerts'))[0];const card=(await query('SELECT payload FROM tbs_sync_jobs WHERE id=$1',[a.job_id]))[0].payload;
 assert.match(JSON.stringify(card),/2.5 of 3/);assert.match(JSON.stringify(card),/0.5 day/);
 const ack=async(accountId,operation='sick-acknowledge')=>(await query('SELECT tbs_sick_acknowledge($1,$2::jsonb) r',[operation,JSON.stringify({id:a.id,token:a.token,accountId})]))[0].r;
 assert.equal((await ack('other')).statusCode,403);assert.equal((await ack('employee')).acknowledged,true);assert.equal((await ack('employee')).acknowledged,true);
});
test.after(()=>db.close());

test('changed request revision refuses the older approval without changing status',async()=>{
 const r=await submit({leaveType:'annual'});
 await query("UPDATE leave_requests SET reason='Changed details' WHERE id=$1",[r.id]);
 const result=(await query("SELECT tbs_dashboard_request_v2('approve',$1::jsonb) r",[JSON.stringify({id:r.id,expectedRevision:r.revision})]))[0].r;
 assert.equal(result.statusCode,409);
 assert.equal((await query('SELECT status FROM leave_requests WHERE id=$1',[r.id]))[0].status,'Pending');
});
test('partial cancellation can reduce an approved request after allowance is lowered',async()=>{
 const r=await add({type:'annual',days:2,dates:'2099-10-01,2099-10-02'});
 await query("UPDATE leave_quotas SET annual_total=0 WHERE year=2099");
 await query("UPDATE leave_requests SET leave_days=1,selected_dates='2099-10-01',end_date='2099-10-01' WHERE id=$1",[r.id]);
 assert.equal(Number((await query('SELECT leave_days FROM leave_requests WHERE id=$1',[r.id]))[0].leave_days),1);
});
test('preview rejects malformed and duplicate dates and offers an annual alternative',async()=>{
 for(const payload of [{},{type:'personal',dates:['2099-10-01','2099-10-01'],daysPerDate:1},{type:'personal',dates:[],daysPerDate:null}])assert.equal((await query('SELECT tbs_leave_policy_preview($1::jsonb) r',[JSON.stringify({accountId:'employee',...payload})]))[0].r.statusCode,422);
 await add({days:3,dates:'2099-09-01,2099-09-02,2099-09-03'});
 const p=(await query('SELECT tbs_leave_policy_preview($1::jsonb) r',[JSON.stringify({accountId:'employee',type:'personal',dates:['2099-10-01'],daysPerDate:1})]))[0].r;
 assert.equal(p.balances[0].allowed,false);assert.equal(p.annualBalances[0].allowed,true);
});
test('medical reminder queues a Flex card only for the requesting employee',async()=>{
 const r=await submit({leaveType:'sick',selectedDates:['2099-10-05','2099-10-06','2099-10-07'],leaveDays:3});
 assert.equal(r.ok,true);assert.equal(r.medicalCertificateRequired,true);
 const cards=await query("SELECT payload FROM tbs_sync_jobs WHERE payload->'messages'->0->>'altText'='Medical certificate reminder'");
 assert.equal(cards.length,1);assert.equal(cards[0].payload.to,'employee');assert.equal(cards[0].payload.messages[0].type,'flex');
});
test('quota edits cannot silently replace the standard personal allowance',async()=>{
 const r=(await query("SELECT tbs_update_quota($1::jsonb) r",[JSON.stringify({userId:'employee',year:2099,personalTotal:4,expectedRevision:(await query("SELECT md5(to_jsonb(q)::text) rev FROM leave_quotas q WHERE user_id='employee' AND year=2099"))[0].rev})]))[0].r;
 assert.equal(r.ok,false);
 assert.equal(Number((await query("SELECT personal_total FROM leave_quotas WHERE user_id='employee' AND year=2099"))[0].personal_total),3);
});

test('undelivered personal notice retires after correction; acknowledgement prevents requeue',async()=>{
 const today=(await query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') d"))[0].d;
 const year=Number(today.slice(0,4));
 await query("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total) VALUES('employee',$1,10,30,3)",[year]);
 const r=await add({days:2,dates:`${year}-01-01,${year}-01-02`});
 await query('UPDATE tbs_leave_policy_settings SET personal_notifications_enabled=true');
 assert.equal((await query('SELECT tbs_run_personal_daily($1::timestamptz) n',[today+'T08:30:00+07:00']))[0].n,1);
 const a=(await query('SELECT * FROM tbs_personal_alerts'))[0];
 await query("UPDATE leave_requests SET status='Rejected' WHERE id=$1",[r.id]);
 await query('SELECT tbs_refresh_sick_jobs()');
 assert.equal((await query('SELECT tbs_sick_job_allowed($1) allowed',[a.job_id]))[0].allowed,false);
 assert.ok((await query('SELECT retired_at FROM tbs_personal_alerts'))[0].retired_at);
 await query("UPDATE leave_requests SET status='Approved' WHERE id=$1",[r.id]);
 await query('UPDATE tbs_leave_policy_settings SET last_personal_date=NULL');
 assert.equal((await query('SELECT tbs_run_personal_daily($1::timestamptz) n',[today+'T08:30:00+07:00']))[0].n,1);
 await query("SELECT tbs_sick_acknowledge('sick-acknowledge',$1::jsonb)",[JSON.stringify({id:a.id,token:a.token,accountId:'employee'})]);
 await query('UPDATE tbs_leave_policy_settings SET last_personal_date=NULL');
 assert.equal((await query('SELECT tbs_run_personal_daily($1::timestamptz) n',[today+'T08:30:00+07:00']))[0].n,0);
});

test('new deadline calendar: sick same morning, personal working day, annual calendar days',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_work_calendar(day,working,note) VALUES('2099-10-02',false,'Company holiday')");
 const d=async(uid,kind,date)=>(await query("SELECT to_char(tbs_policy_deadline($1,$2,$3::date) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI') d",[uid,kind,date]))[0].d;
 assert.equal(await d('employee','sick','2099-10-05'),'2099-10-05 08:30');
 assert.equal(await d('employee','annual','2099-10-05'),'2099-10-04 16:30');
 assert.equal(await d('intern','annual','2099-10-05'),'2099-10-02 16:30');
 assert.equal(await d('employee','personal','2099-10-05'),'2099-10-01 16:30');
});
test('late sick and personal require emergency explanation; annual has no exception',async()=>{
 for(const leaveType of ['sick','personal']){
  assert.equal((await submit({leaveType,selectedDates:['2001-02-05']})).statusCode,422);
 }
 assert.equal((await submit({leaveType:'sick',selectedDates:['2001-02-05'],emergencyReason:'Unexpected illness'})).ok,true);
 assert.equal((await submit({leaveType:'annual',selectedDates:['2001-02-06'],emergencyReason:'Late'})).statusCode,422);
});
test('intern reservations span years and route only to Nam',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,months=4");
 const r=await submit({userId:'intern',leaveType:'annual',selectedDates:['2099-12-31','2100-01-01'],leaveDays:2});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal((await submit({userId:'intern',leaveType:'annual',selectedDates:['2100-01-02']})).statusCode,409);
 const jobs=await query("SELECT payload FROM tbs_sync_jobs WHERE user_id='intern' AND kind='line'");
 assert.deepEqual(jobs[0].payload.to,['U437d78a035fce09cd623650fb6c3fc97']);
 assert.equal((await decide(r)).ok,true);
});
test('intern university activity requires owned evidence and survives normalization',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT DO NOTHING");
 assert.equal((await submit({userId:'intern',leaveType:'university'})).statusCode,422);
 const f=(await query("INSERT INTO tbs_leave_evidence(user_id,filename,mime,content) VALUES('intern','proof.pdf','application/pdf',decode('JVBERi0=','base64')) RETURNING id"))[0];
 const r=await submit({userId:'intern',leaveType:'university',evidenceIds:[f.id]});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal((await query('SELECT request_id FROM tbs_leave_evidence WHERE id=$1',[f.id]))[0].request_id,r.id);
 assert.equal((await submit({userId:'employee',leaveType:'university',selectedDates:['2099-10-02'],evidenceIds:[f.id]})).ok,false);
});

async function session(role){
 const username=role==='admin'?'admin':role+'-policy';const hash='scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128);
 await query("INSERT INTO tbs_dashboard_accounts(username,role,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING",[username,role,hash]);
 const account=(await query('SELECT * FROM tbs_dashboard_accounts WHERE username=$1',[username]))[0];
 const sessionHash={admin:'a',hr:'b',ceo:'c'}[role].repeat(64);
 await query("SELECT tbs_dashboard_auth($1::jsonb)",[JSON.stringify({operation:'login-finish',id:account.id,version:account.version,sessionHash})]);return sessionHash;
}
const rpc=async(fn,payload)=>(await query(`SELECT ${fn}($1::jsonb) r`,[JSON.stringify(payload)]))[0].r;
test('registration stays pending; HR can activate interns but not full-time; codes are unique',async()=>{
 const hr=await session('hr'),admin=await session('admin');
 for(const [accountId,employmentType] of [['reg-intern','intern'],['reg-staff','employee']]){
  await query('DELETE FROM tbs_registrations WHERE user_id=$1',[accountId]);
  const r=await rpc('tbs_registration',{action:'submit',accountId,firstName:'Sample',lastName:'Person',nickname:'Demo',department:'AI',employmentType});assert.equal(r.pending,true);
  assert.equal((await query('SELECT count(*)::int n FROM tbs_employees WHERE user_id=$1',[accountId]))[0].n,0);
 }
 assert.deepEqual((await rpc('tbs_registration',{action:'list',sessionHash:hr})).registrations.map(r=>r.user_id),['reg-intern']);
 assert.equal((await rpc('tbs_registration',{action:'activate',sessionHash:hr,userId:'reg-staff',annualTotal:7})).statusCode,403);
 assert.equal((await rpc('tbs_registration',{action:'activate',sessionHash:hr,userId:'reg-intern',months:6,startDate:'2099-10-01',endDate:'2100-03-31'})).ok,true);
 assert.equal((await rpc('tbs_registration',{action:'activate',sessionHash:admin,userId:'reg-staff',annualTotal:7})).ok,true);
 assert.equal((await rpc('tbs_registration',{action:'status',accountId:'reg-intern'})).found,true);
 assert.equal((await rpc('tbs_registration',{action:'submit',accountId:'reg-intern',employmentType:'employee'})).found,true);
 assert.equal((await query("SELECT employment_type FROM tbs_employees WHERE user_id='reg-intern'"))[0].employment_type,'intern');
 const n=(await query("SELECT intern_number FROM tbs_employees WHERE user_id='reg-intern'"))[0].intern_number;assert.ok(n>0);
 assert.equal((await rpc('tbs_registration',{action:'activate',sessionHash:hr,userId:'reg-intern',months:4,startDate:'2001-01-01',endDate:'2001-05-01'})).ok,true);
 assert.equal((await query("SELECT months FROM tbs_intern_terms WHERE user_id='reg-intern'"))[0].months,6);
});
test('Nam alone can use intern LINE decision; dashboard HR retains scoped approval',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT DO NOTHING");
 const r=await submit({userId:'intern',leaveType:'personal'});assert.equal(r.ok,true);
 const body={id:r.id,token:r.decision_token,revision:r.revision,action:'review'};
 assert.equal((await rpc('tbs_intern_decision',{...body,accountId:'not-Nam'})).statusCode,403);
 assert.equal((await rpc('tbs_intern_decision',{...body,accountId:'U437d78a035fce09cd623650fb6c3fc97'})).ok,true);
 assert.equal((await rpc('tbs_intern_decision',{...body,action:'approve',accountId:'U437d78a035fce09cd623650fb6c3fc97'})).ok,true);
 assert.equal((await rpc('tbs_intern_decision',{...body,action:'approve',accountId:'U437d78a035fce09cd623650fb6c3fc97'})).statusCode,409);
});
test('evidence is private to its employee and scoped reviewers; HR cannot download full-time evidence',async()=>{
 const hr=await session('hr'),ceo=await session('ceo');
 const r=await add({type:'sick'});
 const f=await rpc('tbs_evidence',{action:'upload',accountId:'employee',requestId:r.id,filename:'medical.pdf',mime:'application/pdf',content:'JVBERi0='});assert.equal(f.ok,true);
 assert.equal((await rpc('tbs_evidence',{action:'download',sessionHash:hr,id:f.id})).statusCode,403);
 assert.equal((await rpc('tbs_evidence',{action:'download',sessionHash:ceo,id:f.id})).content,'JVBERi0=');
 assert.equal((await rpc('tbs_evidence',{action:'download',accountId:'unlimited',id:f.id})).statusCode,403);
 assert.equal((await rpc('tbs_evidence',{action:'download',accountId:'employee',id:f.id})).ok,true);
});
test('company calendar requires a session, prevents stale saves, and drives personal deadlines',async()=>{
 const hr=await session('hr');const before=await rpc('tbs_company_calendar',{year:2099,action:'read'});
 const p={year:2099,action:'save',revision:before.revision,holidays:[{date:'2099-10-02',name:'Company holiday'}]};
 assert.equal((await rpc('tbs_company_calendar',p)).statusCode,401);
 assert.equal((await rpc('tbs_company_calendar',{...p,sessionHash:hr})).confirmed,true);
 assert.equal((await rpc('tbs_company_calendar',{...p,sessionHash:hr})).statusCode,409);
 const read=await rpc('tbs_company_calendar',{year:2099,action:'read'});assert.equal(read.holidays[0].name,'Company holiday');
 const d=(await query("SELECT to_char(tbs_policy_deadline('employee','personal','2099-10-05') AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD HH24:MI') d"))[0].d;assert.equal(d,'2099-10-01 16:30');
});
test('unknown company calendar fails closed instead of silently ignoring holidays',async()=>{
 await query('DELETE FROM tbs_calendar_years WHERE year=2099');
 const r=await rpc('tbs_leave_policy_preview',{accountId:'employee',type:'personal',dates:['2099-10-05'],daysPerDate:1});assert.equal(r.statusCode,409);assert.match(r.error,/holiday calendar/);
});
test('intern personal reminder is once for the entire internship, including a new year',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,months=4");
 await add({uid:'intern',dates:'2099-10-01,2099-10-02',days:2});await query('UPDATE tbs_leave_policy_settings SET personal_notifications_enabled=true,last_personal_date=NULL');
 assert.equal((await query("SELECT tbs_run_personal_daily('2099-10-03 08:30+07') n"))[0].n,1);
 assert.equal((await query("SELECT tbs_run_personal_daily('2100-01-03 08:30+07') n"))[0].n,0);
 const job=(await query("SELECT payload FROM tbs_sync_jobs WHERE user_id='intern' AND kind='line'"))[0].payload;assert.equal(job.to,'intern');assert.match(JSON.stringify(job),/during your internship/);
});
test('server handlers join registration, HR activation, verified intern submission and decision without live calls',async()=>{
 const hr=await session('hr');const id='integration-intern';
 const mock=loadTS({
  '../_lib/lineIdentity.js':{verifyLineIdentity:async auth=>{if(!auth?.startsWith('Bearer '))throw Error('Unauthorized');return auth.slice(7);}},
  '../_lib/dashboardAuth.js':{dashboardSession:async()=>({role:'hr'}),tokenHash:()=>hr,sameOrigin:()=>true},
  '../_lib/n8nClient.js':{n8nPost:async(_endpoint,{operation,payload})=>{const fn={'registration':'tbs_registration','employee-submit':'tbs_employee_request','intern-decision':'tbs_intern_decision'}[operation];assert.ok(fn);const r=await rpc(fn,payload);if(!r.ok){const e=Error(r.error);e.status=r.statusCode;throw e;}return r;}}
 });
 async function api(file,method,body,identity=id){let output;const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){output=JSON.parse(v);return this;}};await mock(file).default({method,query:{},headers:{authorization:'Bearer '+identity},body},res);return {status:res.statusCode,body:output};}
 const reg=await api('api/_handlers/registration.ts','POST',{firstName:'Integration',lastName:'Intern',nickname:'Test',department:'AI',employmentType:'intern',accountId:'spoof'});assert.equal(reg.body.pending,true);
 const activated=await api('api/_handlers/registration.ts','PATCH',{userId:id,months:4,startDate:'2099-10-01',endDate:'2100-01-31'});assert.equal(activated.status,200);
 const submitted=await api('api/_handlers/employee-request.ts','POST',{userId:'victim',leaveType:'annual',selectedDates:['2099-10-15'],leaveDays:1,reason:'Family trip'});assert.equal(submitted.status,200,JSON.stringify(submitted));assert.equal(submitted.body.user_id,id);
 const row=submitted.body,body={id:row.id,token:row.decision_token,revision:row.revision,action:'approve'};
 assert.equal((await api('api/_handlers/intern-decision.ts','POST',body,'someone-else')).status,403);
 assert.equal((await api('api/_handlers/intern-decision.ts','POST',body,'U437d78a035fce09cd623650fb6c3fc97')).status,200);
 assert.equal((await query('SELECT status FROM leave_requests WHERE id=$1',[row.id]))[0].status,'Approved');
 const jobs=await query("SELECT payload FROM tbs_sync_jobs WHERE user_id=$1 AND kind='line'",[id]);assert.ok(jobs.length>=2);assert.ok(jobs.every(j=>j.payload.messages.every(m=>m.type==='flex')));
});
test('intern quota endpoint reports whole-term usage instead of full-time annual quotas',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,months=4");
 await add({uid:'intern',type:'annual',dates:'2099-12-30'});
 const r=(await query(readFileSync('n8n/sql/get-quota-policy.sql','utf8'),['intern',2100]))[0];
 assert.equal(r.policyConfigured,true);assert.equal(r.annualTotal,2);assert.equal(r.annualTaken,1);assert.equal(r.remainingDays,1);
});

test('university evidence guard covers dashboard creation, edits and approval',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT DO NOTHING");
 await assert.rejects(add({uid:'intern',type:'university'}),/supporting evidence/);
 const r=await add({uid:'intern',type:'sick',status:'Pending'});
 await assert.rejects(query("UPDATE leave_requests SET leave_type='university' WHERE id=$1",[r.id]),/supporting evidence/);
 assert.equal((await query('SELECT leave_type FROM leave_requests WHERE id=$1',[r.id]))[0].leave_type,'sick');
});
test('attached medical certificate prevents redundant reminder; later upload removes unsent reminder',async()=>{
 const f=(await query("INSERT INTO tbs_leave_evidence(user_id,filename,mime,content) VALUES('employee','medical.pdf','application/pdf',decode('JVBERi0=','base64')) RETURNING id"))[0];
 const r=await submit({leaveType:'sick',selectedDates:['2099-10-05','2099-10-06','2099-10-07'],leaveDays:3,evidenceIds:[f.id]});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal((await query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE payload->'messages'->0->>'altText'='Medical certificate reminder'"))[0].n,0);
 const r2=await submit({leaveType:'sick',selectedDates:['2099-10-12','2099-10-13','2099-10-14'],leaveDays:3});assert.equal(r2.ok,true);
 assert.equal((await query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE payload->>'medicalRequestId'=$1",[String(r2.id)]))[0].n,1);
 await query("INSERT INTO tbs_leave_evidence(user_id,request_id,filename,mime,content) VALUES('employee',$1,'medical.pdf','application/pdf',decode('JVBERi0=','base64'))",[r2.id]);
 assert.equal((await query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE payload->>'medicalRequestId'=$1",[String(r2.id)]))[0].n,0);
});

test('intern cancellation routes to Nam only, rejects CEO LINE identity and keeps full-time data private to HR',async()=>{
 await query("INSERT INTO tbs_employees(user_id,tbs_id,status,employment_type) VALUES('intern',90,'active','intern') ON CONFLICT(user_id) DO UPDATE SET employment_type='intern'");
 await query("INSERT INTO tbs_intern_terms VALUES('intern','2099-10-01','2100-01-31',4) ON CONFLICT DO NOTHING");
 await query("UPDATE tbs_cancellation_line_settings SET enabled=true,ceo_account_id='ceo-line'");
 const r=await submit({userId:'intern',leaveType:'annual',selectedDates:['2099-10-20','2099-10-21'],leaveDays:2});assert.equal(r.ok,true);assert.equal((await decide(r)).ok,true);
 const revision=(await query('SELECT md5(to_jsonb(r)::text) v FROM leave_requests r WHERE id=$1',[r.id]))[0].v;
 const c=(await query("SELECT tbs_cancellation('request',$1::jsonb) r",[JSON.stringify({id:r.id,revision,dates:['2099-10-20'],accountId:'intern'})]))[0].r;assert.equal(c.ok,true,JSON.stringify(c));
 const m=(await query('SELECT * FROM tbs_cancellation_line_messages WHERE cancellation_id=$1',[c.id]))[0];assert.equal(m.approver_id,'U437d78a035fce09cd623650fb6c3fc97');
 const line=async accountId=>(await query("SELECT tbs_line_cancellation('line-approve',$1::jsonb) r",[JSON.stringify({id:c.id,token:m.decision_token,accountId})]))[0].r;
 assert.equal((await line('ceo-line')).ok,false);assert.equal((await line(m.approver_id)).ok,true);
 assert.equal(Number((await query('SELECT leave_days FROM leave_requests WHERE id=$1',[r.id]))[0].leave_days),1);
 const hr=await session('hr'); const fulltime=await add();
 const forbidden=await rpc('tbs_dashboard_auth',{sessionHash:hr,operation:'leave-update',body:{id:fulltime.id,action:'reject'}});assert.equal(forbidden.ok,false);
});
test('calendar keeps English and Thai names and includes only the approved national entries',async()=>{
 const hr=await session('hr');const prior=await rpc('tbs_company_calendar',{action:'read',year:2026});
 const saved=await rpc('tbs_company_calendar',{action:'save',year:2026,revision:prior.revision,sessionHash:hr,holidays:[{date:'2026-10-23',name:'Chulalongkorn Day',localName:'วันปิยมหาราช'}]});assert.equal(saved.ok,true);assert.equal(saved.holidays[0].name,'Chulalongkorn Day');assert.equal(saved.holidays[0].localName,'วันปิยมหาราช');
 await query('DELETE FROM tbs_calendar_years WHERE year=2026');await query("DELETE FROM tbs_work_calendar WHERE extract(year FROM day)=2026");
 await db.exec(readFileSync('n8n/sql/031_confirm_2026_holidays.sql','utf8'));
 const seeded=await rpc('tbs_company_calendar',{action:'read',year:2026});assert.equal(seeded.confirmed,true);assert.equal(seeded.holidays.length,20);assert.equal(seeded.holidays.some(h=>h.date==='2026-10-16'),false);
});
