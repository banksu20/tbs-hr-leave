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
const day=(value:string)=>Date.parse(value+'T00:00:00Z')/86400000;

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
  const [reasons,setReasons]=useState<Record<string,string>>({}),[selectedKey,setSelectedKey]=useState<string|null>(null),[step,setStep]=useState<'approve'|'reject'|null>(null),[typeFilter,setTypeFilter]=useState<string>('all');
  const decide=useMutation({mutationFn:({id,revision,action,reason}:{id:string;revision:string;action:'approve'|'reject';reason?:string})=>action==='approve'?approveLeave(id,revision):rejectLeave(id,revision,reason),
    onSuccess:async(_data,variables)=>{setStep(null);setSelectedKey(null);toast.success(variables.action==='approve'?dt("Request approved"):dt("Request rejected"));await Promise.all([client.invalidateQueries({queryKey:['employees']}),client.invalidateQueries({queryKey:['history']})]);},
    onError:(error)=>toast.error(error.message)});
  const today=day(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date()));
  const requests=employees.flatMap(employee=>{
    const seen=new Set<string>();
    return employee.leaves.filter(leave=>{
      if(leave.status!=='Pending')return false;
      const key=leave.requestId??leave.id;
      if(seen.has(key))return false;seen.add(key);return true;
    }).map(leave=>{const dates=[...(leave.requestDates??[leave.date])].sort();return {employee,leave,dates,key:`${employee.id}-${leave.requestId??leave.id}`,total:round(leave.days*dates.length),startsIn:day(dates[0])-today};});
  }).sort((a,b)=>a.dates[0].localeCompare(b.dates[0]));
  const types=[...new Set(requests.map(r=>r.leave.type))];
  const shown=requests.filter(r=>typeFilter==='all'||r.leave.type===typeFilter);
  const selected=shown.find(r=>r.key===selectedKey)??shown[0];
  const select=(key:string)=>{setSelectedKey(key);setStep(null);};
  const startText=(startsIn:number)=>startsIn<0?dt("Already started"):startsIn===0?dt("Starts today"):startsIn===1?dt("Starts tomorrow"):dt("Starts in {0} days",[startsIn]);
  const range=(dates:string[])=>dates.length===1?formatSheetDate(dates[0],language):`${formatSheetDate(dates[0],language)} – ${formatSheetDate(dates[dates.length-1],language)}`;
  const daysText=(total:number)=>total===1?dt("1 day total"):dt("{0} days total",[total]);
  const detail=()=>{
   if(!selected)return null;
   const {employee,leave,dates,total,startsIn}=selected,meta=LEAVE_META[leave.type],reasonKey=leave.requestId??leave.id;
   const balances=balancesFor(employee,leave.date.slice(0,4));
   const alsoOff=employees.filter(other=>other.id!==employee.id&&other.leaves.some(l=>l.status!=='Rejected'&&dates.includes(l.date))).map(other=>other.nickname||other.name.split(' ')[0]);
   const blocked=!ready||!leave.requestId||!leave.requestRevision||decide.isPending;
   const run=(action:'approve'|'reject')=>{if(leave.requestId&&leave.requestRevision)decide.mutate({id:leave.requestId,revision:leave.requestRevision,action,...(action==='reject'?{reason:reasons[reasonKey]}:{})});};
   return <article className="border rounded-xl bg-white overflow-hidden lg:sticky lg:top-24" aria-live="polite">
    <header className="p-5 flex flex-wrap items-center gap-4 border-b">
     <span aria-hidden className="shrink-0 w-14 h-14 rounded-full grid place-items-center text-lg font-semibold bg-cyan-100 text-cyan-800">{initials(employee.name)}</span>
     <div className="min-w-0 flex-1">
      <h3 className="text-lg font-bold truncate">{employee.name}{employee.nickname?` (${employee.nickname})`:''}</h3>
      <p className="text-sm text-slate-500 truncate">{employee.empCode} · {employee.department}</p>
     </div>
     <span className={`text-sm font-semibold rounded-full px-3 py-1 ${meta?.chip??'bg-slate-200'}`}>{dt(meta?.label??leave.type)}</span>
    </header>
    <div className="p-5 space-y-5">
     <div className="grid gap-5 sm:grid-cols-2">
      <div className="space-y-2">
       <h4 className="text-xs uppercase tracking-wide text-slate-400">{dt("When")}</h4>
       <p className="text-xl font-bold text-slate-900">{daysText(total)}{leave.halfDayPeriod?<span className="text-base font-medium text-slate-600"> · {dt(leave.halfDayPeriod)}</span>:null}</p>
       <div className="flex flex-wrap gap-1.5">{dates.map(date=><span key={date} className="text-sm rounded-md border bg-slate-50 px-2 py-0.5">{formatSheetDate(date,language)}</span>)}</div>
       <p className={`text-sm ${startsIn<=1?'text-amber-700 font-medium':'text-slate-500'}`}>{startText(startsIn)}</p>
      </div>
      <div className="space-y-2">
       <h4 className="text-xs uppercase tracking-wide text-slate-400">{dt("Reason")}</h4>
       <p className="text-sm whitespace-pre-wrap wrap-break-word text-slate-800 bg-slate-50 rounded-lg p-3">{leave.note||dt("No reason provided")}</p>
       {leave.requestId&&['sick','university'].includes(leave.type)&&<LeaveEvidence requestId={leave.requestId}/>}
      </div>
     </div>
     {!!balances.length&&<div className="space-y-2">
      <h4 className="text-xs uppercase tracking-wide text-slate-400">{dt("Leave left if approved")}</h4>
      <div className="grid gap-3 sm:grid-cols-3">{balances.map(b=>{
       const mine=b.type===leave.type,request=mine?total:0,usedBefore=Math.max(0,b.total-b.left-request),scale=Math.max(b.total,b.total-b.left,1),over=b.left<0;
       return <div key={b.type} className={`rounded-lg border p-3 ${over?'border-amber-300 bg-amber-50':mine?'border-cyan-200 bg-cyan-50/50':'border-slate-200'}`}>
        <p className="text-xs text-slate-500">{dt(LEAVE_META[b.type]?.short??b.type)}</p>
        <p className={`text-2xl font-bold ${over?'text-amber-700':'text-slate-900'}`}>{b.left}<span className="text-sm font-normal text-slate-400"> / {b.total}</span></p>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex mt-1" role="presentation"><div className="h-full bg-slate-400" style={{width:`${usedBefore/scale*100}%`}}/><div className={`h-full ${over?'bg-amber-500':'bg-cyan-500'}`} style={{width:`${request/scale*100}%`}}/></div>
        <p className="text-[11px] text-slate-500 mt-1">{mine?dt("Used {0} · this request {1}",[round(usedBefore),request]):dt("Used {0}",[round(usedBefore)])}</p>
       </div>;})}</div>
     </div>}
     <div className="space-y-1">
      <h4 className="text-xs uppercase tracking-wide text-slate-400">{dt("Same days")}</h4>
      <p className="text-sm text-slate-700">{alsoOff.length?dt("Also off: {0}",[alsoOff.slice(0,8).join(', ')]):dt("Nobody else is off on these dates.")}</p>
     </div>
     {!leave.requestRevision&&<p className="text-sm text-amber-800">{dt("Refresh after the approval workflow is deployed to approve this request.")}</p>}
    </div>
    <footer className="border-t bg-slate-50 p-4">
     {step==='reject'?<div className="space-y-2">
       <label className="block text-sm text-slate-700">{dt("Rejection reason (optional)")}<textarea autoFocus maxLength={1000} disabled={decide.isPending} className="block w-full rounded-lg border p-2 mt-1 bg-white" rows={2} placeholder={dt("For example: please choose another date")} value={reasons[reasonKey]??''} onChange={e=>setReasons(current=>({...current,[reasonKey]:e.target.value}))}/></label>
       <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={blocked} className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50" onClick={()=>run('reject')}>{decide.isPending?dt("Saving…"):dt("Confirm rejection")}</button>
        <button type="button" disabled={decide.isPending} className="border rounded-lg px-4 py-2.5 bg-white hover:bg-slate-50" onClick={()=>setStep(null)}>{dt("Back")}</button>
        <span className="text-xs text-slate-500">{dt("Rejected leave will not use their allowance.")}</span>
       </div>
      </div>
     :step==='approve'?<div className="flex flex-wrap items-center gap-2">
       <p className="text-sm text-slate-700 w-full">{dt("Approve {0} of {1} for {2}?",[daysText(total),dt(meta?.label??leave.type),employee.nickname||employee.name])}</p>
       <button type="button" disabled={blocked} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50" onClick={()=>run('approve')}>{decide.isPending?dt("Saving…"):dt("Confirm approval")}</button>
       <button type="button" disabled={decide.isPending} className="border rounded-lg px-4 py-2.5 bg-white hover:bg-slate-50" onClick={()=>setStep(null)}>{dt("Back")}</button>
      </div>
     :<div className="flex flex-wrap gap-2">
       <button type="button" disabled={blocked} className="inline-flex items-center justify-center gap-2 flex-1 sm:flex-none sm:min-w-44 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50" onClick={()=>setStep('approve')}><Check className="w-4 h-4" aria-hidden/>{dt("Approve request")}</button>
       <button type="button" disabled={blocked} className="inline-flex items-center justify-center gap-2 flex-1 sm:flex-none sm:min-w-44 border border-red-300 text-red-700 rounded-lg px-5 py-2.5 font-semibold bg-white hover:bg-red-50 disabled:opacity-50" onClick={()=>setStep('reject')}><X className="w-4 h-4" aria-hidden/>{dt("Reject request")}</button>
      </div>}
    </footer>
   </article>;
  };
  return <div className={`space-y-4 ${cohort==='employee'?'p-4':''}`}>
   <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
     <h2 className="font-bold text-xl">{dt("Approvals")}</h2>
     <span className={`text-sm rounded-full px-2.5 py-0.5 ${requests.length?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-600'}`}>{dt("{0} waiting",[requests.length])}</span>
     {types.length>1&&<div role="group" aria-label={dt("Type")} className="inline-flex flex-wrap gap-1 ml-auto">{['all',...types].map(type=><button key={type} type="button" aria-pressed={typeFilter===type} onClick={()=>{setTypeFilter(type);setStep(null);}} className={`rounded-full border px-3 py-1 text-sm ${typeFilter===type?'bg-slate-900 text-white border-slate-900':'bg-white hover:bg-slate-50'}`}>{type==='all'?dt("All"):dt(LEAVE_META[type as LeaveRecord['type']]?.short??type)}</button>)}</div>}
    </div>
    {!ready&&<p role="alert" className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">{dt("Refresh live data before deciding on requests.")}</p>}
    {!requests.length?<p className="border border-dashed rounded-xl bg-white p-10 text-center text-slate-500">{dt("Nothing is waiting for a decision.")}</p>
    :<div className="grid gap-4 items-start lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <ul className="space-y-2" aria-label={dt("Pending requests")}>{shown.map(r=><li key={r.key}><button type="button" aria-current={selected?.key===r.key} onClick={()=>select(r.key)} className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition ${selected?.key===r.key?'border-cyan-500 ring-2 ring-cyan-100 bg-white':'bg-white hover:border-slate-300'}`}>
        <span aria-hidden className="shrink-0 w-10 h-10 rounded-full grid place-items-center font-semibold bg-cyan-100 text-cyan-800">{initials(r.employee.name)}</span>
        <span className="min-w-0 flex-1">
         <span className="block font-semibold truncate">{r.employee.nickname||r.employee.name}</span>
         <span className="block text-sm text-slate-500 truncate">{range(r.dates)} · {daysText(r.total)}</span>
         <span className={`block text-xs ${r.startsIn<=1?'text-amber-700 font-medium':'text-slate-400'}`}>{startText(r.startsIn)}</span>
        </span>
        <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${LEAVE_META[r.leave.type]?.chip??'bg-slate-200'}`}>{dt(LEAVE_META[r.leave.type]?.short??r.leave.type)}</span>
       </button></li>)}</ul>
      {detail()}
     </div>}
   </section>
   <CancellationRequests cohort={cohort}/>
   {cohort==='employee'&&<DeliveryStatus/>}
  </div>;
}
