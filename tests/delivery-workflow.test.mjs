import test from 'node:test';import assert from 'node:assert/strict';
import {calendarSyncNodes,calendarSyncConnections} from '../scripts/patch-calendar-sync.mjs';
import {calendarMonitoringOperations} from '../scripts/patch-delivery-monitoring.mjs';
test('calendar monitoring handles no-op success and every external failure, without rerunning writes blindly',()=>{
 const connections={};for(const [from,to] of calendarSyncConnections)connections[from]={main:[[{node:to,index:0,type:'main'}]]};
 const ops=calendarMonitoringOperations({nodes:calendarSyncNodes(),connections});
 assert.ok(ops.some(o=>o.type==='addConnection'&&o.source==='Calendar has changes?'&&o.sourceIndex===1&&o.target==='Record calendar success'));
 for(const source of ['Read Staff Leave access','Read existing calendar events','Write managed calendar events','Check calendar write results'])assert.ok(ops.some(o=>o.type==='addConnection'&&o.source===source&&o.sourceIndex===1&&o.target==='Record calendar failure'));
 assert.ok(ops.some(o=>o.type==='addConnection'&&o.source==='Claim calendar sync'&&o.target==='Read Staff Leave access'));
 assert.equal(ops.some(o=>o.type==='updateNodeParameters'&&o.nodeName==='Write managed calendar events'),false);
});
