import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const A='U'+'5'.repeat(32);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type) VALUES($1,91,'Mali','Moon','Mali','SEO','active','employee')",[A]);
await q('ALTER TABLE leave_requests DISABLE TRIGGER USER');
await q('ALTER TABLE leave_requests ENABLE TRIGGER zz_tbs_approved_leave_email');
const leave=(type,status,days=1,dates='2099-03-02')=>q("INSERT INTO leave_requests(user_id,user_name,department,leave_type,leave_days,start_date,end_date,selected_dates,reason,status,source) VALUES($1,'x','SEO',$2,$3,$4::date,$5::date,$6,'private reason',$7,'line') RETURNING id",[A,type,days,dates.split(',')[0],dates.split(',').at(-1),dates,status]).then(r=>r[0].id);
const mails=async()=>(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='email' ORDER BY delivery_order")).map(r=>r.payload);

test('nothing is emailed until recipients are saved',async()=>{
 const id=await leave('annual','Pending');
 await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[id]);
 assert.equal((await mails()).length,0);
});

test('each saved address gets one email when leave is approved, without the reason',async()=>{
 await q(`UPDATE tbs_approved_leave_email_settings SET recipients='["Boss@Example.com","team@example.com"," team@example.com ","not-an-email"]'`);
 const id=await leave('sick','Pending',2,'2099-03-02,2099-03-03');
 assert.equal((await mails()).length,0);
 await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[id]);
 let m=await mails();
 assert.deepEqual(m.map(x=>x.to),['boss@example.com','team@example.com']);
 assert.match(m[0].subject,/^Leave approved \/ อนุมัติการลา: Mali Moon \(Mali\) · 02 Mar – 03 Mar 2099$/);
 assert.ok(m[0].html.includes('Sick / ลาป่วย'));assert.ok(m[0].html.includes('2 day(s) / วัน'));assert.ok(m[0].html.includes('อนุมัติแล้ว / Approved'));
 assert.ok(!m[0].html.includes('private reason'));
 await q("UPDATE leave_requests SET status='Approved',leave_days=1 WHERE id=$1",[id]);
 await q("UPDATE leave_requests SET status='Cancelled' WHERE id=$1",[id]);
 await q("UPDATE leave_requests SET status='Approved' WHERE id=$1",[id]);
 assert.equal((await mails()).length,2);
 await leave('annual','Rejected');
 assert.equal((await mails()).length,2);
 await leave('personal','Approved',0.5);
 m=await mails();
 assert.equal(m.length,4);assert.ok(m[3].html.includes('0.5 day(s)'));
});

test('approval email uses the LINE card layout with single-use decision links',async()=>{
 const id=await leave('annual','Pending',3,'2099-04-06,2099-04-07,2099-04-08');
 await q("UPDATE leave_requests SET reason='<b>trip</b>' WHERE id=$1",[id]);
 const [{p}]=await q(`SELECT tbs_email_approval_payload(r,'{"email":"boss@example.com"}'::jsonb,'tok123',now()+interval '14 days') p FROM leave_requests r WHERE id=$1`,[id]);
 assert.equal(p.to,'boss@example.com');assert.equal(p.requestId,id);
 assert.equal(p.subject,'Leave approval needed / คำขอลารออนุมัติ: Mali Moon (Mali)');
 assert.ok(p.html.includes('คำขอลาใหม่ / New leave request'));assert.ok(p.html.includes('ลาพักร้อน / Annual · 3 วัน / days'));
 assert.ok(p.html.includes('/email-decision?id='+id+'&amp;t=tok123&amp;action=approve'));
 assert.ok(p.html.includes('&amp;t=tok123&amp;action=reject'));
 assert.ok(p.html.includes('&lt;b&gt;trip&lt;/b&gt;'));assert.ok(!p.html.includes('<b>trip'));
 assert.ok(p.html.includes('name="viewport"'));
});
