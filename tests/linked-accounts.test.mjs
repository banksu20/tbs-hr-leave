import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const sql=name=>readFileSync('n8n/sql/'+name,'utf8');
test('merge preserves real leave and main quotas; both LINE accounts share identity without test history',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`CREATE TABLE tbs_employees(user_id text PRIMARY KEY,tbs_id int,first_name text,last_name text,nickname text,department text,status text,start_date date);
 CREATE TABLE leave_quotas(user_id text,year int,annual_total numeric,sick_total numeric,personal_total numeric,carried_over numeric,note text,updated_at timestamptz,UNIQUE(user_id,year));
 CREATE TABLE leave_requests(id serial PRIMARY KEY,user_id text,user_name text,department text,leave_type text,leave_days numeric,start_date date,end_date date,selected_dates text,reason text,status text,source text);
 INSERT INTO tbs_employees VALUES('primary',30,'Intuon','Suphannarat','Alice','Sale','active','2026-06-22'),('second',33,'Intuon','Suphannarat','Alice','Sale','active',NULL);
 INSERT INTO leave_quotas VALUES('primary',2026,3,NULL,3,0,'',now()),('second',2026,0,NULL,3,0,'',now());`);
 for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql','009_linked_employee_accounts.sql'])await db.exec(sql(file));
 await db.exec(`INSERT INTO leave_requests(id,user_id,user_name,department,leave_type,leave_days,start_date,end_date,selected_dates,reason,status,source) VALUES
 (216,'primary','Alice','Sale','sick',1,'2026-07-14','2026-07-14','2026-07-14','Original','Approved','line'),
 (1063,'second','Alice','Sale','sick',1,'2026-09-24','2026-09-24','2026-09-24','Genuine','Approved','line');
 INSERT INTO leave_requests(id,user_id,user_name,department,leave_type,leave_days,start_date,end_date,selected_dates,reason,status,source)
 SELECT id,'second','Alice','Sale','annual',1,'2026-12-30','2026-12-30','2026-12-30','TEST','Rejected','dashboard' FROM unnest(ARRAY[1054,1059,1060,1061]) id;`);
 const before=(await db.query("SELECT to_jsonb(q) value FROM leave_quotas q WHERE user_id='primary'")).rows[0].value;
 await db.exec(sql('010_merge_alice_accounts.sql'));
 await db.exec(sql('010_merge_alice_accounts.sql')); // safe to repeat
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_account_merge_archive")).rows[0].n,1);
 assert.deepEqual((await db.query("SELECT to_jsonb(q) value FROM leave_quotas q WHERE user_id='primary'")).rows[0].value,before);
 assert.deepEqual((await db.query("SELECT tbs_resolve_employee('primary') a,tbs_resolve_employee('second') b")).rows[0],{a:'primary',b:'primary'});
 assert.equal((await db.query("SELECT count(*)::int n FROM leave_requests WHERE user_id=tbs_resolve_employee('second')")).rows[0].n,2);
 assert.equal((await db.query("SELECT count(*)::int n FROM leave_requests WHERE user_id='second' AND status='Rejected'")).rows[0].n,4);
 assert.equal((await db.query("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'")).rows[0].n,0);
 assert.equal((await db.query("SELECT account_user_id FROM tbs_request_accounts WHERE request_id=1063")).rows[0].account_user_id,'second');
 await assert.rejects(db.exec("UPDATE leave_quotas SET annual_total=99 WHERE user_id='second'"),/linked/);
 await assert.rejects(db.exec("UPDATE tbs_employees SET status='active' WHERE user_id='second'"),/linked/);
 await assert.rejects(db.exec("UPDATE leave_requests SET status='Approved' WHERE id=1054"),/linked|Overlapping/);
 const body={userId:'second',selectedDates:['2026-10-01'],leaveType:'personal',leaveDays:1,reason:'Test',approverIds:['manager']};
 const created=(await db.query("SELECT tbs_employee_request($1::jsonb) result",[JSON.stringify(body)])).rows[0].result;
 assert.equal(created.ok,true);assert.equal(created.user_id,'primary');
 const duplicate=(await db.query("SELECT tbs_employee_request($1::jsonb) result",[JSON.stringify({...body,userId:'primary'})])).rows[0].result;
 assert.equal(duplicate.statusCode,409);
 await db.query("UPDATE leave_requests SET status='Approved' WHERE id=$1",[created.id]);
 const messages=(await db.query("SELECT payload FROM tbs_sync_jobs WHERE kind='line' ORDER BY created_at")).rows.map(r=>r.payload);
 assert.equal(messages.at(-1).to,'second');
 assert.deepEqual(messages[0].to,['manager']);
 } finally {await db.close();}
});

test('workflow patch routes profile, history and requests through canonical identity and is repeatable',async()=>{
 const {patchLinkedAccounts}=await import('../scripts/patch-linked-accounts.mjs');
 const original={nodes:[
 {name:'Get quota',type:'n8n-nodes-base.postgres',typeVersion:2.7,credentials:{postgres:{id:'example',name:'Database'}},parameters:{query:'WHERE q.user_id=$1 AND q.year=$2'}},
 {name:'Get History from DB1',parameters:{query:'SELECT * FROM leave_requests WHERE user_id = $1'}},
 {name:'Find Name from UserID (History)',parameters:{filtersUI:{values:[{lookupColumn:'UserID',lookupValue:'old'}]}}},
 {name:'Get all leaves',parameters:{query:'old'}}
 ],connections:{Untouched:{main:[[{node:'Other',type:'main',index:0}]]}}};
 const patched=patchLinkedAccounts(original),again=patchLinkedAccounts(patched);
 assert.deepEqual(patched,again);
 assert.deepEqual(patched.connections.Untouched,original.connections.Untouched);
 assert.equal(patched.connections['Main Webhook'].main[0][0].node,'Resolve submitting account');
 assert.equal(patched.connections['Check User API'].main[0][0].node,'Resolve profile account');
 assert.equal(patched.connections['Webhook get history'].main[0][0].node,'Resolve history account');
 const node=name=>patched.nodes.find(n=>n.name===name);
 assert.match(node('Resolve submitting account').parameters.query,/submittedBy/);
 assert.match(node('Get quota').parameters.query,/tbs_resolve_employee/);
 assert.match(node('Get all leaves').parameters.query,/WHERE NOT EXISTS.*tbs_employee_accounts/);
 assert.match(node('Find Name from UserID (History)').parameters.filtersUI.values[0].lookupValue,/Resolve history account/);
 assert.deepEqual(node('Resolve submitting account').credentials,original.nodes[0].credentials);
});
