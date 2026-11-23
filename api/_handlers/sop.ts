import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {headerValue,json} from '../_lib/http.js';import {verifyLineIdentity} from '../_lib/lineIdentity.js';import {n8nPost} from '../_lib/n8nClient.js';
const schema=z.object({docId:z.number().int().positive(),version:z.number().int().positive()});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method??''))return json(res,405,{error:'Method not allowed'});
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please sign in through LINE.'});}
 const p=req.method==='POST'?schema.safeParse(req.body):null;
 if(p&&!p.success)return json(res,422,{error:'Invalid document.'});
 try{
  const r=await n8nPost('employee-cancellations',{operation:p?'sop-accept':'sop-list',payload:{...(p?p.data:{}),accountId}});
  const out=(Array.isArray(r)?r[0]:r) as {ok?:boolean;statusCode?:number}|undefined;
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}
}
