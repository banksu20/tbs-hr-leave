import {useEffect,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {MessageCircleWarning} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {useDashboardText} from '@/hooks/useDashboardText';

export interface LineQuotaState {state:'ok'|'warn'|'low'|'full'|'unknown'|'unlimited';limit:number|null;used:number;threshold:number|null;percent:number|null;checkedAt:string|null;checkError:string|null;resetsAt:string;held:number;heldMessages:number;alertEmail:string|null;warnPct:number;reservePct:number;}

const tone={ok:'border-slate-200 bg-white',unknown:'border-slate-200 bg-white',unlimited:'border-slate-200 bg-white',warn:'border-amber-300 bg-amber-50',low:'border-orange-300 bg-orange-50',full:'border-rose-300 bg-rose-50'};
const bar={ok:'bg-emerald-500',unknown:'bg-slate-400',unlimited:'bg-emerald-500',warn:'bg-amber-500',low:'bg-orange-500',full:'bg-rose-600'};
const field='mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';

export default function LineQuota({quota}:{quota:LineQuotaState}){
 const dt=useDashboardText();
 const {language}=useLanguage();
 const client=useQueryClient();
 const [email,setEmail]=useState(quota.alertEmail??''),[warn,setWarn]=useState(quota.warnPct),[reserve,setReserve]=useState(quota.reservePct),[open,setOpen]=useState(false);
 useEffect(()=>{setEmail(quota.alertEmail??'');setWarn(quota.warnPct);setReserve(quota.reservePct);},[quota.alertEmail,quota.warnPct,quota.reservePct]);
 const save=useMutation({mutationFn:async()=>{const r=await fetch('/api/cancellations?view=boss&delivery=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'quota',alertEmail:email.trim(),warnPct:warn,reservePct:reserve})}),b=await r.json();if(!r.ok||b.ok===false)throw Error(b.error||dt('Save failed'));},onSuccess:()=>client.invalidateQueries({queryKey:['delivery-status']})});
 const date=(v:string|null)=>v?new Date(v).toLocaleString(language==='th'?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):dt('Not checked yet');
 const width=quota.limit?Math.min(100,Math.round(quota.used*100/quota.limit)):0;
 const status={ok:dt('Plenty left this month.'),unknown:dt('Waiting for the first check with LINE.'),unlimited:dt('This LINE plan has no monthly limit.'),
  warn:dt('Over {0}% used. Nothing is held yet.',[quota.warnPct]),
  low:dt('Almost used up. SOP and travel claim messages now wait, so leave requests and decisions still go out.'),
  full:dt('Used up. Leave requests go to approvers by email. Other messages wait and go out after the reset.')}[quota.state];
 return <div className={`rounded-lg border p-4 space-y-3 ${tone[quota.state]}`}>
  <div className="flex flex-wrap items-baseline justify-between gap-2">
   <strong className="flex items-center gap-2">{quota.state!=='ok'&&quota.state!=='unlimited'&&quota.state!=='unknown'&&<MessageCircleWarning className="h-4 w-4 text-rose-600"/>}{dt('LINE messages this month')}</strong>
   <span className="text-lg font-bold tabular-nums">{quota.used.toLocaleString()}{quota.limit!=null&&<span className="text-sm font-medium text-slate-500"> / {quota.limit.toLocaleString()}</span>}</span>
  </div>
  {quota.limit!=null&&<div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used}><div className={`h-full ${bar[quota.state]}`} style={{width:width+'%'}}/></div>}
  <p className={quota.state==='full'?'font-medium text-rose-800':quota.state==='low'?'font-medium text-orange-800':quota.state==='warn'?'text-amber-800':'text-slate-600'}>{status}</p>
  {quota.held>0&&<p className="font-medium text-slate-800">{dt('{0} messages waiting for the reset',[quota.heldMessages])} · {dt('Resets')} {date(quota.resetsAt)}</p>}
  <p className="text-xs text-slate-500">{dt('Checked with LINE')}: {date(quota.checkedAt)}{quota.held===0&&quota.state!=='unlimited'&&quota.limit!=null&&<> · {dt('Resets')} {date(quota.resetsAt)}</>}</p>
  {quota.checkError&&<p role="alert" className="text-xs text-red-700">{dt('LINE check failed:')} {quota.checkError}</p>}
  <button type="button" className="text-xs text-cyan-700 underline" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?dt('Hide settings'):dt('Warning settings')}</button>
  {open&&<div className="grid gap-3 sm:grid-cols-3">
   <label className="block text-sm font-medium sm:col-span-3">{dt('Email a warning to')}<input type="email" value={email} placeholder={dt('Leave empty for no email')} onChange={e=>setEmail(e.target.value)} className={field}/></label>
   <label className="block text-sm font-medium">{dt('First warning at (%)')}<input type="number" min={50} max={95} value={warn} onChange={e=>setWarn(e.target.valueAsNumber)} className={field}/></label>
   <label className="block text-sm font-medium">{dt('Keep for leave (%)')}<input type="number" min={1} max={30} value={reserve} onChange={e=>setReserve(e.target.valueAsNumber)} className={field}/></label>
   <div className="flex items-end"><button type="button" disabled={save.isPending} onClick={()=>save.mutate()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{save.isPending?dt('Saving…'):dt('Save')}</button></div>
   <p className="text-xs text-slate-500 sm:col-span-3">{dt('The last {0}% of the monthly limit is kept for leave requests and decisions. SOP and travel claim messages wait once it is reached.',[reserve||0])}</p>
   {save.error&&<p role="alert" className="text-sm text-red-700 sm:col-span-3">{save.error.message}</p>}
   {save.isSuccess&&<p className="text-sm text-emerald-700 sm:col-span-3">{dt('Saved.')}</p>}
  </div>}
 </div>;
}
