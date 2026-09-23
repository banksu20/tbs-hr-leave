import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import loadTS from './load-ts.cjs';
const load = loadTS();
const { expandRequest } = load('api/_lib/expandRequests.ts');
const { requestUpdateSchema } = load('api/_lib/requestMutation.ts');
const sql = (name) => readFileSync(`n8n/sql/${name}`, 'utf8');
const db = new PGlite();
await db.exec(`
CREATE TABLE tbs_employees (user_id text PRIMARY KEY, tbs_id int, first_name text, last_name text, nickname text, department text, status text, start_date date);
CREATE TABLE leave_quotas (user_id text, year int, annual_total numeric, sick_total numeric, personal_total numeric, carried_over numeric, note text, updated_at timestamptz, UNIQUE(user_id,year));
CREATE TABLE leave_requests (id serial PRIMARY KEY, user_id text, user_name text, department text, leave_type text, leave_days numeric, start_date date, end_date date, selected_dates text, reason text, status text, source text);
INSERT INTO tbs_employees VALUES ('test-employee',7,'Test','Person','Tester','QA','active','2020-01-01');
INSERT INTO leave_quotas VALUES ('test-employee',2026,12,30,3,0,'',now()),('test-employee',2027,12,30,3,0,'',now());
`);
await db.exec(sql('001_request_safety.sql'));
await db.exec(sql('003_year_rollover.sql'));
const mutate = async (operation, body) => (await db.query('SELECT tbs_dashboard_request($1, $2::jsonb) AS result', [operation, JSON.stringify(body)])).rows[0].result;
const draft = { userId:'test-employee', leaveDate:'2026-12-31', leaveType:'annual', leaveDays:0.5, halfDayPeriod:'afternoon', reason:'Doctor, appointment', status:'Approved' };
let id;

test('numeric IDs are retained separately from stable per-date UI keys', () => {
  const records = expandRequest({id:123,leave_type:'annual',leave_days:2,selected_dates:'2026-12-31,2027-01-04',status:'Approved'}, 0);
  assert.deepEqual(records.map((row) => row.requestId), ['123','123']);
  assert.deepEqual(records.map((row) => row.id), ['123@2026-12-31','123@2027-01-04']);
  assert.deepEqual(records[0].requestDates,['2026-12-31','2027-01-04']);
});
test('half-day requires a period at both API and database boundaries', async () => {
  assert.equal(requestUpdateSchema.safeParse({ scope:'request',expectedDates:['2026-12-31'],dates:['2026-12-31'],type:'annual',daysPerDate:0.5,halfDayPeriod:null,note:'',status:'Approved' }).success, false);
  assert.equal((await mutate('create', {...draft,halfDayPeriod:null})).ok, false);
  const result = await mutate('create',draft); assert.equal(result.ok,true); id=result.id;
  const row = (await db.query('SELECT * FROM leave_requests WHERE id=$1',[id])).rows[0];
  assert.equal(row.half_day_period,'afternoon'); assert.equal(row.reason,'Doctor, appointment');
});
test('invalid IDs and missing employee cannot report a successful write', async () => {
  assert.equal((await mutate('delete',{id:'req_0_0',scope:'request',expectedDates:['2026-12-31']})).statusCode,422);
  assert.equal((await mutate('create',{...draft,userId:'missing'})).statusCode,404);
});
test('complete request update preserves all dates and clears an obsolete half-day period', async () => {
  const result = await mutate('update',{id,scope:'request',expectedDates:['2026-12-31'],leaveDates:['2026-12-31','2027-01-04'],leaveType:'annual',leaveDays:2,halfDayPeriod:null,reason:'Trip, family',status:'Approved'});
  assert.equal(result.ok,true);
  const row=(await db.query('SELECT * FROM leave_requests WHERE id=$1',[id])).rows[0];
  assert.equal(row.selected_dates,'2026-12-31,2027-01-04'); assert.equal(row.half_day_period,null);
});
test('stale or individual-day delete cannot reject a multi-day request', async () => {
  const result=await mutate('delete',{id,scope:'request',expectedDates:['2026-12-31']});
  assert.equal(result.statusCode,409);
  assert.equal((await db.query('SELECT status FROM leave_requests WHERE id=$1',[id])).rows[0].status,'Approved');
});
test('cross-year dashboard includes the request and quotas charge only dates in that year', async () => {
  for(const year of [2026,2027]) {
    const employee=(await db.query(sql('get-all-leaves.sql'),[year])).rows[0];
    assert.equal(employee.requests.length,1);
    assert.deepEqual(employee.requests[0].selected_dates,['2026-12-31','2027-01-04']);
    const quota=(await db.query(sql('get-quota.sql'),['test-employee',year])).rows[0];
    assert.equal(quota.annualTaken,1);assert.equal(quota.remainingDays,11);
  }
});
test('employee-code changes use the same tbs_id column that dashboard reads',async()=>{
  const result=(await db.query(sql('employee-profile.sql'),[JSON.stringify({userId:'test-employee',empNo:9,nickname:'Test, Jr'})])).rows[0];
  assert.equal(result.ok,true);
  const employee=(await db.query(sql('get-all-leaves.sql'),[2026])).rows[0];
  assert.equal(employee.tbs_id,9);assert.equal(employee.nickname,'Test, Jr'); assert.equal(employee.first_name,'Test');
});
test('explicit whole-request removal rejects all dates and restores both year balances',async()=>{
  assert.equal((await mutate('delete',{id,scope:'request',expectedDates:['2027-01-04','2026-12-31']})).ok,true);
  for(const year of [2026,2027]) assert.equal((await db.query(sql('get-quota.sql'),['test-employee',year])).rows[0].annualTaken,0);
});
test.after(async()=>{await db.close();});
