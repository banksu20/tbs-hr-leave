import {useDashboardText} from "@/hooks/useDashboardText";
import LeaveEvidence from '../LeaveEvidence';
import CancellationRequests from "./CancellationRequests";
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Employee } from '@/data/mockEmployees';
import { approveLeave, rejectLeave } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function PendingRequests({employees,ready,cohort="employee"}: {employees: Employee[]; ready:boolean;cohort?:"employee"|"intern"}) {
 const dt = useDashboardText();

  const client=useQueryClient();
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const approve=useMutation({mutationFn:({id,revision,action,reason}:{id:string;revision:string;action:'approve'|'reject';reason?:string})=>action==='approve'?approveLeave(id,revision):rejectLeave(id,revision,reason),
    onSuccess:async(_data,variables)=>{toast.success(variables.action==='approve'?dt("Request approved"):dt("Request rejected"));await Promise.all([client.invalidateQueries({queryKey:['employees']}),client.invalidateQueries({queryKey:['history']})]);},
    onError:(error)=>toast.error(error.message)});
  const requests=employees.flatMap(employee=>{
    const seen=new Set<string>();
    return employee.leaves.filter(leave=>{
      if(leave.status!=='Pending')return false;
      const key=leave.requestId??leave.id;
      if(seen.has(key))return false;seen.add(key);return true;
    }).map(leave=>({employee,leave}));
  }).sort((a,b)=>a.leave.date.localeCompare(b.leave.date));
  return <><CancellationRequests cohort={cohort}/><section className="bg-white border rounded-xl p-4 space-y-4">
    <h2 className="font-bold text-lg">{dt("Pending requests (")}{requests.length})</h2>
    <p className="text-sm text-slate-500">{dt("Shows requests in the selected year, department and search. Approve or reject the entire request, including dates in another year.")}</p>
    {!ready&&<p role="alert" className="text-amber-800">{dt("Refresh live data before deciding on requests.")}</p>}
    {!requests.length&&<p>{dt("No pending requests match these filters.")}</p>}
    {requests.map(({employee,leave})=><article key={`${employee.id}-${leave.requestId??leave.id}`} className="border rounded-lg p-3 space-y-2">
      <h3 className="font-semibold">{employee.name} · {employee.empCode}</h3>
      <p className="text-sm">{employee.department} · {dt(leave.type)} · {leave.days}  {dt("day(s) per date")}{leave.halfDayPeriod?` · ${dt(leave.halfDayPeriod)}`:''}</p>
      <p className="text-sm wrap-break-word">{(leave.requestDates??[leave.date]).join(', ')}</p>
      <p className="text-sm whitespace-pre-wrap wrap-break-word">{leave.note||dt("No reason provided")}</p>
      {leave.requestId&&['sick','university'].includes(leave.type)&&<LeaveEvidence requestId={leave.requestId}/>}
      {!leave.requestRevision&&<p className="text-sm text-amber-800">{dt("Refresh after the approval workflow is deployed to approve this request.")}</p>}
      <label className="block text-sm text-slate-600">{dt("Rejection reason (optional)")} <textarea maxLength={1000} disabled={approve.isPending} className="block w-full rounded-lg border p-2 mt-1" rows={2} placeholder={dt("For example: please choose another date")} value={reasons[leave.requestId??leave.id]??''} onChange={e=>setReasons(current=>({...current,[leave.requestId??leave.id]:e.target.value}))}/>
      </label>
      <div className="flex gap-2">{(['approve','reject'] as const).map(action=><Button key={action} variant={action==='approve'?'default':'destructive'} disabled={!ready||!leave.requestId||!leave.requestRevision||approve.isPending} onClick={()=>{
        if(!leave.requestId||!leave.requestRevision)return;
        if(window.confirm(dt("{0} {1}'s entire {2} request for {3}?{4}", [action==='approve'?dt('Approve'):dt('Reject'), employee.name, dt(leave.type), (leave.requestDates??[leave.date]).join(', '), action==='reject'?' '+dt('Rejected leave will not use their allowance.'):''])))approve.mutate({id:leave.requestId,revision:leave.requestRevision,action,reason:reasons[leave.requestId??leave.id]});
      }}>{approve.isPending&&approve.variables?.id===leave.requestId&&approve.variables.action===action?dt("Saving…"):action==='approve'?dt("Approve request"):dt("Reject request")}</Button>)}</div>
    </article>)}
  </section></>;
}
