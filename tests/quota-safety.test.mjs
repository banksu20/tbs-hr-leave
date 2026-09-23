import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';

test('quota API rejects invalid input before forwarding and keeps explicit unlimited values',async()=>{
 const calls=[];
 const {default:handler}=loadTS({'./_lib/n8nClient.js':{n8nPost:async(_endpoint,body)=>{calls.push(body);return {ok:true}},N8nMutationError:class extends Error{},N8nNotRegisteredError:class extends Error{},N8nUnavailableError:class extends Error{}}})('api/quota.ts');
 const send=async body=>{const res={status(n){this.code=n;return this},setHeader(){return this},send(v){this.body=JSON.parse(v);return this}};await handler({method:'PATCH',headers:{},body:{userId:'test',year:2026,expectedRevision:'a'.repeat(32),...body}},res);return res};
 for(const body of [{annualTotal:-1},{sickTotal:-1},{carriedOver:.3},{personalTotal:null},{expectedRevision:undefined},{carryoverExpiresOn:'2027-01-01'}])assert.equal((await send(body)).code,422);
 assert.equal(calls.length,0);assert.equal((await send({sickTotal:null,carriedOver:0,carryoverExpiresOn:null})).code,200);
 assert.equal(calls[0].sickTotal,null);assert.equal(calls[0].carriedOver,0);assert.equal(calls[0].carryoverExpiresOn,null);assert.equal(Object.hasOwn(calls[0],'annualTotal'),false);
});

test('quota API never turns unlimited leave into 30 days or zero remaining',async()=>{
 const {default:handler}=loadTS({'./_lib/n8nClient.js':{n8nGet:async()=>({annualTotal:12,sickTotal:null,sickRemaining:null,sickTaken:4,carriedOver:2,annualTaken:1}),N8nMutationError:class extends Error{},N8nNotRegisteredError:class extends Error{},N8nUnavailableError:class extends Error{}}})('api/quota.ts');
 const res={status(n){this.code=n;return this},setHeader(){return this},send(v){this.body=JSON.parse(v);return this}};
 await handler({method:'GET',headers:{},query:{userId:'test',year:'2026'}},res);
 assert.equal(res.code,200);assert.equal(res.body.sickTotal,null);assert.equal(res.body.sickRemaining,null);assert.equal(res.body.sickTaken,4);assert.equal(res.body.remainingDays,13);
});

test('dashboard year survives reload but invalid or unavailable storage falls back to calendar year',()=>{
 const previous=Object.getOwnPropertyDescriptor(global,'localStorage');let saved;
 Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:()=>saved,setItem:(_,v)=>{saved=v}}});
 try{
  const {readDashboardYear,saveDashboardYear}=loadTS()('src/lib/dashboardYear.ts');
  assert.equal(readDashboardYear(2026),'2026');saveDashboardYear('2027');assert.equal(readDashboardYear(2026),'2027');
  saved='bad';assert.equal(readDashboardYear(2026),'2026');saved='9999';assert.equal(readDashboardYear(2026),'2026');
 }finally{if(previous)Object.defineProperty(global,'localStorage',previous);else delete global.localStorage;}
});
