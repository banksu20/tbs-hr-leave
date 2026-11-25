import {useEffect,useState} from 'react';
import {BellRing,HeartPulse,Loader2,Users} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {loadAlerts,saveAlerts,type PeopleAlerts as Alerts} from '@/lib/hrAdmin';

const field='mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';

export default function PeopleAlerts({refresh}:{refresh:number}){
 const dt=useDashboardText();
 const [a,setA]=useState<Alerts|null>(null),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const apply=(x:Alerts)=>{setA(x);setEmail(x.pcEmail??'');};
 useEffect(()=>{loadAlerts().then(apply).catch(e=>setError((e as Error).message));},[refresh]);
 const save=async()=>{if(!a)return;setBusy(true);setError('');setNotice('');try{apply(await saveAlerts({pcEmail:email.trim(),sickCount:Number(a.sickCount),sickWindowDays:Number(a.sickWindowDays),leadNotice:a.leadNotice,leadDaysAhead:Number(a.leadDaysAhead)}));setNotice(dt('Saved.'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!a)return error?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>;
 const sickOn=!!a.pcEmail;
 return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
  <h3 className="flex items-center gap-2 font-bold text-slate-900"><BellRing className="h-4 w-4 text-slate-400"/>{dt('People alerts')}</h3>
  <p className="mt-0.5 text-sm text-slate-500">{dt('Emails only. Nothing is sent on LINE.')}</p>
  <div className="mt-4 grid gap-4 lg:grid-cols-2">
   <fieldset className="space-y-3 rounded-xl bg-slate-50 p-4">
    <legend className="sr-only">{dt('Frequent sick leave')}</legend>
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><HeartPulse className="h-4 w-4 text-rose-500"/>{dt('Frequent sick leave')}<span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${sickOn?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-600'}`}>{sickOn?dt('On'):dt('Off')}</span></p>
    <p className="text-xs text-slate-500">{dt('Emails only the Head of People & Culture, as a prompt to check in. It is not a performance score.')}</p>
    <label className="block text-sm font-medium">{dt('Head of People & Culture email')}<input type="email" value={email} placeholder={dt('Leave empty to keep this off')} onChange={e=>setEmail(e.target.value)} className={field}/></label>
    <div className="grid grid-cols-2 gap-3">
     <label className="block text-sm font-medium">{dt('Sick leaves')}<input type="number" min={2} max={20} value={a.sickCount} onChange={e=>setA({...a,sickCount:e.target.valueAsNumber})} className={field}/></label>
     <label className="block text-sm font-medium">{dt('Within (days)')}<input type="number" min={14} max={365} value={a.sickWindowDays} onChange={e=>setA({...a,sickWindowDays:e.target.valueAsNumber})} className={field}/></label>
    </div>
   </fieldset>
   <fieldset className="space-y-3 rounded-xl bg-slate-50 p-4">
    <legend className="sr-only">{dt('Upcoming leave for team leads')}</legend>
    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-cyan-600"/>{dt('Upcoming leave for team leads')}<span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.leadNotice?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-600'}`}>{a.leadNotice?dt('On'):dt('Off')}</span></p>
    <p className="text-xs text-slate-500">{dt('Each morning, a lead gets one email listing approved leave in their team, so they can move work early. Reasons are never included.')}</p>
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={a.leadNotice} onChange={e=>setA({...a,leadNotice:e.target.checked})} className="h-4 w-4 rounded border-slate-300 text-cyan-600"/>{dt('Email team leads before leave starts')}</label>
    <label className="block text-sm font-medium">{dt('Days ahead')}<input type="number" min={1} max={14} value={a.leadDaysAhead} onChange={e=>setA({...a,leadDaysAhead:e.target.valueAsNumber})} className={field}/></label>
    <p className={`text-xs font-medium ${a.leads>0&&a.leadsWithEmail===a.leads?'text-emerald-700':'text-amber-700'}`}>{dt('{0} of {1} team leads have a work email',[a.leadsWithEmail,a.leads])}</p>
   </fieldset>
  </div>
  {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  <button type="button" disabled={busy} onClick={()=>void save()} className="mt-4 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?dt('Saving…'):dt('Save')}</button>
 </div>;
}
