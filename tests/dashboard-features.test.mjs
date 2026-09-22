import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import loadTS from './load-ts.cjs';
import { patchDashboardFeatures } from '../scripts/patch-dashboard-features.mjs';
const sql=name=>readFileSync(`n8n/sql/${name}`,'utf8');
async function fixture(){
  const db=new PGlite();
  await db.exec(`CREATE TABLE tbs_employees(user_id text PRIMARY KEY,tbs_id int,first_name text,last_name text,nickname text,department text,status text,start_date date);
  CREATE TABLE leave_quotas(user_id text,year int,annual_total numeric,sick_total numeric,personal_total numeric,carried_over numeric,note text,updated_at timestamptz,UNIQUE(user_id,year));
  CREATE TABLE leave_requests(id serial PRIMARY KEY,user_id text,user_name text,department text,leave_type text,leave_days numeric,start_date date,end_date date,selected_dates text,reason text,status text,source text);
  INSERT INTO tbs_employees VALUES('test',1,'Test','Person','','QA','active','2020-01-01');`);
  for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql'])await db.exec(sql(file));
  return db;
}
const mutate=async(db,op,body)=>(await db.query('SELECT tbs_dashboard_request_v2($1,$2::jsonb) result',[op,JSON.stringify(body)])).rows[0].result;
const draft={userId:'test',leaveDate:'2026-01-05',leaveType:'annual',leaveDays:0.5,halfDayPeriod:'morning',status:'Approved',reason:'Test'};

test('approval rejects stale, inactive and already handled requests and audits the status-only change',async()=>{
 const db=await fixture();try{
  const created=await mutate(db,'create',{...draft,status:'Pending'});
  assert.equal(created.ok,true);
  const snapshot=async()=>(await db.query('SELECT to_jsonb(r) value, md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[created.id])).rows[0];
  const original=await snapshot();
  await db.query('UPDATE leave_requests SET reason=$1 WHERE id=$2',['Updated reason',created.id]);
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:original.revision})).statusCode,409);
  const current=await snapshot();
  await db.exec("UPDATE tbs_employees SET status='inactive' WHERE user_id='test'");
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:current.revision})).statusCode,409);
  await db.exec("UPDATE tbs_employees SET status='active' WHERE user_id='test'");
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:current.revision})).ok,true);
  assert.deepEqual((await snapshot()).value,{...current.value,status:'Approved'});
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:current.revision})).statusCode,409);
  const events=(await db.query("SELECT * FROM tbs_change_history WHERE action='approve'")).rows;
  assert.equal(events.length,1);assert.equal(events[0].before_value.status,'Pending');assert.equal(events[0].after_value.status,'Approved');
 }finally{await db.close();}
});

test('rejection only decides a current pending request and records a rejection, not cancellation',async()=>{
 const db=await fixture();try{
  const created=await mutate(db,'create',{...draft,status:'Pending'});
  const revision=(await db.query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[created.id])).rows[0].revision;
  assert.equal((await mutate(db,'reject',{id:created.id,expectedRevision:'0'.repeat(32)})).statusCode,409);
  assert.equal((await mutate(db,'reject',{id:created.id,expectedRevision:revision,rejectionReason:'  Please choose another date  '})).ok,true);
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:revision})).statusCode,409);
  const events=(await db.query(sql('change-history.sql'),['test',null])).rows[0].events;
  assert.equal(events[0].after.rejection_reason,'Please choose another date');assert.equal(events[0].after.reason,draft.reason);assert.equal(events[0].action,'reject');assert.equal(events[0].after.status,'Rejected');assert.equal(events[0].canRestore,false);
  const usage=(await db.query("SELECT annual FROM tbs_quota_usage('test',2026)")).rows[0];assert.equal(Number(usage.annual),0);
 }finally{await db.close();}
});

test('LINE and dashboard share the first decision and preserve employee reason',async()=>{
 const db=await fixture();try{
  const line=async(action,body)=>(await db.query('SELECT tbs_line_decision($1,$2::jsonb) r',[action,JSON.stringify(body)])).rows[0].r;
  const created=await mutate(db,'create',{...draft,status:'Pending'});
  const revision=(await db.query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[created.id])).rows[0].revision;
  assert.equal((await line('approve',{id:created.id,userId:'wrong'})).statusCode,409);
  assert.equal((await line('approve',{id:created.id,userId:'test'})).ok,true);
  assert.equal((await mutate(db,'reject',{id:created.id,expectedRevision:revision})).statusCode,409);
  assert.equal((await line('reject',{id:created.id,userId:'test',rejectionReason:'old button'})).statusCode,409);
  const audit=(await db.query("SELECT * FROM tbs_change_history WHERE action='approve'")).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].actor,'LINE — user not identified');
  const second=await mutate(db,'create',{...draft,leaveDate:'2026-01-06',status:'Pending'});
  const rev=(await db.query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[second.id])).rows[0].revision;
  assert.equal((await mutate(db,'reject',{id:second.id,expectedRevision:rev,rejectionReason:'Dashboard decision'})).ok,true);
  assert.equal((await line('approve',{id:second.id,userId:'test'})).statusCode,409);
  const third=await mutate(db,'create',{...draft,leaveDate:'2026-01-07',status:'Pending'});
  assert.equal((await line('reject',{id:third.id,userId:'test',rejectionReason:'LINE decision'})).ok,true);
  const row=(await db.query('SELECT * FROM leave_requests WHERE id=$1',[third.id])).rows[0];assert.equal(row.reason,draft.reason);assert.equal(row.rejection_reason,'LINE decision');
 }finally{await db.close();}
});

test('audit, overlap prevention, cancellation and guarded restoration persist together',async()=>{
 const db=await fixture();try{
  const first=await mutate(db,'create',draft);assert.equal(first.ok,true);
  assert.equal((await mutate(db,'create',draft)).statusCode,409);
  const afternoon=await mutate(db,'create',{...draft,halfDayPeriod:'afternoon'});assert.equal(afternoon.ok,true);
  assert.equal((await mutate(db,'create',{...draft,leaveDays:1,halfDayPeriod:null})).statusCode,409);
  const target={id:first.id,scope:'request',expectedDates:[draft.leaveDate]};
  assert.equal((await mutate(db,'delete',target)).ok,true);
  let event=(await db.query("SELECT * FROM tbs_change_history WHERE action='cancel'")).rows[0];
  assert.equal(event.before_value.status,'Approved');assert.equal(event.after_value.status,'Rejected');
  assert.equal((await mutate(db,'restore',{id:first.id,cancellationId:'999999'})).statusCode,409);
  assert.equal((await mutate(db,'restore',{id:first.id,cancellationId:String(event.id)})).ok,true);
  assert.equal((await mutate(db,'restore',{id:first.id,cancellationId:String(event.id)})).statusCode,409);
  assert.equal((await mutate(db,'delete',target)).ok,true);
  event=(await db.query("SELECT * FROM tbs_change_history WHERE action='cancel' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal((await mutate(db,'create',draft)).ok,true);
  assert.equal((await mutate(db,'restore',{id:first.id,cancellationId:String(event.id)})).statusCode,409);
  assert.equal((await db.query('SELECT status FROM leave_requests WHERE id=$1',[first.id])).rows[0].status,'Rejected');
  await db.exec("UPDATE tbs_employees SET nickname='Updated' WHERE user_id='test'; INSERT INTO leave_quotas VALUES('test',2026,12,30,3,0,'',now(),null); UPDATE leave_quotas SET annual_total=15 WHERE user_id='test';");
  const events=(await db.query(sql('change-history.sql'),['test',null])).rows[0].events;
  assert.ok(events.some(e=>e.entity==='leave_quotas'&&e.before?.annual_total===12&&e.after?.annual_total===15));
  assert.ok(events.some(e=>e.entity==='tbs_employees'&&e.after.nickname==='Updated'));
  for(let i=1;i<events.length;i++)assert.ok(BigInt(events[i-1].id)>BigInt(events[i].id));
  const older=(await db.query(sql('change-history.sql'),['test',events[2].id])).rows[0].events;
  assert.ok(older.every(e=>BigInt(e.id)<BigInt(events[2].id)));
  assert.ok(events.every(e=>e.actor.includes('not identified')));
 }finally{await db.close();}
});

test('carryover expires after its inclusive expiry date, without double charging used days',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO leave_quotas VALUES('test',2026,12,30,3,5,'',now(),'2026-03-31');");
  assert.equal((await mutate(db,'create',{...draft,leaveDate:'2026-03-31',leaveDays:1,halfDayPeriod:null})).ok,true);
  assert.equal((await mutate(db,'create',{...draft,leaveDate:'2026-04-01',leaveDays:1,halfDayPeriod:null})).ok,true);
  const before=(await db.query("SELECT * FROM tbs_quota_usage('test',2026,'2026-03-31')")).rows[0];
  const after=(await db.query("SELECT * FROM tbs_quota_usage('test',2026,'2026-04-01')")).rows[0];
  assert.equal(Number(before.effective_carried),5);assert.equal(Number(after.effective_carried),1);assert.equal(Number(after.annual),2);
  assert.equal(12+Number(after.effective_carried)-Number(after.annual),11);
  const originalQuery=sql('get-all-leaves.sql').replace('COALESCE(q.carried_over, 0) AS "carriedOver"','(SELECT effective_carried FROM tbs_quota_usage(e.user_id,$1::int)) AS "carriedOver"');
  const employee=(await db.query(originalQuery,[2026])).rows[0];
  assert.equal(employee.requests.length,2);
  const read=(await db.query(sql('get-quota-with-expiry.sql'),['test',2026])).rows[0];
  assert.equal(Number(employee.carriedOver),read.carriedOver);

 }finally{await db.close();}
});

test('rollover previews carryover but blocks every apply without changing any quotas',async()=>{
 const db=await fixture();try{
  const year=2025;
  await db.query("INSERT INTO leave_quotas VALUES('test',$1,12,30,3,2,'',now(),null)",[year]);
  const policy={sourceYear:year,carryLimit:5,expiresOn:`${year+1}-03-31`};
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
  const before=(await db.query('SELECT * FROM leave_quotas')).rows;
  const preview=await run({...policy,action:'preview'});assert.equal(preview.ok,true);assert.equal(preview.rows[0].carriedOver,5);
  assert.equal((await run({...policy,action:'apply',token:preview.token})).statusCode,403);
  assert.equal((await run({...policy,action:'apply',token:'stale'})).statusCode,403);
  assert.deepEqual((await db.query('SELECT * FROM leave_quotas')).rows,before);
  assert.equal((await run({...policy,action:'preview',expiresOn:`${year}-03-31`})).statusCode,422);
 }finally{await db.close();}
});

test('client overlap warning excludes itself, cancellations and opposite half-days',()=>{
 const {conflictingLeave}=loadTS()('src/lib/leaveConflicts.ts');
 const leaves=[{requestId:'1',date:'2026-01-01',days:0.5,halfDayPeriod:'morning',status:'Pending'}];
 assert.equal(conflictingLeave(leaves,['2026-01-01'],0.5,'morning').length,1);
 assert.equal(conflictingLeave(leaves,['2026-01-01'],0.5,'afternoon').length,0);
 assert.equal(conflictingLeave(leaves,['2026-01-01'],1,null,'1').length,0);
 assert.equal(conflictingLeave([{...leaves[0],status:'Rejected'}],['2026-01-01'],1).length,0);
});

test('feature workflow patch adds authenticated read and rollover branches without losing connections',()=>{
 const names=['Webhook get all leaves','Get all leaves','Respond get all leaves','Get quota','dashboard-leave-create','dashboard-leave-update','dashboard-leave-delete'];
 const original={nodes:names.map((name,i)=>({id:String(i),name,type:name.startsWith('Webhook')?'n8n-nodes-base.webhook':'n8n-nodes-base.postgres',parameters:{},credentials:{httpHeaderAuth:{id:'test',name:'Test'}}})),connections:{untouched:{main:[[{node:'Get quota',type:'main',index:0}]]}}};
 const patched=patchDashboardFeatures(original);
 assert.deepEqual(patched.connections.untouched,original.connections.untouched);
 for(const name of ['Webhook dashboard-history','Webhook dashboard-rollover'])assert.equal(patched.nodes.find(n=>n.name===name).parameters.authentication,'headerAuth');
 assert.match(patched.nodes.find(n=>n.name==='dashboard-leave-update').parameters.query,/restore/);
 assert.match(patched.nodes.find(n=>n.name==='Get all leaves').parameters.query,/effective_carried/);
 assert.equal(patchDashboardFeatures(patched).nodes.length,patched.nodes.length);
});
