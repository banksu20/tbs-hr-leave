import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import type {VercelRequest} from '@vercel/node';
import {n8nPost} from './n8nClient.js';
export type DashboardRole='admin'|'ceo'|'hr';
export interface DashboardSession {id:string;username:string;role:DashboardRole}
export const COOKIE='tbs_dashboard';
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64,{N:32768,maxmem:64*1024*1024}).toString('hex')}`;}
export function verifyHash(password:string,hash:string){try{const [format,salt,value]=hash.split(':');if(format!=='scrypt'||!salt||!/^[a-f0-9]{128}$/.test(value))return false;return timingSafeEqual(scryptSync(password,salt,64,{N:32768,maxmem:64*1024*1024}),Buffer.from(value,'hex'));}catch{return false;}}
export const passwordValid=(value:unknown):value is string=>typeof value==='string'&&value.length>=8&&value.length<=128;
export function tokenHash(req:VercelRequest){const raw=String(req.headers.cookie??'').match(/(?:^|;\s*)tbs_dashboard=([a-f0-9]{64})(?:;|$)/)?.[1];return raw?createHash('sha256').update(raw).digest('hex'):'';}
export async function authCall(operation:string,payload:Record<string,unknown>={}){const result=await n8nPost('employee-cancellations',{operation:'dashboard-auth',payload:{...payload,operation}});return Array.isArray(result)?result[0]:result;}
export async function dashboardSession(req:VercelRequest):Promise<DashboardSession|null>{const hash=tokenHash(req);if(!hash)return null;try{const result=await authCall('session',{sessionHash:hash});return result.session??null;}catch(e){if((e as {status?:number}).status===401)return null;throw e;}}
export async function dashboardCall(req:VercelRequest,operation:string,payload:Record<string,unknown>={}){return authCall(operation,{...payload,sessionHash:tokenHash(req)});}
export function newSession(){const token=randomBytes(32).toString('hex');return {token,hash:createHash('sha256').update(token).digest('hex')};}
export function cookie(token:string,maxAge=28800){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
export function sameOrigin(req:VercelRequest){const origin=req.headers.origin;if(!origin)return true;try{return new URL(String(origin)).host===req.headers.host;}catch{return false;}}
