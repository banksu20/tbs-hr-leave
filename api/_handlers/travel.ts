import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {headerValue,json} from '../_lib/http.js';import {verifyLineIdentity} from '../_lib/lineIdentity.js';import {n8nPost} from '../_lib/n8nClient.js';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {findPlaces,MapsError,routeKm} from '../_lib/maps.js';import {readReceipt,type ReceiptRead} from '../_lib/readReceipt.js';import {webhookSecret} from '../_lib/webhookSecret.js';
const lat=z.number().min(-90).max(90),lng=z.number().min(-180).max(180),acc=z.number().min(0).max(100000).optional();
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id=z.number().int().positive();
const manual=z.string().trim().min(5).max(300).optional();
const readShape=z.object({amount:z.number().positive().max(100000).nullable(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),kind:z.enum(['toll','parking','grab','taxi','other']).nullable(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),isReceipt:z.boolean().nullable(),merchant:z.string().max(120).nullable(),ref:z.string().max(60).nullable()});
const file={mime:z.enum(['image/jpeg','image/png','application/pdf']),content:z.string().min(10).max(2800000)};
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('place'),query:z.string().trim().min(2).max(2000)}),
 z.object({action:z.literal('start'),purpose:z.enum(['deal','care']),dealRef:z.string().trim().max(120).default(''),mode:z.enum(['car','motorcycle','grab','taxi']),startFrom:z.enum(['office','home']),clientName:z.string().trim().min(1).max(160),destLat:lat,destLng:lng,destLabel:z.string().max(300).default(''),appointment:time,lat:lat.optional(),lng:lng.optional(),accuracy:acc}),
 z.object({action:z.literal('add-stop'),tripId:id,clientName:z.string().trim().min(1).max(160),destLat:lat,destLng:lng,destLabel:z.string().max(300).default('')}),
 z.object({action:z.literal('arrive'),tripId:id,stopId:id,prevPointId:id,lat:lat.optional(),lng:lng.optional(),accuracy:acc,manualReason:manual}),
 z.object({action:z.literal('return'),tripId:id,prevPointId:id,lat:lat.optional(),lng:lng.optional(),accuracy:acc,manualReason:manual}),
 z.object({action:z.literal('receipt-read'),...file}),
 z.object({action:z.literal('receipt-add'),tripId:id,kind:z.enum(['toll','parking','grab','taxi','other']),...file,amount:z.number().positive().max(100000),read:readShape.optional(),readSig:z.string().max(128).optional()}),
 z.object({action:z.literal('receipt-remove'),tripId:id,receiptId:z.string().uuid()}),
 z.object({action:z.literal('submit'),tripId:id}),
 z.object({action:z.literal('cancel'),tripId:id}),
]);
type Point={id:number;kind:string;lat:number;lng:number};
type State={ok?:boolean;statusCode?:number;error?:string;settings?:{officeLat:number|null;officeLng:number|null;radius?:number};trip?:{id:number;points:Point[];stops?:{id:number;lat:number;lng:number}[]}|null};
const CLIENT_RADIUS_M=1000;
const tidy=(r:ReceiptRead):ReceiptRead=>({amount:r.amount??null,date:r.date??null,kind:r.kind??null,time:r.time??null,isReceipt:r.isReceipt??null,merchant:r.merchant??null,ref:r.ref??null});
const signRead=(content:string,r:ReceiptRead)=>createHmac('sha256',webhookSecret()??'').update(createHash('sha256').update(content).digest('hex')+'|'+JSON.stringify(tidy(r))).digest('hex');
const signedRead=(content:string,r:ReceiptRead|undefined,sig:string|undefined)=>{if(!r||!sig||!webhookSecret())return null;const a=Buffer.from(signRead(content,r)),b=Buffer.from(sig);return a.length===b.length&&timingSafeEqual(a,b)?tidy(r):null;};
const metres=(a:{lat:number;lng:number},b:{lat:number;lng:number})=>{const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return Math.round(12742000*Math.asin(Math.sqrt(x)));};
const one=(r:unknown)=>(Array.isArray(r)?r[0]:r) as State|undefined;
const call=async(operation:string,payload:Record<string,unknown>)=>one(await n8nPost('employee-cancellations',{operation,payload}));

function fileOk(mime:string,content:string){
 const f=Buffer.from(content,'base64');
 const magic=mime==='application/pdf'?f.subarray(0,5).toString()==='%PDF-':mime==='image/png'?f.subarray(0,8).toString('hex')==='89504e470d0a1a0a':f.subarray(0,3).toString('hex')==='ffd8ff';
 return magic&&f.length>0&&f.length<=2097152?f.toString('base64'):null;
}

export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please sign in through LINE.'});}
 try{
  if(req.method==='GET'){
   const receiptId=req.query?.receipt;
   if(receiptId!==undefined){
    if(typeof receiptId!=='string'||!/^[0-9a-f-]{36}$/i.test(receiptId))return json(res,422,{error:'Invalid receipt'});
    const r=await call('travel-receipt-image',{accountId,receiptId}) as {ok?:boolean;statusCode?:number;mime?:string;content?:string}|undefined;
    if(!r?.ok||!r.content||!r.mime)return json(res,Number(r?.statusCode)||404,{error:'Receipt not found.'});
    res.setHeader('Content-Type',r.mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=300');
    return res.status(200).send(Buffer.from(r.content,'base64'));
   }
   const s=await call('travel-state',{accountId});
   return json(res,s?.ok?200:Number(s?.statusCode)||503,s??{error:'Service unavailable'});
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const p=schema.safeParse(req.body);if(!p.success)return json(res,422,{error:'Check the details and try again.'});
  const b=p.data;
  if(b.action==='place')return json(res,200,{ok:true,places:await findPlaces(b.query)});
  if(b.action==='receipt-read'){
   const content=fileOk(b.mime,b.content);if(!content)return json(res,422,{error:'Use a photo or PDF up to 2 MB.'});
   const read=tidy(await readReceipt(b.mime,content));
   return json(res,200,{ok:true,read,readSig:signRead(content,read)});
  }
  let out:State|undefined;
  if(b.action==='arrive'||b.action==='return'){
   const s=await call('travel-state',{accountId});
   if(!s?.ok)return json(res,Number(s?.statusCode)||503,s??{error:'Service unavailable'});
   const last=s.trip?.id===b.tripId?s.trip.points.at(-1):undefined;
   if(!last||last.id!==b.prevPointId)return json(res,409,{...s,ok:false,error:'Your trip changed on another screen. Please try again.'});
   const stop=b.action==='arrive'?s.trip?.stops?.find(x=>x.id===b.stopId):undefined;
   const office=s.settings?.officeLat!=null&&s.settings.officeLng!=null?{lat:Number(s.settings.officeLat),lng:Number(s.settings.officeLng)}:undefined;
   const planned=b.action==='arrive'?(stop?{lat:Number(stop.lat),lng:Number(stop.lng)}:undefined):office;
   if(b.manualReason&&!planned)return json(res,409,{...s,ok:false,error:'Your trip changed on another screen. Please try again.'});
   if(!b.manualReason&&(b.lat==null||b.lng==null))return json(res,422,{error:'Location or distance is missing.'});
   const here=b.manualReason?planned!:{lat:b.lat!,lng:b.lng!};
   if(!b.manualReason&&b.action==='arrive'){
    const d=stop?metres(here,{lat:Number(stop.lat),lng:Number(stop.lng)}):0;
    if(stop&&d-Math.min(b.accuracy??0,500)>Math.max(Number(s.settings?.radius)||0,CLIENT_RADIUS_M))return json(res,422,{...s,ok:false,error:'You are not at the client yet.',distanceM:d});
   }else if(!b.manualReason&&office){
    const d=metres(here,office);
    if(d>(Number(s.settings?.radius)||200))return json(res,422,{...s,ok:false,error:'You are not at the office yet.',distanceM:d});
   }
   const km=await routeKm({lat:Number(last.lat),lng:Number(last.lng)},here);
   const extra:Record<string,unknown>={};
   if(b.action==='arrive'&&last.kind==='start_home'&&s.settings?.officeLat!=null&&s.settings.officeLng!=null)extra.officeKm=await routeKm({lat:Number(s.settings.officeLat),lng:Number(s.settings.officeLng)},here);
   const fix=b.manualReason?{lat:here.lat,lng:here.lng,accuracy:undefined,manualReason:b.manualReason}:{manualReason:undefined};
   out=await call(b.action==='arrive'?'travel-arrive':'travel-return',{...b,...fix,accountId,km,...extra});
  }else if(b.action==='receipt-add'){
   const content=fileOk(b.mime,b.content);if(!content)return json(res,422,{error:'Use a photo or PDF up to 2 MB.'});
   const read=signedRead(content,b.read as ReceiptRead|undefined,b.readSig)??tidy(await readReceipt(b.mime,content));
   const {read:_read,readSig:_sig,...rest}=b;void _read;void _sig;
   out=await call('travel-receipt-add',{...rest,accountId,content,amount:b.amount.toFixed(2),readAmount:read.amount!=null?read.amount.toFixed(2):'',readDate:read.date??'',readTime:read.time??'',readKind:read.kind??'',readMerchant:read.merchant??'',readRef:read.ref??'',readIsReceipt:read.isReceipt==null?'':String(read.isReceipt)});
  }else{
   out=await call(`travel-${b.action}`,{...b,accountId});
  }
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){
  if(e instanceof MapsError)return json(res,e.status,{error:e.message});
  return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message||'Service unavailable'});
 }
}
