import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
import {patchLeavePolicy} from '../scripts/patch-leave-policy.mjs';
let calls=[];
const mocked=loadTS({
 './_lib/lineIdentity.js':{verifyLineIdentity:async token=>{if(token!=='Bearer valid')throw Error('bad');return 'verified-account';}},
 './_lib/n8nClient.js':{N8nMutationError:class extends Error{},n8nPost:async (...args)=>{calls.push(args);return [{ok:true,balances:[]}];}},
})('api/leave-policy.ts').default;
const request=async body=>{
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}};
 await mocked({method:'POST',headers:{authorization:'Bearer valid'},body},res);return res;
};
test('policy API uses verified identity, rejects invalid dates and unwraps workflow results',async()=>{
 calls=[];
 const r=await request({accountId:'victim',type:'personal',dates:['2026-10-15'],daysPerDate:.5});
 assert.equal(r.statusCode,200);assert.equal(r.body.ok,true);
 assert.equal(calls[0][1].payload.accountId,'verified-account');
 assert.equal((await request({type:'personal',dates:['2026-02-30'],daysPerDate:1})).statusCode,422);
 assert.equal(calls.length,1);
});
test('workflow patch is idempotent and preserves other routes and credentials',()=>{
 const w={nodes:[{name:'Register User API'},{name:'Main Webhook'},{name:'Employee cancellations',parameters:{query:"SELECT CASE WHEN $1='sick-review' THEN old() ELSE other() END"},credentials:{secret:'reference'}},{name:'Get quota',parameters:{query:'old',options:{queryReplacement:'existing params'}}}],connections:{unchanged:true}};
 const p=patchLeavePolicy(w);assert.deepEqual(patchLeavePolicy(p),p);assert.match(p.nodes[2].parameters.query,/sick-review/);assert.deepEqual(p.nodes[2].credentials,w.nodes[2].credentials);assert.deepEqual(p.nodes[3].parameters.options,w.nodes[3].parameters.options);assert.deepEqual(p.connections,w.connections);assert.equal(w.nodes[3].parameters.query,'old');
});
