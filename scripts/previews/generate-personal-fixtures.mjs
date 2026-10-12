import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const source=readFileSync('tests/leave-policy.test.mjs','utf8');
const files=source.match(/const files=\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
for(const f of files)await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
await db.exec(`INSERT INTO tbs_calendar_years(year) VALUES(2026) ON CONFLICT DO NOTHING;
INSERT INTO tbs_employees(user_id,first_name,last_name,status) VALUES('demo','Demo','Employee','active');
INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total) VALUES('demo',2026,10,30,3);
INSERT INTO leave_requests(user_id,user_name,leave_type,leave_days,start_date,end_date,selected_dates,status,reason) VALUES('demo','Demo Employee','personal',2,'2026-09-01','2026-09-02','2026-09-01,2026-09-02','Approved','Sample appointment');`);
const cards={};for(const language of ['en','th']){
await db.query("INSERT INTO tbs_sick_language(user_id,language) VALUES('demo',$1) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language",[language]);
cards[language]=(await db.query("SELECT tbs_personal_card('demo',2026,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-10-12') card")).rows[0].card;
}
writeFileSync('scripts/previews/personal-fixtures.json',JSON.stringify(cards,null,2));await db.close();
