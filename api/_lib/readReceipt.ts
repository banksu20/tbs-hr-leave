import {N8N_BASE} from './n8nClient.js';
import {webhookSecret} from './webhookSecret.js';
export interface ReceiptRead {amount:number|null;date:string|null;kind:string|null}
const KINDS=['toll','parking','grab','taxi','other'];
export async function readReceipt(mime:string,content:string):Promise<ReceiptRead>{
 const empty={amount:null,date:null,kind:null};
 const secret=webhookSecret();
 if(!secret||mime==='application/pdf')return empty;
 const c=new AbortController();const t=setTimeout(()=>c.abort(),Number(process.env.RECEIPT_TIMEOUT_MS||12000));
 try{
  const r=await fetch(`${N8N_BASE}/webhook/read-receipt`,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','ngrok-skip-browser-warning':'true','x-ceo-webhook-secret':secret},body:JSON.stringify({mime,content})});
  if(!r.ok)return empty;
  const raw=await r.json() as unknown;
  const b=(Array.isArray(raw)?raw[0]:raw) as {amount?:unknown;date?:unknown;kind?:unknown}|undefined;
  const amount=typeof b?.amount==='number'&&b.amount>0&&b.amount<=100000?Math.round(b.amount*100)/100:null;
  const date=typeof b?.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.date)?b.date:null;
  const kind=typeof b?.kind==='string'&&KINDS.includes(b.kind)?b.kind:null;
  return {amount,date,kind};
 }catch(e){console.error('Receipt reading skipped:',(e as Error).message);return empty;}
 finally{clearTimeout(t);}
}
