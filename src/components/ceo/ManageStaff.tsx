import {useMemo,useState} from 'react';
import {Search} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import ManageStaffCard,{type StaffUsage} from './ManageStaffCard';
import {grantedFor,isUnlimited,sumLeavesByType} from './leaveSheetUtils';
import type {Employee} from '@/data/mockEmployees';
import type {QuotaEdit} from './ManageRoster';

type Focus='all'|'pending'|'over'|'unset';
type Sort='name'|'code'|'started';
const round=(value:number)=>Math.round(value*100)/100;

export default function ManageStaff({employees,year,onQuotaChange,onStartDateChange,onOpenSheet,onRemove}:{employees:Employee[];year:string;onQuotaChange:(employee:Employee,patch:QuotaEdit)=>void;onStartDateChange:(employee:Employee,date:string)=>Promise<unknown>;onOpenSheet:(employee:Employee)=>void;onRemove:(employee:Employee)=>void}){
 const dt=useDashboardText();
 const [search,setSearch]=useState(''),[focus,setFocus]=useState<Focus>('all'),[department,setDepartment]=useState(''),[sort,setSort]=useState<Sort>('name');
 const rows=useMemo(()=>employees.map(employee=>{
  const usage:StaffUsage[]=(['sick','annual','personal'] as const).map(type=>({type,used:round(sumLeavesByType(employee.leaves,type,year)),total:isUnlimited(employee,type)?null:grantedFor(employee,type)}));
  const pending=new Set(employee.leaves.filter(l=>l.status==='Pending').map(l=>l.requestId??l.id)).size;
  return {employee,usage,pending,over:usage.some(u=>u.total!==null&&u.used>u.total),unset:employee.quotasKnown===false};
 }),[employees,year]);
 const departments=[...new Set(rows.map(r=>r.employee.department).filter(Boolean))].sort();
 const query=search.trim().toLowerCase();
 const shown=rows.filter(r=>(!department||r.employee.department===department)
  &&(!query||(r.employee.name+' '+r.employee.nickname+' '+r.employee.empCode+' '+r.employee.department).toLowerCase().includes(query))
  &&(focus==='all'||(focus==='pending'&&r.pending>0)||(focus==='over'&&r.over)||(focus==='unset'&&r.unset)))
  .sort((a,b)=>sort==='code'?a.employee.empCode.localeCompare(b.employee.empCode,undefined,{numeric:true}):sort==='started'?(a.employee.startDate||'9999').localeCompare(b.employee.startDate||'9999'):a.employee.name.localeCompare(b.employee.name));
 const filtered=focus!=='all'||!!department||!!query;
 const tiles:{key:Focus;label:string;count:number}[]=[
  {key:'all',label:dt("Active staff"),count:rows.length},
  {key:'pending',label:dt("Pending requests"),count:rows.filter(r=>r.pending>0).length},
  {key:'over',label:dt("Over allowance"),count:rows.filter(r=>r.over).length},
  {key:'unset',label:dt("Allowance not set"),count:rows.filter(r=>r.unset).length},
 ];
 return <div className="p-4 space-y-4 bg-slate-100/70">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{tiles.map(tile=><button key={tile.key} type="button" aria-pressed={focus===tile.key} onClick={()=>setFocus(tile.key)} className={`text-left rounded-xl border p-4 bg-white transition ${focus===tile.key?'border-cyan-500 ring-2 ring-cyan-100':'hover:border-slate-300'}`}>
   <p className={`text-2xl font-bold ${tile.key==='all'?'text-cyan-700':tile.count>0?'text-amber-700':'text-slate-400'}`}>{tile.count}</p>
   <p className="text-sm text-slate-600">{tile.label}</p>
  </button>)}</div>
  <div className="flex flex-wrap items-center gap-2">
   <label className="relative flex-1 min-w-56 sm:max-w-sm"><Search aria-hidden className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input aria-label={dt("Search staff")} placeholder={dt("Search name, nickname, code…")} className="border rounded-lg py-2.5 pl-9 pr-3 w-full bg-white" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <select aria-label={dt("Department")} className="border rounded-lg p-2.5 bg-white" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{dt("All departments")}</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select>
   <select aria-label={dt("Sort")} className="border rounded-lg p-2.5 bg-white" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="name">{dt("Sort: name")}</option><option value="code">{dt("Sort: code")}</option><option value="started">{dt("Sort: start date")}</option></select>
  </div>
  <div className="flex items-center gap-3 text-sm text-slate-500"><span>{dt("Showing {0} of {1} staff",[shown.length,rows.length])}</span>{filtered&&<button type="button" className="text-cyan-700 underline" onClick={()=>{setFocus('all');setDepartment('');setSearch('');}}>{dt("Clear filters")}</button>}</div>
  <div className="hidden lg:grid gap-4 px-4 text-xs uppercase tracking-wide text-slate-400 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_auto]"><span>{dt("Employee")}</span><span>{dt("Started")}</span><span>{dt("Leave used")} · {year}</span><span className="w-5"/></div>
  {!shown.length&&<p className="border border-dashed rounded-xl p-8 text-center text-slate-500 bg-white">{dt("No employees match")}</p>}
  <div className="space-y-2">{shown.map(r=><ManageStaffCard key={r.employee.id} employee={r.employee} year={year} usage={r.usage} pending={r.pending} defaultOpen={shown.length===1} onQuotaChange={patch=>onQuotaChange(r.employee,patch)} onStartDateChange={date=>onStartDateChange(r.employee,date)} onOpenSheet={()=>onOpenSheet(r.employee)} onRemove={()=>onRemove(r.employee)}/>)}</div>
 </div>;
}
