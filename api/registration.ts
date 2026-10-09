import type {VercelRequest,VercelResponse} from '@vercel/node';
import {z} from 'zod';
import {headerValue,json} from './_lib/http.js';
import {verifyLineIdentity} from './_lib/lineIdentity.js';
import {dashboardSession,tokenHash,sameOrigin} from './_lib/dashboardAuth.js';
import {n8nPost} from './_lib/n8nClient.js';
import {isPlainDate} from './_lib/date.js';
const name=z.string().trim().min(1).max(100);
const registration=z.object({firstName:name,lastName:name,nickname:z.string().trim().max(100),department:name,employmentType:z.enum(['employee','intern'])});
const activation=z.object({userId:z.string().min(1),months:z.union([z.literal(4),z.literal(6)]).optional(),startDate:z.string().refine(isPlainDate).optional(),endDate:z.string().refine(isPlainDate).optional(),annualTotal:z.number().min(0).max(366).optional()}).refine(b=>b.annualTotal!==undefined||(b.months&&b.startDate&&b.endDate&&b.endDate>=b.startDate));
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PATCH'].includes(req.method||''))return json(res,405,{error:'Method not allowed'});
 let payload:Record<string,unknown>;
 try{
  if(req.method==='PATCH'||req.query.review==='1'){
   if(!await dashboardSession(req))return json(res,401,{error:'Sign in required'});
   payload={action:'list',sessionHash:tokenHash(req)};
   if(req.method==='PATCH'){if(!sameOrigin(req))return json(res,403,{error:'Access denied'});const p=activation.safeParse(req.body);if(!p.success)return json(res,422,{error:'Check the allowance and internship dates.'});payload={...payload,...p.data,action:'activate'};}
  }else{
   let accountId:string;try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please sign in through LINE.'});}
   payload={accountId,action:'status'};
   if(req.method==='POST'){const p=registration.safeParse(req.body);if(!p.success)return json(res,422,{error:'Complete your name, department and employment type.'});payload={...payload,...p.data,action:'submit'};}
  }
  const result=await n8nPost('employee-cancellations',{operation:'registration',payload});return json(res,200,Array.isArray(result)?result[0]:result);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:'Registration could not be completed. Please try again.'});}
}
