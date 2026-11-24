import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
let calls=[],routes=0;
const office={lat:13.737014,lng:100.610969},client={lat:13.7466,lng:100.5393};
const state={ok:true,settings:{officeLat:office.lat,officeLng:office.lng,radius:200},trip:{id:7,points:[{id:1,kind:'start_office',lat:office.lat,lng:office.lng}],stops:[{id:3,lat:client.lat,lng:client.lng}]}};
const handler=loadTS({
 '../_lib/http.js':{headerValue:()=> 'Bearer x',json:(res,status,body)=>{res.status=status;res.body=body;return res;}},
 '../_lib/lineIdentity.js':{verifyLineIdentity:async()=>'U1'},
 '../_lib/n8nClient.js':{n8nPost:async(_,b)=>{calls.push(b.operation);return b.operation==='travel-state'?state:{ok:true};}},
 '../_lib/maps.js':{findPlaces:async()=>[],routeKm:async()=>{routes++;return 5;},MapsError:class extends Error{}},
 '../_lib/readReceipt.js':{readReceipt:async()=>({})},
})('api/_handlers/travel.ts').default;
const send=async body=>{calls=[];routes=0;const res={setHeader(){}};await handler({method:'POST',body},res);return res;};

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
