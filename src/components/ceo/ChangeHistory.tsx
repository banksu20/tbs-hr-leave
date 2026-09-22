import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHistory, restoreLeave, type ChangeEvent } from '@/lib/api';
import type { Employee } from '@/data/mockEmployees';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function changedFields(event: ChangeEvent) {
  return [...new Set([...Object.keys(event.before??{}),...Object.keys(event.after??{})])]
    .filter(key=>!['updated_at','created_at','user_id','id','source'].includes(key)&&JSON.stringify(event.before?.[key])!==JSON.stringify(event.after?.[key]));
}
const labels: Record<string,string> = {annual_total:'Annual allowance',sick_total:'Sick allowance',personal_total:'Personal allowance',carried_over:'Carried days',carryover_expires_on:'Carryover expiry',leave_days:'Number of days',leave_type:'Leave type',start_date:'First day',end_date:'Last day',selected_dates:'Leave dates',half_day_period:'Time of day',reason:'Employee’s reason',rejection_reason:'Rejection reason',status:'Status',first_name:'First name',last_name:'Last name',nickname:'Nickname',tbs_id:'Employee number',note:'Note',year:'Allowance year',department:'Department',user_name:'Employee name',start_date_employment:'Employment start'};
function activity(event:ChangeEvent) {
  if(event.entity==='leave_requests')return ({insert:'Leave request added',approve:'Leave approved',reject:'Leave rejected',cancel:'Leave cancelled',restore:'Cancellation undone',update:'Leave request updated',delete:'Leave record removed'} as Record<string,string>)[event.action]??'Leave updated';
  return event.entity==='leave_quotas'?(event.action==='insert'?'Leave allowance created':'Leave allowance updated'):'Employee details updated';
}
const show=(value:unknown)=>value===null||value===undefined?'—':Array.isArray(value)?value.join(', '):typeof value==='object'?'Updated details':String(value);
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
    <p className="text-sm text-slate-500">See what changed and when. Open “View changes” for the previous and new values. History starts from when tracking was enabled. The person making each change is not recorded while sign-in is off.</p>
    {history.isPending&&<p>Loading history…</p>}
    {history.error&&<p role="alert" className="text-red-700">{history.error.message}</p>}
    {history.data?.pages.flatMap(p=>p.events).map(event=><article key={event.id} className="border rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{activity(event)}</h3><time className="text-sm">{new Date(event.changedAt).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} · Bangkok</time></div>
      <p className="font-medium text-slate-700">{event.employeeName||'Employee'}{event.department?` · ${event.department}`:''}</p>
      {event.entity==='leave_requests'&&(event.after??event.before)?.leave_type!=null&&<p className="text-sm text-slate-500">{show((event.after??event.before)?.leave_type)} leave · {show((event.after??event.before)?.leave_days)} day(s) · {show((event.after??event.before)?.selected_dates||(event.after??event.before)?.start_date)}</p>}
      {event.entity==='leave_quotas'&&<p className="text-sm text-slate-500">Allowance for {show((event.after??event.before)?.year)}</p>}
      {event.action==='reject'&&<p className="text-sm rounded-lg bg-rose-50 text-rose-900 p-3 whitespace-pre-wrap break-words"><strong>Rejection reason:</strong> {typeof event.after?.rejection_reason==='string'&&event.after.rejection_reason.trim()?event.after.rejection_reason:'No reason provided'}</p>}
      <details><summary className="text-sm font-semibold text-sky-700 cursor-pointer py-2">View changes ({changedFields(event).length})</summary>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>What changed</th><th>Previous</th><th>Now</th></tr></thead><tbody>{changedFields(event).map(key=><tr key={key} className="border-t"><th className="text-left p-1 font-medium">{labels[key]??key.replace(/_/g,' ')}</th><td className="p-1 whitespace-pre-wrap break-words">{show(event.before?.[key])}</td><td className="p-1 whitespace-pre-wrap break-words">{show(event.after?.[key])}</td></tr>)}</tbody></table></div></details>
      {event.canRestore&&<Button variant="outline" disabled={undo.isPending} onClick={()=>{if(window.confirm('Restore this entire leave request to its previous status? Its dates will count against the leave balance again.'))undo.mutate(event);}}>Undo cancellation</Button>}
    </article>)}
    {history.data?.pages[0].events.length===0&&<p>No recorded changes for this selection.</p>}
    {history.hasNextPage&&<Button variant="outline" disabled={history.isFetchingNextPage} onClick={()=>history.fetchNextPage()}>Load older changes</Button>}
  </section>;
}
