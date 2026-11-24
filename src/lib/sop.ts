import liff from '@line/liff';
export interface SopDoc {id:number;titleEn:string;titleTh:string;body:string;bodyEn?:string;version:number;updatedAt:string;acceptedAt:string|null;acceptedBefore:boolean}
async function call(body?:{docId:number;version:number}){
 const token=liff.getAccessToken();if(!token)throw new Error('Please open this page in LINE.');
 const r=await fetch('/api/sop',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const b=await r.json().catch(()=>({error:'Service unavailable'}));
 if(!r.ok||!b.ok){const e=new Error(b?.error||'Service unavailable') as Error&{docs?:SopDoc[]};e.docs=b?.docs;throw e;}
 return b.docs as SopDoc[];
}
export const fetchSops=()=>call();
export const acceptSop=(docId:number,version:number)=>call({docId,version});
export const sopBody=(d:Pick<SopDoc,'body'|'bodyEn'>,th:boolean)=>th?d.body||d.bodyEn||'':d.bodyEn||d.body;
export const sopTitle=(d:Pick<SopDoc,'titleEn'|'titleTh'>,th:boolean)=>th&&d.titleTh?d.titleTh:d.titleEn;
