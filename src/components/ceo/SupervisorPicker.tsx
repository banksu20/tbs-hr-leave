import {useState} from 'react';
import {Plus} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from '@/components/ui/command';
import {supervisorLabel,type Supervisor} from './supervisorLabel';

export default function SupervisorPicker({supervisors,chosen,disabled,onChange}:{supervisors:Supervisor[];chosen:string[];disabled?:boolean;onChange:(next:string[])=>void}){
 const dt=useDashboardText();
 const [picking,setPicking]=useState(false);
 const label=(id:string)=>supervisorLabel(supervisors,id);
 const available=supervisors.filter(s=>!chosen.includes(s.userId)).sort((a,b)=>label(a.userId).localeCompare(label(b.userId)));
 return <div className="space-y-3">
  <div className="flex flex-wrap items-center gap-2">
   {chosen.map(id=><span key={id} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900 text-sm pl-3 pr-1 py-1">{label(id)}<button type="button" disabled={disabled} aria-label={dt("Remove {0}",[label(id)])} className="rounded-full w-6 h-6 leading-none text-cyan-700 hover:bg-cyan-100" onClick={()=>onChange(chosen.filter(c=>c!==id))}>×</button></span>)}
   {!chosen.length&&<span className="text-sm text-slate-500">{dt("No supervisor yet")}</span>}
  </div>
  <Popover open={picking} onOpenChange={setPicking}>
   <PopoverTrigger asChild><button type="button" disabled={disabled||!available.length} className="inline-flex items-center gap-2 border border-dashed border-cyan-400 text-cyan-800 rounded-lg px-3 py-2 text-sm hover:bg-cyan-50 disabled:opacity-50"><Plus className="w-4 h-4" aria-hidden/>{dt("Add a supervisor")}</button></PopoverTrigger>
   <PopoverContent align="start" className="p-0 w-80">
    <Command>
     <CommandInput placeholder={dt("Search by name or nickname")}/>
     <CommandList>
      <CommandEmpty>{dt("No matching staff")}</CommandEmpty>
      <CommandGroup>{available.map(s=><CommandItem key={s.userId} value={label(s.userId)} onSelect={()=>{setPicking(false);onChange([...chosen,s.userId]);}}>{label(s.userId)}</CommandItem>)}</CommandGroup>
     </CommandList>
    </Command>
   </PopoverContent>
  </Popover>
 </div>;
}
