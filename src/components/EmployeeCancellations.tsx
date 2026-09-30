import {useEffect,useState} from 'react';
import liff from '@line/liff';
import {Button} from '@/components/ui/button';
interface Leave {id:number;status:string;type:string;days:number;period:string|null;dates:string[];revision:string;cancellation:null|{status:string;dates:string[];decision_reason:string|null};}
export default function EmployeeCancellations({userId,onChanged}:{userId:string|null;onChanged:()=>void}) {
 const [rows,setRows]=useState<Leave[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [visible,setVisible]=useState(5);
 const [selected,setSelected]=useState<Leave|null>(null),[dates,setDates]=useState<string[]>([]),[reason,setReason]=useState('');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 async function call(body?:unknown) {
  const token=liff.getAccessToken(); if(!token)throw new Error('Please reopen this app in LINE and sign in.');
  const response=await fetch('/api/cancellations',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load cancellations');return result;
 }
 async function refresh(){setLoading(true);setError('');try{const data=await call();setRows(data.requests);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{if(userId)void refresh();},[userId]);
 const relevant=rows.filter(row=>row.status==='Pending'||row.dates.some(d=>d>today)||row.cancellation?.status==='Pending');
 return <section className="mx-4 mt-6 rounded-2xl bg-white border p-4 space-y-3">
  <div className="flex items-center justify-between"><h2 className="font-bold">Cancel leave / ยกเลิกวันลา</h2><Button variant="outline" size="sm" disabled={!userId||busy||loading} onClick={refresh}>Refresh</Button></div>
  <p className="text-sm text-slate-600">Pending leave cancels immediately. Approved leave needs your boss’s approval; your leave and balance stay unchanged while waiting.</p>
  <p className="text-xs text-slate-500">ลาที่ยังไม่อนุมัติยกเลิกได้ทันที • ลาที่อนุมัติแล้วต้องรอหัวหน้าอนุมัติการยกเลิก • วันลาวันนี้หรือย้อนหลังให้ติดต่อหัวหน้า</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {loading?<p>Loading…</p>:!relevant.length&&!error?<p className="text-sm">No active leave requests.</p>:relevant.slice(0,visible).map(row=><article key={row.id} className="border rounded-xl p-3 space-y-2">
   <div className="font-semibold">#{row.id} · {row.type} · {row.days} day(s) {row.period??''}</div><p className="text-sm">{row.dates.join(', ')} · {row.status}</p>
   {row.cancellation&&<p className="text-sm text-amber-800">Cancellation: {row.cancellation.status}{row.cancellation.decision_reason?` — ${row.cancellation.decision_reason}`:''}</p>}
   {row.cancellation?.status==='Pending'?<p className="text-sm">Waiting for your boss. Your leave is still approved.</p>:<Button size="sm" variant="outline" disabled={busy||row.status==='Approved'&&!row.dates.some(d=>d>today)} onClick={()=>{setSelected(row);setDates(row.dates.filter(d=>row.status==='Pending'||d>today));setReason('');}}>{row.status==='Pending'?'Cancel pending leave':'Request cancellation'}</Button>}
  </article>)}
  {relevant.length>visible&&<Button variant="outline" onClick={()=>setVisible(n=>n+5)}>Show more requests</Button>}
  {selected&&<div role="dialog" aria-modal="true" aria-label="Choose leave dates to cancel" className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-auto space-y-4">
   <h3 className="font-bold">{selected.status==='Pending'?'Cancel pending leave':'Request cancellation'} #{selected.id}</h3>
   <p className="text-sm">Select the dates to cancel. Other dates will stay unchanged.</p>
   {selected.dates.map(date=><label key={date} className="flex gap-2"><input type="checkbox" disabled={busy||selected.status==='Approved'&&date<=today} checked={dates.includes(date)} onChange={e=>setDates(current=>e.target.checked?[...current,date]:current.filter(d=>d!==date))}/>{date}</label>)}
   <label className="block text-sm">Reason (optional)<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} maxLength={1000} className="block border rounded p-2 w-full"/></label>
   <p className="text-sm">{selected.status==='Approved'?'Your leave remains approved until your boss approves this cancellation.':'These selected dates will be cancelled immediately.'}</p>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Back</Button><Button disabled={busy||!dates.length} onClick={async()=>{setBusy(true);setError('');try{await call({id:selected.id,revision:selected.revision,dates,reason});setSelected(null);await refresh();onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':selected.status==='Approved'?'Send to boss':'Confirm cancellation'}</Button></div>
  </div></div>}
 </section>;
}
