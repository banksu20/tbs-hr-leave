import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Camera,CheckCircle2,ChevronDown,Clock3,Loader2,MapPin,PencilLine,Power,UserMinus,UserPlus,Users,XCircle} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {useLanguage} from '@/hooks/useLanguage';
import {clock,dayLabel,hours,mapLink,weekdays,type AttendanceKind} from '@/lib/attendance';
import {attendancePhotoUrl,decideAttendanceFix,loadAttendanceOverview,saveAttendanceOn,saveAttendancePerson,type AttendanceOverview,type AttendancePerson} from '@/lib/hrAdmin';

type Edit={id:string;kind:AttendanceKind;days:number[]};
const field='mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';

export default function AttendanceAdmin(){
 const dt=useDashboardText();
 const {language}=useLanguage();const th=language==='th';
 const [data,setData]=useState<AttendanceOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[edit,setEdit]=useState<Edit|null>(null),[open,setOpen]=useState<string|null>(null);
 const load=useCallback((f:string,t:string)=>loadAttendanceOverview(f,t).then(d=>{setData(d);setFrom(d.from);setTo(d.to);}).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load('','');},[load]);
 const act=async(key:string,fn:()=>Promise<AttendanceOverview>)=>{setBusy(key);setError('');try{const d=await fn();setData(d);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
 const members=useMemo(()=>data?.people.filter(p=>p.member)??[],[data]);
 const others=useMemo(()=>data?.people.filter(p=>!p.member)??[],[data]);
 const totals=useMemo(()=>members.map(p=>{const s=data?.shifts.filter(x=>x.userId===p.id)??[];return {...p,shifts:s,worked:s.reduce((a,x)=>a+x.workedMin,0),overtime:s.reduce((a,x)=>a+x.overtimeMin,0),missed:s.filter(x=>x.missedOut).length,days:new Set(s.map(x=>x.date)).size};}),[members,data]);
 const kindLabel=(p:AttendancePerson)=>p.kind==='wfh'?dt('Work from home · {0}',[weekdays(p.wfhDays,th)]):dt('Part-time');
 const saveEdit=()=>{if(!edit)return;const e=edit;void act('save',()=>saveAttendancePerson(e.id,true,e.kind,e.kind==='wfh'?e.days:[])).then(()=>setEdit(null));};
 const pending=data?.fixes.filter(f=>f.status==='pending')??[];
 if(!data)return <div className="rounded-2xl bg-white p-6 shadow-xs">{error?<p role="alert" className="text-sm text-red-700">{error}</p>:<p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}</div>;
 const s=data.settings;
 return <div className="space-y-5">
  <section className={`rounded-2xl border p-5 shadow-xs ${s.enabled?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-white'}`}>
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <h1 className="flex items-center gap-2 text-xl font-bold"><Clock3 className="h-5 w-5 text-cyan-600"/>{dt('Clock-in')}</h1>
     <p className="mt-1 text-sm text-slate-600">{dt('Only people on the list below can clock in: part-timers on any day, work-from-home staff only on their work-from-home days. Nobody else sees it.')}</p>
     <p className="mt-1 text-xs text-slate-500">{dt('Part-time {0} hours a day, work from home {1} hours a day. A {2}-minute break is taken off once a shift is over {3} hours. Staff take a photo and share their location each time. Both are erased after {4} days.',[s.workMinutes/60,s.wfhWorkMinutes/60,s.breakMinutes,s.breakAfterMinutes/60,s.locationDays])}</p>
    </div>
    <button type="button" disabled={!!busy} onClick={()=>void act('on',()=>saveAttendanceOn(!s.enabled))} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${s.enabled?'bg-white text-rose-700 ring-1 ring-rose-200':'bg-emerald-600 text-white'}`}><Power className="h-4 w-4"/>{s.enabled?dt('Turn off'):dt('Turn on')}</button>
   </div>
   <p className={`mt-3 text-sm font-semibold ${s.enabled?'text-emerald-800':'text-slate-700'}`}>{s.enabled?dt('On: people on the list can clock in.'):dt('Off: nobody can clock in yet.')}</p>
  </section>
  {error&&<p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</p>}
  {pending.length>0&&<section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-xs">
   <h2 className="font-bold text-amber-900">{dt('Time fixes to check ({0})',[pending.length])}</h2>
   <p className="text-xs text-amber-800">{dt('Approving puts the corrected times into their hours.')}</p>
   <ul className="mt-3 space-y-2">{pending.map(f=><li key={f.id} className="rounded-xl bg-white p-3 text-sm shadow-xs">
    <div className="flex flex-wrap items-start justify-between gap-2">
     <div><p className="font-semibold">{f.employee}</p>
      <p className="text-slate-700">{dayLabel(f.date,th)} · {clock(f.in)}–{clock(f.out)} · {dt('{0} hrs',[hours(f.workedMin)])}</p>
      {f.was&&<p className="text-xs text-slate-500">{dt('Was {0}–{1}',[clock(f.was.in),f.was.missedOut?'?':clock(f.was.out)])}</p>}
      <p className="mt-1 text-xs text-slate-600">{f.reason}</p></div>
     <div className="flex gap-2">
      <button type="button" disabled={!!busy} onClick={()=>void act('f'+f.id,()=>decideAttendanceFix(f.id,'approve'))} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{dt('Approve')}</button>
      <button type="button" disabled={!!busy} onClick={()=>void act('f'+f.id,()=>decideAttendanceFix(f.id,'reject'))} className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 disabled:opacity-50"><XCircle className="h-4 w-4"/>{dt('Reject')}</button>
     </div>
    </div>
   </li>)}</ul>
  </section>}
  <section className="rounded-2xl bg-white p-5 shadow-xs">
   <h2 className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-cyan-600"/>{dt('People who clock in ({0})',[members.length])}</h2>
   {members.length===0&&<p className="mt-2 text-sm text-slate-500">{dt('Nobody yet. Add part-timers and work-from-home staff below.')}</p>}
   <ul className="mt-2 divide-y divide-slate-100">{members.map(p=><li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
    <span className="min-w-0"><span className="block font-semibold">{p.name}</span><span className="text-xs text-slate-500">{p.department??'—'} · <span className={p.kind==='wfh'?'font-semibold text-cyan-700':''}>{kindLabel(p)}</span></span></span>
    <span className="flex shrink-0 gap-1">
     <button type="button" disabled={!!busy} onClick={()=>setEdit({id:p.id,kind:p.kind,days:p.wfhDays})} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"><PencilLine className="h-3.5 w-3.5"/>{dt('Edit')}</button>
     <button type="button" disabled={!!busy} onClick={()=>void act('p'+p.id,()=>saveAttendancePerson(p.id,false))} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><UserMinus className="h-3.5 w-3.5"/>{dt('Remove')}</button>
    </span>
   </li>)}</ul>
   {edit?<div className="mt-3 space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3">
    {!members.some(p=>p.id===edit.id)&&<label className="block text-sm font-medium">{dt('Person')}<select value={edit.id} onChange={e=>setEdit({...edit,id:e.target.value})} className={field}><option value="">{dt('Choose a person…')}</option>{others.map(p=><option key={p.id} value={p.id}>{p.name}{p.department?` · ${p.department}`:''}</option>)}</select></label>}
    <div><p className="text-sm font-medium">{dt('Type')}</p><div className="mt-1 grid grid-cols-2 gap-2">{(['part-time','wfh'] as const).map(k=><button key={k} type="button" aria-pressed={edit.kind===k} onClick={()=>setEdit({...edit,kind:k})} className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${edit.kind===k?'bg-cyan-600 text-white ring-cyan-600':'bg-white text-slate-700 ring-slate-200'}`}>{k==='wfh'?dt('Full-time, works from home'):dt('Part-time')}</button>)}</div></div>
    {edit.kind==='wfh'&&<div><p className="text-sm font-medium">{dt('Work-from-home days')}</p><div className="mt-1 flex flex-wrap gap-1.5">{[1,2,3,4,5,6,7].map(d=><button key={d} type="button" aria-pressed={edit.days.includes(d)} onClick={()=>setEdit({...edit,days:edit.days.includes(d)?edit.days.filter(x=>x!==d):[...edit.days,d].sort()})} className={`h-9 min-w-11 rounded-lg px-2 text-sm font-semibold ring-1 ${edit.days.includes(d)?'bg-cyan-600 text-white ring-cyan-600':'bg-white text-slate-700 ring-slate-200'}`}>{weekdays([d],th)}</button>)}</div><p className="mt-1 text-xs text-slate-500">{dt('They can clock in only on these days.')}</p></div>}
    <div className="flex gap-2"><button type="button" disabled={!edit.id||(edit.kind==='wfh'&&!edit.days.length)||!!busy} onClick={saveEdit} className="flex items-center gap-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="h-4 w-4"/>{members.some(p=>p.id===edit.id)?dt('Save'):dt('Add')}</button><button type="button" onClick={()=>setEdit(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">{dt('Cancel')}</button></div>
   </div>:<button type="button" disabled={!!busy} onClick={()=>setEdit({id:'',kind:'part-time',days:[]})} className="mt-3 flex items-center gap-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><UserPlus className="h-4 w-4"/>{dt('Add a person')}</button>}
  </section>
  <section className="rounded-2xl bg-white p-5 shadow-xs">
   <div className="flex flex-wrap items-end justify-between gap-3">
    <h2 className="font-bold">{dt('Hours worked')}</h2>
    <div className="flex flex-wrap items-end gap-2">
     <label className="text-xs font-medium">{dt('From')}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} className={field}/></label>
     <label className="text-xs font-medium">{dt('To')}<input type="date" value={to} min={from} max={data.today} onChange={e=>setTo(e.target.value)} className={field}/></label>
     <button type="button" disabled={!!busy} onClick={()=>void load(from,to)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{dt('Show')}</button>
    </div>
   </div>
   {totals.length===0&&<p className="mt-3 text-sm text-slate-500">{dt('Nothing to show yet.')}</p>}
   <ul className="mt-3 space-y-2">{totals.map(p=><li key={p.id} className="overflow-hidden rounded-xl border border-slate-100">
    <button type="button" aria-expanded={open===p.id} onClick={()=>setOpen(open===p.id?null:p.id)} className="flex w-full items-center gap-3 p-3 text-left">
     <span className="min-w-0 flex-1"><span className="block font-semibold">{p.name}</span><span className="text-xs text-slate-500">{kindLabel(p)} · {dt('{0} days',[p.days])}{p.missed?<span className="font-semibold text-rose-600"> · {dt('{0} missed clock-outs',[p.missed])}</span>:null}</span></span>
     <span className="text-right tabular-nums"><span className="block text-lg font-bold">{dt('{0} hrs',[hours(p.worked)])}</span>{p.overtime>0&&<span className="text-xs font-semibold text-amber-700">{dt('+{0} overtime',[hours(p.overtime)])}</span>}</span>
     <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open===p.id?'rotate-180':''}`}/>
    </button>
    {open===p.id&&<table className="w-full border-t border-slate-100 text-sm">
     <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">{dt('Day')}</th><th className="px-3 py-2 font-medium">{dt('In')}</th><th className="px-3 py-2 font-medium">{dt('Out')}</th><th className="px-3 py-2 text-right font-medium">{dt('Hours')}</th></tr></thead>
     <tbody>{p.shifts.map(x=>{const a=mapLink(x.inLat,x.inLng),b=mapLink(x.outLat,x.outLng);return <tr key={x.id} className="border-t border-slate-100">
      <td className="px-3 py-2">{dayLabel(x.date,th)}{x.edited&&<span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{dt('fixed')}</span>}</td>
      <td className="px-3 py-2 tabular-nums">{clock(x.in)}{a&&<a href={a} target="_blank" rel="noreferrer" aria-label={dt('Clock-in location')} className="ml-1 inline-flex text-cyan-700"><MapPin className="h-3.5 w-3.5"/></a>}{x.inPhoto&&<a href={attendancePhotoUrl(x.id,'in')} target="_blank" rel="noreferrer" aria-label={dt('Clock-in photo')} className="ml-1 inline-flex text-cyan-700"><Camera className="h-3.5 w-3.5"/></a>}</td>
      <td className="px-3 py-2 tabular-nums">{x.missedOut?<span className="text-rose-600">{dt('Missing')}</span>:x.out?<>{clock(x.out)}{b&&<a href={b} target="_blank" rel="noreferrer" aria-label={dt('Clock-out location')} className="ml-1 inline-flex text-cyan-700"><MapPin className="h-3.5 w-3.5"/></a>}{x.outPhoto&&<a href={attendancePhotoUrl(x.id,'out')} target="_blank" rel="noreferrer" aria-label={dt('Clock-out photo')} className="ml-1 inline-flex text-cyan-700"><Camera className="h-3.5 w-3.5"/></a>}</>:<span className="text-emerald-700">{dt('Working')}</span>}</td>
      <td className="px-3 py-2 text-right tabular-nums">{hours(x.workedMin)}{x.overtimeMin>0&&<span className="ml-1 text-xs text-amber-700">+{hours(x.overtimeMin)}</span>}</td>
     </tr>;})}</tbody>
    </table>}
   </li>)}</ul>
  </section>
 </div>;
}
