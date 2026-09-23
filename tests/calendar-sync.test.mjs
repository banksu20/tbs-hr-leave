import test from 'node:test';
import assert from 'node:assert/strict';
import {planCalendarSync} from '../n8n/js/calendar-projection.mjs';
const employee={user_id:'test',empNo:33,name:'Test Person',nickname:'Tester',status:'active'};
const entry={userId:'test',requestId:'100',date:'2026-10-01',days:0.5,period:'morning',status:'Approved',eventId:'tbsleave12345'};
const snapshot=(entries=[entry])=>({startDate:'2026-09-23',endDate:'2028-09-23',employees:[employee],entries});
const plan=(entries=[entry],events=[])=>planCalendarSync(snapshot(entries),[{items:events}]);
const manual=(summary='Tester - Holiday',start='2026-10-01',end='2026-10-02')=>({id:'manual1',summary,start:{date:start},end:{date:end},status:'confirmed',etag:'"manual"'});
const managed=()=>({...plan().operations[0].body,etag:'"original"'});
test('approved only, fractional days labelled without guessing working hours or exposing reasons',()=>{
 const result=plan([entry,{...entry,status:'Pending',date:'2026-10-02'}]);
 assert.equal(result.operations.length,1);const b=result.operations[0].body;
 assert.match(b.summary,/0.5 day · AM/);assert.deepEqual(b.start,{date:'2026-10-01'});assert.deepEqual(b.end,{date:'2026-10-02'});
 assert(!('attendees' in b));assert(!b.description.includes('sick'));assert.equal(b.extendedProperties.private.requestIds,'100');
});
test('same-person manual overlap suppresses creation; other employees do not',()=>{
 assert.equal(plan([entry],[manual()]).operations.length,0);
 assert.equal(plan([entry],[manual()]).skipped.length,1);
 const s=snapshot();s.employees.push({user_id:'other',empNo:2,name:'Other Person',nickname:'Other'});
 assert.equal(planCalendarSync(s,[{items:[manual('Other - Holiday')]}]).operations.length,1);
 assert.equal(plan([entry],[manual('Unknown - Holiday')]).operations.length,0);
});
test('timed overlap uses Bangkok date, with exclusive midnight end',()=>{
 const timed={...manual(),start:{dateTime:'2026-09-30T17:00:00Z'},end:{dateTime:'2026-10-01T05:00:00Z'}};
 assert.equal(plan([entry],[timed]).operations.length,0);
 assert.equal(plan([entry],[{...timed,end:{dateTime:'2026-09-30T17:00:00Z'},start:{dateTime:'2026-09-30T05:00:00Z'}}]).operations.length,1);
});
test('repeat sync is idempotent, edit is conditional and cancellation only touches owned events',()=>{
 const existing=managed();assert.equal(plan([entry],[existing]).operations.length,0);
 const changed=plan([{...entry,days:1,period:null}],[existing]).operations;
 assert.equal(changed.length,1);assert.equal(changed[0].method,'PATCH');assert.equal(changed[0].etag,'"original"');
 const cancelled=plan([],[existing,manual()]).operations;
 assert.equal(cancelled.length,1);assert.deepEqual(cancelled[0].body,{status:'cancelled'});
 const restored=plan([entry],[{...existing,status:'cancelled'}]).operations;
 assert.equal(restored.length,1);assert.equal(restored[0].body.status,'confirmed');
});
test('a manual event added later replaces only the managed copy',()=>{
 const result=plan([entry],[managed(),manual()]);
 assert.equal(result.operations.length,1);assert.equal(result.operations[0].id,entry.eventId);assert.deepEqual(result.operations[0].body,{status:'cancelled'});
});
test('fail closed on partial snapshots, missing etag, ID collision and pagination truncation',()=>{
 assert.throws(()=>planCalendarSync(snapshot(),[{items:[],nextPageToken:'more'}]),/Incomplete/);
 assert.throws(()=>planCalendarSync({...snapshot(),employees:[]},[{items:[]}]),/Incomplete/);
 assert.throws(()=>plan([{...entry,days:-1}]),/Invalid/);
 assert.throws(()=>plan([],[{...managed(),etag:undefined}]),/version/);
 assert.throws(()=>plan([entry],[{...manual('No match'),id:entry.eventId,start:{date:'2026-09-25'},end:{date:'2026-09-26'}}]),/collision/);
});
test('multiple pages and duplicate names conservatively skip collisions',()=>{
 const s=snapshot();s.employees.push({...employee,user_id:'duplicate',empNo:30});
 const result=planCalendarSync(s,[{items:[manual()],nextPageToken:'second'},{items:[]}]);
 assert.equal(result.operations.length,0);assert.equal(result.warnings.length,1);
 assert.throws(()=>planCalendarSync(s,[{items:[manual()]},{items:[manual()]}]),/Duplicate/);
});

test('Google JSON key order does not cause repeated updates',()=>{
 const e=managed();e.extendedProperties.private=Object.fromEntries(Object.entries(e.extendedProperties.private).reverse());
 assert.equal(plan([entry],[e]).operations.length,0);
});

test('verified calendar aliases match the employee without blocking others',()=>{
 const s=snapshot();s.employees.push({user_id:'ruj',empNo:2,name:'Rapeeroj Pokpa',nickname:'Julian'});
 const events=[{items:[manual('Ruj - Holiday')]}];
 const r=planCalendarSync(s,events,{'2':['Ruj']});
 assert.equal(r.operations.length,1);assert.equal(r.warnings.length,0);
});
