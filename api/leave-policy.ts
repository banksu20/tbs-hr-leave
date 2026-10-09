import type {VercelRequest,VercelResponse} from '@vercel/node';
import {z} from 'zod';
import {headerValue,json} from './_lib/http.js';
import {isPlainDate} from './_lib/date.js';
import {verifyLineIdentity} from './_lib/lineIdentity.js';
import {n8nPost,N8nMutationError} from './_lib/n8nClient.js';
const schema=z.object({type:z.enum(['personal','annual','vacation','sick','university']),dates:z.array(z.string().refine(isPlainDate)).max(366),daysPerDate:z.union([z.literal(0.25),z.literal(0.5),z.literal(1)])});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 const parsed=schema.safeParse(req.body);if(!parsed.success)return json(res,422,{error:'Invalid leave dates or duration.'});
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please open this form in LINE and sign in again.'});}
 try{const result=await n8nPost('employee-cancellations',{operation:'leave-policy',payload:{...parsed.data,accountId}});return json(res,200,Array.isArray(result)?result[0]:result);}
 catch(e){return json(res,e instanceof N8nMutationError?e.status:503,{error:e instanceof N8nMutationError?e.message:'Could not check leave policy. Please try again.'});}
}
