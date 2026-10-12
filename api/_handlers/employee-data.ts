import type {VercelRequest,VercelResponse} from '@vercel/node';
import {headerValue,json} from '../_lib/http.js';
import {verifyLineIdentity} from '../_lib/lineIdentity.js';
import {n8nGet,n8nPost} from '../_lib/n8nClient.js';

const actions=new Set(['check-user','get-quota','get-leave-history','get-team-calendar']);
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 const action=req.query.action;
 if(typeof action!=='string'||!actions.has(action))return json(res,422,{error:'Invalid data request'});
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Please sign in through LINE.'});}
 try{
  const result=await n8nPost('employee-cancellations',{operation:'registration',payload:{action:'status',accountId}});
  const profile=(Array.isArray(result)?result[0]:result) as {found?:boolean;inactive?:boolean;department?:string};
  if(!profile?.found||profile.inactive)return json(res,403,{error:'An active employee registration is required.'});
  if(action==='check-user')return json(res,200,profile);
  const params:Record<string,string>={userId:accountId};
  if(action==='get-team-calendar'){
   const year=Number(req.query.year),month=Number(req.query.month);
   if(!Number.isInteger(year)||year<2000||year>2200||!Number.isInteger(month)||month<1||month>12)return json(res,422,{error:'Invalid calendar date'});
   const own=profile.department?.trim()||'';
   const allowed=['Web Developer','UX/UI Designer'].includes(own)?['Web Developer','UX/UI Designer']:
    accountId==='Uc229f2377a2b8839adab478d92c0c26f'&&['Graphic','Content'].includes(own)?['Graphic','Content']:[own];
   const department=req.query.department??own;
   if(typeof department!=='string'||!department||!allowed.includes(department))return json(res,403,{error:'This department is not in your team.'});
   params.department=department;params.year=String(year);params.month=String(month);
  }
  const data=await n8nGet(action,params);
  if(data===null)return json(res,503,{error:'Employee data is temporarily unavailable.'});
  return json(res,200,data);
 }catch{return json(res,503,{error:'Employee data could not be loaded. Please try again.'});}
}
