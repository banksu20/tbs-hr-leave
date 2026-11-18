import {useEffect,useState} from 'react';
import {ChevronDown,FileSpreadsheet,Trash2} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {useDashboardText} from '@/hooks/useDashboardText';
import {halfDayLabel} from '@/lib/halfDayLabel';
import EditableStartDate from './EditableStartDate';
import {LEAVE_META,formatSheetDate} from './leaveSheetUtils';
import type {Employee} from '@/data/mockEmployees';
import type {QuotaEdit} from './ManageRoster';
import PersonAvatar from './PersonAvatar';

export type StaffUsage={type:'sick'|'annual'|'personal';used:number;total:number|null};

const statusTone:Record<string,string>={Approved:'bg-emerald-50 text-emerald-800 border-emerald-200',Pending:'bg-amber-50 text-amber-800 border-amber-200',Rejected:'bg-red-50 text-red-800 border-red-200'};

function QuotaField({label,value,onSave}:{label:string;value:number|null|undefined;onSave:(next:number)=>void}){
 const [draft,setDraft]=useState(value===null||value===undefined?'':String(value));
 useEffect(()=>{setDraft(value===null||value===undefined?'':String(value));},[value]);
 const commit=()=>{const parsed=Number(draft);if(!draft.trim()||Number.isNaN(parsed)||parsed<0){setDraft(value===null||value===undefined?'':String(value));return;}if(parsed!==(value??0))onSave(parsed);};
 return <label className="text-sm text-slate-600">{label}<input type="number" min={0} step={0.5} inputMode="decimal" className="block border rounded-lg p-2 mt-1 w-24 text-slate-900 font-semibold" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label>;
}

export default function ManageStaffCard({employee,year,usage,pending,defaultOpen,onQuotaChange,onStartDateChange,onOpenSheet,onRemove}:{employee:Employee;year:string;usage:StaffUsage[];pending:number;defaultOpen:boolean;onQuotaChange:(patch:QuotaEdit)=>void;onStartDateChange:(date:string)=>Promise<unknown>;onOpenSheet:()=>void;onRemove:()=>void}){
 const dt=useDashboardText(),{language}=useLanguage();
 const [open,setOpen]=useState(defaultOpen),[note,setNote]=useState(employee.quotaNote??'');
 useEffect(()=>{setNote(employee.quotaNote??'');},[employee.quotaNote]);
 const leaves=employee.leaves.filter(l=>l.date.startsWith(year)).sort((a,b)=>b.date.localeCompare(a.date));
 const unset=employee.quotasKnown===false;
 return <section className={`border rounded-xl bg-white overflow-hidden transition-shadow ${open?'shadow-md border-cyan-300':'hover:shadow-sm'}`}>
  <button type="button" aria-expanded={open} className="w-full text-left p-4 grid gap-4 items-center lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_auto] hover:bg-slate-50/70" onClick={()=>setOpen(!open)}>
   <div className="flex items-center gap-3 min-w-0">
    <PersonAvatar name={employee.name} pictureUrl={employee.pictureUrl}/>
    <div className="min-w-0">
     <p className="font-semibold truncate">{employee.name}{employee.nickname?<span className="text-amber-600"> ({employee.nickname})</span>:null}</p>
     <p className="text-sm text-slate-500 truncate">{employee.empCode||'—'} · {employee.department}</p>
     <div className="flex flex-wrap gap-1 mt-1 empty:hidden">
      {pending>0&&<span className="text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">{dt("{0} pending",[pending])}</span>}
      {unset&&<span className="text-xs rounded-full bg-red-100 text-red-800 px-2 py-0.5">{dt("Allowance not set")}</span>}
     </div>
    </div>
   </div>
   <div className="min-w-0">
    <p className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">{dt("Started")}</p>
    <p className={`text-sm ${employee.startDate?'text-slate-700':'text-amber-700'}`}>{employee.startDate?formatSheetDate(employee.startDate,language):dt("Not recorded")}</p>
   </div>
   <div className="min-w-0">
    <p className="text-xs uppercase tracking-wide text-slate-400 lg:hidden">{dt("Leave used")}</p>
    <div className="grid grid-cols-3 gap-3">{usage.map(u=>{const over=u.total!==null&&u.used>u.total;return <div key={u.type} className="min-w-0">
     <p className="text-xs text-slate-500 truncate">{dt(LEAVE_META[u.type].short)}</p>
     <p className={`text-sm font-medium ${over?'text-amber-700':'text-slate-800'}`}>{u.used}<span className="text-slate-400 font-normal">/{u.total===null?'—':u.total}</span></p>
     <div className="h-1 rounded-full bg-slate-100 overflow-hidden" role="presentation"><div className={`h-full ${over?'bg-amber-500':'bg-emerald-500'}`} style={{width:`${u.total?Math.min(100,Math.round(u.used/u.total*100)):0}%`}}/></div>
    </div>;})}</div>
   </div>
   <ChevronDown aria-hidden className={`w-5 h-5 text-slate-400 justify-self-end transition-transform ${open?'rotate-180':''}`}/>
  </button>
  {open&&<div className="border-t bg-slate-50/60 p-4 space-y-4">
   <div className="grid gap-4 lg:grid-cols-2">
    <div className="border rounded-xl bg-white p-4 space-y-3">
     <h3 className="font-semibold">{dt("Allowances for {0}",[year])}</h3>
     {employee.unlimitedLeave?<p className="text-sm font-semibold text-slate-700">{dt("Unlimited")} ∞</p>:<div className="flex flex-wrap gap-3">
      <QuotaField label={dt("Annual")} value={employee.quotas.annualTotal} onSave={annualTotal=>onQuotaChange({annualTotal})}/>
      <QuotaField label={dt("Carried")} value={employee.quotas.carriedOver} onSave={carriedOver=>onQuotaChange({carriedOver})}/>
      <QuotaField label={dt("Personal")} value={employee.quotas.personalTotal} onSave={personalTotal=>onQuotaChange({personalTotal})}/>
      <div className="text-sm text-slate-600">{dt("Sick")}<p className="border border-transparent p-2 mt-1 font-semibold text-slate-900">{employee.quotas.sickTotal??'—'}</p></div>
     </div>}
     <label className="block text-sm text-slate-600">{dt("Quota note")}<input className="block border rounded-lg p-2 mt-1 w-full text-slate-900" placeholder={dt("Add a note")} value={note} onChange={e=>setNote(e.target.value)} onBlur={()=>{if(note!==(employee.quotaNote??''))onQuotaChange({note});}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/></label>
     <p className="text-xs text-slate-500">{dt("Changes save when you leave a field.")}</p>
    </div>
    <div className="border rounded-xl bg-white p-4 space-y-3">
     <h3 className="font-semibold">{dt("Start date")}</h3>
     <EditableStartDate value={employee.startDate} name={employee.name} onSave={onStartDateChange}/>
     <div className="flex flex-wrap gap-2 pt-2">
      <button type="button" className="inline-flex items-center gap-2 border rounded-lg px-4 py-2 bg-white hover:bg-slate-50" onClick={onOpenSheet}><FileSpreadsheet className="w-4 h-4" aria-hidden/>{dt("Open leave sheet")}</button>
      <button type="button" className="inline-flex items-center gap-2 border border-red-200 text-red-700 rounded-lg px-4 py-2 bg-white hover:bg-red-50" onClick={onRemove}><Trash2 className="w-4 h-4" aria-hidden/>{dt("Remove from roster")}</button>
     </div>
     <p className="text-xs text-slate-500">{dt("Removed staff keep their leave history and can be restored.")}</p>
    </div>
   </div>
   <div className="border rounded-xl bg-white overflow-hidden">
    <h3 className="font-semibold p-4 pb-2">{dt("Leave this year")}</h3>
    {leaves.length?<div className="overflow-x-auto"><table className="w-full text-sm text-left">
     <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 font-medium">{dt("Leave date")}</th><th className="p-3 font-medium">{dt("Type")}</th><th className="p-3 font-medium">{dt("Days")}</th><th className="p-3 font-medium">{dt("Status")}</th><th className="p-3 font-medium">{dt("Reason")}</th></tr></thead>
     <tbody>{leaves.map(l=><tr className="border-t align-top" key={l.id}>
      <td className="p-3 whitespace-nowrap">{formatSheetDate(l.date,language)}</td>
      <td className="p-3">{dt(LEAVE_META[l.type]?.short??l.type)}</td>
      <td className="p-3">{l.days}{(l.days===0.5||l.halfDayPeriod)&&<span className="block text-xs text-slate-500 whitespace-nowrap">{halfDayLabel(l.halfDayPeriod,language)}</span>}</td>
      <td className="p-3"><span className={`inline-block text-xs rounded-full border px-2 py-0.5 ${statusTone[l.status??'']??'bg-slate-50 border-slate-200'}`}>{dt(l.status??"Approved")}</span></td>
      <td className="p-3 max-w-xs wrap-break-word whitespace-pre-line">{l.note}</td>
     </tr>)}</tbody>
    </table></div>:<p className="px-4 pb-4 text-slate-500">{dt("No leave recorded for this year.")}</p>}
   </div>
  </div>}
 </section>;
}
