import DeliveryStatus from './DeliveryStatus';
import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
interface Request {id:number;request_id:number;name:string;code:number;type:string;dates:string[];daysPerDate:number;period:string|null;reason:string;created_at:string;}
async function call(body?:unknown){const response=await fetch('/api/cancellations?view=boss',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Cancellation service unavailable');return result;}
export default function CancellationRequests(){
 const client=useQueryClient(),[reasons,setReasons]=useState<Record<number,string>>({});
 const query=useQuery({queryKey:['cancellations'],queryFn:async()=>(await call()).requests as Request[],refetchInterval:30000});
 const decide=useMutation({mutationFn:call,onSuccess:async()=>{toast.success('Cancellation decision saved');await Promise.all(['cancellations','employees','history'].map(key=>client.invalidateQueries({queryKey:[key]})));},onError:(e)=>{toast.error(e.message);void query.refetch();}});
 return <section className="rounded-xl border bg-white p-4 space-y-3 mb-4"><h2 className="text-lg font-bold">Cancellation requests ({query.data?.length??0})</h2><p className="text-sm text-slate-600">All employees and years. Approve cancellation to remove only the listed dates and restore their balance. Reject cancellation to keep the original leave.</p>
 <DeliveryStatus/>
 {query.isLoading&&<p>Loading…</p>}{query.error&&<p role="alert" className="text-red-700">{query.error.message} <button onClick={()=>query.refetch()}>Retry</button></p>}
 {query.data?.length===0&&<p className="text-sm">No cancellation requests waiting.</p>}
 {query.data?.map(r=><article key={r.id} className="rounded-lg border p-3 space-y-2"><h3 className="font-semibold">{r.name} · TBS-{String(r.code).padStart(3,'0')}</h3><p className="text-sm">Leave #{r.request_id} · {r.type} · {r.daysPerDate} day(s) per date {r.period??''}</p><p>{r.dates.join(', ')}</p><p className="text-sm whitespace-pre-wrap">{r.reason||'No cancellation reason provided'}</p><label className="block text-sm">Decision note (optional)<textarea className="block w-full border rounded p-2" maxLength={1000} disabled={decide.isPending} value={reasons[r.id]??''} onChange={e=>setReasons(current=>({...current,[r.id]:e.target.value}))}/></label><div className="flex gap-2">{(['approve','reject'] as const).map(action=><Button key={action} variant={action==='approve'?'default':'outline'} disabled={decide.isPending||query.isFetching} onClick={()=>{if(window.confirm(`${action==='approve'?'Approve cancellation of':'Keep the original leave and reject cancellation of'} ${r.name}'s leave on ${r.dates.join(', ')}?`))decide.mutate({id:r.id,action,reason:reasons[r.id]??''});}}>{action==='approve'?'Approve cancellation':'Reject cancellation'}</Button>)}</div></article>)}
 </section>;
}
