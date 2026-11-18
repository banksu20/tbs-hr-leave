import {useDashboardText} from "@/hooks/useDashboardText";
import {useLanguage} from "@/hooks/useLanguage";
import InternAllowanceSummary from './InternAllowanceSummary';
import SupervisorPicker from './SupervisorPicker';
import type {Supervisor} from './supervisorLabel';
import {formatSheetDate} from './leaveSheetUtils';
import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {RotateCw} from 'lucide-react';
import PersonAvatar from './PersonAvatar';

type Registration={user_id:string;first_name:string;last_name:string;nickname?:string|null;department:string;employment_type:'intern'|'employee';created_at?:string|null;picture_url?:string|null};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());

export default function RegistrationReview(){
 const dt=useDashboardText(),{language}=useLanguage(),client=useQueryClient();
 const [rows,setRows]=useState<Registration[]>([]),[selected,setSelected]=useState<string|null>(null),[start,setStart]=useState(''),[end,setEnd]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [supervisors,setSupervisors]=useState<Supervisor[]>([]),[chosen,setChosen]=useState<string[]>([]);
 async function load(){const r=await fetch('/api/registration?review=1',{cache:'no-store'}),b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.registrations);}
 const refresh=()=>{setLoading(true);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));};
 useEffect(()=>{
  setLoading(true);load().catch(e=>setError(e.message)).finally(()=>setLoading(false));
  fetch('/api/intern-terms').then(r=>r.ok?r.json():null).then(b=>setSupervisors(b?.supervisors??[])).catch(()=>setSupervisors([]));
 },[]);
 const open=(r:Registration)=>{setSelected(r.user_id);setStart(today());setEnd('');setChosen([]);setError('');setNotice('');};
 const activate=async(r:Registration)=>{
  setBusy(true);setError('');setNotice('');
  try{
   const intern=r.employment_type==='intern';
   const res=await fetch('/api/registration',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:r.user_id,startDate:start,...(intern?{endDate:end}:{})})}),body=await res.json();
   if(!res.ok)throw Error(body.error);
   let supervisorsSaved=true;
   if(intern&&chosen.length){try{const s=await fetch('/api/intern-terms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:r.user_id,supervisorIds:chosen})});supervisorsSaved=s.ok;}catch{supervisorsSaved=false;}}
   setSelected(null);
   setNotice(supervisorsSaved?dt("{0} is now active.",[`${r.first_name} ${r.last_name}`]):dt("{0} is now active, but the supervisors were not saved. Set them in Manage interns.",[`${r.first_name} ${r.last_name}`]));
   await load();
   await Promise.all(['employees','intern-registration-count','intern-terms'].map(key=>client.invalidateQueries({queryKey:[key]})));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <section className="space-y-3">
  <div className="flex flex-wrap items-center gap-3">
   <h2 className="font-bold text-xl">{dt("Registrations")}</h2>
   <span className={`text-sm rounded-full px-2.5 py-0.5 ${rows.length?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-600'}`}>{dt("{0} waiting",[rows.length])}</span>
   <button type="button" onClick={refresh} className="ml-auto inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50"><RotateCw className={`w-4 h-4 ${loading?'animate-spin':''}`} aria-hidden/>{dt("Refresh")}</button>
  </div>
  <p className="text-sm text-slate-600">{dt("New people register in LINE and wait here. Activating lets them request leave.")}</p>
  {notice&&<p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{notice}</p>}
  {error&&!selected&&<p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
  {!rows.length&&!loading&&<p className="border border-dashed rounded-xl bg-white p-8 text-center text-slate-500">{dt("No registrations awaiting review.")}</p>}
  {rows.map(r=>{
   const intern=r.employment_type==='intern',active=selected===r.user_id;
   return <article key={r.user_id} className={`border rounded-xl bg-white overflow-hidden ${active?'border-cyan-300 shadow-md':''}`}>
    <div className="p-4 flex flex-wrap items-center gap-3">
     <PersonAvatar name={`${r.first_name} ${r.last_name}`} pictureUrl={r.picture_url}/>
     <div className="min-w-0 flex-1">
      <h3 className="font-semibold truncate">{r.first_name} {r.last_name}{r.nickname?` (${r.nickname})`:''}</h3>
      <p className="text-sm text-slate-500 truncate">{r.department}{r.created_at?` · ${dt("Registered {0}",[formatSheetDate(r.created_at.slice(0,10),language)])}`:''}</p>
     </div>
     <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${intern?'bg-violet-100 text-violet-800':'bg-slate-200 text-slate-800'}`}>{intern?dt("Intern"):dt("Full-time")}</span>
     {!active&&<button type="button" className="rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 text-sm" onClick={()=>open(r)}>{dt("Review")}</button>}
    </div>
    {active&&<form className="border-t bg-slate-50/60 p-4 space-y-4" onSubmit={e=>{e.preventDefault();void activate(r);}}>
     <div className={`grid gap-4 ${intern?'lg:grid-cols-2':''}`}>
      <div className="border rounded-xl bg-white p-4 space-y-3">
       <h4 className="font-semibold">{intern?dt("Internship dates & allowances"):dt("Start date")}</h4>
       <div className="flex flex-wrap gap-3">
        <label className="text-sm">{dt("Start date")}<input required type="date" className="block border rounded-lg p-2 mt-1" value={start} onInput={e=>setStart(e.currentTarget.value)}/></label>
        {intern&&<label className="text-sm">{dt("End date")}<input required type="date" min={start} className="block border rounded-lg p-2 mt-1" value={end} onInput={e=>setEnd(e.currentTarget.value)}/></label>}
       </div>
       {intern?<InternAllowanceSummary start={start} end={end}/>:<p className="text-sm text-slate-500">{dt("Set the annual allowance in the roster after activation.")}</p>}
      </div>
      {intern&&<div className="border rounded-xl bg-white p-4 space-y-3">
       <h4 className="font-semibold">{dt("Supervisors")}</h4>
       <SupervisorPicker supervisors={supervisors} chosen={chosen} disabled={busy} onChange={setChosen}/>
       <p className="text-xs text-slate-500">{dt("Supervisors are notified in LINE when this intern requests leave. HR and the CEO still decide.")}</p>
      </div>}
     </div>
     {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
     <div className="flex flex-wrap gap-2">
      <button disabled={busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 disabled:opacity-50">{busy?dt("Activating…"):dt("Activate profile")}</button>
      <button type="button" disabled={busy} className="border rounded-lg px-4 py-2 bg-white hover:bg-slate-50" onClick={()=>setSelected(null)}>{dt("Cancel")}</button>
     </div>
    </form>}
   </article>;
  })}
 </section>;
}
