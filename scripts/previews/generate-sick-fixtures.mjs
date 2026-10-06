import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql','011_employee_cancellation.sql','012_line_cancellation.sql','013_leave_result_flex.sql','014_cancellation_result_cards.sql','015_delivery_reliability.sql','016_sick_notifications.sql','018_sick_acknowledgements.sql'])await db.exec(readFileSync('n8n/sql/'+file,'utf8'));
const cards=[];
for(const threshold of [5,10,20,25,30])for(const audience of [false,...([10,30].includes(threshold)?[true]:[])])for(const language of audience?['en']:['en','th']){
 const card=(await db.query("SELECT tbs_sick_ack_card(tbs_sick_flex($1::jsonb,$2,$3,2026,$4,'2026-10-06'::date,$5),'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',$5='th' AND NOT $4) card",[JSON.stringify({name:'Demo Employee',code:99,department:'Web Developer'}),threshold,threshold,audience,language])).rows[0].card;
 cards.push({threshold,audience:audience?'CEO':'Employee',language,...card});
}
writeFileSync('scripts/previews/sick-fixtures.json',JSON.stringify(cards,null,2)+'\n');await db.close();
