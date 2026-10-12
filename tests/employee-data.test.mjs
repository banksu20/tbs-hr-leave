import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
function fixture(profile={found:true,department:'AI'}){
 const calls=[];
 const handler=loadTS({
  '../_lib/lineIdentity.js':{verifyLineIdentity:async token=>{if(token!=='Bearer valid')throw Error();return 'verified-account';}},
  '../_lib/n8nClient.js':{n8nPost:async(_endpoint,body)=>{calls.push(body);return profile;},n8nGet:async(endpoint,params)=>{calls.push({endpoint,params});return {result:true};}},
 })('api/_handlers/employee-data.ts').default;
 return {calls,async request(query,token='Bearer valid'){
  const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}};
  await handler({method:'GET',query,headers:{authorization:token}},res);return res;
 }};
}
test('employee reads require LINE authentication before accessing workflow data',async()=>{const f=fixture();assert.equal((await f.request({action:'get-quota'},'')).statusCode,401);assert.equal(f.calls.length,0);});
test('quota and history ignore caller-supplied employee identity',async()=>{for(const action of ['get-quota','get-leave-history']){const f=fixture();assert.equal((await f.request({action,userId:'someone-else'})).statusCode,200);assert.equal(f.calls[0].payload.accountId,'verified-account');assert.deepEqual(f.calls[1].params,{userId:'verified-account'});}});
test('inactive and unregistered accounts cannot read employee data',async()=>{for(const profile of [{found:false},{found:true,inactive:true}]){const f=fixture(profile);assert.equal((await f.request({action:'get-quota'})).statusCode,403);assert.equal(f.calls.length,1);}});
test('calendar enforces department access and validates dates',async()=>{const f=fixture();for(const query of [{department:'Finance',year:'2026',month:'10'},{department:'AI',year:'2026',month:'13'}])assert.ok([403,422].includes((await f.request({action:'get-team-calendar',...query})).statusCode));assert.equal(f.calls.filter(c=>c.endpoint).length,0);assert.equal((await f.request({action:'get-team-calendar',department:'AI',year:'2026',month:'10'})).statusCode,200);});
test('tech team retains its paired calendar access without allowing other departments',async()=>{const f=fixture({found:true,department:'Web Developer'});assert.equal((await f.request({action:'get-team-calendar',department:'UX/UI Designer',year:'2026',month:'10'})).statusCode,200);assert.equal((await f.request({action:'get-team-calendar',department:'Content',year:'2026',month:'10'})).statusCode,403);});
import {patchEmployeeReadAuth} from '../scripts/patch-employee-read-auth.mjs';
test('workflow protection is idempotent and preserves every connection and existing credential',()=>{
 const names=['Check User API','Get Quota API','Webhook get history','Webhook Get Calendar'];
 const source={nodes:[{name:'Webhook get all leaves',credentials:{httpHeaderAuth:{id:'existing',name:'server'}}},...names.map(name=>({name,parameters:{path:name,responseMode:'responseNode'}}))],connections:{unchanged:true}};
 const result=patchEmployeeReadAuth(source);
 assert.deepEqual(patchEmployeeReadAuth(result),result);assert.deepEqual(result.connections,source.connections);
 for(const n of result.nodes.slice(1)){assert.equal(n.parameters.authentication,'headerAuth');assert.equal(n.credentials.httpHeaderAuth.id,'existing');}
 assert.equal(source.nodes[1].parameters.authentication,undefined);
});
