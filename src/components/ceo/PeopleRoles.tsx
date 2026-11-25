import {useEffect,useMemo,useState} from 'react';
import {Loader2,Pencil,Plus,Search,X} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import PeopleAlerts from './PeopleAlerts';
import {loadPeople,savePerson,type HrPerson,type HrRole} from '@/lib/hrAdmin';

const levels=[['','Not set'],['operational','Operational'],['manager','Manager'],['c_level','C-level']] as const;
type Draft={userId:string;careerLevel:string;managerId:string;roles:HrRole[];workEmail:string};

export default function PeopleRoles(){
 const dt=useDashboardText();
 const [people,setPeople]=useState<HrPerson[]|null>(null),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[saves,setSaves]=useState(0);
 useEffect(()=>{loadPeople().then(setPeople).catch(e=>setError((e as Error).message));},[]);
 const byId=useMemo(()=>new Map((people??[]).map(p=>[p.id,p])),[people]);
 const label=(p:HrPerson)=>p.nickname?`${p.nickname} · ${p.name}`:p.name;
 const shown=(people??[]).filter(p=>!search||`${p.code} ${p.name} ${p.nickname??''} ${p.department??''} ${p.roles.map(r=>r.role).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
 const total=draft?draft.roles.reduce((s,r)=>s+(Number(r.timeShare)||0),0):0;
 const valid=!!draft&&(!draft.workEmail.trim()||/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.workEmail.trim()))&&(draft.roles.length===0||(Math.abs(total-100)<0.001&&draft.roles.every(r=>r.role.trim()&&Number(r.timeShare)>0)));
 const submit=async()=>{if(!draft||!valid)return;setBusy(true);setError('');try{setPeople(await savePerson({...draft,workEmail:draft.workEmail.trim(),roles:draft.roles.map(r=>({role:r.role.trim(),timeShare:Number(r.timeShare)}))}));setDraft(null);setSaves(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const field='rounded-lg border border-slate-200 p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';
 return <section className="space-y-4">
  <div><h2 className="text-xl font-bold">{dt('Roles & career levels')}</h2><p className="text-sm text-slate-500">{dt('One person can hold several roles. Time shares must add up to 100%.')}</p></div>
  <PeopleAlerts refresh={saves}/>
  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={dt('Search')} aria-label={dt('Search')} className="w-full py-2.5 text-sm outline-hidden"/></label>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {people===null&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
  <div className="space-y-2">{shown.map(p=>{const editing=draft?.userId===p.id;return <article key={p.id} className={`rounded-2xl border bg-white p-4 shadow-xs ${editing?'border-cyan-300':'border-slate-200'}`}>
   <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
     <p className="font-semibold leading-snug">{label(p)}</p>
     <p className="text-xs text-slate-500">{[p.code,p.department,p.type==='intern'?dt('Intern'):null].filter(Boolean).join(' · ')}</p>
     {!editing&&<div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{dt(levels.find(l=>l[0]===(p.careerLevel??''))?.[1]??'Not set')}</span>
      {p.managerId&&<span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{dt('Reports to {0}',[byId.get(p.managerId)?.nickname||byId.get(p.managerId)?.name||'—'])}</span>}
      {p.workEmail&&<span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{p.workEmail}</span>}
      {p.roles.map(r=><span key={r.role} className="rounded-full bg-cyan-50 px-2.5 py-1 font-medium text-cyan-800">{r.role} {r.timeShare}%</span>)}
      {p.sopPending>0&&<span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">{dt('{0} SOPs not accepted',[p.sopPending])}</span>}
     </div>}
    </div>
    {!editing&&<button type="button" aria-label={dt('Edit')} title={dt('Edit')} onClick={()=>setDraft({userId:p.id,careerLevel:p.careerLevel??'',managerId:p.managerId??'',workEmail:p.workEmail??'',roles:p.roles.map(r=>({...r}))})} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4"/></button>}
   </div>
   {editing&&draft&&<form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void submit();}}>
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="block text-sm font-medium">{dt('Career level')}<select value={draft.careerLevel} onChange={e=>setDraft({...draft,careerLevel:e.target.value})} className={field+' mt-1 w-full bg-white'}>{levels.map(([v,l])=><option key={v} value={v}>{dt(l)}</option>)}</select></label>
     <label className="block text-sm font-medium">{dt('Direct manager')}<select value={draft.managerId} onChange={e=>setDraft({...draft,managerId:e.target.value})} className={field+' mt-1 w-full bg-white'}><option value="">{dt('None')}</option>{(people??[]).filter(m=>m.id!==p.id&&m.type==='employee').map(m=><option key={m.id} value={m.id}>{label(m)}</option>)}</select></label>
     <label className="block text-sm font-medium sm:col-span-2">{dt('Work email')}<input type="email" maxLength={200} value={draft.workEmail} placeholder={dt('Used for team lead emails')} onChange={e=>setDraft({...draft,workEmail:e.target.value})} className={field+' mt-1 w-full'}/></label>
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">{dt('Roles')}</legend>
     {draft.roles.map((r,i)=><div key={i} className="flex items-center gap-2">
      <input aria-label={dt('Role name')} placeholder={dt('Role name')} maxLength={80} value={r.role} onChange={e=>setDraft({...draft,roles:draft.roles.map((x,j)=>j===i?{...x,role:e.target.value}:x)})} className={field+' min-w-0 flex-1'}/>
      <input aria-label={dt('Time share %')} type="number" min={1} max={100} step={1} value={Number.isFinite(r.timeShare)?r.timeShare:''} onChange={e=>setDraft({...draft,roles:draft.roles.map((x,j)=>j===i?{...x,timeShare:e.target.valueAsNumber}:x)})} className={field+' w-20 text-right'}/><span className="text-sm text-slate-500">%</span>
      <button type="button" aria-label={dt('Remove role')} onClick={()=>setDraft({...draft,roles:draft.roles.filter((_,j)=>j!==i)})} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button>
     </div>)}
     {draft.roles.length<8&&<button type="button" onClick={()=>setDraft({...draft,roles:[...draft.roles,{role:'',timeShare:draft.roles.length?Math.max(0,100-total):100}]})} className="flex items-center gap-1 text-sm font-semibold text-cyan-700"><Plus className="h-4 w-4"/>{dt('Add role')}</button>}
     {draft.roles.length>0&&<p className={`text-xs font-medium ${Math.abs(total-100)<0.001?'text-emerald-700':'text-amber-700'}`}>{dt('Total {0}% of 100%',[Math.round(total*100)/100])}</p>}
    </fieldset>
    <div className="flex gap-2"><button disabled={busy||!valid} className="rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?dt('Saving…'):dt('Save')}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)} className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600">{dt('Cancel')}</button></div>
   </form>}
  </article>;})}</div>
 </section>;
}
