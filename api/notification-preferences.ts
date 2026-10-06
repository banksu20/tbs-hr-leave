import type {VercelRequest,VercelResponse} from '@vercel/node';
import {headerValue,json} from './_lib/http.js';
import {verifyLineIdentity} from './_lib/lineIdentity.js';
import {n8nPost} from './_lib/n8nClient.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 if(!['en','th'].includes(req.body?.language))return json(res,422,{error:'Choose English or Thai'});
 const changedAt=req.body?.changedAt??Date.now();
 if(!Number.isSafeInteger(changedAt)||changedAt<=0||changedAt>Date.now()+60000)return json(res,422,{error:'Invalid preference timestamp'});
 let accountId:string;
 try{accountId=await verifyLineIdentity(headerValue(req,'authorization'));}catch{return json(res,401,{error:'Open the app in LINE and sign in again.'});}
 try{await n8nPost('employee-cancellations',{operation:'sick-language',payload:{accountId,language:req.body.language,changedAt}});return json(res,200,{ok:true});}
 catch{return json(res,503,{error:'Could not save notification language. Please try again.'});}
}
