import {N8N_BASE} from './n8nClient.js';
import {webhookSecret} from './webhookSecret.js';
export interface ReceiptRead {amount:number|null;date:string|null;kind:string|null;time:string|null;isReceipt:boolean|null;merchant:string|null;ref:string|null}
const KINDS=['toll','parking','grab','taxi','other'];
export async function readReceipt(mime:string,content:string):Promise<ReceiptRead>{
 const empty:ReceiptRead={amount:null,date:null,kind:null,time:null,isReceipt:null,merchant:null,ref:null};
 const secret=webhookSecret();
 if(!secret||mime==='application/pdf')return empty;
 const c=new AbortController();const t=setTimeout(()=>c.abort(),Number(process.env.RECEIPT_TIMEOUT_MS||12000));
 try{
  const r=await fetch(`${N8N_BASE}/webhook/read-receipt`,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'true','x-ceo-webhook-secret':secret},body:JSON.stringify({mime,content})});
  if(!r.ok)return empty;
  const raw=await r.json() as unknown;
  const b=(Array.isArray(raw)?raw[0]:raw) as {amount?:unknown;date?:unknown;kind?:unknown;time?:unknown;isReceipt?:unknown;merchant?:unknown;ref?:unknown}|undefined;
  const amount=typeof b?.amount==='number'&&b.amount>0&&b.amount<=100000?Math.round(b.amount*100)/100:null;
  const date=typeof b?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.date)?b.date:null;
  const kind=typeof b?.kind==='string'&&KINDS.includes(b.kind)?b.kind:null;
  const time=typeof b?.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)?b.time:null;
  const isReceipt=typeof b?.isReceipt==='boolean'?b.isReceipt:null;
  const text=(v:unknown,n:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,n):null;
  return {amount,date,kind,time,isReceipt,merchant:text(b?.merchant,120),ref:text(b?.ref,60)};
 }catch(e){console.error('Receipt reading skipped:',(e as Error).message);return empty;}
 finally{clearTimeout(t);}
}
