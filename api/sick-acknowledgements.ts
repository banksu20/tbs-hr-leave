import type {VercelRequest,VercelResponse} from '@vercel/node';
import {z} from 'zod';
import {headerValue,json,queryParam} from './_lib/http.js';
import {verifyLineIdentity} from './_lib/lineIdentity.js';
import {n8nPost,N8nMutationError} from './_lib/n8nClient.js';
const linkSchema=z.object({id:z.string().uuid(),token:z.string().uuid()});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method??''))return json(res,405,{error:'Method not allowed'});
 const parsed=linkSchema.safeParse(req.method==='POST'?req.body:{id:queryParam(req,'id'),token:queryParam(req,'token')});
 if(!parsed.success)return json(res,422,{error:'Invalid reminder link'});
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}
 catch{return json(res,401,{error:'Please open this card in LINE and sign in again.'});}
 try{
  const result=await n8nPost('employee-cancellations',{operation:req.method==='POST'?'sick-acknowledge':'sick-review',payload:{...parsed.data,accountId}});
  return json(res,200,{...(Array.isArray(result)?result[0]:result),accountId});
 }catch(error){return json(res,error instanceof N8nMutationError?error.status:503,{error:error instanceof N8nMutationError?error.message:'Could not reach the reminder service. Please try again.'});}
}
