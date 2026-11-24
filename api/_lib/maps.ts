import {N8N_BASE} from './n8nClient.js';
import {webhookSecret} from './webhookSecret.js';
export interface Place {lat:number;lng:number;label:string}
export class MapsError extends Error {constructor(public status:number,message:string){super(message);}}
const TIMEOUT=Number(process.env.MAPS_TIMEOUT_MS||9000);
const LINK_HOSTS=/^(maps\.app\.goo\.gl|goo\.gl|share\.google|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;
const valid=(lat:number,lng:number)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&!(lat===0&&lng===0);

async function timed(url:string,init:RequestInit={}){
 const c=new AbortController();const t=setTimeout(()=>c.abort(),TIMEOUT);
 try{return await fetch(url,{...init,signal:c.signal});}finally{clearTimeout(t);}
}

async function maps<T>(body:Record<string,unknown>):Promise<T>{
 const secret=webhookSecret();
 if(!secret)throw new MapsError(503,'Maps are not set up yet. Please tell HR.');
 let r:Response;
 try{r=await timed(`${N8N_BASE}/webhook/maps`,{method:'POST',headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'true','x-ceo-webhook-secret':secret},body:JSON.stringify(body)});}
 catch{throw new MapsError(503,'Maps are not available right now. Please try again.');}
 const raw=await r.json().catch(()=>null) as unknown;
 const out=(Array.isArray(raw)?raw[0]:raw) as (T&{error?:unknown})|null;
 if(!r.ok||!out||out.error)throw new MapsError(503,'Maps are not available right now. Please try again.');
 return out;
}

export function coordsFromText(text:string):{lat:number;lng:number}|null{
 let s=text;try{s=decodeURIComponent(text);}catch{s=text;}
 const pats=[/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,/[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/];
 for(const p of pats){const m=s.match(p);if(m){const lat=Number(m[1]),lng=Number(m[2]);if(valid(lat,lng))return {lat,lng};}}
 return null;
}

function placeName(url:URL){
 const m=url.pathname.match(/\/maps\/place\/([^/]+)/);
 if(m){try{return decodeURIComponent(m[1].replace(/\+/g,' '));}catch{return m[1];}}
 return url.searchParams.get('q')||url.searchParams.get('query')||'';
}

async function expandLink(raw:string){
 let url=new URL(raw);
 for(let i=0;i<5;i++){
  if(url.protocol!=='https:'||!LINK_HOSTS.test(url.hostname))throw new MapsError(422,'Paste a Google Maps link, an address or a place name.');
  if(!/^(maps\.app\.goo\.gl|goo\.gl|share\.google)$/i.test(url.hostname)&&url.pathname!=='/share.google')return url;
  const r=await timed(url.toString(),{redirect:'manual'}).catch(()=>{throw new MapsError(422,'This Google Maps link could not be opened.');});
  const next=r.headers.get('location');if(!next)throw new MapsError(422,'This Google Maps link could not be opened.');
  url=new URL(next,url);
 }
 throw new MapsError(422,'This Google Maps link could not be opened.');
}

async function search(text:string):Promise<Place[]>{
 const out=await maps<{places?:Place[]}>({op:'search',query:text.slice(0,300)});
 return (out.places??[]).filter(p=>valid(Number(p.lat),Number(p.lng))).slice(0,5).map(p=>({lat:Number(p.lat),lng:Number(p.lng),label:String(p.label??'').slice(0,300)}));
}

export async function findPlaces(query:string):Promise<Place[]>{
 const text=query.trim();
 if(/^https?:\/\//i.test(text)){
  const url=await expandLink(text);
  const c=coordsFromText(url.toString());const name=placeName(url);
  if(c)return [{...c,label:(name||`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`).slice(0,300)}];
  if(name)return search(name);
  throw new MapsError(422,'This Google Maps link has no location. Try the address instead.');
 }
 const direct=coordsFromText(text);
 if(direct)return [{...direct,label:`${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`}];
 return search(text);
}

export async function routeKm(from:{lat:number;lng:number},to:{lat:number;lng:number}):Promise<number>{
 const out=await maps<{meters?:number|null}>({op:'route',from,to});
 const m=Number(out.meters);
 if(out.meters==null||!Number.isFinite(m)||m<0)return 0;
 return Math.round(m/10)/100;
}
