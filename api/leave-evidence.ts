import type {VercelRequest,VercelResponse} from '@vercel/node';
import {headerValue,json} from './_lib/http.js';
import {verifyLineIdentity} from './_lib/lineIdentity.js';
import {dashboardSession,tokenHash} from './_lib/dashboardAuth.js';
import {n8nPost} from './_lib/n8nClient.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
 const auth=headerValue(req,'authorization');let accountId:string|undefined;try{accountId=auth?await verifyLineIdentity(auth):undefined;}catch{return json(res,401,{error:'Please sign in through LINE.'});}
 if(!accountId&&!await dashboardSession(req))return json(res,401,{error:'Sign in required'});
 let payload:Record<string,unknown>={accountId,sessionHash:tokenHash(req)};
 if(req.query.id!==undefined&&(typeof req.query.id!=='string'||!/^[-a-f0-9]{36}$/i.test(req.query.id)))return json(res,422,{error:'Invalid file identifier'});
 if(req.query.requestId!==undefined&&!/^[1-9][0-9]*$/.test(String(req.query.requestId)))return json(res,422,{error:'Invalid request identifier'});
 if(req.method==='POST'){
  const b=req.body??{};if(b.requestId!==undefined&&(!Number.isInteger(b.requestId)||b.requestId<=0))return json(res,422,{error:'Invalid request identifier'});if(!accountId)return json(res,403,{error:'Employee sign-in required'});
  if(typeof b.content!=='string'||b.content.length>2800000||typeof b.filename!=='string')return json(res,422,{error:'Use a PDF, PNG or JPEG up to 2 MB.'});
  const file=Buffer.from(b.content,'base64');const valid=b.mime==='application/pdf'?file.subarray(0,5).toString()==='%PDF-':b.mime==='image/png'?file.subarray(0,8).toString('hex')==='89504e470d0a1a0a':b.mime==='image/jpeg'&&file.subarray(0,3).toString('hex')==='ffd8ff';
  if(!valid||file.length>2097152||file.length===0)return json(res,422,{error:'Use a valid PDF, PNG or JPEG up to 2 MB.'});
  payload={...payload,action:'upload',filename:b.filename.replace(/[\r\n"\\/]/g,'_'),mime:b.mime,content:file.toString('base64'),requestId:b.requestId};
 }else if(req.method==='DELETE'){if(!accountId||!req.query.id)return json(res,403,{error:'Employee sign-in required'});payload={accountId,action:'remove',id:req.query.id};}
 else if(req.method==='GET')payload={...payload,action:req.query.id?'download':'list',id:req.query.id,requestId:req.query.requestId};
 else return json(res,405,{error:'Method not allowed'});
 const result=await n8nPost('employee-cancellations',{operation:'evidence',payload});const b=Array.isArray(result)?result[0]:result;
 if(payload.action==='download'){res.setHeader('Content-Type',b.mime);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(b.filename)}`);return res.status(200).send(Buffer.from(b.content,'base64'));}
 return json(res,200,b);
 }catch(e){return json(res,Number((e as {status?:number}).status)||503,{error:'Could not access this evidence file.'});}
}
