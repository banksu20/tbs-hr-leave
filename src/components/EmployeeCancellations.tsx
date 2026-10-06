import {useNotificationLanguage} from '@/hooks/useNotificationLanguage';
import {leaveTypeLabel} from '@/lib/leaveTypeLabel';
import {useEffect,useState} from 'react';
import liff from '@line/liff';
import {RefreshCw, CalendarDays, CalendarX2, Clock3} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {Button} from '@/components/ui/button';
interface Leave {id:number;status:string;type:string;days:number;period:string|null;dates:string[];revision:string;cancellation:null|{status:string;dates:string[];decision_reason:string|null};}
export default function EmployeeCancellations({userId,onChanged}:{userId:string|null;onChanged:()=>void}) {
 const [rows,setRows]=useState<Leave[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [expanded,setExpanded]=useState(false);
 const [selected,setSelected]=useState<Leave|null>(null),[dates,setDates]=useState<string[]>([]),[reason,setReason]=useState('');
 const {language}=useLanguage();
 useNotificationLanguage(userId);
 const th=language==='th';
 const text=(en:string,thai:string)=>th?thai:en;
 const formatDate=(date:string)=>new Date(date+'T12:00:00+07:00').toLocaleDateString(th?'th-TH':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'});
 const leaveName=(type:string)=>leaveTypeLabel(type,language);
 async function call(body?:unknown) {
  const token=liff.getAccessToken(); if(!token)throw new Error('Please reopen this app in LINE and sign in.');
  const response=await fetch('/api/cancellations',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load cancellations');return result;
 }
 async function refresh(){setLoading(true);setError('');try{const data=await call();setRows(data.requests);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{if(userId)void refresh();},[userId]);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const latestDate=(row:Leave)=>[...row.dates].sort().at(-1)??'';
 const relevant=[...rows].sort((a,b)=>latestDate(b).localeCompare(latestDate(a))||b.id-a.id);
 const eligibleDates=(row:Leave)=>row.dates.filter(d=>row.status==='Approved'?d>today:row.status==='Pending'&&d>=today);
 const latestEligible=relevant.find(row=>eligibleDates(row).length>0);
 return <section className="mx-4 mt-6 rounded-3xl bg-white border border-amber-200 p-4 space-y-3 shadow-sm">
  <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="rounded-2xl bg-amber-100 p-3 text-amber-600"><CalendarX2 className="h-6 w-6"/></span><h2 className="font-bold text-amber-900">{text('Recent leave history','ประวัติการลาล่าสุด')}</h2></div><Button variant="ghost" size="icon" aria-label={text('Refresh requests','รีเฟรชรายการ')} disabled={!userId||busy||loading} onClick={refresh}><RefreshCw className={`h-4 w-4 text-slate-500 ${loading?'animate-spin':''}`}/></Button></div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {loading?<p className="text-sm text-slate-500">{text('Loading…','กำลังโหลด…')}</p>:!relevant.length&&!error?<p className="text-sm text-slate-500 py-2">{text('No leave history yet','ยังไม่มีประวัติการลา')}</p>:(expanded?relevant:relevant.slice(0,1)).map((row)=><article key={row.id} className="rounded-2xl bg-amber-50/60 border border-amber-100 p-3 space-y-3">
   <div className="flex items-start justify-between gap-2"><div className="font-semibold text-sm">{leaveName(row.type)}<span className="block text-xs font-normal text-slate-500 mt-1">{row.days} {text('day(s)','วัน')}{row.period?` · ${row.period==='morning'?text('Morning','ช่วงเช้า'):text('Afternoon','ช่วงบ่าย')}`:''}</span></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${row.status==='Approved'?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{row.status==='Approved'?text('Approved','อนุมัติแล้ว'):row.status==='Rejected'?text('Rejected / cancelled','ไม่อนุมัติ / ยกเลิก'):text('Pending','รออนุมัติ')}</span></div>
   <p className="text-sm text-slate-600 flex items-start gap-2"><CalendarDays className="h-4 w-4 mt-0.5 shrink-0"/><span>{row.dates.map(formatDate).join(', ')}</span></p>
   {row.cancellation?.status==='Rejected'&&<p className="text-xs text-rose-700">{text('Cancellation declined','ไม่อนุมัติการยกเลิก')}{row.cancellation.decision_reason?` — ${row.cancellation.decision_reason}`:''}</p>}
   {row.cancellation?.status==='Expired'&&<p className="text-xs text-amber-800">{text('Leave changed. Please send a new request.','รายการลาเปลี่ยนแปลง กรุณาส่งคำขอใหม่')}</p>}
   {row.cancellation?.status==='Pending'?<div className="flex gap-2 items-center rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><Clock3 className="h-4 w-4 shrink-0"/>{text('Awaiting cancellation approval','รออนุมัติการยกเลิก')}</div>:row.id===latestEligible?.id&&eligibleDates(row).length>0?<Button className="w-full rounded-full bg-amber-400 text-amber-950 hover:bg-amber-500 font-bold border-0" size="sm" disabled={busy} onClick={()=>{setSelected(row);setDates(eligibleDates(row));setReason('');setError('');}}>{row.status==='Pending'?text('Cancel request','ยกเลิกคำขอ'):text('Request cancellation','ขอยกเลิกวันลา')}</Button>:null}
  </article>)}
  {relevant.length>1&&<Button variant="ghost" className="w-full" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?text('Show less','แสดงน้อยลง'):text('Show more','ดูประวัติทั้งหมด')}</Button>}
  {selected&&<div role="dialog" aria-modal="true" aria-label="Choose leave dates to cancel" className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"><div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-auto space-y-4">
   <h3 className="font-bold">{selected.status==='Pending'?text('Cancel leave','ยกเลิกวันลา'):text('Request cancellation','ขอยกเลิกวันลา')}</h3>
   <p className="text-sm">{text('Choose dates to cancel','เลือกวันที่ต้องการยกเลิก')}</p>
   {eligibleDates(selected).map(date=><label key={date} className="flex gap-2"><input type="checkbox" disabled={busy} checked={dates.includes(date)} onChange={e=>setDates(current=>e.target.checked?[...current,date]:current.filter(d=>d!==date))}/>{formatDate(date)}</label>)}
   <label className="block text-sm">{text('Reason (optional)','เหตุผล (ไม่บังคับ)')}<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} maxLength={1000} className="block border rounded p-2 w-full"/></label>
   <p className="text-sm">{selected.status==='Approved'?text('Leave stays approved until your boss agrees.','วันลายังคงเดิมจนกว่าหัวหน้าจะอนุมัติ'):text('Selected dates will be cancelled immediately.','วันที่เลือกจะถูกยกเลิกทันที')}</p>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>{text('Back','กลับ')}</Button><Button className="bg-amber-400 text-amber-950 hover:bg-amber-500 rounded-full" disabled={busy||!dates.length} onClick={async()=>{setBusy(true);setError('');try{await call({id:selected.id,revision:selected.revision,dates,reason});setSelected(null);await refresh();onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?text('Saving…','กำลังบันทึก…'):selected.status==='Approved'?text('Send to boss','ส่งคำขอ'):text('Confirm cancellation','ยืนยันยกเลิก')}</Button></div>
  </div></div>}
 </section>;
}
