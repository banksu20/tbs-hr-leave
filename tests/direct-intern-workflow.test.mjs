import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {patchDirectInternApproval} from '../scripts/patch-direct-intern-approval.mjs';
test('direct approval patch preserves routes, forwards actor and stops test FYI fan-out',()=>{
 const w={nodes:[{name:'Update DB (Approve)',parameters:{options:{}},credentials:{postgres:{id:'keep'}}},{name:'Prepare Approve Payload',parameters:{}},{name:'Get Dept for CM',parameters:{}},{name:'Find CM to Notify',parameters:{jsCode:"return {hasCm:true};"}},{name:'Check Message',parameters:{conditions:{conditions:[{leftValue:'={{ $json.body.events[0].postback.data }}'}]}}}],connections:{keep:true}};
 const p=patchDirectInternApproval(w);assert.deepEqual(patchDirectInternApproval(p),p);assert.deepEqual(p.connections,w.connections);assert.deepEqual(p.nodes[0].credentials,w.nodes[0].credentials);
 assert.match(p.nodes[0].parameters.options.queryReplacement,/accountId:.*cmUserId/);
 const run=(name,test)=>vm.runInNewContext('(function(){'+p.nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$:()=>({first:()=>({json:{isolatedTest:test}})})});
 assert.equal(run('Find CM to Notify',true).length,0);assert.equal(run('Find CM to Notify',false).hasCm,true);
 assert.match(run('Prepare Approve Payload',true).reply_message_cm,/Test approved/);
});
