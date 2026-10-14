import type {VercelRequest,VercelResponse} from './_lib/platform.js';
import {json} from './_lib/http.js';
import {dashboardCall,dashboardSession,sameOrigin} from './_lib/dashboardAuth.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const session=await dashboardSession(req);if(!session)return json(res,401,{error:'Sign in required'});
  if(req.method!=='POST'||!sameOrigin(req))return json(res,403,{error:'Operation not permitted'});
  const body=req.body??{};
  if(typeof body.userId!=='string'||!body.userId)return json(res,422,{error:'Employee required'});
  if(body.action==='delete'){
   if(typeof body.confirmation!=='string'||!/^TBSInterns-[0-9]{3,}$/.test(body.confirmation))return json(res,422,{error:'Enter the exact intern code.'});
   return json(res,200,await dashboardCall(req,'intern-delete',{body:{userId:body.userId,confirmation:body.confirmation}}));
  }
  if(['archive','restore'].includes(body.action))return json(res,200,await dashboardCall(req,'intern-'+body.action,{body:{userId:body.userId}}));
  return json(res,403,{error:'Employee type is set during registration and cannot be changed.'});
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}
}
