import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {headerValue,json} from '../_lib/http.js';import {verifyLineIdentity} from '../_lib/lineIdentity.js';import {n8nPost} from '../_lib/n8nClient.js';
const fix={lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),accuracy:z.number().min(0).max(100000).optional()};
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id=z.number().int().positive();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('in'),...fix}),
 z.object({action:z.literal('out'),...fix}),
 z.object({action:z.literal('fix'),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),in:time,out:time,shiftId:id.optional(),reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('fix-cancel'),id}),
]);
type Out={ok?:boolean;statusCode?:number;error?:string};
const call=async(operation:string,payload:Record<string,unknown>)=>{const r=await n8nPost('employee-cancellations',{operation,payload});return (Array.isArray(r)?r[0]:r) as Out|undefined;};

export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please sign in through LINE.'});}
 try{
  let out:Out|undefined;
  if(req.method==='GET')out=await call('attendance-state',{accountId});
  else if(req.method==='POST'){
   const p=schema.safeParse(req.body);if(!p.success)return json(res,422,{error:'Check the details and try again.'});
   const {action,...rest}=p.data;
   out=await call(`attendance-${action}`,{...rest,accountId});
  }else return json(res,405,{error:'Method not allowed'});
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message||'Service unavailable'});}
}
