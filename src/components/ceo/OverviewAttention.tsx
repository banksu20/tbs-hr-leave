import {ArrowRight} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {useDashboardText} from '@/hooks/useDashboardText';
import {LEAVE_META,formatSheetDate} from './leaveSheetUtils';
import type {Employee,LeaveRecord} from '@/data/mockEmployees';
import PersonAvatar from './PersonAvatar';

const shortName=(employee:Employee)=>employee.nickname||employee.name.split(' ')[0];
const plusDays=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);

function Panel({title,count,children}:{title:string;count:number;children:React.ReactNode}){
 return <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 min-w-0">
  <div className="flex items-center gap-2 mb-3"><h3 className="font-bold text-slate-900">{title}</h3><span className={`text-xs rounded-full px-2 py-0.5 ${count?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-500'}`}>{count}</span></div>
  {children}
 </section>;
}

export default function OverviewAttention({employees,onSelectEmployee,onOpenApprovals}:{employees:Employee[];onSelectEmployee:(employee:Employee)=>void;onOpenApprovals?:()=>void}){
 const dt=useDashboardText(),{language}=useLanguage();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date()),horizon=plusDays(today,14);
 const offToday=employees.flatMap(employee=>{const leave=employee.leaves.find(l=>l.date===today&&l.status==='Approved');return leave?[{employee,leave}]:[];});
 const groups=new Map<string,{employee:Employee;leave:LeaveRecord;first:string;last:string}>();
 for(const employee of employees)for(const leave of employee.leaves){
  if(leave.status==='Rejected'||leave.date<=today||leave.date>horizon)continue;
  const key=`${employee.id}:${leave.requestId??leave.id}`,group=groups.get(key);
  if(group){if(leave.date<group.first)group.first=leave.date;if(leave.date>group.last)group.last=leave.date;}else groups.set(key,{employee,leave,first:leave.date,last:leave.date});
 }
 const upcoming=[...groups.values()].sort((a,b)=>a.first.localeCompare(b.first));
 const pending=new Map<string,Employee>();
 for(const employee of employees)for(const leave of employee.leaves)if(leave.status==='Pending')pending.set(`${employee.id}:${leave.requestId??leave.id}`,employee);
 const pendingPeople=[...new Set([...pending.values()].map(shortName))];
 const person=(employee:Employee)=><><PersonAvatar name={employee.name} pictureUrl={employee.pictureUrl} className="w-8 h-8 text-xs"/><span className="font-medium text-slate-800 truncate">{shortName(employee)}</span></>;
 const typeChip=(leave:LeaveRecord)=><span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${LEAVE_META[leave.type]?.chip??'bg-slate-200'}`}>{dt(LEAVE_META[leave.type]?.short??leave.type)}</span>;
 return <div className="grid gap-3 lg:grid-cols-3">
  <Panel title={dt("Off today")} count={offToday.length}>
   {offToday.length?<ul className="space-y-2">{offToday.slice(0,6).map(({employee,leave})=><li key={employee.id}><button type="button" className="w-full flex items-center gap-2 text-sm text-left rounded-lg p-1 hover:bg-slate-50" onClick={()=>onSelectEmployee(employee)}>{person(employee)}<span className="ml-auto">{typeChip(leave)}</span></button></li>)}{offToday.length>6&&<li className="text-xs text-slate-500">{dt("and {0} more",[offToday.length-6])}</li>}</ul>:<p className="text-sm text-slate-500">{dt("Nobody is off today")}</p>}
  </Panel>
  <Panel title={dt("Coming up in 14 days")} count={upcoming.length}>
   {upcoming.length?<ul className="space-y-2">{upcoming.slice(0,6).map(group=><li key={`${group.employee.id}:${group.leave.requestId??group.leave.id}`}><button type="button" className="w-full flex items-center gap-2 text-sm text-left rounded-lg p-1 hover:bg-slate-50" onClick={()=>onSelectEmployee(group.employee)}>{person(group.employee)}<span className="text-slate-500 whitespace-nowrap">{formatSheetDate(group.first,language)}{group.last!==group.first?` – ${formatSheetDate(group.last,language)}`:''}</span><span className="ml-auto flex items-center gap-1">{group.leave.status==='Pending'&&<span className="text-[11px] rounded-full border border-amber-300 text-amber-800 px-2 py-0.5">{dt("Pending")}</span>}{typeChip(group.leave)}</span></button></li>)}{upcoming.length>6&&<li className="text-xs text-slate-500">{dt("and {0} more",[upcoming.length-6])}</li>}</ul>:<p className="text-sm text-slate-500">{dt("No leave booked in the next 14 days.")}</p>}
  </Panel>
  <Panel title={dt("Waiting for a decision")} count={pending.size}>
   {pending.size?<div className="space-y-3"><p className="text-sm text-slate-700">{pendingPeople.slice(0,5).join(', ')}{pendingPeople.length>5?` ${dt("and {0} more",[pendingPeople.length-5])}`:''}</p>{onOpenApprovals&&<button type="button" className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg px-4 py-2 text-sm" onClick={onOpenApprovals}>{dt("Review requests")}<ArrowRight className="w-4 h-4" aria-hidden/></button>}</div>:<p className="text-sm text-slate-500">{dt("Nothing is waiting for a decision.")}</p>}
  </Panel>
 </div>;
}
