import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
const realFetch=globalThis.fetch;
let sent=[],reply=()=>({ok:true,json:async()=>({translation:'Attending a family funeral'})});
globalThis.fetch=async(url,init)=>{sent.push({url,init,body:JSON.parse(init.body)});return reply(init);};
process.env.CEO_WEBHOOK_SECRET='test-secret';
const {withTranslation,translationTarget}=loadTS()('api/_lib/translateReason.ts');
let calls=[];
const handler=loadTS({
 '../_lib/lineIdentity.js':{verifyLineIdentity:async()=>'verified-account'},
 '../_lib/n8nClient.js':{N8N_BASE:'https://n8n.test',n8nPost:async(...args)=>{calls.push(args);return [{ok:true}];}},
})('api/_handlers/employee-request.ts').default;
const submit=async body=>{const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},send(v){this.body=JSON.parse(v);return this;}};await handler({method:'POST',headers:{authorization:'Bearer valid'},body},res);return res;};
test('Thai reasons gain an English line and English reasons gain a Thai line',async()=>{
 sent=[];
 assert.equal(translationTarget('ร่วมงานศพครอบครัว'),'EN');assert.equal(translationTarget('Family funeral'),'TH');
 assert.equal(await withTranslation(' ร่วมงานศพครอบครัว ',2000),'ร่วมงานศพครอบครัว\n(EN) Attending a family funeral');
 assert.match(sent[0].url,/\/webhook\/translate-reason$/);
 assert.equal(sent[0].init.headers['x-ceo-webhook-secret'],'test-secret');
 assert.deepEqual(sent[0].body,{text:'ร่วมงานศพครอบครัว',target:'EN'});
 reply=()=>({ok:true,json:async()=>[{translation:'ไปงานศพ\nของครอบครัว'}]});
 assert.equal(await withTranslation('Family funeral',2000),'Family funeral\n(TH) ไปงานศพ ของครอบครัว');
 assert.equal(sent[1].body.target,'TH');
});
test('original text is kept when translation is unavailable, pointless or too long',async()=>{
 sent=[];reply=()=>({ok:false,status:500,json:async()=>({})});
 assert.equal(await withTranslation('ป่วย',2000),'ป่วย');
 reply=()=>{throw new Error('offline');};
 assert.equal(await withTranslation('ป่วย',2000),'ป่วย');
 reply=()=>({ok:true,json:async()=>({translation:'Sick'})});
 assert.equal(await withTranslation('ป่วย',6),'ป่วย');
 assert.equal(await withTranslation('sick',2000),'sick');
 const before=sent.length;
 assert.equal(await withTranslation('',2000),'');
 assert.equal(await withTranslation(undefined,1000),'');
 assert.equal(await withTranslation('-',2000),'-');
 assert.equal(await withTranslation('ป่วย\n(EN) Sick',2000),'ป่วย\n(EN) Sick');
 assert.equal(sent.length,before);
 delete process.env.CEO_WEBHOOK_SECRET;
 assert.equal(await withTranslation('ป่วย',2000),'ป่วย');
 assert.equal(sent.length,before);
 process.env.CEO_WEBHOOK_SECRET='test-secret';
});
test('leave submission stores both languages and keeps emergency text identical',async()=>{
 calls=[];sent=[];reply=()=>({ok:true,json:async()=>({translation:'Family funeral'})});
 const r=await submit({leaveType:'personal',selectedDates:['2099-01-05'],leaveDays:1,reason:'ร่วมงานศพครอบครัว',emergencyReason:'ร่วมงานศพครอบครัว'});
 assert.equal(r.statusCode,200);
 const payload=calls[0][1].payload;
 assert.equal(payload.reason,'ร่วมงานศพครอบครัว\n(EN) Family funeral');
 assert.equal(payload.emergencyReason,payload.reason);
 assert.equal(sent.length,1);
 assert.equal(payload.userId,'verified-account');
 calls=[];reply=()=>{throw new Error('offline');};
 assert.equal((await submit({leaveType:'sick',selectedDates:['2099-01-05'],leaveDays:1,reason:'ป่วย'})).statusCode,200);
 assert.equal(calls[0][1].payload.reason,'ป่วย');
});
test.after(()=>{globalThis.fetch=realFetch;});
