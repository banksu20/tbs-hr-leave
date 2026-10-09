import type {VercelRequest,VercelResponse} from '@vercel/node';
import {z} from 'zod';
import {json} from './_lib/http.js';
import {dashboardCall,dashboardSession,hashPassword,passwordValid,sameOrigin} from './_lib/dashboardAuth.js';
const schema=z.object({id:z.string().uuid().optional(),username:z.string().regex(/^[a-z0-9._-]{2,64}$/),role:z.enum(['admin','ceo','hr']),active:z.boolean(),password:z.string().optional()});
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const session=await dashboardSession(req);if(!session)return json(res,401,{error:'Sign in required'});
  if(session.role!=='admin')return json(res,403,{error:'Admin access required'});
  if(req.method==='GET')return json(res,200,await dashboardCall(req,'accounts-list'));
  if(req.method!=='POST'||!sameOrigin(req))return json(res,403,{error:'Operation not permitted'});
  const parsed=schema.safeParse(req.body);if(!parsed.success)return json(res,422,{error:'Invalid account details'});
  const {password,...body}=parsed.data;
  if((!body.id||password!==undefined)&&!passwordValid(password))return json(res,422,{error:'Use a password of 8–128 characters'});
  return json(res,200,await dashboardCall(req,'account-save',{...body,...(password?{passwordHash:hashPassword(password)}:{})}));
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message||'Account service unavailable'});}
}
