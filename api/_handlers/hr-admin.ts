import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {json} from '../_lib/http.js';import {findPlaces,MapsError} from '../_lib/maps.js';import {dashboardCall,dashboardSession,sameOrigin} from '../_lib/dashboardAuth.js';
const role=z.object({role:z.string().trim().min(1).max(80),timeShare:z.number().positive().max(100)});
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('hr-people-save'),userId:z.string().min(1).max(64),careerLevel:z.enum(['','operational','manager','c_level']),managerId:z.string().max(64).default(''),roles:z.array(role).max(8),workEmail:z.union([z.string().trim().email().max(200),z.literal('')]).optional()}),
 z.object({action:z.literal('hr-sop-save'),id:z.number().int().positive().optional(),version:z.number().int().positive().optional(),titleEn:z.string().trim().min(1).max(120),titleTh:z.string().trim().max(120).default(''),body:z.string().trim().min(1).max(20000),bodyEn:z.string().trim().max(20000).default(''),notify:z.boolean().default(false)}),
 z.object({action:z.literal('hr-sop-active'),id:z.number().int().positive(),active:z.boolean()}),
 z.object({action:z.literal('travel-settings-save'),officeLat:z.number().min(-90).max(90).nullable().optional(),officeLng:z.number().min(-180).max(180).nullable().optional(),radius:z.number().int().min(50).max(2000).optional(),rate:z.number().positive().max(100).optional(),homeCutoff:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),tripKmCap:z.number().positive().max(5000).optional(),motorcycleRate:z.number().positive().max(100).nullable().optional(),accountingEmail:z.union([z.string().trim().email().max(200),z.literal('')]).optional(),departments:z.array(z.string().trim().min(1).max(80)).max(20).optional(),payoutNotify:z.string().max(64).optional()}),
 z.object({action:z.literal('people-alerts-save'),pcEmail:z.union([z.string().trim().email().max(200),z.literal('')]),sickCount:z.number().int().min(2).max(20),sickWindowDays:z.number().int().min(14).max(365),leadNotice:z.boolean(),leadDaysAhead:z.number().int().min(1).max(14)}),
 z.object({action:z.literal('travel-access-save'),userId:z.string().min(1).max(64),allowed:z.boolean().nullable()}),
 z.object({action:z.literal('travel-decide'),id:z.number().int().positive(),decision:z.enum(['approve','reject']),note:z.string().trim().max(500).default('')}),
 z.object({action:z.literal('travel-mark'),id:z.number().int().positive(),mark:z.enum(['paid','received'])}),
 z.object({action:z.literal('travel-payout-paid'),month:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),userId:z.string().min(1).max(64).optional()}),
 z.object({action:z.literal('travel-place'),query:z.string().trim().min(2).max(2000)}),
 z.object({action:z.literal('attendance-settings-save'),enabled:z.boolean()}),
 z.object({action:z.literal('attendance-person-save'),userId:z.string().min(1).max(64),member:z.boolean()}),
 z.object({action:z.literal('attendance-fix-decide'),id:z.number().int().positive(),decision:z.enum(['approve','reject']),note:z.string().trim().max(500).default('')}),
]);
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const session=await dashboardSession(req);if(!session)return json(res,401,{error:'Sign in required'});
  let out:{ok?:boolean;statusCode?:number};
  if(req.method==='GET'){
   const view=String(req.query?.view??'');
   if(view==='receipt'){
    const id=String(req.query?.id??'');if(!/^[0-9a-f-]{36}$/i.test(id))return json(res,422,{error:'Invalid receipt'});
    const r=await dashboardCall(req,'travel-receipt',{body:{receiptId:id}}) as {ok?:boolean;statusCode?:number;mime?:string;content?:string};
    if(!r?.ok||!r.mime||!r.content)return json(res,Number(r?.statusCode)||404,{error:'Receipt not found.'});
    res.setHeader('Content-Type',r.mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, max-age=300');
    return res.status(200).send(Buffer.from(r.content,'base64'));
   }
   const views:Record<string,string>={people:'hr-people',alerts:'people-alerts',sops:'hr-sops',travel:'travel-settings',trips:'travel-trips',trip:'travel-trip',payout:'travel-payout',attendance:'attendance-overview'};
   if(!Object.hasOwn(views,view))return json(res,404,{error:'Unknown view'});
   const tripId=Number(req.query?.id);
   if(view==='trip'&&!(Number.isInteger(tripId)&&tripId>0))return json(res,422,{error:'Invalid trip'});
   const status=String(req.query?.status??''),month=String(req.query?.month??''),from=String(req.query?.from??''),to=String(req.query?.to??'');
   const day=(v:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(v)?v:'';
   if(view==='payout'&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return json(res,422,{error:'Choose a month.'});
   out=await dashboardCall(req,views[view],{body:view==='trip'?{id:tripId}:view==='trips'?{status:/^[a-z]{4,10}$/.test(status)?status:''}:view==='payout'?{month}:view==='attendance'?{from:day(from),to:day(to)}:{}});
  }else{
   if(req.method!=='POST'||!sameOrigin(req))return json(res,403,{error:'Operation not permitted'});
   const p=schema.safeParse(req.body);if(!p.success)return json(res,422,{error:'Check the details and try again.'});
   const {action,...rest}=p.data;
   if(p.data.action==='travel-place')return json(res,200,{ok:true,places:await findPlaces(p.data.query)});
   const body=p.data.action==='travel-decide'?{id:p.data.id,action:p.data.decision,note:p.data.note}:p.data.action==='travel-mark'?{id:p.data.id,action:p.data.mark}:p.data.action==='attendance-fix-decide'?{id:p.data.id,action:p.data.decision,note:p.data.note}:rest;
   out=await dashboardCall(req,action,{body});
  }
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){
  if(e instanceof MapsError)return json(res,e.status,{error:e.message});return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message||'HR service unavailable'});}
}
