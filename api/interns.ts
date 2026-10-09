import type {VercelRequest,VercelResponse} from '@vercel/node';
import {json} from './_lib/http.js';
import {dashboardCall,dashboardSession,sameOrigin} from './_lib/dashboardAuth.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  const session=await dashboardSession(req);if(!session)return json(res,401,{error:'Sign in required'});
  if(req.method==='GET'&&session.role!=='hr')return json(res,200,await dashboardCall(req,'employee-types'));
  if(req.method!=='POST'||!sameOrigin(req))return json(res,403,{error:'Operation not permitted'});
  const body=req.body??{};
  if(typeof body.userId!=='string'||!body.userId)return json(res,422,{error:'Employee required'});
  if(['archive','restore'].includes(body.action))return json(res,200,await dashboardCall(req,'intern-'+body.action,{body:{userId:body.userId}}));
  if(session.role==='hr'||!['intern','employee'].includes(body.type))return json(res,403,{error:'Only Admin and CEO can classify employees'});
  return json(res,200,await dashboardCall(req,'employee-type',{userId:body.userId,type:body.type}));
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:(e as Error).message});}
}
