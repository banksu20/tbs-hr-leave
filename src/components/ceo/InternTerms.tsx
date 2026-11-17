import {useDashboardText} from "@/hooks/useDashboardText";
import InternAllowanceSummary from './InternAllowanceSummary';
import {useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {supervisorLabel,type Supervisor} from './supervisorLabel';
import {Plus} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';

export default function InternTerms({userId,startDate,endDate,supervisors,supervisorIds}:{userId:string;startDate?:string;endDate?:string;supervisors:Supervisor[];supervisorIds:string[]}){
 const dt=useDashboardText(),client=useQueryClient();
 const [start,setStart]=useState(startDate??''),[end,setEnd]=useState(endDate??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [chosen,setChosen]=useState(supervisorIds),[supervisorState,setSupervisorState]=useState<''|'saving'|'saved'>(''),[picking,setPicking]=useState(false);
 const supervisorKey=supervisorIds.join('|');
 useEffect(()=>{setChosen(supervisorKey?supervisorKey.split('|'):[]);},[supervisorKey]);
 const label=(id:string)=>supervisorLabel(supervisors,id);
 const available=supervisors.filter(s=>!chosen.includes(s.userId)).sort((a,b)=>label(a.userId).localeCompare(label(b.userId)));
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
   <div className="flex flex-wrap items-center gap-2">
    {chosen.map(id=><span key={id} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900 text-sm pl-3 pr-1 py-1">{label(id)}<button type="button" disabled={supervisorState==='saving'} aria-label={dt("Remove {0}",[label(id)])} className="rounded-full w-6 h-6 leading-none text-cyan-700 hover:bg-cyan-100" onClick={()=>void saveSupervisors(chosen.filter(c=>c!==id))}>×</button></span>)}
    {!chosen.length&&<span className="text-sm text-slate-500">{dt("No supervisor yet")}</span>}
   </div>
   <Popover open={picking} onOpenChange={setPicking}>
    <PopoverTrigger asChild><button type="button" disabled={supervisorState==='saving'||!available.length} className="inline-flex items-center gap-2 border border-dashed border-cyan-400 text-cyan-800 rounded-lg px-3 py-2 text-sm hover:bg-cyan-50 disabled:opacity-50"><Plus className="w-4 h-4" aria-hidden/>{dt("Add a supervisor")}</button></PopoverTrigger>
    <PopoverContent align="start" className="p-0 w-80">
     <Command>
      <CommandInput placeholder={dt("Search by name or nickname")}/>
      <CommandList>
       <CommandEmpty>{dt("No matching staff")}</CommandEmpty>
       <CommandGroup>{available.map(s=><CommandItem key={s.userId} value={label(s.userId)} onSelect={()=>{setPicking(false);void saveSupervisors([...chosen,s.userId]);}}>{label(s.userId)}</CommandItem>)}</CommandGroup>
      </CommandList>
     </Command>
    </PopoverContent>
   </Popover>
   <p className="text-xs text-slate-500">{dt("Supervisors are notified in LINE when this intern requests leave. HR and the CEO still decide.")}</p>
   {supervisorState==='saved'&&<p className="text-emerald-700 text-sm">{dt("Supervisors saved")}</p>}
  </div>
  {error&&<p role="alert" className="text-red-700 text-sm lg:col-span-2">{error}</p>}
 </div>;
}
