import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { isPlainDate } from './_lib/date.js';
import { ceoAuthorised, writesAllowed, json } from './_lib/http.js';
import { n8nPost, N8nMutationError } from './_lib/n8nClient.js';
const schema=z.object({action:z.enum(['preview','apply']),sourceYear:z.number().int().min(2000).max(2099),
  expiresOn:z.string().refine(isPlainDate),token:z.string().optional(),
  overrides:z.array(z.object({userId:z.string().trim().min(1).max(200),carriedOver:z.number().min(0).max(365).multipleOf(0.25),expiresOn:z.string().refine(isPlainDate),note:z.string().max(1000),annualTotal:z.number().min(0).max(365).multipleOf(0.25).optional(),sickTotal:z.number().min(0).max(365).multipleOf(0.25).nullable().optional(),personalTotal:z.number().min(0).max(365).multipleOf(0.25).optional()})).max(500).default([])})
  .refine(r=>new Set(r.overrides.map(o=>o.userId)).size===r.overrides.length,{message:'Each employee can only appear once'})
  .refine(r=>r.overrides.every(o=>o.expiresOn.startsWith(String(r.sourceYear+1))),{message:'Employee expiry must be in the target year'})
  .refine(r=>r.expiresOn.startsWith(String(r.sourceYear+1)),{message:'Expiry must be in the target year'})
  .refine(r=>r.action==='preview'||!!r.token,{message:'Preview is required before applying'});
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(!ceoAuthorised(req)||!writesAllowed(req))return json(res,401,{error:'Not signed in'});
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const parsed=schema.safeParse(req.body);
  if(!parsed.success)return json(res,422,{error:'Invalid rollover settings',issues:parsed.error.issues.map(i=>i.message)});
  try { const result=await n8nPost('dashboard-rollover',parsed.data);return json(res,200,Array.isArray(result)?result[0]:result); }
  catch(error){return json(res,error instanceof N8nMutationError?error.status:502,{error:error instanceof Error?error.message:'Rollover failed'});}
}
