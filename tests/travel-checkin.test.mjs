import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
let calls=[],routes=0,reads=0,lastPayload=null;
process.env.CEO_WEBHOOK_SECRET='test-secret';
const realRead={amount:50,date:'2026-11-23',kind:'toll',time:'14:37',isReceipt:true,merchant:'Plaza',ref:'TX-1'};
const office={lat:13.737014,lng:100.610969},client={lat:13.7466,lng:100.5393};
const state={ok:true,settings:{officeLat:office.lat,officeLng:office.lng,radius:200},trip:{id:7,points:[{id:1,kind:'start_office',lat:office.lat,lng:office.lng}],stops:[{id:3,lat:client.lat,lng:client.lng}]}};
const handler=loadTS({
 '../_lib/http.js':{headerValue:()=> 'Bearer x',json:(res,status,body)=>{res.status=status;res.body=body;return res;}},
 '../_lib/lineIdentity.js':{verifyLineIdentity:async()=>'U1'},
 '../_lib/n8nClient.js':{n8nPost:async(_,b)=>{calls.push(b.operation);lastPayload=b.payload;return b.operation==='travel-state'?state:{ok:true};}},
 '../_lib/maps.js':{findPlaces:async()=>[],routeKm:async()=>{routes++;return 5;},MapsError:class extends Error{}},
 '../_lib/readReceipt.js':{readReceipt:async()=>{reads++;return realRead;}},
})('api/_handlers/travel.ts').default;
const send=async body=>{calls=[];routes=0;reads=0;const res={setHeader(){}};await handler({method:'POST',body},res);return res;};

test('check-in is refused far from the client before any Google call',async()=>{
 let r=await send({action:'arrive',tripId:7,stopId:3,prevPointId:1,lat:office.lat,lng:office.lng,accuracy:20});
 assert.equal(r.status,422);assert.match(r.body.error,/not at the client/);assert.ok(r.body.distanceM>7000);
 assert.equal(routes,0);assert.deepEqual(calls,['travel-state']);
 r=await send({action:'arrive',tripId:7,stopId:3,prevPointId:1,lat:client.lat+0.003,lng:client.lng,accuracy:30});
 assert.equal(r.status,200);assert.equal(routes,1);assert.deepEqual(calls,['travel-state','travel-arrive']);
});

test('return is refused away from the office before any Google call',async()=>{
 const r=await send({action:'return',tripId:7,prevPointId:1,lat:client.lat,lng:client.lng,accuracy:10});
 assert.equal(r.status,422);assert.match(r.body.error,/not at the office/);assert.equal(routes,0);
});

test('receipt reads are signed so the app cannot fake them',async()=>{
 const content=Buffer.from([0xff,0xd8,0xff,...Array(30).fill(7)]).toString('base64');
 let r=await send({action:'receipt-read',mime:'image/jpeg',content});
 assert.equal(reads,1);assert.deepEqual(r.body.read,realRead);assert.match(r.body.readSig,/^[0-9a-f]{64}$/);
 const base={action:'receipt-add',tripId:7,kind:'toll',mime:'image/jpeg',content,amount:50};
 await send({...base,read:r.body.read,readSig:r.body.readSig});
 assert.equal(reads,0);assert.equal(lastPayload.readRef,'TX-1');assert.equal(lastPayload.readIsReceipt,'true');assert.equal(lastPayload.readTime,'14:37');
 await send({...base,read:{...r.body.read,isReceipt:true,date:'2026-11-24',ref:'FAKE'},readSig:r.body.readSig});
 assert.equal(reads,1);assert.equal(lastPayload.readRef,'TX-1');assert.equal(lastPayload.readDate,'2026-11-23');
 await send(base);
 assert.equal(reads,1);assert.equal(lastPayload.readRef,'TX-1');
});
