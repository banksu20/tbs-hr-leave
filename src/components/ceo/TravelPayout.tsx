import {useCallback,useEffect,useMemo,useState} from 'react';
import {Banknote,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,Download,FileText,Flag,Loader2,MailCheck,Receipt,Wallet} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {useLanguage} from '@/hooks/useLanguage';
import {loadPayout,markPayoutPaid,type PayoutPerson} from '@/lib/hrAdmin';
import ReimbursementForm from './ReimbursementForm';
import {money,statusLabel,tripDate,type T,type TripStatus} from '@/lib/travel';

const thisMonth=()=>new Date(Date.now()+7*3600e3).toISOString().slice(0,7);
const shift=(m:string,by:number)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mo-1+by,1));return d.toISOString().slice(0,7);};
const initials=(n:string)=>n.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
const tones:Record<string,string>={submitted:'bg-sky-100 text-sky-800',flagged:'bg-amber-100 text-amber-800',approved:'bg-indigo-100 text-indigo-800',paid:'bg-emerald-100 text-emerald-800'};
const cell=(v:string|number)=>{const s=typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?`'${v}`:String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};

export default function TravelPayout({month,onMonth,onOpen}:{month:string;onMonth:(m:string)=>void;onOpen:(id:number)=>void}){
 const dt=useDashboardText();const {language}=useLanguage();const text:T=(en,th)=>language==='th'?th:en;
 const [people,setPeople]=useState<PayoutPerson[]|null>(null),[openRow,setOpenRow]=useState<string|null>(null),[confirm,setConfirm]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[formFor,setFormFor]=useState<string|null>(null);
 const load=useCallback(()=>{setPeople(null);setError('');loadPayout(month).then(setPeople).catch(e=>setError((e as Error).message));},[month]);
 useEffect(()=>{load();setConfirm(null);setNotice('');},[load]);
 const totals=useMemo(()=>{const l=people??[];const s=(k:'ready'|'held'|'paid')=>l.reduce((a,p)=>a+p[k],0);return {ready:s('ready'),held:s('held'),paid:s('paid'),flagged:l.reduce((a,p)=>a+p.flagged,0),paper:l.reduce((a,p)=>a+p.paperMissing,0),readyPeople:l.filter(p=>p.ready>0).length};},[people]);
 const label=new Date(`${month}-01T00:00:00Z`).toLocaleDateString(language==='th'?'th-TH':'en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
 const pay=async(userId?:string)=>{setBusy(true);setError('');setNotice('');try{const r=await markPayoutPaid(month,userId);setPeople(r.people);setNotice(dt('{0} trips marked as paid.',[r.marked]));}catch(e){setError((e as Error).message);}finally{setBusy(false);setConfirm(null);}};
 const download=()=>{
  const head=[dt('Code'),dt('Employee'),dt('Department'),dt('Trips'),dt('Km'),dt('Distance (THB)'),dt('Receipts (THB)'),dt('Total (THB)'),dt('Paid (THB)'),dt('Ready to pay (THB)'),dt('On hold (THB)'),dt('Paper receipts missing')];
  const rows=(people??[]).map(p=>[p.code,p.nickname?`${p.name} (${p.nickname})`:p.name,p.department??'',p.trips,p.km.toFixed(2),p.kmAmount.toFixed(2),p.receiptAmount.toFixed(2),p.total.toFixed(2),p.paid.toFixed(2),p.ready.toFixed(2),p.held.toFixed(2),p.paperMissing]);
  const blob=new Blob(['﻿'+[head,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`travel-payout-${month}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 };
 const tiles:[string,string,React.ReactNode,string][]=[[dt('Ready to pay'),`฿${money(totals.ready)}`,<Wallet key="w" className="h-4 w-4"/>,'bg-emerald-100 text-emerald-700'],[dt('Waiting for paper receipts'),`฿${money(totals.held)}`,<Receipt key="r" className="h-4 w-4"/>,'bg-indigo-100 text-indigo-700'],[dt('Paid'),`฿${money(totals.paid)}`,<CheckCircle2 key="c" className="h-4 w-4"/>,'bg-slate-100 text-slate-600'],[dt('Needs your check'),String(totals.flagged),<Flag key="f" className="h-4 w-4"/>,'bg-amber-100 text-amber-700']];
 return <div className="space-y-4">
  {formFor&&<ReimbursementForm month={month} userId={formFor} onClose={()=>{setFormFor(null);loadPayout(month).then(setPeople).catch(()=>undefined);}}/>}
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
    <button type="button" onClick={()=>onMonth(shift(month,-1))} aria-label={dt('Previous month')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4"/></button>
    <span className="min-w-36 text-center text-sm font-bold text-slate-900">{label}</span>
    <button type="button" disabled={month>=thisMonth()} onClick={()=>onMonth(shift(month,1))} aria-label={dt('Next month')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-4 w-4"/></button>
   </div>
   <button type="button" disabled={!people?.length} onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"><Download className="h-4 w-4"/>{dt('Download for payroll (CSV)')}</button>
  </div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(([k,v,icon,tone])=><div key={k} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-500">{k}</p><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span></div><p className="mt-2 truncate text-2xl font-extrabold text-slate-900">{people?v:'–'}</p></div>)}</div>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  {totals.ready>0&&<div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/10">
   <div className="w-full min-w-0 sm:w-auto sm:flex-1"><p className="text-xs font-medium text-slate-400">{dt('Ready to pay')}</p><p className="text-3xl font-extrabold tracking-tight">฿{money(totals.ready)}</p><p className="text-xs text-slate-400">{dt('{0} people · trips with paper receipts missing are held back',[totals.readyPeople])}</p></div>
   {confirm==='all'?<div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void pay()} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?dt('Saving…'):dt('Yes, mark ฿{0} paid',[money(totals.ready)])}</button><button type="button" onClick={()=>setConfirm(null)} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold">{dt('Cancel')}</button></div>
    :<button type="button" onClick={()=>setConfirm('all')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900"><Banknote className="h-4 w-4"/>{dt('Mark all ready as paid')}</button>}
  </div>}
  {people===null&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
  {people?.length===0&&<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-sm text-slate-500">{dt('No claims this month.')}</p></div>}
  {!!people?.length&&<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><ul className="divide-y divide-slate-100">{people.map(p=>{const open=openRow===p.userId;return <li key={p.userId}>
   <div className="flex flex-wrap items-center gap-4 px-4 py-3.5">
    <button type="button" onClick={()=>setOpenRow(open?null:p.userId)} aria-expanded={open} className="flex w-full min-w-0 items-center gap-3 text-left sm:w-auto sm:flex-1">
     <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(p.nickname||p.name)}</span>
     <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold text-slate-900">{p.nickname?`${p.nickname} · ${p.name}`:p.name}</span><span className="text-xs text-slate-400">{[p.code,p.department].filter(Boolean).join(' · ')}</span></span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"><span className="text-slate-500">{dt('{0} trips · {1} km',[p.trips,money(p.km)])}</span>
       {p.paid>0&&<span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">{dt('Paid ฿{0}',[money(p.paid)])}</span>}
       {p.held>0&&<span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">{dt('On hold ฿{0} · {1} paper missing',[money(p.held),p.paperMissing])}</span>}
       {p.flagged>0&&<span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800"><Flag className="h-2.5 w-2.5"/>{dt('{0} need your check',[p.flagged])}</span>}
       {p.formEmailedAt&&<span className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800"><MailCheck className="h-2.5 w-2.5"/>{dt('Form emailed {0}',[new Date(p.formEmailedAt).toLocaleDateString(language==='th'?'th-TH':'en-GB',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'})])}</span>}</span></span>
     <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition ${open?'rotate-180':''}`}/>
    </button>
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
     <button type="button" onClick={()=>setFormFor(p.userId)} className="order-last inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold whitespace-nowrap text-sky-800 hover:bg-sky-100 sm:order-none sm:w-auto"><FileText className="h-3.5 w-3.5"/>{dt('Reimbursement form')}</button>
     <div className="order-first flex-1 sm:order-none sm:flex-none sm:text-right"><p className="text-lg font-extrabold text-slate-900">฿{money(p.ready)}</p>{p.ready!==p.total&&<p className="text-[11px] text-slate-400">{dt('of ฿{0}',[money(p.total)])}</p>}</div>
     {p.ready>0&&(confirm===p.userId?<button type="button" disabled={busy} onClick={()=>void pay(p.userId)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{dt('Confirm')}</button>
      :<button type="button" onClick={()=>setConfirm(p.userId)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold whitespace-nowrap text-slate-700 hover:bg-slate-50">{dt('Mark paid')}</button>)}
    </div>
   </div>
   {open&&<div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2"><table className="w-full text-sm"><tbody>{p.lines.map(l=><tr key={l.id} onClick={()=>onOpen(l.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-white">
    <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-500">{tripDate(l.date,language)}</td>
    <td className="py-2 pr-3"><span className="block truncate font-medium text-slate-800">{l.clients.join(', ')}</span>{l.originalsWaiting>0&&<span className="text-[11px] text-indigo-700">{dt('Paper due')}</span>}</td>
    <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[l.status]??'bg-slate-100 text-slate-600'}`}>{statusLabel(l.status as TripStatus,text)}</span></td>
    <td className="py-2 pr-3 text-right text-xs whitespace-nowrap text-slate-500">{dt('{0} km',[money(l.km)])}</td>
    <td className="py-2 text-right font-bold whitespace-nowrap text-slate-900">฿{money(l.total)}</td></tr>)}</tbody></table></div>}
  </li>;})}</ul></div>}
  {!!people?.length&&<p className="flex items-start gap-1.5 text-xs text-slate-500"><FileText className="mt-px h-3.5 w-3.5 shrink-0"/>{dt('Open Reimbursement form to check the paper form and receipts, then print it or email it to accounting.')}</p>}
  {totals.paper>0&&<p className="text-xs text-slate-500">{dt('Mark paper receipts received on each trip to release the payment.')}</p>}
 </div>;
}
