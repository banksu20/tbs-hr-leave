import type {VercelRequest,VercelResponse} from '@vercel/node';
import {z} from 'zod';import {isPlainDate} from '../_lib/date.js';import {json} from '../_lib/http.js';
import {dashboardSession,tokenHash,sameOrigin} from '../_lib/dashboardAuth.js';import {n8nPost} from '../_lib/n8nClient.js';
const schema=z.object({userId:z.string().min(1),startDate:z.string().refine(isPlainDate),endDate:z.string().refine(isPlainDate),months:z.union([z.literal(4),z.literal(6)])}).refine(b=>b.endDate>=b.startDate);
export default async function handler(req:VercelRequest,res:VercelResponse){res.setHeader('Cache-Control','no-store');try{
 if(!await dashboardSession(req))return json(res,401,{error:'Sign in required'});
 let payload:Record<string,unknown>={action:'list',sessionHash:tokenHash(req)};
 if(req.method==='POST'){if(!sameOrigin(req))return json(res,403,{error:'Access denied'});const b=schema.safeParse(req.body);if(!b.success)return json(res,422,{error:'Choose a 4- or 6-month plan and valid internship dates.'});payload={...payload,...b.data,action:'save'};}else if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 const r=await n8nPost('employee-cancellations',{operation:'intern-terms',payload});return json(res,200,Array.isArray(r)?r[0]:r);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}}
