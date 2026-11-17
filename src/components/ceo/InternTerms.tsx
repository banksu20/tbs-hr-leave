import {useDashboardText} from "@/hooks/useDashboardText";
import InternAllowanceSummary from './InternAllowanceSummary';
import {useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import type {Supervisor} from './supervisorLabel';
import SupervisorPicker from './SupervisorPicker';

export default function InternTerms({userId,startDate,endDate,supervisors,supervisorIds}:{userId:string;startDate?:string;endDate?:string;supervisors:Supervisor[];supervisorIds:string[]}){
 const dt=useDashboardText(),client=useQueryClient();
 const [start,setStart]=useState(startDate??''),[end,setEnd]=useState(endDate??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [chosen,setChosen]=useState(supervisorIds),[supervisorState,setSupervisorState]=useState<''|'saving'|'saved'>('');
 const supervisorKey=supervisorIds.join('|');
 useEffect(()=>{setChosen(supervisorKey?supervisorKey.split('|'):[]);},[supervisorKey]);
 const post=async(body:unknown)=>{const r=await fetch('/api/intern-terms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),b=await r.json();if(!r.ok)throw Error(b.error);};
 const saveDates=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');setSaved(false);try{await post({userId,startDate:start,endDate:end});setSaved(true);await client.invalidateQueries({queryKey:['intern-terms']});await client.invalidateQueries({queryKey:['employees']});}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
 const saveSupervisors=async(next:string[])=>{setSupervisorState('saving');setError('');try{await post({userId,supervisorIds:next});setChosen(next);setSupervisorState('saved');await client.invalidateQueries({queryKey:['intern-terms']});}catch(err){setSupervisorState('');setError((err as Error).message);}};
 return <div className="grid gap-4 lg:grid-cols-2">
  <form className="border rounded-xl p-4 space-y-3" onSubmit={saveDates}>
   <h3 className="font-semibold">{dt("Internship dates & allowances")}</h3>
   <div className="flex flex-wrap gap-3">
    <label className="text-sm">{dt("Start")}<input type="date" required className="block border rounded-lg p-2 mt-1" value={start} onInput={e=>setStart(e.currentTarget.value)}/></label>
    <label className="text-sm">{dt("End")}<input type="date" required min={start} className="block border rounded-lg p-2 mt-1" value={end} onInput={e=>setEnd(e.currentTarget.value)}/></label>
   </div>
   <InternAllowanceSummary start={start} end={end}/>
   <div className="flex items-center gap-3">
    <button disabled={busy} className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg px-4 py-2 disabled:opacity-60">{busy?dt("Saving…"):dt("Save internship")}</button>
    {saved&&<span className="text-emerald-700 text-sm">{dt("Saved")}</span>}
   </div>
  </form>
  <div className="border rounded-xl p-4 space-y-3">
   <h3 className="font-semibold">{dt("Supervisors")}</h3>
   <SupervisorPicker supervisors={supervisors} chosen={chosen} disabled={supervisorState==='saving'} onChange={next=>void saveSupervisors(next)}/>
   <p className="text-xs text-slate-500">{dt("Supervisors are notified in LINE when this intern requests leave. HR and the CEO still decide.")}</p>
   {supervisorState==='saved'&&<p className="text-emerald-700 text-sm">{dt("Supervisors saved")}</p>}
  </div>
  {error&&<p role="alert" className="text-red-700 text-sm lg:col-span-2">{error}</p>}
 </div>;
}
