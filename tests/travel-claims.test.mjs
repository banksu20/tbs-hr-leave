import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-7]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const S='U'+'5'.repeat(32),O='U'+'6'.repeat(32);
const office={lat:13.7563,lng:100.5018};
const img=Buffer.from('fake-receipt-image').toString('base64');
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,nickname,department,status,employment_type) VALUES($1,71,'Somchai','Som','Sale','active','employee'),($2,72,'Orn','Orn','Account','active','employee')",[S,O]);

test('claims stay closed until HR sets the office pin and only Sales can start',async()=>{
 let st=await emp('travel-state',{accountId:S});
 assert.equal(st.eligible,true);assert.equal(st.configured,false);
 assert.equal((await emp('travel-start',{accountId:S})).statusCode,409);
 assert.equal((await emp('travel-state',{accountId:O})).eligible,false);
 assert.equal((await dash('travel-settings',{},'z')).statusCode,401);
 assert.equal((await dash('travel-settings-save',{officeLat:200,officeLng:1})).statusCode,422);
 const saved=await dash('travel-settings-save',{officeLat:office.lat,officeLng:office.lng,accountingEmail:'Acc@Example.com',rate:7});
 assert.equal(saved.settings.accountingEmail,'acc@example.com');
 assert.equal(saved.people.find(p=>p.id===S).eligible,true);
 assert.equal((await emp('travel-start',{accountId:O,purpose:'deal',mode:'car',startFrom:'office',clientName:'X',destLat:13.8,destLng:100.6,appointment:'14:00'})).statusCode,403);
 const access=await dash('travel-access-save',{userId:O,allowed:true});
 assert.equal(access.people.find(p=>p.id===O).eligible,true);
 await dash('travel-access-save',{userId:O,allowed:null});
 assert.equal((await emp('travel-state',{accountId:O})).eligible,false);
});

test('an office trip records legs, receipts and goes straight to accounting',async()=>{
 assert.equal((await emp('travel-start',{accountId:S,purpose:'deal',mode:'car',startFrom:'home',clientName:'ACME',destLat:13.8,destLng:100.6,appointment:'14:00',lat:13.7,lng:100.4})).statusCode,422);
 let st=await emp('travel-start',{accountId:S,purpose:'deal',dealRef:'D-1',mode:'car',startFrom:'office',clientName:'ACME',destLat:13.8,destLng:100.6,appointment:'14:00'});
 assert.equal(st.trip.status,'open');
 assert.equal((await emp('travel-start',{accountId:S,purpose:'care',mode:'car',startFrom:'office',clientName:'B',destLat:1,destLng:1,appointment:'15:00'})).statusCode,409);
 const trip=st.trip,start=trip.points[0];
 assert.equal(start.kind,'start_office');
 const ago=()=>q("UPDATE tbs_trip_points SET recorded_at=recorded_at-interval '1 hour' WHERE trip_id=$1",[trip.id]);
 await ago();
 assert.equal((await emp('travel-return',{accountId:S,tripId:trip.id,prevPointId:start.id,lat:office.lat,lng:office.lng,km:12})).statusCode,409);
 assert.equal((await emp('travel-arrive',{accountId:S,tripId:trip.id,stopId:trip.stops[0].id,prevPointId:start.id+99,lat:13.8,lng:100.6,km:12})).statusCode,409);
 st=await emp('travel-arrive',{accountId:S,tripId:trip.id,stopId:trip.stops[0].id,prevPointId:start.id,lat:13.8001,lng:100.6001,accuracy:15,km:12.345});
 assert.equal(Number(st.trip.km),12.35);assert.equal(Number(st.trip.kmAmount),86.45);
 const arrive=st.trip.points.at(-1);
 await ago();
 assert.equal((await emp('travel-return',{accountId:S,tripId:trip.id,prevPointId:arrive.id,lat:13.9,lng:100.9,km:12})).statusCode,422);
 st=await emp('travel-return',{accountId:S,tripId:trip.id,prevPointId:arrive.id,lat:office.lat+0.0005,lng:office.lng,accuracy:10,km:11});
 assert.equal(Number(st.trip.km),23.35);
 assert.equal((await emp('travel-receipt-add',{accountId:S,tripId:trip.id,kind:'toll',mime:'image/png',content:img,amount:'abc'})).statusCode,422);
 st=await emp('travel-receipt-add',{accountId:S,tripId:trip.id,kind:'toll',mime:'image/png',content:img,amount:'50',readAmount:'50'});
 st=await emp('travel-receipt-add',{accountId:S,tripId:trip.id,kind:'parking',mime:'image/jpeg',content:Buffer.from('fake-parking-image').toString('base64'),amount:'40',readAmount:'30'});
 const [toll,park]=st.trip.receipts;
 assert.equal(toll.edited,false);assert.equal(park.edited,true);assert.equal(park.needsOriginal,true);
 assert.equal((await emp('travel-receipt-image',{accountId:O,receiptId:toll.id})).statusCode,404);
 assert.equal((await emp('travel-receipt-image',{accountId:S,receiptId:toll.id})).content,img);
 const before=(await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n;
 st=await emp('travel-submit',{accountId:S,tripId:trip.id});
 assert.equal(st.submitted.status,'submitted');assert.deepEqual(st.submitted.flags,[]);
 assert.equal(Number(st.submitted.total),163.45+90);
 assert.equal(st.trip,null);
 const job=(await q("SELECT payload,completed_generation<generation open FROM tbs_sync_jobs WHERE kind='line' ORDER BY delivery_order DESC LIMIT 1"))[0];
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n,before+1);
 assert.equal(job.open,true,'trip notice passes the LINE allowlist');
 assert.match(job.payload.messages[0].altText,/^Travel claim/);
 assert.equal((await emp('travel-submit',{accountId:S,tripId:trip.id})).statusCode,409);
});

test('home start is capped at the office distance and odd trips are flagged for review',async()=>{
 let st=await emp('travel-start',{accountId:S,purpose:'care',mode:'car',startFrom:'home',clientName:'Far Client',destLat:14.5,destLng:100.6,appointment:'09:00',lat:13.6,lng:100.3,accuracy:250});
 const trip=st.trip,start=trip.points[0];
 assert.equal(start.kind,'start_home');
 assert.equal((await emp('travel-arrive',{accountId:S,tripId:trip.id,stopId:trip.stops[0].id,prevPointId:start.id,lat:14.5,lng:100.6,km:30})).statusCode,422);
 st=await emp('travel-arrive',{accountId:S,tripId:trip.id,stopId:trip.stops[0].id,prevPointId:start.id,lat:14.3,lng:100.6,km:30,officeKm:20});
 assert.equal(Number(st.trip.km),20);assert.equal(st.trip.legs[0].capped,true);
 st=await emp('travel-submit',{accountId:S,tripId:trip.id});
 assert.equal(st.submitted.status,'flagged');
 assert.ok(st.submitted.flags.includes('gps_weak'));assert.ok(st.submitted.flags.includes('far_from_client'));assert.ok(st.submitted.flags.includes('too_fast'));
 assert.equal((await dash('travel-mark',{id:trip.id,action:'paid'})).statusCode,409);
 const list=await dash('travel-trips',{status:'flagged'});
 assert.deepEqual(list.trips.map(t=>t.id),[trip.id]);
 const d=await dash('travel-decide',{id:trip.id,action:'approve',note:'Checked with client'});
 assert.equal(d.trip.status,'approved');assert.equal(d.trip.decidedBy,'hr');
 assert.equal((await dash('travel-decide',{id:trip.id,action:'reject'})).statusCode,409);
 const audit=await q("SELECT action FROM tbs_dashboard_account_audit ORDER BY id");
 assert.ok(audit.some(r=>r.action==='travel-approve')&&audit.some(r=>r.action==='travel-settings-save'));
});

test('daily run closes forgotten trips and emails accounting with working review links',async()=>{
 const st=await emp('travel-start',{accountId:S,purpose:'deal',mode:'grab',startFrom:'office',clientName:'Late',destLat:13.76,destLng:100.51,appointment:'16:00'});
 await q("UPDATE tbs_trips SET trip_date=trip_date-1 WHERE id=$1",[st.trip.id]);
 await q("UPDATE tbs_trips SET submitted_at=submitted_at-interval '1 day',decided_at=decided_at-interval '1 day' WHERE status IN ('submitted','approved')");
 await q("UPDATE tbs_trip_receipts SET created_at=created_at-interval '8 days'");
 const n=(await q('SELECT tbs_travel_daily(true) n'))[0].n;
 assert.equal(n,2);
 const closed=(await q('SELECT status,auto_closed,flags FROM tbs_trips WHERE id=$1',[st.trip.id]))[0];
 assert.equal(closed.auto_closed,true);assert.equal(closed.status,'flagged');assert.ok(closed.flags.includes('no_checkin'));
 const mail=(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='email' ORDER BY delivery_order DESC LIMIT 1"))[0].payload;
 assert.equal(mail.to,'acc@example.com');assert.match(mail.subject,/253\.45|THB/);
 const reminder=(await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line' AND payload#>>'{messages,0,type}'='text' AND payload::text LIKE '%paper receipt%' AND completed_generation<generation"))[0].n;
 assert.equal(reminder,1);
 assert.equal((await q('SELECT tbs_travel_daily(false) n'))[0].n,0);
 const link=mail.html.match(/travel-review\?id=(\d+)&(?:amp;)?t=([0-9a-f-]{36})/);
 assert.ok(link);
 assert.equal((await emp('travel-review',{id:link[1],token:'0'.repeat(8)+'-0000-4000-8000-000000000000',action:'review'})).statusCode,404);
 let r=await emp('travel-review',{id:link[1],token:link[2],action:'review'});
 assert.equal(r.ok,true);assert.ok(r.trip.employee.includes('Som'));
 r=await emp('travel-review',{id:link[1],token:link[2],action:'received'});
 assert.equal(r.trip.originalsWaiting,0);
 r=await emp('travel-review',{id:link[1],token:link[2],action:'paid'});
 assert.equal(r.trip.status,'paid');
 assert.equal((await emp('travel-review',{id:link[1],token:link[2],action:'paid'})).statusCode,409);
});

test('the delivery loop runs the daily job once and a failure never blocks LINE',async()=>{
 await q("UPDATE tbs_travel_settings SET last_daily_date=NULL");

 await q("ALTER TABLE tbs_travel_settings RENAME COLUMN accounting_email TO accounting_email_x");
 await q("UPDATE tbs_travel_settings SET last_daily_date=NULL");
 await q("SELECT * FROM tbs_claim_line_batch('line')");
 await q("ALTER TABLE tbs_travel_settings RENAME COLUMN accounting_email_x TO accounting_email");
});

test('earlier operations still route and leave the 12-function limit intact',async()=>{
 const read=f=>readFileSync(f,'utf8');
 assert.match(JSON.parse(read('vercel.json')).routes[0].src,/\|travel\|travel-review\|attendance\)/);
 assert.match(read('api/[policy].ts'),/travel,'travel-review':travelReview/);
 assert.match(read('vite-api-plugin.ts'),/'travel','travel-review'/);
 assert.match(read('src/App.tsx'),/path="\/travel"/);
 assert.match(read('api/_handlers/travel.ts'),/verifyLineIdentity/);
 assert.doesNotMatch(read('n8n/sql/076_travel_claims.sql'),/@gmail\.com/);
 assert.equal((await dash('session')).session.username,'hr');
 assert.equal((await emp('sop-list',{accountId:S})).ok,true);
 assert.ok(readdirSync('api').filter(f=>/\.ts$/.test(f)).length<=12);
});

test('receipt checks flag non-receipts, wrong day or time, reuse and wrong type, but not clean receipts',async()=>{
 const [{today,now,late,yesterday}]=await q("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') today,to_char(now() AT TIME ZONE 'Asia/Bangkok','HH24:MI') now,to_char((now() AT TIME ZONE 'Asia/Bangkok')-interval '5 hours','HH24:MI') late,to_char((now() AT TIME ZONE 'Asia/Bangkok')::date-1,'YYYY-MM-DD') yesterday");
 const pic=s=>Buffer.from('receipt-'+s).toString('base64');
 const run=async receipts=>{
  let st=await emp('travel-start',{accountId:S,purpose:'deal',mode:'car',startFrom:'office',clientName:'Check Co',destLat:13.8,destLng:100.6,appointment:'14:00'});
  const t=st.trip;
  await q("UPDATE tbs_trip_points SET recorded_at=recorded_at-interval '1 hour' WHERE trip_id=$1",[t.id]);
  st=await emp('travel-arrive',{accountId:S,tripId:t.id,stopId:t.stops[0].id,prevPointId:t.points[0].id,lat:13.8,lng:100.6,accuracy:10,km:3});
  for(const r of receipts)st=await emp('travel-receipt-add',{accountId:S,tripId:t.id,mime:'image/jpeg',amount:'50',readAmount:'50',readIsReceipt:'true',readDate:today,readTime:now,...r});
  const receipts_=st.trip.receipts;
  return {receipts:receipts_,done:(await emp('travel-submit',{accountId:S,tripId:t.id})).submitted};
 };
 const clean=await run([{kind:'toll',content:pic('clean-1'),readKind:'toll',readRef:'C-1',readMerchant:'Plaza 1'},{kind:'parking',content:pic('clean-2'),readKind:'parking'}]);
 assert.deepEqual(clean.done.flags,[]);assert.equal(clean.receipts[0].readRef,'C-1');assert.equal(clean.receipts[0].readTime,now);
 const bad=await run([
  {kind:'toll',content:pic('cat'),readIsReceipt:'false'},
  {kind:'toll',content:pic('old'),readDate:yesterday},
  {kind:'parking',content:pic('late'),readTime:late},
  {kind:'toll',content:pic('clean-1'),readRef:'C-9'},
  {kind:'toll',content:pic('copy'),readRef:'C-1',readKind:'toll'},
  {kind:'grab',content:pic('grab'),readKind:'grab'},
 ]);
 for(const f of ['receipt_not_receipt','receipt_date','receipt_time','receipt_duplicate','receipt_kind'])assert.ok(bad.done.flags.includes(f),f);
 assert.equal(bad.done.status,'flagged');
 assert.equal(bad.receipts[0].readIsReceipt,false);assert.equal(bad.receipts[3].duplicate,true);assert.equal(bad.receipts[4].duplicate,true);
 assert.equal(bad.receipts[2].wrongTime,true);assert.equal(bad.receipts[5].wrongKind,true);
});
