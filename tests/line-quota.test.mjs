import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('boss','test','admin'),('hr','test','hr')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='boss'",['a'.repeat(64)]);
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['b'.repeat(64)]);
const U=n=>'U'+String(n).padStart(32,'0');
await q('ALTER TABLE leave_requests DISABLE TRIGGER USER');
const request=async(id,status='Pending')=>q("INSERT INTO leave_requests(id,user_id,leave_type,leave_days,start_date,end_date,selected_dates,status) VALUES($1,'x','annual',1,'2099-01-05','2099-01-05','2099-01-05',$2) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status",[id,status]);
const text=(to,t)=>({to,messages:[{type:'text',text:t}]});
const sop=to=>({to,messages:[{type:'flex',altText:'Company SOP updated / ระเบียบบริษัท: Leave',contents:{}}]});
const decision=to=>({to,messages:[{type:'flex',altText:'อนุมัติแล้ว / Approved',contents:{}}]});
const approval=(to,id)=>({to,messages:[{type:'flex',altText:'Leave request',contents:{action:{uri:'https://x/leave-decision?id='+id}}}]});
const add=async p=>(await q("INSERT INTO tbs_sync_jobs(kind,user_id,payload) VALUES('line',$1,$2::jsonb) RETURNING id",[Array.isArray(p.to)?p.to[0]:p.to,JSON.stringify(p)]))[0].id;
const report=(limit,used)=>q('SELECT tbs_line_quota_report($1::jsonb,$2::jsonb) r',[JSON.stringify(limit==null?{type:'none'}:{type:'limited',value:limit}),JSON.stringify({totalUsage:used})]).then(r=>r[0].r);
const claim=async()=>q("SELECT id,lease_token,generation,payload FROM tbs_claim_line_batch('line')");
const finish=(j,err=null)=>q('SELECT tbs_finish_sync($1::uuid,$2::uuid,$3::bigint,$4::text) s',[j.id,j.lease_token,j.generation,err]);
const sendAll=async()=>{const c=await claim();for(const j of c)await finish(j);return c;};
const pending=async()=>(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='line' AND retired_at IS NULL AND completed_generation<generation ORDER BY delivery_order")).map(r=>r.payload);
const reset=async()=>{await q("DELETE FROM tbs_sync_jobs");await q("DELETE FROM tbs_line_held");await q("DELETE FROM tbs_line_sends");await q("UPDATE tbs_line_quota SET full_month=NULL,warned_month=NULL,warned_level=0");await q("UPDATE tbs_email_fallback_settings SET line_full_until=NULL,recipients='[]'");};

test('counts sent LINE messages per recipient on top of what LINE reports',async()=>{
 await reset();
 let st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.state,'unknown');
 st=await report(300,100);
 assert.equal(st.state,'ok');assert.equal(st.used,100);assert.equal(st.limit,300);assert.equal(st.threshold,285);
 await add(decision(U(1)));await add({...decision(U(2)),to:[U(2),U(3),U(4)]});
 assert.equal((await sendAll()).length,2);
 assert.equal((await dash('delivery-status')).lineQuota.used,104);
 const [j]=await (async()=>{await add(decision(U(5)));return claim();})();
 await finish(j,'LINE delivery failed (500). Server error');
 assert.equal((await dash('delivery-status')).lineQuota.used,104);
 assert.equal((await report(300,104)).used,104);
});

test('near the limit, SOP and travel messages wait while leave messages still go',async()=>{
 await reset();
 await report(300,283);
 await add(sop(U(1)));await add(decision(U(2)));await add(text(U(3),'Travel claim / เบิกค่าเดินทาง: paid'));await add(sop(U(4)));
 assert.deepEqual((await sendAll()).map(j=>j.payload.to),[U(1),U(2)]);
 let st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.used,285);assert.equal(st.held,2);assert.equal(st.state,'low');
 assert.equal((await q("SELECT retirement_reason r FROM tbs_sync_jobs WHERE user_id=$1",[U(3)]))[0].r,'Held until the LINE monthly limit resets');
 await add(decision(U(6)));await add(sop(U(7)));
 assert.deepEqual((await sendAll()).map(j=>j.payload.to),[U(6)]);
 assert.equal((await dash('delivery-status')).lineQuota.held,3);
 assert.equal((await sendAll()).length,0);
 await report(1000,286);
 assert.deepEqual((await sendAll()).map(j=>j.payload.to),[U(3),U(4),U(7)]);
 st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.held,0);assert.equal(st.state,'ok');
 assert.equal((await q("SELECT count(*)::int n FROM tbs_line_held WHERE released_at IS NOT NULL"))[0].n,3);
});

test('when LINE is full, approvals go by email and everything else waits for the reset',async()=>{
 await reset();
 await q("UPDATE tbs_email_fallback_settings SET recipients='[{\"email\":\"boss@example.com\",\"name\":\"Boss\"}]'");
 await report(300,120);
 await add(decision(U(1)));
 const [j]=await claim();
 await finish(j,'LINE delivery failed (429). You have reached your monthly limit. Execution 9');
 let st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.state,'full');
 await request(777);await add(sop(U(2)));await add(approval(U(3),777));
 assert.equal((await claim()).length,0);
 st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.held,2);
 assert.deepEqual(await pending(),[]);
 const approvalJob=(await q("SELECT retirement_reason,last_error,completed_generation>=generation done FROM tbs_sync_jobs WHERE user_id=$1",[U(3)]))[0];
 assert.equal(approvalJob.retirement_reason,null);
 assert.equal((await q("SELECT priority FROM tbs_line_held ORDER BY id")).map(r=>r.priority).join(),'high,low');
 await report(300,120);
 const back=await sendAll();
 assert.deepEqual(back.map(j=>j.payload.to),[U(1),U(2)]);
 assert.equal((await dash('delivery-status')).lineQuota.held,0);
});

test('without approver emails, approvals also wait instead of failing for a day',async()=>{
 await reset();
 await report(300,300);
 await request(778);
 await add(approval(U(9),778));
 assert.equal((await claim()).length,0);
 assert.equal((await q("SELECT priority FROM tbs_line_held")).map(r=>r.priority).join(),'high');
 await report(500,300);
 assert.deepEqual((await sendAll()).map(j=>j.payload.to),[U(9)]);
});

test('one warning email per level each month, only to the saved address, and only admins can change it',async()=>{
 await reset();
 await q("DELETE FROM tbs_sync_jobs WHERE kind='email'");
 assert.equal((await dash('line-quota-save',{alertEmail:'x',warnPct:80,reservePct:5})).statusCode,422);
 assert.equal((await dash('line-quota-save',{alertEmail:'',warnPct:96,reservePct:5})).statusCode,422);
 assert.equal((await dash('line-quota-save',{alertEmail:'ok@example.com',warnPct:80,reservePct:5},'b')).statusCode,403);
 await report(300,250);await claim();
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='email'"))[0].n,0);
 const saved=await dash('line-quota-save',{alertEmail:' Ops@Example.com ',warnPct:80,reservePct:5});
 assert.equal(saved.lineQuota.alertEmail,'ops@example.com');
 await claim();await claim();
 let mails=(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='email' ORDER BY delivery_order")).map(r=>r.payload);
 assert.equal(mails.length,1);assert.equal(mails[0].to,'ops@example.com');assert.match(mails[0].subject,/83% used \(250 \/ 300\)/);
 await report(300,290);await claim();await claim();
 await report(300,300);await claim();
 mails=(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='email' ORDER BY delivery_order")).map(r=>r.payload);
 assert.equal(mails.length,3);assert.match(mails[1].subject,/almost used up/);assert.match(mails[2].subject,/used up/);
 assert.ok(mails[2].html.includes('by email'));
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n,0);
});

test('a failed LINE check is shown but keeps the last good numbers, and unlimited plans hold nothing',async()=>{
 await reset();
 await report(300,10);
 await q("SELECT tbs_line_quota_report($1::jsonb,$2::jsonb)",[JSON.stringify({message:'Authentication failed'}),JSON.stringify({})]);
 let st=(await dash('delivery-status')).lineQuota;
 assert.equal(st.checkError,'Authentication failed');assert.equal(st.limit,300);
 st=await report(null,5000);
 assert.equal(st.state,'unlimited');assert.equal(st.checkError,null);
 await add(sop(U(1)));
 assert.equal((await sendAll()).length,1);
});

test('an approval already sent by email or already decided never goes out on LINE',async()=>{
 await reset();
 await report(300,10);
 await request(801);await request(802,'Approved');await request(803);
 await q("INSERT INTO tbs_email_decision_links(request_id,recipient,recipient_name,token_hash,expires_at) VALUES(801,'boss@example.com','Boss',md5(random()::text),now()+interval '1 day')");
 await add(approval(U(1),801));await add(approval(U(2),802));await add(approval(U(3),803));
 assert.deepEqual((await sendAll()).map(j=>j.payload.to),[U(3)]);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE retirement_reason LIKE 'Not sent on LINE%'"))[0].n,2);
 await report(300,300);
 await request(804);await add(approval(U(4),804));
 assert.equal((await claim()).length,0);
 assert.equal((await dash('delivery-status')).lineQuota.held,1);
 await q("INSERT INTO tbs_email_decision_links(request_id,recipient,recipient_name,token_hash,expires_at) VALUES(804,'boss@example.com','Boss',md5(random()::text),now()+interval '1 day')");
 await report(300,10);
 assert.equal((await claim()).length,0);
 assert.equal((await dash('delivery-status')).lineQuota.held,0);
 assert.equal((await q("SELECT released_job FROM tbs_line_held WHERE payload::text LIKE '%id=804%'"))[0].released_job,null);
});
