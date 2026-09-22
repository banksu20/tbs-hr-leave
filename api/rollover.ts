import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { isPlainDate } from './_lib/date.js';
import { ceoAuthorised, writesAllowed, json } from './_lib/http.js';
import { n8nPost, N8nMutationError } from './_lib/n8nClient.js';
const schema=z.object({action:z.enum(['preview','apply']),sourceYear:z.number().int().min(2000).max(2099),
  carryLimit:z.number().min(0).max(365).multipleOf(0.25),expiresOn:z.string().refine(isPlainDate),token:z.string().optional()})
  .refine(r=>r.expiresOn.startsWith(String(r.sourceYear+1)),{message:'Expiry must be in the target year'})
  .refine(r=>r.action==='preview'||!!r.token,{message:'Preview is required before applying'});
export default async function handler(req:VercelRequest,res:VercelResponse){
  if(!ceoAuthorised(req)||!writesAllowed(req))return json(res,401,{error:'Not signed in'});
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  if(req.body?.action==='apply')return json(res,403,{error:'Year rollover is preview-only until the policy is approved and applying is enabled.'});
  const parsed=schema.safeParse(req.body);
  if(!parsed.success)return json(res,422,{error:'Invalid rollover settings',issues:parsed.error.issues.map(i=>i.message)});
  try { const result=await n8nPost('dashboard-rollover',parsed.data);return json(res,200,Array.isArray(result)?result[0]:result); }
  catch(error){return json(res,error instanceof N8nMutationError?error.status:502,{error:error instanceof Error?error.message:'Rollover failed'});}
}
