import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
import {patchLeavePolicy} from '../scripts/patch-leave-policy.mjs';
let calls=[];
const mocked=loadTS({
 '../_lib/lineIdentity.js':{verifyLineIdentity:async token=>{if(token!=='Bearer valid')throw Error('bad');return 'verified-account';}},
 '../_lib/n8nClient.js':{N8nMutationError:class extends Error{},n8nPost:async (...args)=>{calls.push(args);return [{ok:true,balances:[]}];}},
})('api/_handlers/leave-policy.ts').default;
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
test('bundled policy router uses the URL path and preserves query parameters without exposing unknown handlers',async()=>{
 let called='';const names=['employee-data','company-holidays','employee-request','intern-decision','intern-terms','leave-evidence','leave-policy','registration'];
 const stubs=Object.fromEntries(names.map(name=>['./_handlers/'+name+'.js',{default:async(req,res)=>{called=name;res.status(200).send(JSON.stringify({query:req.query}));}}]));
 const handler=loadTS(stubs)('api/[policy].ts').default;
 const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}});
 for(const name of names){const res=response();await handler({url:'/api/'+name+'?year=2026',query:{year:'2026',policy:'different'}},res);assert.equal(called,name);assert.equal(res.body.query.year,'2026');}
 const res=response();await handler({url:'/api/unknown',query:{policy:'registration'}},res);assert.equal(res.statusCode,404);
});
test('employee submission rejects backdating before workflow calls and uses Bangkok day boundaries',async()=>{
 let forwarded=0;
 const handler=loadTS({'../_lib/lineIdentity.js':{verifyLineIdentity:async()=> 'verified'},'../_lib/n8nClient.js':{n8nPost:async()=>{forwarded++;return {ok:true};}}})('api/_handlers/employee-request.ts').default;
 const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}});
 for(const type of ['sick','personal','annual','university']){const res=response();await handler({method:'POST',headers:{authorization:'Bearer valid'},body:{leaveType:type,selectedDates:['2001-01-01'],leaveDays:1,reason:'Test',emergencyReason:'Emergency'}},res);assert.equal(res.statusCode,422);assert.match(res.body.error,/past dates/);}
 assert.equal(forwarded,0);
 const res=response();await handler({method:'POST',headers:{authorization:'Bearer valid'},body:{leaveType:'personal',selectedDates:['2099-10-01'],leaveDays:1,reason:'Test'}},res);assert.equal(res.statusCode,200);assert.equal(forwarded,1);
 const {todayInBangkok}=loadTS()('api/_lib/date.ts');assert.equal(todayInBangkok(new Date('2026-10-13T16:59:59Z')),'2026-10-13');assert.equal(todayInBangkok(new Date('2026-10-13T17:00:00Z')),'2026-10-14');
});
test('employee request API accepts optional annual reasons but keeps sick and university validation',async()=>{
 const calls=[];const handler=loadTS({'../_lib/lineIdentity.js':{verifyLineIdentity:async()=> 'verified'},'../_lib/n8nClient.js':{n8nPost:async(...args)=>{calls.push(args);return {ok:true};}}})('api/_handlers/employee-request.ts').default;
 for(const leaveType of ['annual','vacation','personal','sick','university']){
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}};
 await handler({method:'POST',headers:{authorization:'Bearer valid'},body:{leaveType,selectedDates:['2099-10-15'],leaveDays:1}},res);
 assert.equal(res.statusCode,['sick','university'].includes(leaveType)?422:200,leaveType);
 }
 assert.equal(calls.length,3);for(const [,data] of calls)assert.equal(data.payload.reason,'');
});
