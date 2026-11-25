import {useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,Camera,CheckCircle2,ChevronDown,Clock3,Home,Loader2,MapPin,PencilLine,Power,ShieldCheck,UserMinus,UserPlus,Users,X,XCircle} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {useLanguage} from '@/hooks/useLanguage';
import {clock,dayLabel,hours,mapLink,weekdays,type AttendanceKind} from '@/lib/attendance';
import {attendancePhotoUrl,decideAttendanceFix,loadAttendanceOverview,saveAttendanceOn,saveAttendancePerson,type AdminShift,type AttendanceOverview,type AttendancePerson} from '@/lib/hrAdmin';

type Edit={id:string;kind:AttendanceKind;days:number[]};
type Photo={url:string;title:string};
const field='mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm focus:border-emerald-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-200';
const panel='rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100';
const initials=(name:string)=>name.replace(/\(.*\)/,'').trim().split(/\s+/).slice(0,2).map(w=>w[0]??'').join('').toUpperCase()||'?';
const tones=['bg-emerald-100 text-emerald-800','bg-sky-100 text-sky-800','bg-violet-100 text-violet-800','bg-amber-100 text-amber-800','bg-rose-100 text-rose-800','bg-teal-100 text-teal-800'];
const tone=(id:string)=>tones[[...id].reduce((a,c)=>a+c.charCodeAt(0),0)%tones.length];
function Avatar({id,name,size='h-10 w-10 text-sm'}:{id:string;name:string;size?:string}){return <span className={`grid shrink-0 place-items-center rounded-full font-bold ${size} ${tone(id)}`}>{initials(name)}</span>;}

function Thumb({src}:{src:string}){const [bad,setBad]=useState(false);return bad?<Camera className="m-auto h-4 w-4 text-slate-400"/>:<img src={src} alt="" loading="lazy" onError={()=>setBad(true)} className="h-full w-full object-cover"/>;}

export default function AttendanceAdmin(){
 const dt=useDashboardText();
 const {language}=useLanguage();const th=language==='th';
 const [data,setData]=useState<AttendanceOverview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[edit,setEdit]=useState<Edit|null>(null),[open,setOpen]=useState<string|null>(null),[photo,setPhoto]=useState<Photo|null>(null);
 const load=useCallback((f:string,t:string)=>loadAttendanceOverview(f,t).then(d=>{setData(d);setFrom(d.from);setTo(d.to);}).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load('','');},[load]);
 useEffect(()=>{if(!photo&&!edit)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPhoto(null);setEdit(null);}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[photo,edit]);
 const act=async(key:string,fn:()=>Promise<AttendanceOverview>)=>{setBusy(key);setError('');try{const d=await fn();setData(d);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy('');}};
 const members=useMemo(()=>data?.people.filter(p=>p.member)??[],[data]);
 const others=useMemo(()=>data?.people.filter(p=>!p.member)??[],[data]);
 const target=useCallback((p:AttendancePerson)=>p.kind==='wfh'?data?.settings.wfhWorkMinutes??480:data?.settings.workMinutes??420,[data]);
 const totals=useMemo(()=>members.map(p=>{const s=data?.shifts.filter(x=>x.userId===p.id)??[];const days=new Set(s.map(x=>x.date)).size;return {...p,shifts:s,worked:s.reduce((a,x)=>a+x.workedMin,0),overtime:s.reduce((a,x)=>a+x.overtimeMin,0),missed:s.filter(x=>x.missedOut).length,days,goal:days*target(p)};}),[members,data,target]);
 const working=useMemo(()=>(data?.shifts??[]).filter(x=>!x.out&&!x.missedOut),[data]);
 const todayMin=useMemo(()=>(data?.shifts??[]).filter(x=>x.date===data?.today).reduce((a,x)=>a+x.workedMin,0),[data]);
 const kindLabel=(p:AttendancePerson)=>p.kind==='wfh'?dt('Work from home · {0}',[weekdays(p.wfhDays,th)]):dt('Part-time');
 const kindChip=(p:AttendancePerson)=><span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${p.kind==='wfh'?'bg-violet-50 text-violet-700':'bg-sky-50 text-sky-700'}`}>{p.kind==='wfh'?<Home className="h-3 w-3 shrink-0"/>:<Clock3 className="h-3 w-3 shrink-0"/>}{kindLabel(p)}</span>;
 const saveEdit=async()=>{if(!edit)return;const e=edit;if(await act('save',()=>saveAttendancePerson(e.id,true,e.kind,e.kind==='wfh'?e.days:[])))setEdit(null);};
 const pending=data?.fixes.filter(f=>f.status==='pending')??[];
 const thumb=(x:AdminShift,kind:'in'|'out')=>(kind==='in'?x.inPhoto:x.outPhoto)&&<button type="button" onClick={()=>setPhoto({url:attendancePhotoUrl(x.id,kind),title:`${x.employee} · ${dayLabel(x.date,th)} · ${kind==='in'?dt('Clock-in photo'):dt('Clock-out photo')}`})} aria-label={kind==='in'?dt('Clock-in photo'):dt('Clock-out photo')} className="relative grid h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 transition hover:ring-2 hover:ring-emerald-400"><Thumb src={attendancePhotoUrl(x.id,kind)}/></button>;
 const pin=(lat:number|null|undefined,lng:number|null|undefined,label:string)=>{const m=mapLink(lat,lng);return m&&<a href={m} target="_blank" rel="noreferrer" aria-label={label} className="grid h-7 w-7 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50"><MapPin className="h-4 w-4"/></a>;};
 if(!data)return <div className={panel}>{error?<p role="alert" className="text-sm text-red-700">{error}</p>:<p className="flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}</div>;
 const s=data.settings;
 const stats:[string,string,string][]=[[dt('Working now'),String(working.length),'text-white'],[dt('Hours today'),hours(todayMin),'text-white'],[dt('Fixes to check'),String(pending.length),pending.length?'text-amber-200':'text-white'],[dt('On the list'),String(members.length),'text-white']];
 return <div className="space-y-5">
  <section className="relative overflow-hidden rounded-3xl bg-linear-to-br/srgb from-emerald-500 via-teal-600 to-cyan-700 p-6 text-white shadow-lg shadow-emerald-900/10">
   <span className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10"/><span className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-white/5"/>
   <div className="relative flex flex-wrap items-start justify-between gap-4">
    <div className="max-w-xl">
     <p className="flex items-center gap-2 text-sm font-semibold text-emerald-50"><Clock3 className="h-4 w-4"/>{dt('Clock-in')}</p>
     <h1 className="mt-1 text-2xl font-extrabold">{s.enabled?dt('On: people on the list can clock in.'):dt('Off: nobody can clock in yet.')}</h1>
     <p className="mt-2 text-sm text-emerald-50/90">{dt('Only people on the list below can clock in: part-timers on any day, work-from-home staff only on their work-from-home days. Nobody else sees it.')}</p>
    </div>
    <button type="button" disabled={!!busy} onClick={()=>void act('on',()=>saveAttendanceOn(!s.enabled))} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition disabled:opacity-50 ${s.enabled?'bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25':'bg-white text-emerald-700 hover:bg-emerald-50'}`}>{busy==='on'?<Loader2 className="h-4 w-4 animate-spin"/>:<Power className="h-4 w-4"/>}{s.enabled?dt('Turn off'):dt('Turn on')}</button>
   </div>
   <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map(([k,v,c])=><div key={k} className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur-sm"><p className="text-xs font-medium text-emerald-50">{k}</p><p className={`text-2xl font-extrabold tabular-nums ${c}`}>{v}</p></div>)}</div>
   <p className="relative mt-4 flex items-start gap-1.5 text-xs text-emerald-50/90"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0"/>{dt('Part-time {0} hours a day, work from home {1} hours a day. A {2}-minute break is taken off once a shift is over {3} hours. Staff take a photo and share their location each time. Both are erased after {4} days.',[s.workMinutes/60,s.wfhWorkMinutes/60,s.breakMinutes,s.breakAfterMinutes/60,s.locationDays])}</p>
  </section>
  {error&&<p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</p>}
  {pending.length>0&&<section className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5">
   <div className="flex items-baseline justify-between gap-2"><h2 className="text-lg font-bold text-amber-900">{dt('Time fixes to check ({0})',[pending.length])}</h2><p className="text-xs text-amber-800">{dt('Approving puts the corrected times into their hours.')}</p></div>
   <ul className="mt-3 grid gap-3 md:grid-cols-2">{pending.map(f=><li key={f.id} className="flex flex-col rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex items-center gap-3"><Avatar id={f.userId} name={f.employee}/><div className="min-w-0"><p className="truncate font-bold text-slate-900">{f.employee}</p><p className="text-xs text-slate-500">{dayLabel(f.date,th)}</p></div></div>
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-sm tabular-nums">
     {f.was&&<span className="text-slate-400 line-through">{clock(f.was.in)}–{f.was.missedOut?'?':clock(f.was.out)}</span>}
     {f.was&&<span className="text-slate-300">→</span>}
     <span className="font-bold text-slate-900">{clock(f.in)}–{clock(f.out)}</span>
     <span className="ml-auto text-xs font-semibold text-emerald-700">{dt('{0} hrs',[hours(f.workedMin)])}</span>
    </div>
    <p className="mt-2 flex-1 text-sm text-slate-600">“{f.reason}”</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
     <button type="button" disabled={!!busy} onClick={()=>void act('f'+f.id,()=>decideAttendanceFix(f.id,'approve'))} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{dt('Approve')}</button>
     <button type="button" disabled={!!busy} onClick={()=>void act('f'+f.id,()=>decideAttendanceFix(f.id,'reject'))} className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-4 w-4"/>{dt('Reject')}</button>
    </div>
   </li>)}</ul>
  </section>}
  <div className="grid gap-5 lg:grid-cols-2">
   <section className={panel}>
    <h2 className="flex items-center gap-2 font-bold text-slate-900"><span className="relative flex h-2.5 w-2.5">{working.length>0&&<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/>}<span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${working.length?'bg-emerald-500':'bg-slate-300'}`}/></span>{dt('Working now')}</h2>
    {working.length===0&&<p className="mt-3 text-sm text-slate-500">{dt('Nobody is clocked in right now.')}</p>}
    <ul className="mt-3 space-y-2">{working.map(x=><li key={x.id} className="flex items-center gap-3 rounded-2xl bg-emerald-50/60 p-2.5">
     {thumb(x,'in')||<Avatar id={x.userId} name={x.employee}/>}
     <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{x.employee}</p><p className="text-xs font-semibold text-emerald-700">{dt('Since {0}',[clock(x.in)])}</p></div>
     {pin(x.inLat,x.inLng,dt('Clock-in location'))}
    </li>)}</ul>
   </section>
   <section className={panel}>
    <div className="flex items-center justify-between gap-2">
     <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-4 w-4 text-emerald-600"/>{dt('People who clock in ({0})',[members.length])}</h2>
     <button type="button" disabled={!!busy} onClick={()=>setEdit({id:'',kind:'part-time',days:[]})} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><UserPlus className="h-3.5 w-3.5"/>{dt('Add a person')}</button>
    </div>
    {members.length===0&&<p className="mt-3 rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{dt('Nobody yet. Add part-timers and work-from-home staff below.')}</p>}
    <ul className="mt-3 divide-y divide-slate-100">{members.map(p=><li key={p.id} className="group flex items-center gap-3 py-2.5">
     <Avatar id={p.id} name={p.name}/>
     <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{p.name}</span><span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{kindChip(p)}{p.department&&<span>{p.department}</span>}</span></span>
     <span className="flex shrink-0 gap-0.5">
      <button type="button" disabled={!!busy} onClick={()=>setEdit({id:p.id,kind:p.kind,days:p.wfhDays})} aria-label={dt('Edit')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700 disabled:opacity-50"><PencilLine className="h-4 w-4"/></button>
      <button type="button" disabled={!!busy} onClick={()=>void act('p'+p.id,()=>saveAttendancePerson(p.id,false))} aria-label={dt('Remove')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"><UserMinus className="h-4 w-4"/></button>
     </span>
    </li>)}</ul>
   </section>
  </div>
  <section className={panel}>
   <div className="flex flex-wrap items-end justify-between gap-3">
    <h2 className="text-lg font-bold text-slate-900">{dt('Hours worked')}</h2>
    <div className="grid w-full grid-cols-2 items-end gap-2 sm:w-auto sm:grid-cols-[1fr_1fr_auto]">
     <label className="min-w-0 text-xs font-semibold text-slate-600">{dt('From')}<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} className={field}/></label>
     <label className="min-w-0 text-xs font-semibold text-slate-600">{dt('To')}<input type="date" value={to} min={from} max={data.today} onChange={e=>setTo(e.target.value)} className={field}/></label>
     <button type="button" disabled={!!busy} onClick={()=>void load(from,to)} className="col-span-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-1">{dt('Show')}</button>
    </div>
   </div>
   {totals.length===0&&<p className="mt-3 text-sm text-slate-500">{dt('Nothing to show yet.')}</p>}
   <ul className="mt-4 space-y-2">{totals.map(p=>{const pct=p.goal?Math.min(100,Math.round(p.worked/p.goal*100)):0;return <li key={p.id} className={`overflow-hidden rounded-2xl ring-1 transition ${open===p.id?'ring-emerald-200':'ring-slate-100'}`}>
    <button type="button" aria-expanded={open===p.id} onClick={()=>setOpen(open===p.id?null:p.id)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-slate-50">
     <span className="hidden sm:contents"><Avatar id={p.id} name={p.name}/></span>
     <span className="min-w-0 flex-1">
      <span className="block font-bold text-slate-900">{p.name}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{kindChip(p)}<span>{dt('{0} days',[p.days])}</span>{p.missed>0&&<span className="font-semibold text-rose-600">{dt('{0} missed clock-outs',[p.missed])}</span>}</span>
      {p.goal>0&&<span className="mt-2 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${p.worked>=p.goal?'bg-emerald-500':'bg-emerald-300'}`} style={{width:`${pct}%`}}/></span>}
     </span>
     <span className="text-right tabular-nums"><span className="block whitespace-nowrap text-lg font-extrabold text-slate-900 sm:text-xl">{dt('{0} hrs',[hours(p.worked)])}</span>{p.overtime>0&&<span className="text-xs font-semibold text-amber-700">{dt('+{0} overtime',[hours(p.overtime)])}</span>}</span>
     <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open===p.id?'rotate-180':''}`}/>
    </button>
    {open===p.id&&<ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/50">{p.shifts.length===0&&<li className="p-4 text-sm text-slate-500">{dt('Nothing to show yet.')}</li>}{p.shifts.map(x=><li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
     <span className="w-28 shrink-0 font-semibold text-slate-700">{dayLabel(x.date,th)}{x.edited&&<span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{dt('fixed')}</span>}</span>
     <span className="flex items-center gap-1.5"><span className="w-8 text-[11px] font-semibold text-slate-400 uppercase">{dt('In')}</span>{thumb(x,'in')}<span className="tabular-nums font-semibold text-slate-900">{clock(x.in)}</span>{pin(x.inLat,x.inLng,dt('Clock-in location'))}</span>
     <span className="flex items-center gap-1.5"><span className="w-8 text-[11px] font-semibold text-slate-400 uppercase">{dt('Out')}</span>{x.missedOut?<span className="font-semibold text-rose-600">{dt('Missing')}</span>:x.out?<>{thumb(x,'out')}<span className="tabular-nums font-semibold text-slate-900">{clock(x.out)}</span>{pin(x.outLat,x.outLng,dt('Clock-out location'))}</>:<span className="font-semibold text-emerald-700">{dt('Working')}</span>}</span>
     <span className="ml-auto text-right tabular-nums"><span className="font-extrabold text-slate-900">{hours(x.workedMin)}</span>{x.overtimeMin>0&&<span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">+{hours(x.overtimeMin)}</span>}</span>
    </li>)}</ul>}
   </li>;})}</ul>
  </section>
  {edit&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onClick={()=>setEdit(null)}>
   <div role="dialog" aria-modal="true" aria-label={members.some(p=>p.id===edit.id)?dt('Edit'):dt('Add a person')} onClick={e=>e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
    <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold text-slate-900">{members.some(p=>p.id===edit.id)?members.find(p=>p.id===edit.id)!.name:dt('Add a person')}</h3><button type="button" aria-label={dt('Cancel')} onClick={()=>setEdit(null)} className="rounded-full bg-slate-100 p-1.5 text-slate-500"><X className="h-4 w-4"/></button></div>
    {!members.some(p=>p.id===edit.id)&&<label className="block text-sm font-semibold text-slate-700">{dt('Person')}<select value={edit.id} onChange={e=>setEdit({...edit,id:e.target.value})} className={field}><option value="">{dt('Choose a person…')}</option>{others.map(p=><option key={p.id} value={p.id}>{p.name}{p.department?` · ${p.department}`:''}</option>)}</select></label>}
    <div><p className="text-sm font-semibold text-slate-700">{dt('Type')}</p><div className="mt-1.5 grid grid-cols-2 gap-2">{(['part-time','wfh'] as const).map(k=><button key={k} type="button" aria-pressed={edit.kind===k} onClick={()=>setEdit({...edit,kind:k})} className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-sm font-bold ring-1 transition ${edit.kind===k?'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500':'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>{k==='wfh'?<Home className="h-5 w-5"/>:<Clock3 className="h-5 w-5"/>}{k==='wfh'?dt('Full-time, works from home'):dt('Part-time')}</button>)}</div></div>
    {edit.kind==='wfh'&&<div><p className="text-sm font-semibold text-slate-700">{dt('Work-from-home days')}</p><div className="mt-1.5 grid grid-cols-7 gap-1">{[1,2,3,4,5,6,7].map(d=><button key={d} type="button" aria-pressed={edit.days.includes(d)} onClick={()=>setEdit({...edit,days:edit.days.includes(d)?edit.days.filter(x=>x!==d):[...edit.days,d].sort()})} className={`h-10 rounded-xl text-xs font-bold ring-1 transition ${edit.days.includes(d)?'bg-emerald-600 text-white ring-emerald-600':'bg-white text-slate-600 ring-slate-200'}`}>{weekdays([d],th)}</button>)}</div><p className="mt-1.5 text-xs text-slate-500">{dt('They can clock in only on these days.')}</p></div>}
    <button type="button" disabled={!edit.id||(edit.kind==='wfh'&&!edit.days.length)||!!busy} onClick={()=>void saveEdit()} className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<UserPlus className="h-4 w-4"/>}{members.some(p=>p.id===edit.id)?dt('Save'):dt('Add')}</button>
   </div>
  </div>}
  {photo&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onClick={()=>setPhoto(null)}>
   <figure role="dialog" aria-modal="true" aria-label={photo.title} onClick={e=>e.stopPropagation()} className="relative max-h-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
    <img src={photo.url} alt={photo.title} className="max-h-[75vh] w-full object-contain bg-slate-900"/>
    <figcaption className="flex items-center justify-between gap-3 p-4 text-sm font-semibold text-slate-700"><span className="flex items-center gap-1.5"><Camera className="h-4 w-4 text-emerald-600"/>{photo.title}</span><button type="button" aria-label={dt('Cancel')} onClick={()=>setPhoto(null)} className="rounded-full bg-slate-100 p-1.5 text-slate-500"><X className="h-4 w-4"/></button></figcaption>
   </figure>
  </div>}
 </div>;
}
