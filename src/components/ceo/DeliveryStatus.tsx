import {useQuery} from '@tanstack/react-query';
interface Delivery {pending:number;failed:number;jobs:{id:string;kind:string;name:string;status:string;attempts:number;blocked:boolean}[];}
export default function DeliveryStatus(){
 const query=useQuery<Delivery>({queryKey:['delivery-status'],queryFn:async()=>{const r=await fetch('/api/cancellations?view=boss&delivery=1');const data=await r.json();if(!r.ok||!Array.isArray(data.jobs))throw Error('Delivery status unavailable. Check the n8n update.');return data;},refetchInterval:15000});
 return <div className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-3"><strong>Notification & Sheets delivery</strong><button className="underline" onClick={()=>query.refetch()}>Refresh</button></div>
 {query.isLoading?<p>Checking delivery…</p>:query.error?<p role="alert" className="text-red-700">{query.error.message}</p>:query.data&&<><p className={query.data.failed?'text-red-700':'text-slate-600'}>{query.data.pending} queued · {query.data.failed} need attention</p>{query.data.pending>0&&<details><summary className="cursor-pointer mt-2">View queue</summary>{query.data.jobs.map(j=><p key={j.id} className="mt-2">{j.name} · {j.kind==='line'?'LINE':'Sheets'} · {j.status} · {j.attempts} attempts{j.blocked?' — ask the workflow administrator to review delivery before resending.':''}</p>)}</details>}</>}
 </div>;
}
