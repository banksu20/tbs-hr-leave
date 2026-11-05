import {useEffect,useState} from 'react';
import {useDashboardText} from '@/hooks/useDashboardText';

export default function EditableStartDate({value,name,onSave}:{value?:string|null;name:string;onSave:(date:string)=>Promise<unknown>}) {
 const dt=useDashboardText();
 const [draft,setDraft]=useState(value||''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{setDraft(value||'');},[value]);
 const save=async()=>{
  if(busy||draft===(value||''))return;
  if(!draft){setDraft(value||'');return;}
  setBusy(true);setFailed(false);
  try{await onSave(draft);}catch{setDraft(value||'');setFailed(true);}finally{setBusy(false);}
 };
 return <div><input type="date" aria-label={`${dt('Start date')}: ${name}`} aria-invalid={failed} disabled={busy} value={draft} className="w-32 rounded border border-transparent bg-transparent p-1 hover:border-slate-300 focus:border-cyan-500 disabled:opacity-60" onChange={e=>{setDraft(e.target.value);setFailed(false);}} onBlur={()=>void save()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){setDraft(value||'');setFailed(false);}}}/>{busy&&<span role="status" className="block text-xs text-slate-500">{dt('Saving…')}</span>}{failed&&<span role="alert" className="block text-xs text-red-600">{dt('Not saved')}</span>}</div>;
}
