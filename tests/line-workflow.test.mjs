import test from 'node:test';
import assert from 'node:assert/strict';
import {patchLineDecisions} from '../scripts/patch-line-decisions.mjs';
test('LINE patch gates legacy sheet writes and success notifications behind database decisions',()=>{
 const names=['Prepare Check Data','Update DB (Approve)','Prepare Approve Payload','Get Dept for CM','Notify CM (Already Processed)','Code1','Update DB (Reject)','Clear Leave Data','Respond Error (Already Processed)','Get Current Quota','Check Current Status','Is Awaiting Approval?','Get Status Before Reject','Is Awaiting Approval? (Reject)','Register User API'];
 const original={nodes:names.map(name=>({id:name,name,type:'test',parameters:{jsCode:name==='Prepare Approve Payload'?"const statusData = $('Check Current Status').first().json;":''}})),connections:{'Register User API':{main:[[{node:'Other unchanged node',type:'main',index:0}]]}}};
 const w=patchLineDecisions(original);
 const targets=name=>w.connections[name].main.map(x=>x.map(y=>y.node));
 assert.deepEqual(targets('Prepare Check Data'),[['Update DB (Approve)']]);
 assert.deepEqual(targets('LINE Approve saved?'),[['Prepare Approve Payload'],['Notify CM (Already Processed)']]);
 assert.deepEqual(targets('LINE Reject saved?'),[['Clear Leave Data'],['Respond Error (Already Processed)']]);
 assert.deepEqual(targets('Code1'),[['Update DB (Reject)']]);
 assert.deepEqual(targets('Clear Leave Data'),[['Get Current Quota']]);
 assert.deepEqual(w.connections['Register User API'],original.connections['Register User API']);
 assert.ok(w.nodes.find(n=>n.name==='Check Current Status').disabled);
 assert.match(w.nodes.find(n=>n.name==='Update DB (Reject)').parameters.options.queryReplacement,/JSON.stringify/);
 assert.doesNotMatch(w.nodes.find(n=>n.name==='Prepare Approve Payload').parameters.jsCode,/\$\('Check Current Status'\)/);
 assert.equal(patchLineDecisions(w).nodes.length,w.nodes.length);
});
