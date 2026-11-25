import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-8]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const L='U'+'1'.repeat(32),A='U'+'2'.repeat(32),B='U'+'3'.repeat(32),S='U'+'4'.repeat(32);
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr'),('acc','test','accounting')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='acc'",['e'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type) VALUES($1,81,'Lek','Lead','Lek','SEO','active','employee'),($2,82,'Anan','Ake','An','SEO','active','employee'),($3,83,'Boon','Bee','Bee','SEO','active','employee'),($4,84,'Somchai','Sale','Som','Sale','active','employee')",[L,A,B,S]);
await q('ALTER TABLE leave_requests DISABLE TRIGGER USER');
const today=(await q("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::date::text d"))[0].d;
const day=n=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const leave=(uid,type,start,status='Approved',days=1)=>q("INSERT INTO leave_requests(user_id,user_name,department,leave_type,leave_days,start_date,end_date,selected_dates,reason,status,source) VALUES($1,'x','SEO',$2,$3,$4::date,$4::date,$4::text,'private reason',$5,'line') RETURNING id",[uid,type,days,start,status]);
const mails=async()=>(await q("SELECT payload FROM tbs_sync_jobs WHERE kind='email' ORDER BY created_at,id")).map(r=>r.payload);
const run=async()=>{await q('UPDATE tbs_people_alert_settings SET last_run_date=NULL');return (await q('SELECT tbs_people_daily(true) r'))[0].r;};

test('alerts are off until HR turns them on, and accounting cannot see them',async()=>{
 await leave(A,'sick',day(-40));await leave(A,'sick',day(-20));await leave(A,'sick',day(-2));
 await leave(B,'annual',day(2));
 assert.deepEqual(await run(),{sick:0,leads:0});
 assert.equal((await mails()).length,0);
 const a=await dash('people-alerts');
 assert.equal(a.alerts.pcEmail,null);assert.equal(a.alerts.leadNotice,false);assert.equal(a.alerts.sickCount,3);
 assert.equal((await dash('people-alerts','{}','e')).statusCode,403);
 assert.equal((await dash('people-alerts-save',{pcEmail:'bad',sickCount:3,sickWindowDays:90,leadNotice:false,leadDaysAhead:3})).statusCode,422);
 assert.equal((await dash('people-alerts-save',{pcEmail:'pc@example.com',sickCount:1,sickWindowDays:90,leadNotice:false,leadDaysAhead:3})).statusCode,422);
});

test('frequent sick leave emails only the Head of P&C, once per window, without reasons',async()=>{
 const saved=await dash('people-alerts-save',{pcEmail:' PC@Example.com ',sickCount:3,sickWindowDays:90,leadNotice:false,leadDaysAhead:3});
 assert.equal(saved.ok,true);assert.equal(saved.alerts.pcEmail,'pc@example.com');
 await leave(B,'sick',day(-5));await leave(B,'sick',day(-200));await leave(B,'sick',day(-3),'Rejected');
 assert.deepEqual(await run(),{sick:1,leads:0});
 const [m]=await mails();
 assert.equal(m.to,'pc@example.com');
 assert.match(m.subject,/Frequent sick leave: 1 person/);
 assert.ok(m.html.includes('Anan Ake (An)'));assert.ok(!m.html.includes('Boon'));assert.ok(!m.html.includes('private reason'));
 assert.ok(m.html.includes('not a performance score'));
 assert.deepEqual(await run(),{sick:0,leads:0});
 assert.equal((await q("SELECT count(*)::int n FROM tbs_sync_jobs WHERE kind='line'"))[0].n,0);
});

test('team leads with a work email get one summary of approved leave coming up',async()=>{
 await q("DELETE FROM tbs_sync_jobs");
 assert.equal((await dash('hr-people-save',{userId:A,careerLevel:'operational',managerId:L,roles:[],workEmail:'x'})).statusCode,422);
 let r=await dash('hr-people-save',{userId:A,careerLevel:'operational',managerId:L,roles:[]});
 assert.equal(r.people.find(p=>p.id===A).managerId,L);
 await dash('hr-people-save',{userId:B,careerLevel:'operational',managerId:L,roles:[]});
 r=await dash('hr-people-save',{userId:L,careerLevel:'manager',managerId:'',roles:[],workEmail:'Lek@Example.com'});
 assert.equal(r.people.find(p=>p.id===L).workEmail,'lek@example.com');
 assert.equal((await dash('hr-people')).people.find(p=>p.id===L).workEmail,'lek@example.com');
 await leave(A,'personal',day(1));await leave(B,'annual',day(9));await leave(A,'annual',day(3),'Pending');
 assert.deepEqual(await run(),{sick:0,leads:0});
 const on=await dash('people-alerts-save',{pcEmail:'pc@example.com',sickCount:3,sickWindowDays:90,leadNotice:true,leadDaysAhead:3});
 assert.equal(on.alerts.leads,1);assert.equal(on.alerts.leadsWithEmail,1);
 assert.deepEqual(await run(),{sick:0,leads:1});
 const [m]=await mails();
 assert.equal(m.to,'lek@example.com');
 assert.match(m.subject,/Upcoming leave in your team/);
 assert.ok(m.html.includes('Anan Ake (An)'));assert.ok(m.html.includes('Boon Bee (Bee)'));
 assert.ok(m.html.includes('ลากิจ / Personal'));assert.ok(m.html.includes('ลาพักร้อน / Annual'));
 assert.ok(!m.html.includes('private reason'));
 assert.equal((m.html.match(/<tr>/g)||[]).length,2);
 assert.deepEqual(await run(),{sick:0,leads:0});
 r=await dash('hr-people-save',{userId:L,careerLevel:'manager',managerId:'',roles:[],workEmail:''});
 assert.equal(r.people.find(p=>p.id===L).workEmail,null);
 r=await dash('hr-people-save',{userId:A,careerLevel:'manager',managerId:L,roles:[]});
 assert.equal(r.people.find(p=>p.id===A).careerLevel,'manager');
});

test('motorcycle rate stays off until HR sets it, then pays per km',async()=>{
 await q("UPDATE tbs_travel_settings SET office_lat=13.7563,office_lng=100.5018");
 const start={accountId:S,purpose:'care',mode:'motorcycle',startFrom:'office',clientName:'ACME',destLat:13.8,destLng:100.6,appointment:'14:00'};
 assert.equal((await emp('travel-state',{accountId:S})).settings.motorcycleRate,null);
 assert.equal((await emp('travel-start',start)).statusCode,422);
 assert.equal((await dash('travel-settings-save',{motorcycleRate:0})).statusCode,422);
 let s=await dash('travel-settings-save',{motorcycleRate:4});
 assert.equal(s.ok,true);assert.equal(Number(s.settings.motorcycleRate),4);
 assert.equal(Number((await dash('travel-settings')).settings.motorcycleRate),4);
 let st=await emp('travel-start',start);
 assert.equal(st.trip.mode,'motorcycle');assert.equal(Number(st.trip.rate),4);
 st=await emp('travel-arrive',{accountId:S,tripId:st.trip.id,stopId:st.trip.stops[0].id,prevPointId:st.trip.points[0].id,lat:13.8,lng:100.6,accuracy:10,km:10});
 assert.equal(Number(st.trip.kmAmount),40);
 await emp('travel-cancel',{accountId:S,tripId:st.trip.id});
 s=await dash('travel-settings-save',{motorcycleRate:null});
 assert.equal(s.settings.motorcycleRate,null);
});

test('a check-in without GPS keeps the reason and sends the trip for review',async()=>{
 let st=await emp('travel-start',{accountId:S,purpose:'care',mode:'car',startFrom:'office',clientName:'Bravo',destLat:13.8,destLng:100.6,appointment:'14:00'});
 const t=st.trip;
 st=await emp('travel-arrive',{accountId:S,tripId:t.id,stopId:t.stops[0].id,prevPointId:t.points[0].id,lat:13.8,lng:100.6,km:12,manualReason:'Phone GPS would not load'});
 const p=st.trip.points.at(-1);
 assert.equal(p.manualReason,'Phone GPS would not load');assert.equal(p.accuracy,null);
 st=await emp('travel-return',{accountId:S,tripId:t.id,prevPointId:p.id,lat:13.7563,lng:100.5018,km:12});
 assert.equal(st.trip.points.at(-1).manualReason,null);
 st=await emp('travel-submit',{accountId:S,tripId:t.id});
 assert.equal(st.submitted.status,'flagged');
 assert.ok(st.submitted.flags.includes('gps_manual'));
 assert.equal((await q("SELECT tbs_trip_flag_text('gps_manual') t"))[0].t,'เช็กอินโดยไม่มี GPS / Checked in without GPS');
});
