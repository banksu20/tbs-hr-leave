import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const S='U'+'a'.repeat(32),ACC='U'+'b'.repeat(32);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type) VALUES($1,97,'Somchai','Jaidee','Som','Sale','active','employee'),($2,98,'Da','Homsuwan','Da','Account','active','employee')",[S,ACC]);
const trip=async(fields)=>{
 const id=(await q("INSERT INTO tbs_trips(user_id,trip_date,purpose,deal_ref,mode,start_from,rate,status) VALUES($1,'2026-11-24',$2,$3,$4,'office',7,'open') RETURNING id",[S,fields.purpose,fields.dealRef??null,fields.mode]))[0].id;
 await q("INSERT INTO tbs_trip_stops(trip_id,seq,client_name,lat,lng) VALUES($1,1,'Central World',13.74,100.53)",[id]);
 await q("INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,amount,needs_original) VALUES($1,'toll','image/png',$2,50,true)",[id,Buffer.from('card-'+id)]);
 return id;
};
const cards=async()=>(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='line' AND user_id=$1 ORDER BY delivery_order",[ACC])).map(r=>r.payload);

test('no card is sent until someone is chosen as the accountant on LINE',async()=>{
 const id=await trip({purpose:'care',mode:'car'});
 await q('SELECT tbs_trip_finish($1,false)',[id]);
 assert.equal((await cards()).length,0);
});

test('a finished client trip sends the accountant one card with the details',async()=>{
 await q('UPDATE tbs_travel_settings SET payout_notify_user=$1',[ACC]);
 const id=await trip({purpose:'deal',dealRef:'QT-2026-118',mode:'car'});
 await q('SELECT tbs_trip_finish($1,false)',[id]);
 await q('SELECT tbs_trip_finish($1,false)',[id]);
 const all=await cards();
 assert.equal(all.length,1);
 const card=all[0],msg=card.messages[0],text=JSON.stringify(msg.contents);
 assert.equal(card.to,ACC);
 assert.equal(msg.type,'flex');
 assert.match(msg.altText,/^Travel claim \/ เบิกค่าเดินทาง: พบลูกค้า \/ Client meeting · Som · Somchai Jaidee · 50(\.00)? THB$/);
 for(const part of ['Sale · 24/11/2026','Central World','Close a deal · QT-2026-118','Own car','Paper receipts due','Waiting for HR check','No check-in at the client'])assert.ok(text.includes(part),part);
 assert.match(msg.contents.footer.contents[0].action.uri,new RegExp(`/ceo\\?view=travel&trip=${id}$`));
 assert.equal((await q('SELECT tbs_line_job_wanted($1::jsonb) w',[JSON.stringify(card)]))[0].w,true);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line' AND user_id=$1",[S]))[0].n,2);
});

test('trips closed at midnight and later status changes are handled once',async()=>{
 const before=(await cards()).length;
 const id=await trip({purpose:'care',mode:'grab'});
 await q("UPDATE tbs_trips SET trip_date='2026-11-20' WHERE id=$1",[id]);
 await q('SELECT tbs_trip_finish($1,true)',[id]);
 const card=(await cards()).at(-1);
 assert.equal((await cards()).length,before+1);
 assert.ok(JSON.stringify(card).includes('Closed automatically at midnight'));
 assert.ok(JSON.stringify(card).includes('"Grab"'));
 await q("UPDATE tbs_trips SET status='approved' WHERE id=$1",[id]);
 await q("UPDATE tbs_trips SET status='paid' WHERE id=$1",[id]);
 assert.equal((await cards()).length,before+1);
});
