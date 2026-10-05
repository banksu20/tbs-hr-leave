// Offline fixtures from the real PostgreSQL formatters and queue. No external calls.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
const db=new PGlite();
const testSource=readFileSync('tests/employee-cancellation.test.mjs','utf8');
await db.exec(testSource.match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql','011_employee_cancellation.sql','012_line_cancellation.sql','013_leave_result_flex.sql','014_cancellation_result_cards.sql','015_delivery_reliability.sql'])await db.exec(readFileSync('n8n/sql/'+file,'utf8'));
await db.exec("INSERT INTO tbs_employees(user_id,first_name,last_name,status) VALUES('demo','Demo','Employee','active')");
const row={id:1081,user_id:'demo',user_name:'Demo Employee',status:'Approved',leave_type:'annual',leave_days:2,selected_dates:'2026-10-15,2026-10-16',start_date:'2026-10-15',end_date:'2026-10-16'};
const cards=[];
for(const status of ['Approved','Rejected','Cancelled']){
 const card=(await db.query('SELECT tbs_leave_result_flex($1::jsonb) card',[JSON.stringify({...row,status:status==='Cancelled'?'Rejected':status,decision_kind:status==='Cancelled'?'cancel':null,rejection_reason:status==='Rejected'?'Please choose different dates.':null})])).rows[0].card;
 cards.push({scenario:status==='Approved'?'Leave approved':status==='Cancelled'?'Leave cancelled by dashboard':'Leave rejected',recipient:'Employee',...card});
}
for(const [event,dates,note,label] of [
 ['cancel',['2026-10-15','2026-10-16'],'','Pending leave cancelled immediately'],
 ['request',['2026-10-15'],'Personal plans changed.','Cancellation request received'],
 ['approve',['2026-10-15','2026-10-16'],'Approved.','Full cancellation approved'],
 ['approve',['2026-10-15'],'Approved.','Partial cancellation approved'],
 ['reject',['2026-10-15'],'Please keep the original leave.','Cancellation declined'],
 ['expired',['2026-10-15'],'Leave details changed.','Cancellation expired']]){
 const card=(await db.query('SELECT tbs_cancellation_result_flex($1::jsonb,$2,$3::date[],$4) card',[JSON.stringify({...row,status:event==='cancel'?'Pending':'Approved'}),event,dates,note])).rows[0].card;
 cards.push({scenario:label,recipient:event==='expired'?'Employee + previously notified CEO':'Employee',...card});
}
await db.exec("UPDATE tbs_cancellation_line_settings SET enabled=true,ceo_account_id='demo-ceo'; INSERT INTO leave_requests(id,user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,status) VALUES(1081,'demo','Demo Employee','annual',2,'2026-10-15','2026-10-16','2026-10-15,2026-10-16','Approved'); INSERT INTO tbs_cancellation_requests(request_id,user_id,account_user_id,dates,request_revision,reason) SELECT id,user_id,user_id,ARRAY['2026-10-15'::date],md5(to_jsonb(r)::text),'Personal plans changed.' FROM leave_requests r WHERE id=1081");
const approval=(await db.query("SELECT tbs_approval_message(r,'[\"demo-ceo\"]'::jsonb)->'messages'->0 card FROM leave_requests r WHERE id=1081")).rows[0].card;
for(const b of approval.contents.footer.contents)b.action={type:'uri',label:b.action.label,uri:'https://example.invalid/preview-only'};
cards.unshift({scenario:'New leave request for approval',recipient:'Configured approvers (including CEO)',...approval});
const boss=(await db.query("SELECT payload->'messages'->0 card FROM tbs_sync_jobs WHERE kind='line'")).rows[0].card;
// Gallery controls are disabled; never include actionable decision links.
for(const b of boss.contents.footer.contents)b.action.uri='https://example.invalid/preview-only';
cards.push({scenario:'Boss receives cancellation request',recipient:'CEO',...boss});
writeFileSync('scripts/previews/flex-fixtures.json',JSON.stringify(cards,null,2)+'\n');
await db.close();
