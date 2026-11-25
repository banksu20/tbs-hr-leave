import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import liff from '@line/liff';
import TravelClaims from '../../src/pages/TravelClaims';
import TravelReview from '../../src/pages/TravelReview';
import TravelAdmin from '../../src/components/ceo/TravelAdmin';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import '../../src/index.css';
(liff as unknown as {getAccessToken:()=>string}).getAccessToken=()=>'preview';
const office={lat:13.7466,lng:100.5393};
const client={lat:13.7244,lng:100.5786};
let fix={...office,accuracy:12};
const gpsOff=new URLSearchParams(location.search).get('gps')==='off';
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok:PositionCallback,fail?:PositionErrorCallback|null)=>setTimeout(()=>gpsOff?fail?.({code:2,message:'unavailable'} as GeolocationPositionError):ok({coords:{latitude:fix.lat,longitude:fix.lng,accuracy:fix.accuracy}} as GeolocationPosition),300)}});
const svg=(label:string,amount:string)=>'data:image/svg+xml;base64,'+btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" fill="#fff"/><text x="20" y="50" font-size="20" font-family="Arial">${label}</text><text x="20" y="120" font-size="16" font-family="Arial">Date 2026-11-23</text><text x="20" y="260" font-size="30" font-weight="bold" font-family="Arial">${amount} THB</text></svg>`);
const now=()=>new Date().toISOString();
const ago=(m:number)=>new Date(Date.now()-m*60000).toISOString();
const settings={officeLat:office.lat,officeLng:office.lng,radius:200,rate:7,homeCutoff:'10:00',tripKmCap:200,accountingEmail:'accounting@example.com',departments:['Sale'],payoutNotify:null as string|null,motorcycleRate:4 as number|null};
type R={id:string;kind:string;mime:string;readAmount:number|null;readDate:string|null;readTime?:string|null;readIsReceipt?:boolean|null;readMerchant?:string|null;readRef?:string|null;duplicate?:boolean;wrongTime?:boolean;wrongKind?:boolean;amount:number;edited:boolean;needsOriginal:boolean;originalReceivedAt:string|null;createdAt:string;img:string};
type Trip={id:number;date:string;purpose:'deal'|'care';dealRef:string|null;mode:'car'|'motorcycle'|'grab'|'taxi';startFrom:'office'|'home';appointment:string;rate:number;status:string;flags:string[];autoClosed:boolean;submittedAt:string|null;decidedAt:string|null;decidedBy:string|null;decisionNote:string|null;paidAt:string|null;
 stops:{id:number;seq:number;clientName:string;label:string;lat:number;lng:number;arrivedAt:string|null}[];points:{id:number;kind:string;stopId:number|null;lat:number;lng:number;accuracy:number|null;manualReason?:string|null;at:string}[];legs:{id:number;from:number;to:number;routeKm:number;km:number;amount:number;capped:boolean}[];receipts:R[];user:string;employee:string;department:string};
let seq=100;
const today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.now()-864e5).toISOString().slice(0,10);
const trips:Trip[]=[
 {id:41,date:yesterday,purpose:'deal',dealRef:'QT-2026-118',mode:'car',startFrom:'home',appointment:'09:00',rate:7,status:'flagged',flags:['gps_weak','gps_manual','receipt_time','receipt_duplicate'],autoClosed:false,submittedAt:ago(1200),decidedAt:null,decidedBy:null,decisionNote:null,paidAt:null,user:'other',employee:'Boonsri Dee (Bee)',department:'Sale',
  stops:[{id:1,seq:1,clientName:'Siam Paragon Office',label:'991 Rama I Rd, Pathum Wan',lat:13.746,lng:100.535,arrivedAt:ago(1260)}],
  points:[{id:1,kind:'start_home',stopId:null,lat:13.8,lng:100.6,accuracy:180,at:ago(1320)},{id:2,kind:'arrive',stopId:1,lat:13.746,lng:100.535,accuracy:null,manualReason:'Basement car park, phone had no GPS signal',at:ago(1260)},{id:3,kind:'return_office',stopId:null,lat:office.lat,lng:office.lng,accuracy:10,at:ago(1200)}],
  legs:[{id:1,from:1,to:2,routeKm:18.4,km:3.1,amount:21.7,capped:true},{id:2,from:2,to:3,routeKm:3.4,km:3.4,amount:23.8,capped:false}],
  receipts:[{id:'aaaaaaaa-0000-4000-8000-000000000001',kind:'parking',mime:'image/svg+xml',readAmount:40,readDate:yesterday,readTime:'06:12',readIsReceipt:true,readMerchant:'Siam Paragon car park',readRef:'P-20431',duplicate:true,wrongTime:true,amount:60,edited:true,needsOriginal:true,originalReceivedAt:null,createdAt:ago(1200),img:svg('Parking','40.00')}]},
 {id:40,date:yesterday,purpose:'care',dealRef:null,mode:'car',startFrom:'office',appointment:'14:00',rate:7,status:'submitted',flags:[],autoClosed:false,submittedAt:ago(1100),decidedAt:null,decidedBy:null,decisionNote:null,paidAt:null,user:'me',employee:'Somchai Jaidee (Som)',department:'Sale',
  stops:[{id:2,seq:1,clientName:'Central World',label:'4 Ratchadamri Rd',lat:13.7466,lng:100.5393,arrivedAt:ago(1150)}],
  points:[{id:4,kind:'start_office',stopId:null,lat:office.lat,lng:office.lng,accuracy:null,at:ago(1200)},{id:5,kind:'arrive',stopId:2,lat:13.7247,lng:100.5786,accuracy:15,at:ago(1150)},{id:6,kind:'return_office',stopId:null,lat:office.lat,lng:office.lng,accuracy:9,at:ago(1100)}],
  legs:[{id:3,from:4,to:5,routeKm:6.2,km:6.2,amount:43.4,capped:false},{id:4,from:5,to:6,routeKm:6.8,km:6.8,amount:47.6,capped:false}],
  receipts:[{id:'aaaaaaaa-0000-4000-8000-000000000002',kind:'toll',mime:'image/svg+xml',readAmount:50,readDate:yesterday,readTime:'13:52',readIsReceipt:true,readMerchant:'Sukhumvit 62 plaza',readRef:'TX-558812',amount:50,edited:false,needsOriginal:true,originalReceivedAt:null,createdAt:ago(1100),img:svg('Expressway toll','50.00')}]},
];
const early=(d:string)=>today.slice(0,8)+d;
const simple=(id:number,date:string,user:string,employee:string,status:string,client:string,km:number,toll:number,received:boolean):Trip=>({id,date,purpose:'care',dealRef:null,mode:'car',startFrom:'office',appointment:'10:00',rate:7,status,flags:[],autoClosed:false,submittedAt:ago(9000),decidedAt:null,decidedBy:null,decisionNote:null,paidAt:status==='paid'?ago(4000):null,user,employee,department:'Sale',
 stops:[{id:id*10,seq:1,clientName:client,label:'',lat:client.length,lng:100,arrivedAt:ago(9100)}],points:[{id:id*10,kind:'start_office',stopId:null,lat:office.lat,lng:office.lng,accuracy:10,at:ago(9200)},{id:id*10+1,kind:'arrive',stopId:id*10,lat:13.7,lng:100.5,accuracy:12,at:ago(9100)},{id:id*10+2,kind:'return_office',stopId:null,lat:office.lat,lng:office.lng,accuracy:9,at:ago(9000)}],
 legs:[{id:id*10,from:id*10,to:id*10+1,routeKm:km/2,km:km/2,amount:km/2*7,capped:false},{id:id*10+1,from:id*10+1,to:id*10+2,routeKm:km/2,km:km/2,amount:km/2*7,capped:false}],
 receipts:toll?[{id:`aaaaaaaa-0000-4000-8000-0000000000${id}`,kind:'toll',mime:'image/svg+xml',readAmount:toll,readDate:date,amount:toll,edited:false,needsOriginal:true,originalReceivedAt:received?ago(5000):null,createdAt:ago(9000),img:svg('Expressway toll',String(toll))}]:[]});
trips.push(simple(39,early('12'),'other','Boonsri Dee (Bee)','approved','True Digital Park',22,50,true),simple(38,early('06'),'me','Somchai Jaidee (Som)','paid','Siam Discovery',14,0,false),simple(37,early('09'),'me','Somchai Jaidee (Som)','submitted','ICONSIAM',30,70,true),simple(36,early('16'),'other','Boonsri Dee (Bee)','submitted','Samyan Mitrtown',18,0,false));
const sum=(t:Trip)=>{const km=t.legs.reduce((s,l)=>s+l.km,0),kmAmount=t.legs.reduce((s,l)=>s+l.amount,0),receiptAmount=t.receipts.reduce((s,r)=>s+r.amount,0);
 return {...t,clients:t.stops.map(s=>s.clientName),km:Math.round(km*100)/100,kmAmount:Math.round(kmAmount*100)/100,receiptAmount,total:Math.round((kmAmount+receiptAmount)*100)/100,originalsWaiting:t.receipts.filter(r=>r.needsOriginal&&!r.originalReceivedAt).length,receipts:t.receipts.map(r=>({...r,img:undefined}))};};
const state=(extra={})=>({ok:true,eligible:true,configured:true,settings,trip:trips.filter(t=>t.user==='me'&&t.status==='open').map(sum)[0]??null,recent:trips.filter(t=>t.user==='me'&&t.status!=='open').map(sum),...extra});
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json'}});
const dist=(a:{lat:number;lng:number},b:{lat:number;lng:number})=>Math.round(Math.hypot((a.lat-b.lat)*111,(a.lng-b.lng)*108)*1.35*100)/100;
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=String(input);if(!url.startsWith('/api/'))return realFetch(input,init);
 const b=init?.body?JSON.parse(String(init.body)):null;await new Promise(r=>setTimeout(r,350));
 const receipt=url.match(/receipt[=](.+?)(&|$)/)?.[1]??url.match(/[?&]id=([0-9a-f-]{36})/)?.[1]??(b?.action==='receipt'?b.receiptId:null);
 if(receipt){const r=trips.flatMap(t=>t.receipts).find(x=>x.id===decodeURIComponent(receipt));return r?realFetch(r.img):json({error:'Not found'},404);}
 if(url.startsWith('/api/travel-review')){const t=trips.find(x=>x.id===Number(b.id))!;if(b.action==='received')t.receipts.forEach(r=>r.originalReceivedAt=now());if(b.action==='paid'){t.status='paid';t.paidAt=now();}return json({ok:true,trip:sum(t)});}
 if(url.startsWith('/api/travel')){
  if(!b)return json(state());
  const t=trips.find(x=>x.id===b.tripId);
  switch(b.action){
   case 'place':return json({ok:true,places:/maps|goo\.gl/.test(b.query)?[{...client,label:'Central World, Ratchadamri Rd'}]:[{...client,label:'Central World, 4 Ratchadamri Rd, Pathum Wan, Bangkok'},{lat:13.7563,lng:100.5018,label:'Central World Plaza Food Hall, Bangkok'}]});
   case 'start':{const id=++seq;fix={...client,accuracy:14};trips.unshift({id,date:today,purpose:b.purpose,dealRef:b.dealRef||null,mode:b.mode,startFrom:b.startFrom,appointment:b.appointment,rate:b.mode==='motorcycle'?settings.motorcycleRate??7:settings.rate,status:'open',flags:[],autoClosed:false,submittedAt:null,decidedAt:null,decidedBy:null,decisionNote:null,paidAt:null,user:'me',employee:'Somchai Jaidee (Som)',department:'Sale',
    stops:[{id:++seq,seq:1,clientName:b.clientName,label:b.destLabel,lat:b.destLat,lng:b.destLng,arrivedAt:null}],points:[{id:++seq,kind:b.startFrom==='home'?'start_home':'start_office',stopId:null,lat:b.lat??office.lat,lng:b.lng??office.lng,accuracy:b.accuracy??null,at:now()}],legs:[],receipts:[]});return json(state());}
   case 'add-stop':t!.stops.push({id:++seq,seq:t!.stops.length+1,clientName:b.clientName,label:b.destLabel,lat:b.destLat,lng:b.destLng,arrivedAt:null});fix={lat:b.destLat,lng:b.destLng,accuracy:20};return json(state());
   case 'arrive':case 'return':{const last=t!.points.at(-1)!;const stop=t!.stops.find(s=>s.id===b.stopId);const here=b.manualReason?(b.action==='arrive'?{lat:stop!.lat,lng:stop!.lng}:office):{lat:b.lat,lng:b.lng};
    if(!b.manualReason&&b.action==='return'&&dist(here,office)>0.2)return json({ok:false,error:'You are not at the office yet.',distanceM:dist(here,office)*1000},422);
    const p={id:++seq,kind:b.action==='arrive'?'arrive':'return_office',stopId:b.stopId??null,lat:here.lat,lng:here.lng,accuracy:b.manualReason?null:b.accuracy,manualReason:b.manualReason??null,at:now()};t!.points.push(p);
    if(b.stopId)t!.stops.find(s=>s.id===b.stopId)!.arrivedAt=now();
    const km=dist(last,here)||6.4;t!.legs.push({id:++seq,from:last.id,to:p.id,routeKm:km,km,amount:t!.mode==='car'||t!.mode==='motorcycle'?Math.round(km*t!.rate*100)/100:0,capped:false});
    fix=b.action==='arrive'?{...office,accuracy:11}:fix;return json(state());}
   case 'receipt-read':return json({ok:true,read:{amount:65,date:yesterday,kind:t?.mode==='grab'?'grab':'toll',time:'09:41',isReceipt:true,merchant:'Sukhumvit 62 plaza',ref:'TX-771203'},readSig:'demo'});
   case 'receipt-add':t!.receipts.push({id:crypto.randomUUID(),kind:b.kind,mime:b.mime,readAmount:b.read?.amount??null,readDate:b.read?.date??null,readTime:b.read?.time??null,readIsReceipt:b.read?.isReceipt??null,readMerchant:b.read?.merchant??null,readRef:b.read?.ref??null,amount:b.amount,edited:b.read?.amount!==b.amount,needsOriginal:['toll','parking','other'].includes(b.kind),originalReceivedAt:null,createdAt:now(),img:`data:${b.mime};base64,${b.content}`});return json(state());
   case 'receipt-remove':t!.receipts=t!.receipts.filter(r=>r.id!==b.receiptId);return json(state());
   case 'submit':t!.flags=t!.points.some(p=>p.manualReason)?['gps_manual']:[];t!.status=t!.points.some(p=>(p.accuracy??0)>100||p.manualReason)?'flagged':'submitted';t!.submittedAt=now();return json(state({submitted:sum(t!)}));
   case 'cancel':t!.status='cancelled';fix={...office,accuracy:12};return json(state());
  }
 }
 if(url.startsWith('/api/hr-admin')){
  const q=new URL(url,location.href).searchParams;
  const people=[{id:'U'+'1'.repeat(32),name:'Somchai Jaidee',nickname:'Som',department:'Sale',eligible:true,override:null},{id:'U'+'2'.repeat(32),name:'Boonsri Dee',nickname:'Bee',department:'Sale',eligible:true,override:null},{id:'x',name:'Orn Rak',nickname:'Orn',department:'Account',eligible:false,override:null}];
  if(q.get('view')==='travel')return json({ok:true,settings,people});
  if(q.get('view')==='trips')return json({ok:true,trips:trips.filter(t=>t.status!=='open'&&t.status!=='cancelled'&&(!q.get('status')||t.status===q.get('status'))).map(sum)});
  const payout=()=>{const m=q.get('month')??b?.month;const by=new Map<string,Trip[]>();trips.filter(t=>t.date.startsWith(m)&&['submitted','approved','paid','flagged'].includes(t.status)).forEach(t=>by.set(t.user,[...(by.get(t.user)??[]),t]));
   return [...by].map(([user,l])=>{const s=l.map(sum),ok=s.filter(t=>t.status!=='flagged'),add=(f:(t:ReturnType<typeof sum>)=>boolean)=>ok.filter(f).reduce((a,t)=>a+t.total,0);const [name,nick]=l[0].employee.replace(')','').split(' (');
    return {userId:user,code:user==='me'?'TBS-071':'TBS-072',name,nickname:nick,department:l[0].department,trips:ok.length,flagged:s.length-ok.length,km:ok.reduce((a,t)=>a+t.km,0),kmAmount:ok.reduce((a,t)=>a+t.kmAmount,0),receiptAmount:ok.reduce((a,t)=>a+t.receiptAmount,0),total:add(()=>true),paid:add(t=>t.status==='paid'),ready:add(t=>t.status!=='paid'&&!t.originalsWaiting),held:add(t=>t.status!=='paid'&&t.originalsWaiting>0),paperMissing:ok.reduce((a,t)=>a+t.originalsWaiting,0),
     lines:s.map(t=>({id:t.id,date:t.date,status:t.status,clients:t.clients,km:t.km,kmAmount:t.kmAmount,receiptAmount:t.receiptAmount,total:t.total,originalsWaiting:t.originalsWaiting}))};});};
  if(q.get('view')==='payout')return json({ok:true,people:payout()});
  if(b?.action==='travel-payout-paid'){let n=0;trips.filter(t=>t.date.startsWith(b.month)&&['submitted','approved'].includes(t.status)&&(!b.userId||t.user===b.userId)&&!sum(t).originalsWaiting).forEach(t=>{t.status='paid';n++;});return json({ok:true,marked:n,people:payout()});}
  if(q.get('view')==='trip')return json({ok:true,trip:sum(trips.find(t=>t.id===Number(q.get('id')))!)});
  const t=trips.find(x=>x.id===b?.id);
  if(b?.action==='travel-decide'){t!.status=b.decision==='approve'?'approved':'rejected';t!.decidedBy='hr';t!.decisionNote=b.note||null;return json({ok:true,trip:sum(t!)});}
  if(b?.action==='travel-mark'){if(b.mark==='paid')t!.status='paid';else t!.receipts.forEach(r=>r.originalReceivedAt=now());return json({ok:true,trip:sum(t!)});}
  if(b?.action==='travel-place')return json({ok:true,places:[{...office,label:'TBS Marketing office, Bangkok'}]});
  if(b?.action==='travel-settings-save'){Object.assign(settings,b);return json({ok:true,settings,people});}
  if(b?.action==='travel-access-save')return json({ok:true,people:people.map(p=>p.id===b.userId?{...p,override:b.allowed,eligible:b.allowed??p.department==='Sale'}:p)});
 }
 return json({ok:false,error:'Unknown demo call'},404);
};
history.replaceState(null,'',location.pathname+location.search.replace(/([?&])t=[^&]*/,'$1')+(location.search.includes('id=')?'':(location.search?'&':'?')+'id=40&t=00000000-0000-4000-8000-000000000000'));
export function Preview(){
 const {toggleLanguage,language}=useLanguage();
 const [tab,setTab]=useState(new URLSearchParams(location.search).get('tab')||'employee');
 return <><div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 p-3 text-sm"><span>Local demo · no live changes</span><span className="flex gap-3">{['employee','accounting','dashboard','accounting login'].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'font-bold underline':''}>{t}</button>)}<button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button></span></div>
  {tab==='employee'?<div className="mx-auto max-w-md"><MemoryRouter><TravelClaims/></MemoryRouter></div>:tab==='accounting'?<TravelReview/>:<div className="min-h-screen bg-slate-100"><div className="mx-auto max-w-4xl p-6"><TravelAdmin key={tab} accounting={tab==='accounting login'}/></div></div>}</>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview/></LanguageProvider>);
