import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Employee } from '@/data/mockEmployees';
import { approveLeave } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function PendingRequests({employees,ready}: {employees: Employee[]; ready:boolean}) {
  const client=useQueryClient();
  const approve=useMutation({mutationFn:({id,revision}:{id:string;revision:string})=>approveLeave(id,revision),
    onSuccess:async()=>{toast.success('Request approved');await Promise.all([client.invalidateQueries({queryKey:['employees']}),client.invalidateQueries({queryKey:['history']})]);},
    onError:(error)=>toast.error(error.message)});
  const requests=employees.flatMap(employee=>{
    const seen=new Set<string>();
    return employee.leaves.filter(leave=>{
      if(leave.status!=='Pending')return false;
      const key=leave.requestId??leave.id;
      if(seen.has(key))return false;seen.add(key);return true;
    }).map(leave=>({employee,leave}));
  }).sort((a,b)=>a.leave.date.localeCompare(b.leave.date));
  return <section className="bg-white border rounded-xl p-4 space-y-4">
    <h2 className="font-bold text-lg">Pending requests ({requests.length})</h2>
    <p className="text-sm text-slate-500">Shows requests in the selected year, department and search. Approval covers the entire request, including dates in another year.</p>
    {!ready&&<p role="alert" className="text-amber-800">Refresh live data before approving requests.</p>}
    {!requests.length&&<p>No pending requests match these filters.</p>}
    {requests.map(({employee,leave})=><article key={`${employee.id}-${leave.requestId??leave.id}`} className="border rounded-lg p-3 space-y-2">
      <h3 className="font-semibold">{employee.name} · {employee.empCode}</h3>
      <p className="text-sm">{employee.department} · {leave.type} · {leave.days} day(s) per date{leave.halfDayPeriod?` · ${leave.halfDayPeriod}`:''}</p>
      <p className="text-sm break-words">{(leave.requestDates??[leave.date]).join(', ')}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{leave.note||'No reason provided'}</p>
      {!leave.requestRevision&&<p className="text-sm text-amber-800">Refresh after the approval workflow is deployed to approve this request.</p>}
      <Button disabled={!ready||!leave.requestId||!leave.requestRevision||approve.isPending} onClick={()=>{
        if(!leave.requestId||!leave.requestRevision)return;
        if(window.confirm(`Approve ${employee.name}'s entire ${leave.type} request for ${(leave.requestDates??[leave.date]).join(', ')}?`))approve.mutate({id:leave.requestId,revision:leave.requestRevision});
      }}>{approve.isPending&&approve.variables?.id===leave.requestId?'Approving…':'Approve request'}</Button>
    </article>)}
  </section>;
}
