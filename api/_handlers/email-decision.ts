import type {VercelRequest,VercelResponse} from '../_lib/platform.js';
import {z} from 'zod';import {json} from '../_lib/http.js';import {n8nPost} from '../_lib/n8nClient.js';import {withTranslation} from '../_lib/translateReason.js';
const schema=z.object({id:z.coerce.number().int().positive(),token:z.string().uuid(),action:z.enum(['review','approve','reject']),reason:z.string().max(1000).optional()});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 const p=schema.safeParse(req.body);if(!p.success)return json(res,404,{error:'This link is not valid.'});
 try{
  const reason=p.data.action==='reject'&&p.data.reason?await withTranslation(p.data.reason,1000):undefined;
  const r=await n8nPost('employee-cancellations',{operation:'email-decision',payload:{id:p.data.id,token:p.data.token,action:p.data.action,...(reason!==undefined?{reason}:{})}});
  const out=(Array.isArray(r)?r[0]:r) as {ok?:boolean;statusCode?:number;error?:string}|undefined;
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  return json(res,200,out);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}
}
