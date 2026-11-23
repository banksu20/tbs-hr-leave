import test from 'node:test';
import assert from 'node:assert/strict';
import loadTS from './load-ts.cjs';
let sent=[],reply=()=>({ok:true,json:async()=>({places:[{lat:13.7466,lng:100.5393,label:'Central World, Bangkok'}]}),headers:new Map()});
globalThis.fetch=async(url,init)=>{sent.push({url,init,body:init?.body?JSON.parse(init.body):null});return reply(url,init);};
process.env.CEO_WEBHOOK_SECRET='test-secret';
delete process.env.GOOGLE_MAPS_API_KEY;
const {findPlaces,routeKm,coordsFromText}=loadTS({'./n8nClient.js':{N8N_BASE:'https://n8n.test'}})('api/_lib/maps.ts');

test('place search and distance go through the secured n8n maps route',async()=>{
 sent=[];
 assert.deepEqual(await findPlaces('Central World'),[{lat:13.7466,lng:100.5393,label:'Central World, Bangkok'}]);
 assert.equal(sent[0].url,'https://n8n.test/webhook/maps');
 assert.equal(sent[0].init.headers['x-ceo-webhook-secret'],'test-secret');
 assert.deepEqual(sent[0].body,{op:'search',query:'Central World'});
 reply=()=>({ok:true,json:async()=>[{meters:12345}]});
 assert.equal(await routeKm({lat:13.7,lng:100.5},{lat:13.8,lng:100.6}),12.35);
 assert.deepEqual(sent[1].body,{op:'route',from:{lat:13.7,lng:100.5},to:{lat:13.8,lng:100.6}});
 assert.equal(JSON.stringify(sent).includes('key='),false);
});

test('coordinates and full map links need no lookup',async()=>{
 sent=[];
 assert.deepEqual(coordsFromText('13.75, 100.5'),{lat:13.75,lng:100.5});
 const p=await findPlaces('https://www.google.com/maps/place/TBS+Office/@13.7563,100.5018,17z');
 assert.deepEqual(p,[{lat:13.7563,lng:100.5018,label:'TBS Office'}]);
 assert.equal(sent.length,0);
 await assert.rejects(findPlaces('https://evil.example/maps'),/Google Maps link/);
});

test('short links are followed only on Google hosts',async()=>{
 sent=[];
 reply=url=>url.startsWith('https://maps.app.goo.gl')?{ok:false,status:302,headers:new Map([['location','https://www.google.com/maps/place/Siam/@13.746,100.534,17z']]),json:async()=>({})}:{ok:true,json:async()=>({})};
 assert.deepEqual(await findPlaces('https://maps.app.goo.gl/abc'),[{lat:13.746,lng:100.534,label:'Siam'}]);
 reply=()=>({ok:false,status:302,headers:new Map([['location','https://evil.example/x']]),json:async()=>({})});
 await assert.rejects(findPlaces('https://maps.app.goo.gl/abc'),/Google Maps link/);
});

test('a Google failure is a clear retry message',async()=>{
 reply=()=>({ok:true,json:async()=>({error:true})});
 await assert.rejects(routeKm({lat:1,lng:1},{lat:2,lng:2}),e=>e.status===503&&/try again/.test(e.message));
 reply=()=>{throw new Error('offline');};
 await assert.rejects(findPlaces('Siam'),e=>e.status===503);
});
