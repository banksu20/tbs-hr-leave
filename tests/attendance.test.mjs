import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-9]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const P='U'+'7'.repeat(32),L='U'+'8'.repeat(32),X='U'+'9'.repeat(32);
const here={lat:13.7563,lng:100.5018,accuracy:15};
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('hr','test','hr'),('acc','test','accounting')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='hr'",['a'.repeat(64)]);
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='acc'",['c'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type) VALUES($1,81,'Ploy','Dee','Ploy','SEO','active','employee'),($2,82,'Lek','Lead','Lek','SEO','active','employee'),($3,83,'Other','One','Ot','SEO','active','employee')",[P,L,X]);
await q('UPDATE tbs_employees SET manager_user_id=$2 WHERE user_id=$1',[P,L]);
const hoursAgo=h=>`now()-interval '${h} hours'`;

test('clock-in stays closed until HR turns it on and adds the person',async()=>{
 let st=await emp('attendance-state',{accountId:P});
 assert.equal(st.enabled,false);assert.equal(st.eligible,false);
 assert.equal((await emp('attendance-in',{accountId:P,...here})).statusCode,403);
 assert.equal((await dash('attendance-overview',{},'z')).statusCode,401);
 assert.equal((await dash('attendance-overview',{},'c')).statusCode,403);
 let o=await dash('attendance-person-save',{userId:P,member:true});
 assert.equal(o.people.find(p=>p.id===P).member,true);
 assert.equal(o.people.find(p=>p.id===P).kind,'part-time');
 assert.equal((await emp('attendance-in',{accountId:P,...here})).statusCode,403);
 o=await dash('attendance-settings-save',{enabled:true});
 assert.equal(o.settings.enabled,true);
 st=await emp('attendance-state',{accountId:P});
 assert.equal(st.eligible,true);
 assert.equal((await emp('attendance-state',{accountId:X})).eligible,false);
});

test('clock in and out records location and counts hours with a 1 hour break',async()=>{
 assert.equal((await emp('attendance-in',{accountId:P})).statusCode,422);
 let st=await emp('attendance-in',{accountId:P,...here});
 assert.ok(st.open);assert.equal(Number(st.open.inLat),here.lat);
 assert.equal((await emp('attendance-in',{accountId:P,...here})).statusCode,409);
 await q(`UPDATE tbs_attendance_shifts SET in_at=${hoursAgo(8.5)} WHERE user_id=$1`,[P]);
 st=await emp('attendance-out',{accountId:P,...here});
 assert.equal(st.open,null);
 const s=st.shifts[0];
 assert.ok(s.workedMin>=449&&s.workedMin<=451);
 assert.ok(s.overtimeMin>=29&&s.overtimeMin<=31);
 assert.equal((await emp('attendance-out',{accountId:P,...here})).statusCode,409);
 assert.equal((await q("SELECT tbs_attendance_worked(now()-interval '4 hours',now()) m"))[0].m,240);
 assert.equal((await q("SELECT tbs_attendance_worked(now()-interval '5 hours',now()) m"))[0].m,300);
 assert.equal((await q("SELECT tbs_attendance_worked(now()-interval '8 hours',now()) m"))[0].m,420);
});

test('a forgotten clock-out is marked missed and fixed by HR',async()=>{
 await q('DELETE FROM tbs_attendance_shifts');
 await emp('attendance-in',{accountId:P,...here});
 await q(`UPDATE tbs_attendance_shifts SET in_at=${hoursAgo(20)},work_date=(now() AT TIME ZONE 'Asia/Bangkok')::date-1 WHERE user_id=$1`,[P]);
 let st=await emp('attendance-state',{accountId:P});
 assert.equal(st.open,null);assert.equal(st.shifts[0].missedOut,true);
 const shiftId=st.shifts[0].id,day=st.shifts[0].date;
 assert.equal((await emp('attendance-fix',{accountId:P,shiftId,date:day,in:'09:00',out:'17:00',reason:'x'})).statusCode,422);
 st=await emp('attendance-fix',{accountId:P,shiftId,date:day,in:'09:00',out:'17:00',reason:'Forgot to clock out'});
 assert.equal(st.fixes[0].status,'pending');
 assert.equal((await emp('attendance-fix',{accountId:P,shiftId,date:day,in:'09:00',out:'18:00',reason:'Again please'})).statusCode,409);
 const lead=await emp('attendance-state',{accountId:L});
 assert.equal(lead.team.length,0);assert.equal(lead.teamFixes.length,0);
 assert.equal((await emp('attendance-team-decide',{accountId:L,id:st.fixes[0].id,decision:'approve'})).statusCode,403);
 await dash('attendance-fix-decide',{id:st.fixes[0].id,action:'approve'});
 st=await emp('attendance-state',{accountId:P});
 assert.equal(st.shifts[0].missedOut,false);assert.equal(st.shifts[0].edited,true);assert.equal(st.shifts[0].workedMin,420);
 assert.equal(st.fixes[0].status,'approved');
});

test('a missing day can be added, cancelled or decided by HR, and times cannot overlap',async()=>{
 const day=(await q("SELECT ((now() AT TIME ZONE 'Asia/Bangkok')::date-3)::text d"))[0].d;
 let st=await emp('attendance-fix',{accountId:P,date:day,in:'10:00',out:'14:00',reason:'Phone was dead'});
 const id=st.fixes[0].id;
 st=await emp('attendance-fix-cancel',{accountId:P,id});
 assert.equal(st.fixes.some(f=>f.id===id),false);
 st=await emp('attendance-fix',{accountId:P,date:day,in:'10:00',out:'14:00',reason:'Phone was dead'});
 const o=await dash('attendance-fix-decide',{id:st.fixes[0].id,action:'approve',note:'ok'});
 assert.equal(o.fixes.find(f=>f.id===st.fixes[0].id).status,'approved');
 assert.ok(o.shifts.some(s=>s.date===day&&s.workedMin===240));
 assert.equal((await dash('attendance-fix-decide',{id:st.fixes[0].id,action:'reject'})).statusCode,409);
 assert.equal((await emp('attendance-fix',{accountId:P,date:day,in:'11:00',out:'12:00',reason:'Overlap test'})).statusCode,422);
 const future=(await q("SELECT ((now() AT TIME ZONE 'Asia/Bangkok')::date+1)::text d"))[0].d;
 assert.equal((await emp('attendance-fix',{accountId:P,date:future,in:'09:00',out:'10:00',reason:'Too early'})).statusCode,422);
 assert.equal((await emp('attendance-fix',{accountId:X,date:day,in:'09:00',out:'10:00',reason:'Not a member'})).statusCode,403);
});

test('locations are erased after the keep period but hours stay',async()=>{
 await q(`INSERT INTO tbs_attendance_shifts(user_id,work_date,in_at,in_lat,in_lng,out_at,out_lat,out_lng) VALUES($1,(now()-interval '100 days')::date,now()-interval '100 days',13.7,100.5,now()-interval '100 days'+interval '6 hours',13.7,100.5)`,[P]);
 assert.equal((await q('SELECT tbs_attendance_purge() n'))[0].n,1);
 const [r]=await q("SELECT in_lat,out_lat,tbs_attendance_worked(in_at,out_at) w FROM tbs_attendance_shifts WHERE work_date<now()::date-90");
 assert.equal(r.in_lat,null);assert.equal(r.out_lat,null);assert.equal(r.w,300);
});

test('turning it off or removing the person closes clock-in again',async()=>{
 await dash('attendance-person-save',{userId:P,member:false});
 assert.equal((await emp('attendance-state',{accountId:P})).eligible,false);
 await dash('attendance-person-save',{userId:P,member:true});
 await dash('attendance-settings-save',{enabled:false});
 assert.equal((await emp('attendance-in',{accountId:P,...here})).statusCode,403);
});

test('full-time WFH staff clock in only on their WFH days with an 8 hour target',async()=>{
 await q('DELETE FROM tbs_attendance_shifts');await q('DELETE FROM tbs_attendance_fixes');
 await dash('attendance-settings-save',{enabled:true});
 const dow=Number((await q("SELECT extract(isodow FROM (now() AT TIME ZONE 'Asia/Bangkok')::date)::int d"))[0].d);
 const other=dow%7+1;
 assert.equal((await dash('attendance-person-save',{userId:X,member:true,kind:'wfh',wfhDays:[]})).statusCode,422);
 assert.equal((await dash('attendance-person-save',{userId:X,member:true,kind:'wfh',wfhDays:[8]})).statusCode,422);
 let o=await dash('attendance-person-save',{userId:X,member:true,kind:'wfh',wfhDays:[other]});
 let me=o.people.find(p=>p.id===X);assert.equal(me.kind,'wfh');assert.deepEqual(me.wfhDays,[other]);
 let st=await emp('attendance-state',{accountId:X});
 assert.equal(st.kind,'wfh');assert.equal(st.workToday,false);assert.equal(st.settings.workMinutes,480);
 assert.equal((await emp('attendance-in',{accountId:X,...here})).statusCode,409);
 const today=(await q("SELECT ((now() AT TIME ZONE 'Asia/Bangkok')::date)::text d"))[0].d;
 assert.equal((await emp('attendance-fix',{accountId:X,date:today,in:'00:00',out:'00:01',reason:'Office day'})).statusCode,422);
 await dash('attendance-person-save',{userId:X,member:true,kind:'wfh',wfhDays:[dow,other]});
 st=await emp('attendance-in',{accountId:X,...here});
 assert.equal(st.workToday,true);assert.ok(st.open);
 await q(`UPDATE tbs_attendance_shifts SET in_at=${hoursAgo(9.5)} WHERE user_id=$1`,[X]);
 st=await emp('attendance-out',{accountId:X,...here});
 assert.ok(st.shifts[0].workedMin>=509&&st.shifts[0].workedMin<=511);
 assert.ok(st.shifts[0].overtimeMin>=29&&st.shifts[0].overtimeMin<=31);
 assert.equal((await emp('attendance-state',{accountId:P})).settings.workMinutes,420);
 o=await dash('attendance-person-save',{userId:X,member:true,kind:'part-time'});
 me=o.people.find(p=>p.id===X);assert.equal(me.kind,'part-time');assert.deepEqual(me.wfhDays,[]);
 assert.equal((await emp('attendance-state',{accountId:X})).workToday,true);
});
