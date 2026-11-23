import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {json} from '../_lib/http.js';import {dashboardCall,dashboardSession,sameOrigin} from '../_lib/dashboardAuth.js';
const role=z.object({role:z.string().trim().min(1).max(80),timeShare:z.number().positive().max(100)});
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('hr-people-save'),userId:z.string().min(1).max(64),careerLevel:z.enum(['','operational','manager','c_level']),managerId:z.string().max(64).default(''),roles:z.array(role).max(8)}),
 z.object({action:z.literal('hr-sop-save'),id:z.number().int().positive().optional(),version:z.number().int().positive().optional(),titleEn:z.string().trim().min(1).max(120),titleTh:z.string().trim().max(120).default(''),body:z.string().trim().min(1).max(20000),notify:z.boolean().default(false)}),
 z.object({action:z.literal('hr-sop-active'),id:z.number().int().positive(),active:z.boolean()}),
]);
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const session=await dashboardSession(req);if(!session)return json(res,401,{error:'Sign in required'});
  let out:{ok?:boolean;statusCode?:number};
  if(req.method==='GET'){
   const view=String(req.query?.view??'');
   if(!['people','sops'].includes(view))return json(res,404,{error:'Unknown view'});
   out=await dashboardCall(req,view==='people'?'hr-people':'hr-sops');
  }else{
   if(req.method!=='POST'||!sameOrigin(req))return json(res,403,{error:'Operation not permitted'});
   const p=schema.safeParse(req.body);if(!p.success)return json(res,422,{error:'Check the details and try again.'});
   const {action,...body}=p.data;
   out=await dashboardCall(req,action,{body});
  }
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message||'HR service unavailable'});}
}
