import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,XCircle,Loader2,CalendarDays} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {leaveTypeLabel} from '@/lib/leaveTypeLabel';
import {halfDayLabel} from '@/lib/halfDayLabel';

interface Details {id:number;name:string;department:string;type:string;dates:string[];days:number;period:string|null;reason:string;status:string;balance:string|null}
interface Review {request:Details;approver:string;expiresAt:string;usedAction:string|null;expired:boolean;canDecide:boolean}
type Action='approve'|'reject';

function readLink(){
 const params=new URLSearchParams(location.search);
 const id=params.get('id')??'';
 const preset=params.get('action');
 let token=params.get('t')??'';
 try{
  if(token)sessionStorage.setItem(`email-decision:${id}`,token);else token=sessionStorage.getItem(`email-decision:${id}`)??'';
 }catch{}
 if(params.has('t')){params.delete('t');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);}
 return {id,token,preset:preset==='approve'||preset==='reject'?preset as Action:null};
}

export default function EmailDecision(){
 const link=useMemo(readLink,[]);
 const {language}=useLanguage();const th=language==='th';
 const text=(en:string,thai:string)=>th?thai:en;
 const [review,setReview]=useState<Review|null>(null),[details,setDetails]=useState<Details|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<Action|null>(link.preset),[reason,setReason]=useState(''),[done,setDone]=useState<Action|null>(null);
 const call=useCallback(async(action:'review'|Action,extra:Record<string,string>={})=>{
  const r=await fetch('/api/email-decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:link.id,token:link.token,action,...extra})});
  const b=await r.json().catch(()=>({error:'Service unavailable'}));
  if(b?.request)setDetails(b.request);
  if(!r.ok||!b.ok)throw new Error(b?.error||'Service unavailable');
  return b;
 },[link]);
 useEffect(()=>{
  const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';document.head.appendChild(meta);
  return ()=>{meta.remove();};
 },[]);
 useEffect(()=>{
  let active=true;
  (async()=>{try{const b=await call('review');if(active)setReview(b);}catch(e){if(active)setError((e as Error).message);}finally{if(active)setLoading(false);}})();
  return ()=>{active=false;};
 },[call]);
 const decide=async(action:Action)=>{
  setBusy(true);setError('');
  try{await call(action,action==='reject'&&reason.trim()?{reason:reason.trim()}:{});setDone(action);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 };
 const formatDate=(d:string)=>new Date(d+'T12:00:00+07:00').toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'});
 const request=details??review?.request??null;
 const half=request&&(request.period||Number(request.days)/Math.max(request.dates.length,1)===0.5);
 const closed=review&&!review.canDecide&&!done;
 const statusNote=!review||!request?'':review.usedAction?text(`You already ${review.usedAction==='approve'?'approved':'rejected'} this request.`,`คุณ${review.usedAction==='approve'?'อนุมัติ':'ไม่อนุมัติ'}คำขอนี้แล้ว`)
  :!['pending','awaiting','awaiting approval'].includes(request.status.toLowerCase())?text(`This request is already ${request.status.toLowerCase()}.`,`คำขอนี้${request.status==='Approved'?'อนุมัติ':'ดำเนินการ'}แล้ว`)
  :review.expired?text('This link has expired. Please use the HR dashboard.','ลิงก์นี้หมดอายุแล้ว กรุณาใช้หน้า HR dashboard'):'';
 return <main className="min-h-dvh bg-slate-50 px-4 py-8 grid place-items-center font-sans">
  <section className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
   <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">{text('TBS HR · Leave approval','TBS HR · อนุมัติการลา')}</p>
   {loading&&<div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>{text('Loading request…','กำลังโหลดคำขอ…')}</div>}
   {!loading&&!request&&<div className="space-y-2"><h1 className="text-xl font-bold text-slate-900">{text('Link not valid','ลิงก์ไม่ถูกต้อง')}</h1><p className="text-sm text-slate-600">{text('This approval link is not valid. Please use the HR dashboard.','ลิงก์อนุมัตินี้ใช้ไม่ได้ กรุณาใช้หน้า HR dashboard')}</p><a className="inline-block text-sm font-semibold text-cyan-700 underline" href="/ceo">{text('Open HR dashboard','เปิด HR dashboard')}</a></div>}
   {request&&<>
    <div><h1 className="text-2xl font-bold text-slate-900 leading-tight">{request.name}</h1><p className="text-sm text-slate-500">{request.department}</p></div>
    <dl className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3 text-sm">
     <div className="flex justify-between gap-3"><dt className="text-slate-500">{text('Type','ประเภท')}</dt><dd className="font-semibold text-slate-800 text-right">{leaveTypeLabel(request.type,language)}</dd></div>
     <div className="flex justify-between gap-3"><dt className="text-slate-500">{text('Days','จำนวนวัน')}</dt><dd className="font-semibold text-slate-800 text-right">{Number(request.days)}{half?` · ${halfDayLabel(request.period,th?'th':'en')}`:''}</dd></div>
     <div className="flex justify-between gap-3"><dt className="text-slate-500 flex items-center gap-1"><CalendarDays className="h-4 w-4"/>{text('Dates','วันที่')}</dt><dd className="font-semibold text-slate-800 text-right space-y-0.5">{request.dates.map(d=><div key={d}>{formatDate(d)}</div>)}</dd></div>
     {request.reason&&<div><dt className="text-slate-500">{text('Reason','เหตุผล')}</dt><dd className="mt-1 whitespace-pre-wrap text-slate-800">{request.reason}</dd></div>}
     {request.balance&&<div><dt className="text-slate-500">{text('Left after this request','คงเหลือหลังคำขอนี้')}</dt><dd className="mt-1 font-semibold text-slate-800 space-y-0.5">{request.balance.replace(/^[^:]*:\s*/,'').split(' · ').map(line=><div key={line}>{line}</div>)}</dd></div>}
    </dl>
    {done&&<div className={`flex items-start gap-3 rounded-2xl p-4 ${done==='approve'?'bg-emerald-50 text-emerald-800':'bg-rose-50 text-rose-800'}`}>{done==='approve'?<CheckCircle2 className="h-6 w-6 shrink-0"/>:<XCircle className="h-6 w-6 shrink-0"/>}<div><p className="font-bold">{done==='approve'?text('Leave approved','อนุมัติการลาแล้ว'):text('Leave rejected','ไม่อนุมัติการลาแล้ว')}</p><p className="text-sm">{text('Saved in the HR system. You can close this page.','บันทึกในระบบ HR แล้ว ปิดหน้านี้ได้เลย')}</p></div></div>}
    {closed&&<p className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">{statusNote||error}</p>}
    {!done&&review?.canDecide&&<div className="space-y-3">
     {mode==='reject'&&<label className="block text-sm text-slate-600">{text('Reason for rejecting (optional)','เหตุผลที่ไม่อนุมัติ (ไม่บังคับ)')}<textarea value={reason} disabled={busy} maxLength={1000} onChange={e=>setReason(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 p-3 text-slate-900"/></label>}
     {mode?<>
      <button type="button" disabled={busy} onClick={()=>void decide(mode)} className={`w-full rounded-2xl py-4 text-base font-bold text-white disabled:opacity-60 ${mode==='approve'?'bg-cyan-600 hover:bg-cyan-700':'bg-rose-600 hover:bg-rose-700'}`}>{busy?text('Saving…','กำลังบันทึก…'):mode==='approve'?text('Confirm approve','ยืนยันอนุมัติ'):text('Confirm reject','ยืนยันไม่อนุมัติ')}</button>
      <button type="button" disabled={busy} onClick={()=>{setMode(mode==='approve'?'reject':'approve');setError('');}} className="w-full text-sm font-semibold text-slate-500 underline">{mode==='approve'?text('Reject instead','เปลี่ยนเป็นไม่อนุมัติ'):text('Approve instead','เปลี่ยนเป็นอนุมัติ')}</button>
     </>:<div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={()=>setMode('approve')} className="rounded-2xl bg-cyan-600 py-4 font-bold text-white hover:bg-cyan-700">{text('Approve','อนุมัติ')}</button>
      <button type="button" onClick={()=>setMode('reject')} className="rounded-2xl border border-rose-300 py-4 font-bold text-rose-700 hover:bg-rose-50">{text('Reject','ไม่อนุมัติ')}</button>
     </div>}
    </div>}
    {error&&!closed&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
   </>}
  </section>
 </main>;
}
