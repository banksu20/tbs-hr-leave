import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const q=async(s,p=[])=>(await db.query(s,p)).rows;
await db.exec(readFileSync('tests/employee-cancellation.test.mjs','utf8').match(/await db.exec\(`([\s\S]*?)`\);/)[1]);
const files=JSON.parse(readFileSync('tests/leave-policy.test.mjs','utf8').match(/const files=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const later=readdirSync('n8n/sql').filter(f=>/^0(4[3-9]|[5-9]\d)_/.test(f)).sort().map(f=>f.replace('.sql',''));
for(const f of [...files,...later])await db.exec(readFileSync('n8n/sql/'+f+'.sql','utf8'));
const dash=async(operation,body={},token='a')=>(await q('SELECT tbs_dashboard_auth($1::jsonb) r',[JSON.stringify({operation,sessionHash:token.repeat(64),body})]))[0].r;
const emp=async(operation,payload)=>(await q('SELECT tbs_cancellation($1,$2::jsonb) r',[operation,JSON.stringify(payload)]))[0].r;
const S='U'+'7'.repeat(32);
await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('acc','test','accounting')");
await q("INSERT INTO tbs_dashboard_sessions(token_hash,account_id,version) SELECT $1,id,version FROM tbs_dashboard_accounts WHERE username='acc'",['a'.repeat(64)]);
await q("INSERT INTO tbs_employees(user_id,tbs_id,first_name,last_name,nickname,department,status,employment_type) VALUES($1,81,'Kochakorn','Kei','Ko','Sale','active','employee')",[S]);
await q("UPDATE tbs_travel_settings SET office_lat=13.75,office_lng=100.5 WHERE singleton");
const payee={nameTh:'กชกร ทดสอบ',nameEn:'Kochakorn Test',position:'Sales',idNo:'1-1020-02406-94-1',bank:'กสิกรไทย',account:'041-1-64428-6'};
const trip=async(date,status,km,amount,receipts=[])=>{
 const id=(await q("INSERT INTO tbs_trips(user_id,trip_date,purpose,mode,start_from,rate,status) VALUES($1,$2,'deal','car','office',7,$3) RETURNING id",[S,date,status]))[0].id;
 const st=(await q("INSERT INTO tbs_trip_stops(trip_id,seq,client_name,lat,lng) VALUES($1,1,'Client A',13.8,100.6) RETURNING id",[id]))[0].id;
 const a=(await q("INSERT INTO tbs_trip_points(trip_id,kind,lat,lng) VALUES($1,'start_office',13.75,100.5) RETURNING id",[id]))[0].id;
 const b=(await q("INSERT INTO tbs_trip_points(trip_id,kind,stop_id,lat,lng) VALUES($1,'arrive',$2,13.8,100.6) RETURNING id",[id,st]))[0].id;
 await q("INSERT INTO tbs_trip_legs(trip_id,from_point,to_point,route_km,km,amount) VALUES($1,$2,$3,$4,$4,$5)",[id,a,b,km,amount]);
 for(const [kind,amt,merchant] of receipts)await q("INSERT INTO tbs_trip_receipts(trip_id,kind,mime,content,amount,read_merchant) VALUES($1,$2,'image/png',$3,$4,$5)",[id,kind,Buffer.from(kind+amt),amt,merchant]);
 return id;
};

test('staff must add payment details once before their first trip',async()=>{
 let st=await emp('travel-state',{accountId:S});
 assert.equal(st.payee,null);
 assert.equal((await emp('travel-start',{accountId:S,purpose:'deal',mode:'car',startFrom:'office',clientName:'X',destLat:13.8,destLng:100.6,appointment:'14:00'})).error,'Add your payment details first.');
 assert.equal((await emp('travel-payee-save',{...payee,accountId:S,idNo:'123'})).statusCode,422);
 assert.equal((await emp('travel-payee-save',{...payee,accountId:S,account:'12'})).statusCode,422);
 st=await emp('travel-payee-save',{...payee,accountId:S});
 assert.equal(st.ok,true);assert.equal(st.payee.idNo,'1102002406941');assert.equal(st.payee.account,'0411644286');
 assert.notEqual((await emp('travel-start',{accountId:S,purpose:'deal',mode:'car',startFrom:'office',clientName:'X',destLat:13.8,destLng:100.6,appointment:'14:00'})).error,'Add your payment details first.');
 await q("DELETE FROM tbs_trips WHERE user_id=$1",[S]);
});

test('accounting gets a filled form with numbered evidence, can edit, save and reset it',async()=>{
 await trip('2026-10-03','approved',20,140,[['toll',50,'EXAT'],['parking',30,null]]);
 await trip('2026-10-09','submitted',10,70,[['grab',120,'Grab']]);
 await trip('2026-10-12','flagged',99,693,[['toll',999,'X']]);
 await trip('2026-11-01','approved',5,35);
 assert.equal((await dash('travel-form',{month:'2026-10',userId:S},'z')).statusCode,401);
 assert.equal((await dash('travel-form',{month:'bad',userId:S})).statusCode,422);
 let f=await dash('travel-form',{month:'2026-10',userId:S});
 assert.equal(f.ok,true);assert.equal(f.saved,null);assert.equal(f.payeeMissing,false);
 assert.equal(f.form.idNo,'1102002406941');assert.equal(f.form.nameEn,'Kochakorn Test');assert.equal(f.form.department,'Sale');
 assert.equal(f.form.from,'2026-10-03');assert.equal(f.form.to,'2026-10-09');
 assert.deepEqual(f.form.rows.map(r=>[r.date,Number(r.amount),r.remark]),[['2026-10-03',140,''],['2026-10-03',50,'หลักฐาน #1'],['2026-10-03',30,'หลักฐาน #2'],['2026-10-09',70,''],['2026-10-09',120,'หลักฐาน #3']]);
 assert.match(f.form.rows[0].detail,/20\.0 กม\. · Client A/);assert.match(f.form.rows[1].detail,/Toll · EXAT/);
 assert.deepEqual(f.evidence.map(e=>[e.n,e.kind,Number(e.amount)]),[[1,'toll',50],[2,'parking',30],[3,'grab',120]]);
 const edited={...f.form,account:'9999999999',approver:'Nam',rows:[...f.form.rows.slice(0,2),{date:'2026-10-05',detail:'<b>Extra</b>',amount:'15.5',remark:'x'},{date:'nope',detail:'y',amount:'abc'}],evil:'x'};
 f=await dash('travel-form-save',{month:'2026-10',userId:S,data:edited});
 assert.equal(f.ok,true);assert.equal(f.saved.updatedBy,'acc');assert.equal(f.form.approver,'Nam');assert.equal(f.form.evil,undefined);
 assert.equal(f.form.rows.length,4);assert.equal(Number(f.form.rows[2].amount),15.5);assert.equal(f.form.rows[3].date,null);assert.equal(f.form.rows[3].amount,null);
 assert.equal((await emp('travel-state',{accountId:S})).payee.account,'9999999999');
 f=await dash('travel-form',{month:'2026-10',userId:S});assert.equal(f.form.rows.length,4);
 f=await dash('travel-form-reset',{month:'2026-10',userId:S});assert.equal(f.saved,null);assert.equal(f.form.rows.length,5);
 assert.equal((await q("SELECT count(*)::int n FROM tbs_dashboard_account_audit WHERE action LIKE 'travel-form-%'"))[0].n,2);
});

test('other roles and unknown people are refused; old dashboard ops still work',async()=>{
 await q("INSERT INTO tbs_dashboard_accounts(username,password_hash,role) VALUES('ceo2','test','ceo')");
 assert.equal((await dash('travel-form',{month:'2026-10',userId:'nobody'})).statusCode,404);
 assert.equal((await dash('travel-payout',{month:'2026-10'})).ok,true);
});

test('amounts are written in Thai words like the paper form',async()=>{
 const {default:loadTS}=await import('./load-ts.cjs');const {bahtText}=loadTS()('src/lib/bahtText.ts');
 assert.equal(bahtText(404),'สี่ร้อยสี่บาทถ้วน');
 assert.equal(bahtText(0),'ศูนย์บาทถ้วน');
 assert.equal(bahtText(11),'สิบเอ็ดบาทถ้วน');
 assert.equal(bahtText(21.5),'ยี่สิบเอ็ดบาทห้าสิบสตางค์');
 assert.equal(bahtText(101),'หนึ่งร้อยเอ็ดบาทถ้วน');
 assert.equal(bahtText(1),'หนึ่งบาทถ้วน');
 assert.equal(bahtText(4366.7),'สี่พันสามร้อยหกสิบหกบาทเจ็ดสิบสตางค์');
 assert.equal(bahtText(1000001),'หนึ่งล้านเอ็ดบาทถ้วน');
 assert.equal(bahtText(25000000),'ยี่สิบห้าล้านบาทถ้วน');
 assert.equal(bahtText(0.25),'ยี่สิบห้าสตางค์');
});
