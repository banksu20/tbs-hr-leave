import {useMemo,useState} from 'react';
import {Search} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import ManageInternCard,{type InternTermRow,type InternTimeline} from './ManageInternCard';
import type {Supervisor} from './supervisorLabel';
import type {Employee,LeaveRecord} from '@/data/mockEmployees';

type Focus='all'|'noSupervisor'|'ending'|'pending';
type View='active'|'archived'|'all';
type Sort='name'|'ending'|'department';

const day=(value:string)=>Date.parse(value+'T00:00:00Z')/86400000;

export default function ManageInterns({interns,terms,supervisors,internSupervisors,search,onSearch,loading,busy,removing,onArchiveToggle,onDelete,onEditLeave,onCancelLeave}:{interns:Employee[];terms:InternTermRow[];supervisors:Supervisor[];internSupervisors:Record<string,string[]>;search:string;onSearch:(value:string)=>void;loading:boolean;busy:boolean;removing:boolean;onArchiveToggle:(employee:Employee)=>void;onDelete:(employee:Employee)=>void;onEditLeave:(employee:Employee,leave:LeaveRecord)=>void;onCancelLeave:(employee:Employee,leave:LeaveRecord)=>void}){
 const dt=useDashboardText();
 const [focus,setFocus]=useState<Focus>('all'),[view,setView]=useState<View>('active'),[department,setDepartment]=useState(''),[sort,setSort]=useState<Sort>('name');
 const rows=useMemo(()=>{
  const today=day(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date()));
  return interns.map(employee=>{
   const term=terms.find(t=>t.user_id===employee.id);
   let timeline:InternTimeline|undefined;
   if(term){const start=day(term.start_date),end=day(term.end_date);timeline={daysToStart:start-today,daysToEnd:end-today,progress:Math.min(1,Math.max(0,(today-start+1)/Math.max(1,end-start+1)))};}
   const pending=new Set(employee.leaves.filter(l=>l.status==='Pending').map(l=>l.requestId??l.id)).size;
   const supervisorIds=internSupervisors[employee.id]??[];
   return {employee,term,timeline,pending,supervisorIds,archived:employee.status==='inactive',ending:!!timeline&&timeline.daysToStart<=0&&timeline.daysToEnd>=0&&timeline.daysToEnd<=30};
  });
 },[interns,terms,internSupervisors]);
 const active=rows.filter(r=>!r.archived);
 const departments=[...new Set(rows.map(r=>r.employee.department).filter(Boolean))].sort();
 const query=search.trim().toLowerCase();
 const shown=rows.filter(r=>(view==='all'||(view==='archived')===r.archived)
  &&(!department||r.employee.department===department)
  &&(!query||(r.employee.name+' '+r.employee.empCode+' '+r.employee.nickname).toLowerCase().includes(query))
  &&(focus==='all'||(focus==='noSupervisor'&&!r.supervisorIds.length)||(focus==='ending'&&r.ending)||(focus==='pending'&&r.pending>0)))
  .sort((a,b)=>sort==='ending'?(a.timeline?.daysToEnd??Infinity)-(b.timeline?.daysToEnd??Infinity):sort==='department'?a.employee.department.localeCompare(b.employee.department)||a.employee.name.localeCompare(b.employee.name):a.employee.name.localeCompare(b.employee.name));
 const filtered=focus!=='all'||view!=='active'||!!department||!!query;
 const clear=()=>{setFocus('all');setView('active');setDepartment('');onSearch('');};
 const tiles:{key:Focus;label:string;count:number;tone:string}[]=[
  {key:'all',label:dt("Active interns"),count:active.length,tone:'text-cyan-700'},
  {key:'noSupervisor',label:dt("Without supervisor"),count:active.filter(r=>!r.supervisorIds.length).length,tone:'text-amber-700'},
  {key:'ending',label:dt("Ending within 30 days"),count:active.filter(r=>r.ending).length,tone:'text-amber-700'},
  {key:'pending',label:dt("Pending requests"),count:active.filter(r=>r.pending>0).length,tone:'text-amber-700'},
 ];
 return <div className="space-y-4">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{tiles.map(tile=><button key={tile.key} type="button" aria-pressed={focus===tile.key} onClick={()=>{setFocus(tile.key);if(tile.key!=='all'||view==='archived')setView('active');}} className={`text-left rounded-xl border p-4 bg-white transition ${focus===tile.key?'border-cyan-500 ring-2 ring-cyan-100':'hover:border-slate-300'}`}>
   <p className={`text-2xl font-bold ${tile.key==='all'||tile.count>0?tile.tone:'text-slate-400'}`}>{tile.count}</p>
   <p className="text-sm text-slate-600">{tile.label}</p>
  </button>)}</div>
  <div className="flex flex-wrap items-center gap-2">
   <label className="relative flex-1 min-w-56 sm:max-w-sm"><Search aria-hidden className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input aria-label={dt("Search interns")} placeholder={dt("Search name or intern code")} className="border rounded-lg py-2.5 pl-9 pr-3 w-full bg-white" value={search} onChange={e=>onSearch(e.target.value)}/></label>
   <select aria-label={dt("Department")} className="border rounded-lg p-2.5 bg-white" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{dt("All departments")}</option>{departments.map(d=><option key={d} value={d}>{d}</option>)}</select>
   <select aria-label={dt("Sort")} className="border rounded-lg p-2.5 bg-white" value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="name">{dt("Sort: name")}</option><option value="ending">{dt("Sort: ending soonest")}</option><option value="department">{dt("Sort: department")}</option></select>
   <div role="group" aria-label={dt("Status")} className="inline-flex rounded-lg border bg-white overflow-hidden ml-auto">{(['active','archived','all'] as View[]).map(v=><button key={v} type="button" aria-pressed={view===v} onClick={()=>{setView(v);if(v!=='active')setFocus('all');}} className={`px-3 py-2 text-sm ${view===v?'bg-cyan-600 text-white':'hover:bg-slate-50'}`}>{v==='active'?dt("Active"):v==='archived'?dt("Archived"):dt("All")}</button>)}</div>
  </div>
  <div className="flex items-center gap-3 text-sm text-slate-500"><span>{dt("Showing {0} of {1} interns",[shown.length,rows.length])}</span>{filtered&&<button type="button" className="text-cyan-700 underline" onClick={clear}>{dt("Clear filters")}</button>}</div>
  <div className="hidden lg:grid gap-4 px-4 text-xs uppercase tracking-wide text-slate-400 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"><span>{dt("Intern")}</span><span>{dt("Internship")}</span><span>{dt("Supervisors")}</span><span>{dt("Leave used")}</span><span className="w-5"/></div>
  {!shown.length&&!loading&&<p className="border border-dashed rounded-xl p-8 text-center text-slate-500 bg-white">{rows.length?dt("No interns match these filters."):dt("No interns have been assigned to this view.")}</p>}
  <div className="space-y-2">{shown.map(r=><ManageInternCard key={r.employee.id} employee={r.employee} term={r.term} timeline={r.timeline} pending={r.pending} supervisors={supervisors} supervisorIds={r.supervisorIds} defaultOpen={shown.length===1} busy={busy} removing={removing} onArchiveToggle={()=>onArchiveToggle(r.employee)} onDelete={()=>onDelete(r.employee)} onEditLeave={leave=>onEditLeave(r.employee,leave)} onCancelLeave={leave=>onCancelLeave(r.employee,leave)}/>)}</div>
 </div>;
}
