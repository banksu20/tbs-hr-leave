import {useLanguage} from "@/hooks/useLanguage";
import {useDashboardText} from "@/hooks/useDashboardText";
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
interface Job {id:string;kind:string;name:string;status:string;attempts:number;blocked:boolean;running:boolean;needsResend:boolean;error:string|null;updatedAt:string;}
interface Delivery {pending:number;failed:number;jobs:Job[];calendar?:{lastSuccess:string|null;error:string|null;running:boolean;failures:number};}
export default function DeliveryStatus(){
 const dt = useDashboardText();
 const {language}=useLanguage();
 const time=(value:string|null)=>value?new Date(value).toLocaleString(language==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok'}):dt('Not recorded yet');

 const client=useQueryClient();
 const query=useQuery<Delivery>({queryKey:['delivery-status'],queryFn:async()=>{const r=await fetch('/api/cancellations?view=boss&delivery=1');const data=await r.json();if(!r.ok||!Array.isArray(data.jobs))throw Error(data.error||dt("Delivery status unavailable."));return data;},refetchInterval:15000});
 const retry=useMutation({mutationFn:async(body:{kind:'line'|'calendar';id?:string;confirmResend?:boolean})=>{const r=await fetch('/api/cancellations?view=boss&delivery=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw Error(b.error||dt("Retry failed"));},onSuccess:()=>client.invalidateQueries({queryKey:['delivery-status']})});
 return <section className="rounded-xl border bg-white p-5 space-y-4 text-sm"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{dt("Delivery alerts")}</h2><button className="border rounded-lg px-3 py-2" onClick={()=>query.refetch()}>{dt("Refresh")}</button></div>
 <p className="text-slate-500">{dt("Admin: Dale · Times shown in Bangkok time. Failed deliveries also queue a LINE alert to Dale. Alerts remain here if LINE is unavailable.")}</p>
 {retry.error&&<p role="alert" className="text-red-700">{retry.error.message}</p>}{retry.isSuccess&&<p role="status" className="text-emerald-700">{dt("Retry queued. This page updates when the worker finishes.")}</p>}
 {query.isLoading?<p>{dt("Checking delivery…")}</p>:query.error?<p role="alert" className="text-red-700">{query.error.message}</p>:query.data&&<>
 {query.data.calendar&&<div className="border rounded-lg p-4 space-y-2"><div className="flex justify-between gap-3"><strong>Google Calendar</strong><button className="text-cyan-700 underline disabled:opacity-50" disabled={retry.isPending||query.data.calendar.running} onClick={()=>retry.mutate({kind:'calendar'})}>{query.data.calendar.running?dt("Syncing…"):dt("Retry sync")}</button></div><p>{dt("Last successful sync:")} {time(query.data.calendar.lastSuccess)}</p>{query.data.calendar.error&&<p role="alert" className="text-red-700">{query.data.calendar.error}</p>}</div>}
 <h3 className="font-semibold">{dt("LINE notifications")}</h3><p className={query.data.failed?'text-red-700':'text-slate-600'}>{query.data.pending}  {dt("queued ·")} {query.data.failed}  {dt("need attention")}</p>
 {query.data.jobs.map(j=><article key={j.id} className="border rounded-lg p-4 space-y-2"><div className="flex flex-wrap justify-between gap-3"><strong>{j.name}</strong><button className="text-cyan-700 underline disabled:opacity-50" disabled={retry.isPending||j.running} onClick={()=>{if(j.needsResend&&!window.confirm(dt("LINE’s duplicate-protection window has expired. This sends a new copy and the recipient may receive a duplicate. Resend?")))return;retry.mutate({kind:'line',id:j.id,confirmResend:j.needsResend});}}>{j.running?dt("Sending…"):j.needsResend?dt("Resend…"):dt("Retry")}</button></div><p>{dt(j.status)} · {j.attempts}  {dt("attempts ·")} {time(j.updatedAt)}</p>{j.error&&<p className="text-red-700">{j.error}</p>}{j.needsResend&&<p className="text-amber-700">{dt("Delivery outcome needs review before resending.")}</p>}</article>)}
 </>}
 </section>;
}
