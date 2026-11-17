import {useDashboardText} from "@/hooks/useDashboardText";
import {useLanguage} from "@/hooks/useLanguage";
import LeaveEvidence from '../LeaveEvidence';
import CancellationRequests from "./CancellationRequests";
import DeliveryStatus from './DeliveryStatus';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import type { Employee, LeaveRecord } from '@/data/mockEmployees';
import { approveLeave, rejectLeave } from '@/lib/api';
import { LEAVE_META, formatSheetDate, grantedFor, isUnlimited, sumLeavesByType } from './leaveSheetUtils';

const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('');
const round=(value:number)=>Math.round(value*100)/100;

function balancesFor(employee:Employee,year:string){
 if(employee.internshipBalances?.length)return employee.internshipBalances.map(b=>({type:b.type as LeaveRecord['type'],left:round(b.total-b.approved-b.pending),total:b.total}));
 if(employee.employmentType==='intern')return [];
 return (['sick','annual','personal'] as const).filter(type=>!isUnlimited(employee,type)).map(type=>{
  const pending=employee.leaves.filter(l=>l.status==='Pending'&&l.type===type&&l.date.startsWith(year)).reduce((sum,l)=>sum+(Number(l.days)||0),0),total=grantedFor(employee,type);
  return {type,left:round(total-sumLeavesByType(employee.leaves,type,year)-pending),total};
 });
}

export default function PendingRequests({employees,ready,cohort="employee"}: {employees: Employee[]; ready:boolean;cohort?:"employee"|"intern"}) {
  const dt = useDashboardText(),{language}=useLanguage();
  const client=useQueryClient();
  const [reasons,setReasons]=useState<Record<string,string>>({}),[rejecting,setRejecting]=useState<string|null>(null);
  const decide=useMutation({mutationFn:({id,revision,action,reason}:{id:string;revision:string;action:'approve'|'reject';reason?:string})=>action==='approve'?approveLeave(id,revision):rejectLeave(id,revision,reason),
    onSuccess:async(_data,variables)=>{setRejecting(null);toast.success(variables.action==='approve'?dt("Request approved"):dt("Request rejected"));await Promise.all([client.invalidateQueries({queryKey:['employees']}),client.invalidateQueries({queryKey:['history']})]);},
    onError:(error)=>toast.error(error.message)});
  const requests=employees.flatMap(employee=>{
    const seen=new Set<string>();
    return employee.leaves.filter(leave=>{
      if(leave.status!=='Pending')return false;
      const key=leave.requestId??leave.id;
      if(seen.has(key))return false;seen.add(key);return true;
    }).map(leave=>({employee,leave}));
  }).sort((a,b)=>a.leave.date.localeCompare(b.leave.date));
  return <div className={`space-y-4 ${cohort==='employee'?'p-4':''}`}>
   <section className="space-y-3">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
     <h2 className="font-bold text-xl">{dt("Approvals")}</h2>
     <span className={`text-sm rounded-full px-2.5 py-0.5 ${requests.length?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-600'}`}>{dt("{0} waiting",[requests.length])}</span>
    </div>
    {!ready&&<p role="alert" className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{dt("Refresh live data before deciding on requests.")}</p>}
    {!requests.length&&<p className="border border-dashed rounded-xl bg-white p-8 text-center text-slate-500">{dt("Nothing is waiting for a decision.")}</p>}
    {requests.map(({employee,leave})=>{
      const key=leave.requestId??leave.id,dates=leave.requestDates??[leave.date],total=round(leave.days*dates.length),meta=LEAVE_META[leave.type];
      const balances=balancesFor(employee,leave.date.slice(0,4));
      const alsoOff=employees.filter(other=>other.id!==employee.id&&other.leaves.some(l=>l.status!=='Rejected'&&dates.includes(l.date))).map(other=>other.nickname||other.name.split(' ')[0]);
      const blocked=!ready||!leave.requestId||!leave.requestRevision||decide.isPending;
      const saving=(action:'approve'|'reject')=>decide.isPending&&decide.variables?.id===leave.requestId&&decide.variables.action===action;
      return <article key={`${employee.id}-${key}`} className="border rounded-xl bg-white p-4 space-y-3">
       <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="shrink-0 w-11 h-11 rounded-full grid place-items-center font-semibold bg-cyan-100 text-cyan-800">{initials(employee.name)}</span>
        <div className="min-w-0 flex-1">
         <h3 className="font-semibold truncate">{employee.name}</h3>
         <p className="text-sm text-slate-500 truncate">{employee.empCode} · {employee.department}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
         <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${meta?.chip??'bg-slate-200'}`}>{dt(meta?.label??leave.type)}</span>
         <span className="text-sm font-medium">{total===1?dt("1 day total"):dt("{0} days total",[total])}{leave.halfDayPeriod?` · ${dt(leave.halfDayPeriod)}`:''}</span>
        </div>
       </div>
       <div className="flex flex-wrap gap-1.5">{dates.map(date=><span key={date} className="text-sm rounded-md border bg-slate-50 px-2 py-0.5">{formatSheetDate(date,language)}</span>)}</div>
       <p className="text-sm whitespace-pre-wrap wrap-break-word border-l-2 border-slate-200 pl-3 text-slate-700">{leave.note||dt("No reason provided")}</p>
       {leave.requestId&&['sick','university'].includes(leave.type)&&<LeaveEvidence requestId={leave.requestId}/>}
       {!!balances.length&&<div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">{dt("Left after this request")}</span>
        {balances.map(b=><span key={b.type} className={`rounded-md border px-2 py-0.5 ${b.left<0?'bg-amber-50 border-amber-300 text-amber-900 font-medium':b.type===leave.type?'bg-cyan-50 border-cyan-200 text-cyan-900 font-medium':'bg-white border-slate-200 text-slate-700'}`}>{dt(LEAVE_META[b.type]?.short??b.type)} {b.left}<span className="text-slate-400 font-normal">/{b.total}</span></span>)}
       </div>}
       <p className="text-sm text-slate-600">{alsoOff.length?dt("Also off: {0}",[alsoOff.slice(0,6).join(', ')]):dt("Nobody else is off on these dates.")}</p>
       {!leave.requestRevision&&<p className="text-sm text-amber-800">{dt("Refresh after the approval workflow is deployed to approve this request.")}</p>}
       {rejecting===key?<div className="border border-red-200 bg-red-50/60 rounded-lg p-3 space-y-2">
         <label className="block text-sm text-slate-700">{dt("Rejection reason (optional)")}<textarea autoFocus maxLength={1000} disabled={decide.isPending} className="block w-full rounded-lg border p-2 mt-1 bg-white" rows={2} placeholder={dt("For example: please choose another date")} value={reasons[key]??''} onChange={e=>setReasons(current=>({...current,[key]:e.target.value}))}/></label>
         <p className="text-xs text-slate-500">{dt("Rejected leave will not use their allowance.")}</p>
         <div className="flex flex-wrap gap-2">
          <button type="button" disabled={blocked} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={()=>{if(leave.requestId&&leave.requestRevision)decide.mutate({id:leave.requestId,revision:leave.requestRevision,action:'reject',reason:reasons[key]});}}>{saving('reject')?dt("Saving…"):dt("Confirm rejection")}</button>
          <button type="button" disabled={decide.isPending} className="border rounded-lg px-4 py-2 bg-white hover:bg-slate-50" onClick={()=>setRejecting(null)}>{dt("Back")}</button>
         </div>
        </div>
       :<div className="flex flex-wrap gap-2">
         <button type="button" disabled={blocked} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={()=>{
          if(!leave.requestId||!leave.requestRevision)return;
          if(window.confirm(dt("{0} {1}'s entire {2} request for {3}?{4}", [dt('Approve'), employee.name, dt(leave.type), dates.join(', '), ''])))decide.mutate({id:leave.requestId,revision:leave.requestRevision,action:'approve'});
         }}><Check className="w-4 h-4" aria-hidden/>{saving('approve')?dt("Saving…"):dt("Approve request")}</button>
         <button type="button" disabled={blocked} className="inline-flex items-center gap-2 border border-red-300 text-red-700 rounded-lg px-4 py-2 bg-white hover:bg-red-50 disabled:opacity-50" onClick={()=>setRejecting(key)}><X className="w-4 h-4" aria-hidden/>{dt("Reject request")}</button>
        </div>}
      </article>;
    })}
   </section>
   <CancellationRequests cohort={cohort}/>
   {cohort==='employee'&&<DeliveryStatus/>}
  </div>;
}
