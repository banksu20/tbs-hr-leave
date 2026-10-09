import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createHash,timingSafeEqual} from 'node:crypto';
import {json} from './_lib/http.js';
import {authCall,cookie,dashboardSession,hashPassword,newSession,passwordValid,sameOrigin,tokenHash,verifyHash} from './_lib/dashboardAuth.js';
export default async function handler(req:VercelRequest,res:VercelResponse){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET'){const session=await dashboardSession(req);return json(res,200,{required:true,signedIn:!!session,session});}
  if(!sameOrigin(req))return json(res,403,{error:'Cross-origin request refused'});
  if(req.method==='DELETE'){if(tokenHash(req))await authCall('logout',{sessionHash:tokenHash(req)});res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const {username,password}=req.body??{};
  if(typeof username!=='string'||! /^[a-z0-9._-]{2,64}$/i.test(username)||typeof password!=='string'||password.length>128)return json(res,401,{error:'Incorrect username or password'});
  const name=username.toLowerCase();
  const bootstrap=process.env.DASHBOARD_BOOTSTRAP_PASSWORD;
  if(name==='admin'&&passwordValid(bootstrap)&&timingSafeEqual(createHash('sha256').update(password).digest(),createHash('sha256').update(bootstrap).digest())){await authCall('bootstrap',{passwordHash:hashPassword(password)});}
  const ip=String(req.headers['x-forwarded-for']??'unknown').split(',')[0].trim();
  const attempt=await authCall('login-start',{username:name,ipHash:createHash('sha256').update(ip).digest('hex')});
  if(!attempt.account||!verifyHash(password,attempt.account.password_hash)){
   // Perform password work for unknown accounts too.
   if(!attempt.account)hashPassword(password);
   return json(res,401,{error:'Incorrect username or password'});
  }
  const next=newSession();
  await authCall('login-finish',{id:attempt.account.id,version:attempt.account.version,sessionHash:next.hash});
  res.setHeader('Set-Cookie',cookie(next.token));return json(res,200,{ok:true});
 }catch(e){const status=Number((e as {status?:number}).status);return json(res,status===429?429:503,{error:status===429?'Too many attempts. Try again in 15 minutes.':'Sign-in service unavailable. Please try again.'});}
}
