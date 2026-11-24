import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-7]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={})=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:'a'.repeat(64),body})]))[0].r;
const A='U'+'3'.repeat(32),B='U'+'4'.repeat(32);
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,department,status,employment_type) VALUES($1,91,'Kanya','Kan','Sale','active','employee'),($2,92,'Lek','Lek','Sale','active','employee'),('no-line',93,'Mana','Ma','Sale','active','employee')",[A,B]);
const trip=async(user,date,status,client,receipts=[])=>{
 const id=(await q("INSERT INTO tbs_trips(user_id,trip_date,purpose,mode,start_from,rate,status) VALUES($1,$2,'care','car','office',7,$3) RETURNING id",[user,date,status]))[0].id;
 await q("INSERT INTO tbs_trip_stops(trip_id,seq,client_name,lat,lng) VALUES($1,1,$2,13.7,100.5)",[id,client]);
 for(const [amount,paper] of receipts)await q("INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,amount,needs_original) VALUES($1,'toll','image/png',$2,$3,$4)",[id,Buffer.from(`n-${id}-${amount}-${Math.random()}`),amount,paper]);
 return id;
};
const sent=async(user)=>(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='line' AND user_id=$1 ORDER BY delivery_order",[user])).map(r=>r.payload.messages[0].text);
const wanted=async()=>(await q("SELECT bool_and(tbs_line_job_wanted(payload)) ok FROM tbs_sync_jobs WHERE kind='line'"))[0].ok;

test('approving or rejecting a flagged trip tells only its owner',async()=>{
 const ok=await trip(A,'2026-11-10','flagged','ACME',[[80,false]]);
 const no=await trip(A,'2026-11-11','flagged','Beta Co');
 await dash('travel-decide',{id:ok,action:'approve'});
 await dash('travel-decide',{id:no,action:'reject',note:'Personal trip'});
 const m=await sent(A);
 assert.equal(m.length,2);
 assert.match(m[0],/^Travel claim \/ เบิกค่าเดินทาง: อนุมัติแล้ว \/ Approved\nACME · 10\/11\/2026\n80(\.00)? บาท/);
 assert.match(m[1],/ไม่อนุมัติ \/ Not approved\nBeta Co · 11\/11\/2026\nเหตุผล \/ Reason: Personal trip/);
 assert.equal((await sent(B)).length,0);
 assert.equal(await wanted(),true);
});

test('paying several trips sends one total per person',async()=>{
 const a1=await trip(A,'2026-10-03','submitted','One',[[100,false]]);
 await trip(A,'2026-10-04','approved','Two',[[50,false]]);
 await trip(B,'2026-10-05','submitted','Three',[[60,false]]);
 await trip('no-line','2026-10-06','submitted','Four',[[70,false]]);
 const before=(await sent(A)).length;
 const r=await dash('travel-payout-paid',{month:'2026-10'});
 assert.equal(r.marked,4);
 const a=(await sent(A)).slice(before),b=await sent(B);
 assert.equal(a.length,1);
 assert.match(a[0],/จ่ายแล้ว \/ Paid 150(\.00)? บาท \/ THB \(2 ทริป \/ trips\)\nOne · 03\/10\/2026 · 100(\.00)? บาท\nTwo · 04\/10\/2026 · 50(\.00)? บาท/);
 assert.equal(b.length,1);assert.match(b[0],/Paid 60/);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE user_id='no-line'"))[0].n,0);
 await q("UPDATE tbs_trips SET decision_note='x' WHERE id=$1",[a1]);
 assert.equal((await sent(A)).length,before+1);
});

test('paper receipts received are confirmed with what is still missing',async()=>{
 const t=await trip(B,'2026-11-12','submitted','Gamma',[[30,true],[40,true]]);
 const before=(await sent(B)).length;
 const id=(await q('SELECT id FROM tbs_trip_receipts WHERE trip_id=$1 ORDER BY amount LIMIT 1',[t]))[0].id;
 await q('UPDATE tbs_trip_receipts SET original_received_at=now() WHERE id=$1',[id]);
 await dash('travel-mark',{id:t,action:'received'});
 await dash('travel-mark',{id:t,action:'received'});
 const m=(await sent(B)).slice(before);
 assert.equal(m.length,2);
 assert.match(m[0],/Paper receipts received \(1\)\nGamma · 12\/11\/2026\nยังขาดอีก 1 ใบ \/ 1 still missing/);
 assert.match(m[1],/Paper receipts received \(1\)\nGamma · 12\/11\/2026$/);
 await dash('travel-mark',{id:t,action:'paid'});
 assert.match((await sent(B)).at(-1),/Paid 70(\.00)? บาท \/ THB\nGamma/);
 assert.equal(await wanted(),true);
});
