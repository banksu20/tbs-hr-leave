import type {VercelRequest,VercelResponse} from '../_lib/platform.js';import {z} from 'zod';
import {json} from '../_lib/http.js';import {n8nPost} from '../_lib/n8nClient.js';
const schema=z.object({id:z.coerce.number().int().positive(),token:z.string().uuid(),action:z.enum(['review','received','paid','receipt']),receiptId:z.string().uuid().optional()});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 const p=schema.safeParse(req.body);if(!p.success)return json(res,404,{error:'This link is not valid.'});
 try{
  const r=await n8nPost('employee-cancellations',{operation:'travel-review',payload:p.data});
  const out=(Array.isArray(r)?r[0]:r) as {ok?:boolean;statusCode?:number;mime?:string;content?:string}|undefined;
  if(!out||out.ok!==true)return json(res,Number(out?.statusCode)||503,out??{error:'Service unavailable'});
  if(p.data.action==='receipt'&&out.content&&out.mime){res.setHeader('Content-Type',out.mime);res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(Buffer.from(out.content,'base64'));}
  return json(res,200,out);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}
}
