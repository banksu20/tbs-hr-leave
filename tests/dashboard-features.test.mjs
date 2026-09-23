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
  for(const file of ['001_request_safety.sql','002_history_and_conflicts.sql','003_year_rollover.sql','004_line_decisions.sql','005_sync_outbox.sql','006_employee_submission.sql','007_sheet_employee_links.sql','008_quota_safety.sql'])await db.exec(sql(file));
  return db;
}
const requestRevision=async(db,id)=>(await db.query('SELECT md5(to_jsonb(r)::text) revision FROM leave_requests r WHERE id=$1',[id])).rows[0]?.revision;
const mutate=async(db,op,body)=>{
 if(['update','delete'].includes(op)&&body.expectedRevision===undefined)body={...body,expectedRevision:await requestRevision(db,body.id)};
 return (await db.query('SELECT tbs_dashboard_request_v2($1,$2::jsonb) result',[op,JSON.stringify(body)])).rows[0].result;
};
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
  const line=async(action,body)=>{
 const row=(await db.query('SELECT decision_token FROM leave_requests WHERE id=$1',[body.id])).rows[0];
 return (await db.query('SELECT tbs_line_decision($1,$2::jsonb) r',[action,JSON.stringify({...body,expectedRevision:await requestRevision(db,body.id),decisionToken:row?.decision_token})])).rows[0].r;
 };
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
  await db.exec("UPDATE tbs_employees SET nickname='Updated' WHERE user_id='test'; INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over,note,updated_at,carryover_expires_on) VALUES('test',2026,12,30,3,0,'',now(),null); UPDATE leave_quotas SET annual_total=15 WHERE user_id='test';");
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
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over,note,updated_at,carryover_expires_on) VALUES('test',2026,12,30,3,5,'',now(),'2026-03-31');");
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

test('rollover applies reviewed quotas once and preserves source allowances',async()=>{
 const db=await fixture();try{
  const year=2025;
  await db.query("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over,note,updated_at,carryover_expires_on) VALUES('test',$1,12,30,3,2,'',now(),null)",[year]);
  const policy={sourceYear:year,carryLimit:5,expiresOn:`${year+1}-03-31`};
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
  const before=(await db.query('SELECT * FROM leave_quotas')).rows;
  const preview=await run({...policy,action:'preview'});assert.equal(preview.ok,true);assert.equal(preview.rows[0].carriedOver,12);
  assert.equal((await run({...policy,action:'apply',token:'stale'})).statusCode,409);
  assert.deepEqual((await db.query('SELECT * FROM leave_quotas')).rows,before);
  assert.equal((await run({...policy,action:'apply',token:preview.token})).saved,1);
  assert.equal((await run({...policy,action:'apply',token:preview.token})).statusCode,409);
  const saved=(await db.query('SELECT * FROM leave_quotas WHERE year=2026')).rows[0];assert.equal(Number(saved.annual_total),12);assert.equal(Number(saved.carried_over),12);
  assert.equal((await run({...policy,action:'apply',token:'stale'})).statusCode,409);
  assert.deepEqual((await db.query('SELECT * FROM leave_quotas WHERE year=2025')).rows,before);
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

test('daily chart includes every calendar day and respects year, employee scope, status and type',()=>{
 const {dailyTotals,monthlyTotals}=loadTS()('src/components/ceo/overviewData.ts');
 const employee={leaves:[{date:'2026-02-03',type:'annual',days:.5,status:'Approved'},{date:'2026-02-03',type:'sick',days:1,status:'Approved'},{date:'2026-02-04',type:'annual',days:1,status:'Pending'},{date:'2026-03-03',type:'annual',days:1,status:'Approved'},{date:'2025-02-03',type:'annual',days:1,status:'Approved'}]};
 const days=dailyTotals([employee],'2026',2,['annual']);
 assert.equal(days.length,28);assert.equal(days[2].total,.5);assert.equal(days[3].total,0);
 assert.equal(days.reduce((sum,r)=>sum+r.total,0),monthlyTotals([employee],'2026',['annual'])[1].total);
 assert.equal(dailyTotals([],'2028',2).length,29);assert.equal(dailyTotals([],'2026',4).length,30);assert.equal(dailyTotals([],'2026',1).length,31);
});


test('stale edits, stale cancellation and old LINE snapshots cannot overwrite a decision',async()=>{
 const db=await fixture();try{
  const created=await mutate(db,'create',{...draft,status:'Pending'});
  const before=await requestRevision(db,created.id);
  const token=(await db.query('SELECT decision_token FROM leave_requests WHERE id=$1',[created.id])).rows[0].decision_token;
  assert.equal((await mutate(db,'approve',{id:created.id,expectedRevision:before})).ok,true);
  const edit={...draft,id:created.id,scope:'request',expectedDates:[draft.leaveDate],leaveDates:[draft.leaveDate],expectedRevision:before,status:'Pending'};
  assert.equal((await mutate(db,'update',edit)).statusCode,409);
  assert.equal((await mutate(db,'delete',edit)).statusCode,409);
  assert.equal((await mutate(db,'update',{...edit,expectedRevision:await requestRevision(db,created.id)})).statusCode,409);
  const other=await mutate(db,'create',{...draft,leaveDate:'2026-01-06',status:'Pending'});
  const old=await requestRevision(db,other.id), otherToken=(await db.query('SELECT decision_token FROM leave_requests WHERE id=$1',[other.id])).rows[0].decision_token;
  assert.equal((await mutate(db,'update',{...edit,id:other.id,expectedDates:['2026-01-06'],leaveDates:['2026-01-07'],expectedRevision:old})).ok,true);
  const line=async(body)=>(await db.query("SELECT tbs_line_decision('approve',$1::jsonb) r",[JSON.stringify(body)])).rows[0].r;
  assert.equal((await line({id:other.id,userId:'test',expectedRevision:old,decisionToken:otherToken})).statusCode,409);
  assert.equal((await line({id:other.id,userId:'test',expectedRevision:await requestRevision(db,other.id)})).statusCode,409);
  assert.equal((await db.query('SELECT status FROM leave_requests WHERE id=$1',[other.id])).rows[0].status,'Pending');
 }finally{await db.close();}
});

test('decision queues one notification; failed delivery is retryable without another decision',async()=>{
 const db=await fixture();try{
  const created=await mutate(db,'create',{...draft,status:'Pending'});const rev=await requestRevision(db,created.id);
  await mutate(db,'approve',{id:created.id,expectedRevision:rev});
  await mutate(db,'approve',{id:created.id,expectedRevision:rev});
  assert.equal(Number((await db.query("SELECT count(*) n FROM tbs_sync_jobs WHERE kind='line'")).rows[0].n),1);
  let job=(await db.query("SELECT * FROM tbs_claim_sync('line')")).rows[0];assert.ok(job.id);
  assert.equal((await db.query("SELECT * FROM tbs_claim_sync('line')")).rows.length,0);
  assert.equal((await db.query('SELECT tbs_finish_sync($1,$2,$3,$4) ok',[job.id,job.lease_token,job.generation,'Temporary failure'])).rows[0].ok,true);
  await db.exec("UPDATE tbs_sync_jobs SET lease_until=now()-interval '1 second' WHERE kind='line'");
  const retry=(await db.query("SELECT * FROM tbs_claim_sync('line')")).rows[0];assert.equal(retry.id,job.id);assert.deepEqual(retry.payload,job.payload);
  await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[retry.id,retry.lease_token,retry.generation]);
  assert.equal((await db.query("SELECT * FROM tbs_claim_sync('line')")).rows.length,0);
 }finally{await db.close();}
});

test('employee half-day submission retains period and rolls back both queues on overlap',async()=>{
 const db=await fixture();try{
 const submit=async(p)=>(await db.query('SELECT tbs_employee_request($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
 const p={userId:'test',selectedDates:['2027-01-05','2027-01-06'],leaveDays:1,leaveType:'annual',halfDayPeriod:'morning',approverIds:['test-manager']};
 const r=await submit(p);assert.equal(r.ok,true);assert.equal(r.half_day_period,'morning');
 assert.equal((await submit(p)).statusCode,409);
 assert.equal((await submit({...p,halfDayPeriod:'afternoon'})).ok,true);
 const jobs=(await db.query("SELECT * FROM tbs_sync_jobs WHERE kind='line'")).rows;assert.equal(jobs.length,2);
 const action=jobs[0].payload.messages[0].contents.footer.contents[0].action.data;
 assert.match(action,/revision=[a-f0-9]{32}/);assert.match(action,/token=/);assert.ok(action.length<300);
 assert.equal((await db.query("SELECT year FROM tbs_sync_jobs WHERE kind='sheet'")).rows[0].year,2027);
 }finally{await db.close();}
});

test('failed sheet jobs do not block other employees and older acknowledgments preserve newer changes',async()=>{
 const db=await fixture();try{
  await db.exec("SELECT tbs_queue_sheet('test',2026); SELECT tbs_queue_sheet('other',2026);");
  const job=(await db.query("SELECT * FROM tbs_claim_sync('sheet')")).rows[0];
  await db.query('SELECT tbs_finish_sync($1,$2,$3,$4)',[job.id,job.lease_token,job.generation,'Unmapped employee']);
  const other=(await db.query("SELECT * FROM tbs_claim_sync('sheet')")).rows[0];
  assert.ok(other);assert.notEqual(other.user_id,job.user_id);
  await db.query('SELECT tbs_queue_sheet($1,2026)',[other.user_id]);
  assert.equal((await db.query('SELECT tbs_finish_sync($1,gen_random_uuid(),$2,NULL) ok',[other.id,other.generation])).rows[0].ok,false);
  await db.query('SELECT tbs_finish_sync($1,$2,$3,NULL)',[other.id,other.lease_token,other.generation]);
  const newest=(await db.query("SELECT * FROM tbs_claim_sync('sheet')")).rows[0];
  assert.equal(newest.id,other.id);assert.equal(Number(newest.generation),Number(other.generation)+1);
 }finally{await db.close();}
});

test('sheet snapshot carries verified destination and explicit reconciliation policy',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO tbs_sheet_employee_links(user_id,year,header,sheet_name,evidence,database_authoritative) VALUES('test',2026,'Name: TEST','TEST TAB','Fixture',true); SELECT tbs_queue_sheet('test',2026);");
  const {snapshot}=(await db.query(sql('sync-sheet-snapshot.sql'))).rows[0];
  assert.equal(snapshot.requireVerifiedLink,true);assert.equal(snapshot.sheetName,'TEST TAB');assert.equal(snapshot.sheetHeader,'Name: TEST');assert.equal(snapshot.databaseAuthoritative,true);
  assert.deepEqual(snapshot.entries,[]);
 }finally{await db.close();}
});

test('rollover supports individual carryover, expiry and notes without changing quotas',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total) VALUES('test',2026,12,30,3)");
  const settings={action:'preview',sourceYear:2026,carryLimit:5,expiresOn:'2027-03-31'};
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify({...settings,...p})])).rows[0].r;
  const override={userId:'test',carriedOver:7.5,expiresOn:'2027-06-30',note:'Approved exception for postponed leave'};
  const before=(await db.query('SELECT * FROM leave_quotas')).rows;
  await db.exec("UPDATE leave_quotas SET sick_total=NULL WHERE user_id='test'");
  const unlimitedBefore=(await db.query('SELECT * FROM leave_quotas')).rows;
  const base=await run({});assert.equal(base.rows[0].status,'Ready');assert.equal(base.rows[0].sickTotal,null);const adjusted=await run({overrides:[override]});assert.equal(adjusted.ok,true);
  assert.equal(adjusted.rows[0].unusedAnnual,12);assert.equal(adjusted.rows[0].carriedOver,7.5);assert.equal(adjusted.rows[0].note,override.note);assert.equal(adjusted.rows[0].expiresOn,override.expiresOn);assert.notEqual(adjusted.token,base.token);
  for(const bad of [{...override,carriedOver:13},{...override,carriedOver:.3},{...override,expiresOn:'2028-01-01'},{...override,userId:'missing'}])assert.equal((await run({overrides:[bad]})).statusCode,422);
  assert.equal((await run({overrides:[override,override]})).statusCode,422);
  assert.equal((await run({overrides:[{...override,carriedOver:0,note:''}]})).ok,true);
  assert.equal((await run({action:'apply',overrides:[override]})).statusCode,409);
  assert.deepEqual((await db.query('SELECT * FROM leave_quotas')).rows,unlimitedBefore);
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total) VALUES('test',2027,12,30,3)");
  assert.equal((await run({overrides:[override]})).statusCode,422);
 }finally{await db.close();}
});

test('rollover edits all allowances, detects stale source behind overrides, and saves notes with separate carryover',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('test',2026,12,30,3,5)");
  const settings={sourceYear:2026,expiresOn:'2027-03-31'};
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify({...settings,action:'preview',...p})])).rows[0].r;
  const base=await run({});assert.equal(base.rows[0].sourceAnnual,17);assert.equal(base.rows[0].sourceCarried,5);assert.equal(base.rows[0].annualTotal,12);
  const override={userId:'test',annualTotal:15,sickTotal:null,personalTotal:5,carriedOver:7.5,expiresOn:'2027-06-30',note:'Individual allowance review'};
  const preview=await run({overrides:[override]});assert.equal(preview.ok,true);
  await db.exec("UPDATE leave_quotas SET sick_total=20 WHERE year=2026");
  assert.equal((await run({action:'apply',token:preview.token,overrides:[override]})).statusCode,409);
  assert.equal((await db.query('SELECT * FROM leave_quotas WHERE year=2027')).rows.length,0);
  for(const patch of [{annualTotal:-1},{annualTotal:0.3},{personalTotal:null},{sickTotal:-1}])assert.equal((await run({overrides:[{...override,...patch}]})).statusCode,422);
  const fresh=await run({overrides:[override]});
  assert.equal((await run({action:'apply',token:fresh.token,overrides:[override]})).saved,1);
  const q=(await db.query('SELECT * FROM leave_quotas WHERE year=2027')).rows[0];
  assert.equal(Number(q.annual_total),15);assert.equal(q.sick_total,null);assert.equal(Number(q.personal_total),5);assert.equal(Number(q.carried_over),7.5);assert.equal(q.note,override.note);
  assert.equal(q.carryover_expires_on.toISOString().slice(0,10),'2027-06-30');
  const original=(await db.query('SELECT * FROM leave_quotas WHERE year=2026')).rows[0];assert.equal(Number(original.annual_total),12);assert.equal(Number(original.carried_over),5);
  assert.ok((await db.query("SELECT * FROM tbs_change_history WHERE after_value->>'year'='2027'")).rows.length);
  assert.ok((await db.query("SELECT * FROM tbs_sync_jobs WHERE kind='sheet' AND year=2027")).rows.length);
 }finally{await db.close();}
});

test('rollover pending leave reduces carryover and subsequent leave changes invalidate review',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('test',2026,12,30,3,0)");
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify({sourceYear:2026,expiresOn:'2027-03-31',action:'preview',...p})])).rows[0].r;
  const original=await run({});await mutate(db,'create',{...draft,status:'Pending'});
  assert.equal((await run({action:'apply',token:original.token})).statusCode,409);
  const preview=await run({});assert.equal(preview.rows[0].carriedOver,11.5);
  assert.equal((await run({action:'apply',token:preview.token})).saved,1);
 }finally{await db.close();}
});

test('quota updates reject stale versions and invalid amounts, preserve unlimited and edit expiry',async()=>{
 const db=await fixture();try{
  const run=async patch=>(await db.query('SELECT tbs_update_quota($1::jsonb) r',[JSON.stringify({userId:'test',year:2026,...patch})])).rows[0].r;
  assert.equal((await run({expectedRevision:'missing',annualTotal:12,sickTotal:null,personalTotal:3,carriedOver:5,carryoverExpiresOn:'2026-03-31'})).ok,true);
  const before=(await db.query(sql('get-all-leaves.sql'),[2026])).rows[0];
  assert.equal(before.sickTotal,null);assert.match(before.quotaRevision,/^[a-f0-9]{32}$/);
  for(const patch of [{annualTotal:-1},{sickTotal:-1},{personalTotal:null},{carriedOver:.3},{carryoverExpiresOn:'2027-01-01'}])assert.equal((await run({expectedRevision:before.quotaRevision,...patch})).statusCode,422);
  assert.equal((await run({expectedRevision:before.quotaRevision,sickTotal:20,carryoverExpiresOn:'2026-06-30'})).ok,true);
  assert.equal((await run({expectedRevision:before.quotaRevision,annualTotal:1})).statusCode,409);
  const current=(await db.query(sql('get-all-leaves.sql'),[2026])).rows[0];
  assert.equal((await run({expectedRevision:current.quotaRevision,sickTotal:null,note:'Note only preserves carry',carryoverExpiresOn:null})).ok,true);
  const q=(await db.query('SELECT * FROM leave_quotas')).rows[0];assert.equal(q.sick_total,null);assert.equal(q.carryover_expires_on,null);assert.equal(Number(q.carried_over),5);assert.equal(Number(q.annual_total),12);
 }finally{await db.close();}
});

test('changed source leave flags rollover for review; correction preserves manual differences and target base quotas',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO leave_quotas(user_id,year,annual_total,sick_total,personal_total,carried_over) VALUES('test',2026,12,NULL,3,0)");
  const run=async p=>(await db.query('SELECT tbs_rollover($1::jsonb) r',[JSON.stringify({sourceYear:2026,expiresOn:'2027-03-31',action:'preview',...p})])).rows[0].r;
  const overrides=[{userId:'test',carriedOver:5,expiresOn:'2027-03-31',note:'Keep seven days out of carryover'}];
  const preview=await run({overrides});assert.equal((await run({action:'apply',token:preview.token,overrides})).saved,1);
  await db.exec("UPDATE leave_quotas SET annual_total=20,personal_total=4,carryover_expires_on=NULL WHERE year=2027");
  const leave=await mutate(db,'create',{...draft,leaveDays:1,halfDayPeriod:null,status:'Pending'});assert.equal(leave.ok,true);
  assert.equal((await db.query(sql('get-all-leaves.sql'),[2027])).rows[0].rolloverNeedsReview,true);
  const review=await run({reconcile:true});assert.equal(review.rows[0].carriedOver,4);assert.equal(review.rows[0].previousCarryover,5);assert.equal(review.rows[0].annualTotal,20);assert.equal(review.rows[0].expiresOn,null);
  assert.equal((await run({action:'apply',reconcile:true,token:review.token})).saved,1);
  assert.equal((await db.query(sql('get-all-leaves.sql'),[2027])).rows[0].rolloverNeedsReview,false);
  const q=(await db.query('SELECT * FROM leave_quotas WHERE year=2027')).rows[0];assert.equal(Number(q.annual_total),20);assert.equal(Number(q.personal_total),4);assert.equal(q.sick_total,null);assert.equal(q.carryover_expires_on,null);
  assert.equal((await mutate(db,'delete',{id:leave.id,scope:'request',expectedDates:['2026-01-05']})).ok,true);
  const second=await run({reconcile:true});assert.equal(second.rows[0].carriedOver,5);
  assert.equal((await run({action:'apply',reconcile:true,token:review.token})).statusCode,409);
 }finally{await db.close();}
});
