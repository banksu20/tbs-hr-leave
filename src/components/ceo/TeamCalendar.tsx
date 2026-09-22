import { useState } from 'react';
import type { Employee } from '@/data/mockEmployees';

export default function TeamCalendar({employees, year}: {employees: Employee[]; year: string}) {
  const [month,setMonth]=useState(new Date().getMonth());
  const [status,setStatus]=useState('all');
  const count=new Date(Number(year),month+1,0).getDate();
  const offset=(new Date(Number(year),month,1).getDay()+6)%7;
  return <section className="bg-white rounded-xl border p-4 space-y-4">
    <div className="flex flex-wrap gap-4 items-center"><h2 className="font-bold text-lg">Team calendar · {year}</h2>
      <label>Month <select className="border rounded p-2" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,m)=><option key={m} value={m}>{new Date(2026,m,1).toLocaleString('en',{month:'long'})}</option>)}</select></label>
      <label>Status <select className="border rounded p-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Approved & pending</option><option>Approved</option><option>Pending</option></select></label>
    </div>
    <p className="text-sm text-slate-500">Uses the department and employee filters above. Pending leave is marked explicitly.</p>
    <div className="overflow-x-auto"><div className="grid grid-cols-7 min-w-[770px] gap-px bg-slate-200 border">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="bg-slate-100 p-2 font-semibold" key={d}>{d}</div>)}
      {Array.from({length:offset},(_,i)=><div key={`blank${i}`} className="bg-slate-50"/>)}
      {Array.from({length:count},(_,i)=>{
        const date=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
        const entries=employees.flatMap(e=>e.leaves.filter(l=>l.date===date&&l.status!=='Rejected'&&(status==='all'||l.status===status)).map(l=>({e,l})));
        return <div key={date} className="bg-white p-2 min-h-28"><time dateTime={date} className="font-semibold text-sm">{i+1}</time>
          {entries.map(({e,l})=><div key={`${e.id}-${l.id}`} className={`text-xs rounded p-1 mt-1 ${l.status==='Pending'?'bg-amber-50 border border-dashed border-amber-400':'bg-sky-50 border border-sky-100'}`}>
            <strong>{e.nickname||e.name}</strong><div>{l.type} · {l.days} day{l.days===1?'':'s'}{l.halfDayPeriod?` · ${l.halfDayPeriod}`:''}</div><div>{e.department} · {l.status}</div>
          </div>)}
        </div>;
      })}
    </div></div>
  </section>;
}
