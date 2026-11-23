import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
let sent=[],reply=()=>({ok:true,json:async()=>({amount:65,date:'2026-11-23',kind:'toll'})});
globalThis.fetch=async(url,init)=>{sent.push({url,init,body:JSON.parse(init.body)});return reply(init);};
process.env.CEO_WEBHOOK_SECRET='test-secret';
const {readReceipt}=loadTS({'./n8nClient.js':{N8N_BASE:'https://n8n.test'}})('api/_lib/readReceipt.ts');

test('receipt photos are read through the secured n8n route',async()=>{
 sent=[];
 assert.deepEqual(await readReceipt('image/jpeg','abc'),{amount:65,date:'2026-11-23',kind:'toll'});
 assert.equal(sent[0].url,'https://n8n.test/webhook/read-receipt');
 assert.equal(sent[0].init.headers['x-ceo-webhook-secret'],'test-secret');
 assert.deepEqual(sent[0].body,{mime:'image/jpeg',content:'abc'});
 reply=()=>({ok:true,json:async()=>[{amount:120.456,date:'23/11/2569',kind:'boat'}]});
 assert.deepEqual(await readReceipt('image/png','abc'),{amount:120.46,date:null,kind:null});
});

test('PDFs, failures and nonsense fall back to typing the amount',async()=>{
 sent=[];
 assert.deepEqual(await readReceipt('application/pdf','abc'),{amount:null,date:null,kind:null});
 assert.equal(sent.length,0);
 reply=()=>({ok:false,status:500,json:async()=>({})});
 assert.deepEqual(await readReceipt('image/jpeg','abc'),{amount:null,date:null,kind:null});
 reply=()=>{throw new Error('offline');};
 assert.deepEqual(await readReceipt('image/jpeg','abc'),{amount:null,date:null,kind:null});
 reply=()=>({ok:true,json:async()=>({amount:-5})});
 assert.deepEqual(await readReceipt('image/jpeg','abc'),{amount:null,date:null,kind:null});
});
