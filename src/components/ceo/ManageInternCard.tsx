import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {useDashboardText} from '@/hooks/useDashboardText';
import {halfDayLabel} from '@/lib/halfDayLabel';
import {formatSheetDate} from './leaveSheetUtils';
import InternTerms from './InternTerms';
import {supervisorLabel,type Supervisor} from './supervisorLabel';
import LeaveEvidence from '../LeaveEvidence';
import type {Employee,LeaveRecord} from '@/data/mockEmployees';

export type InternTermRow={user_id:string;months:number;start_date:string;end_date:string;universityApproved?:number;internshipBalances?:{type:string;total:number;approved:number;pending:number}[]};
export type InternTimeline={progress:number;daysToStart:number;daysToEnd:number};

const statusTone:Record<string,string>={Approved:'bg-emerald-50 text-emerald-800 border-emerald-200',Pending:'bg-amber-50 text-amber-800 border-amber-200',Rejected:'bg-red-50 text-red-800 border-red-200'};
const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()??'').join('');

export default function ManageInternCard({employee,term,timeline,pending,supervisors,supervisorIds,defaultOpen,busy,removing,onArchiveToggle,onDelete,onEditLeave,onCancelLeave}:{employee:Employee;term?:InternTermRow;timeline?:InternTimeline;pending:number;supervisors:Supervisor[];supervisorIds:string[];defaultOpen:boolean;busy:boolean;removing:boolean;onArchiveToggle:()=>void;onDelete:()=>void;onEditLeave:(leave:LeaveRecord)=>void;onCancelLeave:(leave:LeaveRecord)=>void}){
 const dt=useDashboardText(),{language}=useLanguage();
 const [open,setOpen]=useState(defaultOpen);
 const archived=employee.status==='inactive';
 const leaves=[...employee.leaves].sort((a,b)=>b.date.localeCompare(a.date));
 const ending=timeline&&timeline.daysToEnd>=0&&timeline.daysToEnd<=30&&timeline.daysToStart<=0;
 const timelineText=!timeline?'':timeline.daysToStart>0?dt("Starts in {0} days",[timeline.daysToStart]):timeline.daysToEnd<0?dt("Ended {0} days ago",[-timeline.daysToEnd]):timeline.daysToEnd===0?dt("Ends today"):dt("Ends in {0} days",[timeline.daysToEnd]);
 return <section className={`border rounded-xl bg-white overflow-hidden transition-shadow ${open?'shadow-md border-cyan-300':'hover:shadow-sm'} ${archived?'bg-slate-50':''}`}>
  <button type="button" aria-expanded={open} className="w-full text-left p-4 grid gap-4 items-center lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] hover:bg-slate-50/70" onClick={()=>setOpen(!open)}>
   <div className="flex items-center gap-3 min-w-0">
    <span aria-hidden className={`shrink-0 w-11 h-11 rounded-full grid place-items-center font-semibold ${archived?'bg-slate-200 text-slate-600':'bg-cyan-100 text-cyan-800'}`}>{initials(employee.name)}</span>
    <div className="min-w-0">
     <p className="font-semibold truncate">{employee.name}</p>
     <p className="text-sm text-slate-500 truncate">{employee.empCode} · {employee.department}</p>
     <div className="flex flex-wrap gap-1 mt-1 empty:hidden">
      {archived&&<span className="text-xs rounded-full bg-slate-200 text-slate-700 px-2 py-0.5">{dt("Archived")}</span>}
      {pending>0&&<span className="text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">{dt("{0} pending",[pending])}</span>}
     </div>
    </div>
   </div>
   <div className="min-w-0">
    <p className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">{dt("Internship")}</p>
    {term&&timeline?<>
     <p className="text-sm text-slate-700">{formatSheetDate(term.start_date,language)} – {formatSheetDate(term.end_date,language)}</p>
     <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden" role="presentation"><div className={`h-full rounded-full ${ending?'bg-amber-500':timeline.daysToEnd<0?'bg-slate-400':'bg-cyan-500'}`} style={{width:`${Math.round(timeline.progress*100)}%`}}/></div>
     <p className={`text-xs mt-1 ${ending?'text-amber-700 font-medium':'text-slate-500'}`}>{timelineText}</p>
    </>:<p className="text-sm text-amber-700">{dt("No internship dates yet")}</p>}
   </div>
   <div className="min-w-0">
    <p className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">{dt("Supervisors")}</p>
    {supervisorIds.length?<div className="flex flex-wrap gap-1">{supervisorIds.map(id=><span key={id} className="text-xs rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900 px-2 py-0.5">{supervisorLabel(supervisors,id).split(' · ')[0]}</span>)}</div>
    :<p className="text-sm text-amber-700">{dt("No supervisor yet")}</p>}
   </div>
   <div className="min-w-0">
    <p className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">{dt("Leave used")}</p>
    {term?.internshipBalances?.length?<div className="grid grid-cols-3 gap-2">{term.internshipBalances.map(b=>{const used=Math.round((b.approved+b.pending)*100)/100,over=used>b.total;return <div key={b.type} className="min-w-0">
     <p className="text-xs text-slate-500 truncate capitalize">{dt(b.type)}</p>
     <p className={`text-sm font-medium ${over?'text-amber-700':'text-slate-800'}`}>{used}<span className="text-slate-400 font-normal">/{b.total}</span></p>
     <div className="h-1 rounded-full bg-slate-100 overflow-hidden" role="presentation"><div className={`h-full ${over?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${b.total>0?Math.min(100,Math.round(used/b.total*100)):used>0?100:0}%`}}/></div>
    </div>;})}</div>:<p className="text-sm text-slate-400">—</p>}
   </div>
   <ChevronDown aria-hidden className={`w-5 h-5 text-slate-400 justify-self-end transition-transform ${open?'rotate-180':''}`}/>
  </button>
  {open&&<div className="border-t bg-slate-50/60 p-4 space-y-4">
   <InternTerms userId={employee.id} startDate={term?.start_date} endDate={term?.end_date} supervisors={supervisors} supervisorIds={supervisorIds}/>
   <div className="border rounded-xl bg-white overflow-hidden">
    <h3 className="font-semibold p-4 pb-2">{dt("Leave this year")}</h3>
    {leaves.length?<div className="overflow-x-auto"><table className="w-full text-sm text-left">
     <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 font-medium">{dt("Leave date")}</th><th className="p-3 font-medium">{dt("Type")}</th><th className="p-3 font-medium">{dt("Days")}</th><th className="p-3 font-medium">{dt("Status")}</th><th className="p-3 font-medium">{dt("Reason")}</th><th className="p-3"/></tr></thead>
     <tbody>{leaves.map(l=><tr className="border-t align-top" key={l.id}>
      <td className="p-3 whitespace-nowrap">{formatSheetDate(l.date,language)}</td>
      <td className="p-3">{dt(l.type??"")}</td>
      <td className="p-3">{l.days}{(l.days===0.5||l.halfDayPeriod)&&<span className="block text-xs text-slate-500 whitespace-nowrap">{halfDayLabel(l.halfDayPeriod,language)}</span>}</td>
      <td className="p-3"><span className={`inline-block text-xs rounded-full border px-2 py-0.5 ${statusTone[l.status??'']??'bg-slate-50 border-slate-200'}`}>{dt(l.status??"")}</span></td>
      <td className="p-3 max-w-xs wrap-break-word whitespace-pre-line">{l.note}{l.requestId&&<LeaveEvidence requestId={l.requestId}/>}</td>
      <td className="p-3 whitespace-nowrap text-right">
       <button type="button" className="border rounded-lg px-3 py-1 mr-2 bg-white hover:bg-slate-50 disabled:opacity-50" disabled={!l.requestRevision} onClick={()=>onEditLeave(l)}>{dt("Edit request")}</button>
       <button type="button" className="border border-red-200 text-red-700 rounded-lg px-3 py-1 bg-white hover:bg-red-50 disabled:opacity-50" disabled={!l.requestRevision||removing} onClick={()=>onCancelLeave(l)}>{dt("Cancel")}</button>
      </td>
     </tr>)}</tbody>
    </table></div>:<p className="px-4 pb-4 text-slate-500">{dt("No leave recorded for this year.")}</p>}
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="border rounded-lg px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={onArchiveToggle}>{archived?dt("Restore"):dt("Archive intern")}</button>
    {archived&&<button type="button" className="border border-red-300 text-red-700 rounded-lg px-4 py-2 bg-white hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={onDelete}>{dt("Permanently delete")}</button>}
    <span className="text-xs text-slate-500">{archived?dt("Archived interns cannot request leave. Restore to make them active again."):dt("Archiving keeps the leave history and stops new requests.")}</span>
   </div>
  </div>}
 </section>;
}
