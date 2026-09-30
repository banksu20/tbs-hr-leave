import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { ceoAuthorised, writesAllowed, headerValue, json, queryParam } from './_lib/http.js';
import { n8nPost, N8nMutationError } from './_lib/n8nClient.js';
import { verifyLineIdentity } from './_lib/lineIdentity.js';
const requestSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[a-f0-9]{32}$/),dates:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(366),reason:z.string().max(1000).default('')});
const decisionSchema=z.object({id:z.number().int().positive(),action:z.enum(['approve','reject']),reason:z.string().max(1000).default('')});
export default async function handler(req:VercelRequest,res:VercelResponse) {
 res.setHeader('Cache-Control','no-store');
 if (!['GET','POST'].includes(req.method??'')) return json(res,405,{error:'Method not allowed'});
 const admin=queryParam(req,'view')==='boss';
 let accountId:string|undefined;
 if(admin) {
  if(!ceoAuthorised(req)||!writesAllowed(req)) return json(res,401,{error:'Not signed in'});
 } else {
  try {accountId=await verifyLineIdentity(headerValue(req,'authorization'));}
  catch {return json(res,401,{error:'Cannot verify your LINE session. Open the employee app in LINE and sign in again.'});}
 }
 try {
  let operation=admin?'admin-list':'employee-list';
  let payload:Record<string,unknown>={accountId};
  if(req.method==='POST') {
   const parsed=(admin?decisionSchema:requestSchema).safeParse(req.body);
   if(!parsed.success) return json(res,422,{error:'Invalid cancellation details'});
   operation=admin?(parsed.data as z.infer<typeof decisionSchema>).action:'request';
   payload={...parsed.data,accountId};
  }
  const result=await n8nPost('employee-cancellations',{operation,payload});
  const row=Array.isArray(result)?result[0]:result;
  return json(res,200,row);
 } catch(error) { return json(res,error instanceof N8nMutationError?error.status:502,{error:error instanceof N8nMutationError?error.message:'Cancellation service is unavailable. Please try again.'}); }
}
