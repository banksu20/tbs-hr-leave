import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
import {patchSickNotifications} from '../scripts/patch-sick-notifications.mjs';
test('notification workflow patch preserves existing routes and is idempotent',()=>{
 const old={nodes:[{id:'original',name:'Employee cancellations',type:'n8n-nodes-base.postgres',credentials:{postgres:{id:'example',name:'Postgres'}},parameters:{query:"SELECT CASE WHEN $1::text='admin-delivery' THEN tbs_delivery_status() ELSE tbs_cancellation($1::text,$2::jsonb) END AS result;"}}],connections:{Existing:{main:[[{node:'Other',type:'main',index:0}]]}}};
 const first=patchSickNotifications(old),second=patchSickNotifications(first);
 assert.deepEqual(first,second);assert.equal(old.nodes.length,1);assert.deepEqual(second.connections.Existing,old.connections.Existing);
 assert.equal(second.nodes.length,3);assert.match(second.nodes[0].parameters.query,/admin-delivery/);
});
test('acknowledgement API uses verified LINE identity, separates read/write and rejects invalid input',async()=>{
 let authenticated=true;const calls=[];
 const {default:handler}=loadTS({
  './_lib/lineIdentity.js':{verifyLineIdentity:async()=>{if(!authenticated)throw Error('No session');return 'verified-account';}},
  './_lib/n8nClient.js':{N8nMutationError:class extends Error{},n8nPost:async(endpoint,body)=>{calls.push({endpoint,...body});return {ok:true};}}
 })('api/sick-acknowledgements.ts');
 const link={id:'00000000-0000-4000-8000-000000000001',token:'00000000-0000-4000-8000-000000000002'};
 const send=async(method,body=link)=>{const res={status(n){this.code=n;return this;},setHeader(){},send(v){this.body=JSON.parse(v);}};await handler({method,body,query:body,headers:{}},res);return res;};
 assert.equal((await send('GET')).code,200);assert.equal(calls[0].operation,'sick-review');
 assert.equal((await send('POST',{...link,accountId:'forged'})).code,200);assert.equal(calls[1].payload.accountId,'verified-account');assert.equal(calls[1].operation,'sick-acknowledge');
 assert.equal((await send('POST',{...link,token:'bad'})).code,422);
 authenticated=false;assert.equal((await send('POST')).code,401);assert.equal(calls.length,2);
 assert.equal((await send('DELETE')).code,405);
});
