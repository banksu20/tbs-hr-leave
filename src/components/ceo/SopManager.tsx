import {useEffect,useState} from 'react';
import {Archive,FileText,Loader2,Pencil,Plus,RotateCcw} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {loadSops,saveSop,setSopActive,type HrSop} from '@/lib/hrAdmin';

type Draft={id?:number;version?:number;titleEn:string;titleTh:string;body:string;bodyEn:string;notify:boolean};
const empty:Draft={titleEn:'',titleTh:'',body:'',bodyEn:'',notify:true};

export default function SopManager(){
 const dt=useDashboardText();
 const [sops,setSops]=useState<HrSop[]|null>(null),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showMissing,setShowMissing]=useState<number|null>(null);
 useEffect(()=>{loadSops().then(setSops).catch(e=>setError((e as Error).message));},[]);
 const submit=async()=>{
  if(!draft)return;setBusy(true);setError('');setNotice('');
  try{const r=await saveSop(draft);setSops(r.sops);setDraft(null);setNotice(r.notified?dt('Saved. {0} people were asked in LINE to accept it.',[r.notified]):dt('Saved.'));}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 const toggle=async(s:HrSop)=>{setBusy(true);setError('');setNotice('');try{setSops(await setSopActive(s.id,!s.active));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const total=(s:HrSop)=>s.accepted+s.missing.length;
 const field='mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';
 return <section className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div><h2 className="text-xl font-bold">{dt('Company SOPs')}</h2><p className="text-sm text-slate-500">{dt('Everyone reads and accepts these in LINE. Editing a document asks everyone to accept it again.')}</p></div>
   {!draft&&<button type="button" onClick={()=>{setDraft({...empty});setNotice('');}} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4"/>{dt('New SOP')}</button>}
  </div>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  {draft&&<form className="space-y-3 rounded-2xl border border-cyan-200 bg-white p-5 shadow-xs" onSubmit={e=>{e.preventDefault();void submit();}}>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm font-medium">{dt('Title (English)')}<input required maxLength={120} value={draft.titleEn} onChange={e=>setDraft({...draft,titleEn:e.target.value})} className={field}/></label>
    <label className="block text-sm font-medium">{dt('Title (Thai)')}<input maxLength={120} value={draft.titleTh} onChange={e=>setDraft({...draft,titleTh:e.target.value})} className={field}/></label>
   </div>
   <div className="grid gap-3 lg:grid-cols-2">
    <label className="block text-sm font-medium">{dt('Document text (Thai)')}<textarea required maxLength={20000} rows={14} lang="th" value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})} className={field+' font-sans leading-relaxed'}/></label>
    <label className="block text-sm font-medium">{dt('Document text (English)')}<textarea maxLength={20000} rows={14} lang="en" value={draft.bodyEn} onChange={e=>setDraft({...draft,bodyEn:e.target.value})} className={field+' font-sans leading-relaxed'}/></label>
   </div>
   <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-600" checked={draft.notify} onChange={e=>setDraft({...draft,notify:e.target.checked})}/>{dt('Send everyone a LINE message to read and accept it')}</label>
   {draft.id&&<p className="text-xs text-amber-700">{dt('Changing the title or text creates a new version. Everyone must accept it again.')}</p>}
   <div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy?dt('Saving…'):dt('Save')}</button><button type="button" disabled={busy} onClick={()=>setDraft(null)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600">{dt('Cancel')}</button></div>
  </form>}
  {sops===null&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
  {sops?.map(s=><article key={s.id} className={`rounded-2xl border bg-white p-4 shadow-xs ${s.active?'border-slate-200':'border-dashed border-slate-300 opacity-70'}`}>
   <div className="flex items-start gap-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><FileText className="h-5 w-5"/></span>
    <div className="min-w-0 flex-1">
     <h3 className="font-bold leading-snug">{s.titleTh?`${s.titleTh} · ${s.titleEn}`:s.titleEn}</h3>
     <p className="text-xs text-slate-500">{dt('Version {0}',[s.version])}{s.bodyEn?'':` · ${dt('No English text yet')}`}{s.active?'':` · ${dt('Archived')}`}</p>
     {s.active&&<div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{width:`${total(s)?Math.round(s.accepted*100/total(s)):0}%`}}/></div>
      <button type="button" onClick={()=>setShowMissing(showMissing===s.id?null:s.id)} className="mt-1 text-xs font-medium text-slate-600 underline-offset-2 hover:underline">{dt('{0} of {1} accepted',[s.accepted,total(s)])}{s.missing.length?` · ${dt('{0} waiting',[s.missing.length])}`:''}</button>
      {showMissing===s.id&&s.missing.length>0&&<p className="mt-1 text-xs text-amber-800">{s.missing.join(', ')}</p>}
     </div>}
    </div>
    <div className="flex shrink-0 gap-1">
     {s.active&&<button type="button" title={dt('Edit')} aria-label={dt('Edit')} onClick={()=>{setDraft({id:s.id,version:s.version,titleEn:s.titleEn,titleTh:s.titleTh,body:s.body,bodyEn:s.bodyEn??'',notify:true});setNotice('');window.scrollTo({top:0,behavior:'smooth'});}} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4"/></button>}
     <button type="button" disabled={busy} title={s.active?dt('Archive'):dt('Restore')} aria-label={s.active?dt('Archive'):dt('Restore')} onClick={()=>void toggle(s)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">{s.active?<Archive className="h-4 w-4"/>:<RotateCcw className="h-4 w-4"/>}</button>
    </div>
   </div>
  </article>)}
 </section>;
}
