import {useDashboardText} from "@/hooks/useDashboardText";
import {useLanguage} from '@/hooks/useLanguage';
import {formatSheetDate} from './leaveSheetUtils';
import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
interface Request {displayCode?:string;id:number;request_id:number;name:string;code:number;type:string;dates:string[];daysPerDate:number;period:string|null;reason:string;created_at:string;}
async function call(body?:unknown,cohort="employee"){const response=await fetch('/api/cancellations?view=boss&cohort='+cohort,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Cancellation service unavailable');return result;}
export default function CancellationRequests({cohort="employee"}:{cohort?:"employee"|"intern"}){
 const dt = useDashboardText(),{language}=useLanguage();

 const client=useQueryClient(),[reasons,setReasons]=useState<Record<number,string>>({});
 const query=useQuery({queryKey:['cancellations',cohort],queryFn:async()=>(await call(undefined,cohort)).requests as Request[],refetchInterval:30000});
 const decide=useMutation({mutationFn:(body:unknown)=>call(body,cohort),onSuccess:async()=>{toast.success(dt("Cancellation decision saved"));await Promise.all(['cancellations','employees','history'].map(key=>client.invalidateQueries({queryKey:[key]})));},onError:(e)=>{toast.error(e.message);void query.refetch();}});
 if(!query.isLoading&&!query.error&&!query.data?.length)return null;
 return <section className="space-y-3">
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 className="text-lg font-bold">{dt("Leave cancellations")}</h2><span className="text-sm rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-900">{dt("{0} waiting",[query.data?.length??0])}</span></div>
  <p className="text-sm text-slate-600">{dt("Approving removes only the listed dates and restores the balance. Rejecting keeps the original leave.")}</p>
  {query.isLoading&&<p>{dt("Loading…")}</p>}{query.error&&<p role="alert" className="text-red-700">{query.error.message} <button className="underline" onClick={()=>query.refetch()}>{dt("Retry")}</button></p>}
  {query.data?.map(r=><article key={r.id} className="rounded-xl border bg-white p-4 space-y-3">
   <div className="flex flex-wrap items-center gap-3">
    <div className="min-w-0 flex-1"><h3 className="font-semibold truncate">{r.name}</h3><p className="text-sm text-slate-500">{r.displayCode??`TBS-${String(r.code).padStart(3,'0')}`} · {dt("Leave #")}{r.request_id}</p></div>
    <span className="text-sm font-medium">{dt(r.type)} · {r.daysPerDate*r.dates.length===1?dt("1 day total"):dt("{0} days total",[Math.round(r.daysPerDate*r.dates.length*100)/100])}{r.period?` · ${dt(r.period)}`:''}</span>
   </div>
   <div className="flex flex-wrap gap-1.5">{r.dates.map(date=><span key={date} className="text-sm rounded-md border bg-slate-50 px-2 py-0.5">{formatSheetDate(date,language)}</span>)}</div>
   <p className="text-sm whitespace-pre-wrap wrap-break-word border-l-2 border-slate-200 pl-3 text-slate-700">{r.reason||dt("No cancellation reason provided")}</p>
   <label className="block text-sm text-slate-700">{dt("Decision note (optional)")}<textarea className="block w-full border rounded-lg p-2 mt-1" rows={2} maxLength={1000} disabled={decide.isPending} value={reasons[r.id]??''} onChange={e=>setReasons(current=>({...current,[r.id]:e.target.value}))}/></label>
   <div className="flex flex-wrap gap-2">{(['approve','reject'] as const).map(action=><button type="button" key={action} className={action==='approve'?'bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 disabled:opacity-50':'border rounded-lg px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50'} disabled={decide.isPending||query.isFetching} onClick={()=>{if(window.confirm(dt("{0} {1}'s leave on {2}?", [action==='approve'?dt('Approve cancellation of'):dt('Keep the original leave and reject cancellation of'), r.name, r.dates.join(', ')])))decide.mutate({id:r.id,action,reason:reasons[r.id]??''});}}>{action==='approve'?dt("Approve cancellation"):dt("Reject cancellation")}</button>)}</div>
  </article>)}
 </section>;
}
