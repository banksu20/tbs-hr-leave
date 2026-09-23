import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, ExternalLink } from 'lucide-react';
import type { Employee } from '@/data/mockEmployees';
import { MONTH_LABELS } from './overviewData';
import { LEAVE_META } from './leaveSheetUtils';

const tones={annual:'bg-amber-50 text-amber-900 border-amber-200',sick:'bg-rose-50 text-rose-900 border-rose-200',personal:'bg-sky-50 text-sky-900 border-sky-200'};
export default function TeamCalendar({employees, year}: {employees: Employee[]; year: string}) {
  const [month,setMonth]=useState(new Date().getMonth());
  const [status,setStatus]=useState('all');
  const [day,setDay]=useState<number|null>(null);
  const count=new Date(Number(year),month+1,0).getDate();
  const offset=(new Date(Number(year),month,1).getDay()+6)%7;
  const prefix=`${year}-${String(month+1).padStart(2,'0')}-`;
  const entries=employees.flatMap(e=>e.leaves.filter(l=>l.date.startsWith(prefix)&&l.status!=='Rejected'&&(status==='all'||l.status===status)).map(l=>({e,l})));
  const selected=entries.filter(({l})=>day===null||Number(l.date.slice(8))===day).sort((a,b)=>a.l.date.localeCompare(b.l.date)||a.e.name.localeCompare(b.e.name));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
  const changeMonth=(m:number)=>{setMonth(m);setDay(null);};
  return <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-5 border-b space-y-4">
      <div className="flex flex-wrap gap-3 justify-between items-center"><div><h2 className="font-bold text-xl flex gap-2 items-center"><CalendarDays className="text-sky-500"/>Team calendar</h2><p className="text-sm text-slate-500 mt-1">{new Set(entries.map(x=>x.e.id)).size} people with leave in {MONTH_LABELS[month]} · Click a day for details</p></div>
        <div className="flex flex-wrap gap-2 items-center">
        <a href="https://calendar.google.com/calendar/embed?src=50cpt8b361qli1poevjsqrt5vo%40group.calendar.google.com&ctz=Asia%2FBangkok" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-label="Open Google Calendar (opens in a new tab)">Open Google Calendar<ExternalLink size={16} aria-hidden="true"/></a>
        <button aria-label="Previous month" disabled={month===0} onClick={()=>changeMonth(month-1)} className="border rounded-lg p-2 disabled:opacity-30"><ChevronLeft size={18}/></button>
        <select aria-label="Calendar month" className="border rounded-lg p-2" value={month} onChange={e=>changeMonth(Number(e.target.value))}>{MONTH_LABELS.map((m,i)=><option key={m} value={i}>{m} {year}</option>)}</select>
        <button aria-label="Next month" disabled={month===11} onClick={()=>changeMonth(month+1)} className="border rounded-lg p-2 disabled:opacity-30"><ChevronRight size={18}/></button></div>
      </div>
      <div className="flex flex-wrap justify-between gap-3 items-center"><div className="flex flex-wrap gap-2 text-xs">{(['annual','sick','personal'] as const).map(t=><span key={t} className={`border rounded-full px-3 py-1 ${tones[t]}`}>{LEAVE_META[t].label}</span>)}<span className="border border-dashed rounded-full px-3 py-1">Dashed = pending</span></div>
        <select aria-label="Calendar status" className="border rounded-lg p-2 text-sm" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Approved & pending</option><option>Approved</option><option>Pending</option></select></div>
    </div>
    <div className="p-2 sm:p-4"><div className="grid grid-cols-7 gap-1 sm:gap-2">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="text-center py-2 text-xs font-semibold text-slate-500" key={d}>{d}</div>)}
      {Array.from({length:Math.ceil((count+offset)/7)*7},(_,i)=>{const n=i-offset+1;if(n<1||n>count)return <div key={`blank${i}`} className="rounded-lg bg-slate-50"/>;
        const date=prefix+String(n).padStart(2,'0');const items=entries.filter(({l})=>l.date===date);
        return <button aria-label={`${date}, ${items.length} leave entries`} aria-pressed={day===n} key={date} onClick={()=>setDay(n)} className={`flex flex-col items-stretch text-left rounded-lg border p-1 sm:p-2 min-h-20 sm:min-h-28 ${day===n?'ring-2 ring-sky-400 border-sky-400':'border-slate-100 hover:border-sky-300'} ${i%7>4?'bg-slate-50':'bg-white'}`}>
          <time dateTime={date} className={`inline-flex rounded-full w-6 h-6 items-center justify-center text-xs font-bold ${date===today?'bg-sky-500 text-white':'text-slate-600'}`}>{n}</time>
          <span className="sm:hidden block text-[10px] text-slate-500">{items.length?`${items.length} away`:''}</span>
          <div className="hidden sm:block">{items.slice(0,2).map(({e,l})=><div key={`${e.id}-${l.id}`} className={`truncate text-[10px] border rounded px-1 py-0.5 mt-1 ${tones[l.type]} ${l.status==='Pending'?'border-dashed':''}`}>{e.nickname||e.name}</div>)}{items.length>2&&<p className="text-[10px] text-slate-500 mt-1">+{items.length-2} more</p>}</div>
        </button>;
      })}
    </div></div>
    <div className="border-t p-5 bg-slate-50/60"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">{day===null?`${MONTH_LABELS[month]} leave list`:`${day} ${MONTH_LABELS[month]} ${year}`}</h3>{day!==null&&<button className="text-sm text-sky-700 font-semibold" onClick={()=>setDay(null)}>Show whole month</button>}</div>
      {!selected.length&&<p className="text-sm text-slate-500">No leave matches this selection.</p>}
      <div className="grid md:grid-cols-2 gap-2">{selected.map(({e,l})=><article key={`${e.id}-${l.id}`} className={`rounded-lg border p-3 ${tones[l.type]} ${l.status==='Pending'?'border-dashed':''}`}><div className="flex justify-between gap-2"><strong className="text-sm">{e.name}</strong><span className="text-xs">{l.status||'Approved'}</span></div><p className="text-xs mt-1">{l.date} · {LEAVE_META[l.type].short} · {l.days} day(s){l.halfDayPeriod?` · ${l.halfDayPeriod}`:''}</p><p className="text-xs mt-1">{e.department} · {e.empCode}</p></article>)}</div>
    </div>
  </section>;
}
