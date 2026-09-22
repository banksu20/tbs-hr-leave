import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHistory, restoreLeave, type ChangeEvent } from '@/lib/api';
import type { Employee } from '@/data/mockEmployees';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function changedFields(event: ChangeEvent) {
  return [...new Set([...Object.keys(event.before??{}),...Object.keys(event.after??{})])]
    .filter(key=>!['updated_at','created_at','user_id','id'].includes(key)&&JSON.stringify(event.before?.[key])!==JSON.stringify(event.after?.[key]));
}
const show=(value:unknown)=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
export default function ChangeHistory({employees}: {employees: Employee[]}) {
  const [userId,setUserId]=useState('');
  const client=useQueryClient();
  const history=useInfiniteQuery({queryKey:['history',userId],initialPageParam:undefined as string|undefined,
    queryFn:({pageParam})=>fetchHistory(userId||undefined,pageParam),getNextPageParam:page=>page.nextCursor??undefined});
  const undo=useMutation({mutationFn:(event:ChangeEvent)=>restoreLeave(event.recordId,event.id),onSuccess:async()=>{
    toast.success('Cancellation undone'); await Promise.all([client.invalidateQueries({queryKey:['history']}),client.invalidateQueries({queryKey:['employees']})]);
  },onError:(error)=>toast.error(error.message)});
  return <section className="bg-white rounded-xl border p-4 space-y-4">
    <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold">Change history</h2>
      <label>Employee <select className="border rounded p-2" value={userId} onChange={e=>setUserId(e.target.value)}><option value="">All employees</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name} · {e.empCode}</option>)}</select></label>
      <Button variant="outline" disabled={history.isFetching} onClick={()=>history.refetch()}>Refresh</Button>
    </div>
    <p className="text-sm text-slate-500">Changes recorded after history was enabled, across all years. Individual users cannot be identified until individual sign-in is enabled.</p>
    {history.isPending&&<p>Loading history…</p>}
    {history.error&&<p role="alert" className="text-red-700">{history.error.message}</p>}
    {history.data?.pages.flatMap(p=>p.events).map(event=><article key={event.id} className="border rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{event.employeeName||event.userId} · {event.entity==='leave_requests'?'Leave':event.entity==='leave_quotas'?'Quota':'Employee'} · {event.action}</h3><time className="text-sm">{new Date(event.changedAt).toLocaleString()}</time></div>
      <p className="text-xs text-slate-500">{event.actor}</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{changedFields(event).map(key=><tr key={key} className="border-t"><th className="text-left p-1 font-medium">{key.replace(/_/g,' ')}</th><td className="p-1 whitespace-pre-wrap break-words">{show(event.before?.[key])}</td><td className="p-1 whitespace-pre-wrap break-words">{show(event.after?.[key])}</td></tr>)}</tbody></table></div>
      {event.canRestore&&<Button variant="outline" disabled={undo.isPending} onClick={()=>{if(window.confirm('Restore this entire leave request to its previous status? Its dates will count against the leave balance again.'))undo.mutate(event);}}>Undo cancellation</Button>}
    </article>)}
    {history.data?.pages[0].events.length===0&&<p>No recorded changes for this selection.</p>}
    {history.hasNextPage&&<Button variant="outline" disabled={history.isFetchingNextPage} onClick={()=>history.fetchNextPage()}>Load older changes</Button>}
  </section>;
}
