import {useCallback,useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AlertTriangle,ArrowLeft,CheckCircle2,Clock3,Loader2,LogIn,LogOut,MapPin,PencilLine,Users,X,XCircle} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {attendanceAction,AttendanceError,clock,dayLabel,hours,loadAttendance,type AttendanceState,type Fix,type Shift} from '@/lib/attendance';
import {currentPosition} from '@/lib/travel';

type Draft={shiftId?:number;date:string;in:string;out:string;reason:string};
const field='mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-base focus:outline-hidden focus:ring-2 focus:ring-cyan-500';

export default function Attendance(){
 const navigate=useNavigate();
 const {language}=useLanguage();const th=language==='th';
 const text=(en:string,thai:string)=>th?thai:en;
 const [state,setState]=useState<AttendanceState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
 const load=useCallback(()=>loadAttendance().then(setState).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();},[load]);
 const run=async(key:string,fn:()=>Promise<AttendanceState>)=>{
  setBusy(key);setError('');
  try{setState(await fn());return true;}
  catch(e){const err=e as AttendanceError;if(err.state)setState(err.state);setError(err.message);return false;}
  finally{setBusy('');}
 };
 const punch=(action:'in'|'out')=>run(action,async()=>{const f=await currentPosition();return attendanceAction(action,{lat:f.lat,lng:f.lng,accuracy:f.accuracy});});
 const sendFix=async()=>{if(!draft)return;if(await run('fix',()=>attendanceAction('fix',{...draft,reason:draft.reason.trim()})))setDraft(null);};
 const startFix=(s?:Shift)=>setDraft(s?{shiftId:s.id,date:s.date,in:clock(s.in),out:s.out?clock(s.out):'',reason:''}:{date:state?.today??'',in:'09:00',out:'17:00',reason:''});
 const minDate=state?new Date(new Date(state.today+'T00:00:00Z').getTime()-31*864e5).toISOString().slice(0,10):'';
 const open=state?.open;
 const elapsed=open?Math.max(0,Math.floor((now-new Date(open.in).getTime())/60000)):0;
 const todayMin=(state?.shifts??[]).filter(s=>s.date===state?.today).reduce((a,s)=>a+s.workedMin,0);
 const statusChip=(f:Fix)=>f.status==='pending'?<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{text('Waiting','รออนุมัติ')}</span>:f.status==='approved'?<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{text('Approved','อนุมัติแล้ว')}</span>:<span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">{text('Not approved','ไม่อนุมัติ')}</span>;
 return <main className="min-h-dvh bg-slate-50 pb-12">
  <header className="bg-linear-to-br from-cyan-500 to-cyan-700 px-5 pt-6 pb-10 text-white">
   <button type="button" onClick={()=>navigate('/')} className="mb-5 flex items-center gap-1 text-sm font-semibold text-cyan-50"><ArrowLeft className="h-4 w-4"/>{text('Back','กลับ')}</button>
   <p className="text-xs font-bold uppercase tracking-wider text-cyan-100">TBS · {text('Part-time','พาร์ทไทม์')}</p>
   <h1 className="mt-1 text-2xl font-bold">{state&&!state.eligible&&state.team.length?text('Part-time team hours','เวลาทำงานของทีมพาร์ทไทม์'):text('Clock in','ลงเวลาทำงาน')}</h1>
   <p className="mt-1 text-sm text-cyan-50">{text('7 hours of work plus a 1-hour break each day.','ทำงาน 7 ชั่วโมง พัก 1 ชั่วโมงต่อวัน')}</p>
  </header>
  <section className="-mt-6 space-y-3 px-4">
   {state===null&&!error&&<div className="flex items-center gap-2 rounded-2xl bg-white p-5 text-slate-500 shadow-xs"><Loader2 className="h-5 w-5 animate-spin"/>{text('Loading…','กำลังโหลด…')}</div>}
   {error&&<p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></p>}
   {state&&!state.eligible&&!state.team.length&&<div className="rounded-2xl bg-white p-5 shadow-xs"><p className="font-bold text-slate-900">{text('Clock-in is not open for you yet','ยังไม่เปิดให้คุณลงเวลา')}</p><p className="mt-1 text-sm text-slate-500">{text('HR will let you know when it starts.','HR จะแจ้งเมื่อเริ่มใช้งาน')}</p></div>}
   {state?.eligible&&<div className={`rounded-2xl border p-5 shadow-xs ${open?'border-emerald-200 bg-emerald-50':'border-slate-100 bg-white'}`}>
    <div className="flex items-center gap-3">
     <span className={`grid h-12 w-12 place-items-center rounded-2xl ${open?'bg-emerald-500 text-white':'bg-slate-100 text-slate-500'}`}><Clock3 className="h-6 w-6"/></span>
     <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-500">{open?text('Working since','เริ่มงานเวลา'):text('Not clocked in · worked today','ยังไม่ได้ลงเวลา · วันนี้ทำไป')}</p>
      <p className="text-3xl font-bold tabular-nums text-slate-900">{open?clock(open.in):hours(todayMin)}{!open&&<span className="text-base font-medium text-slate-400"> {text('hrs','ชม.')}</span>}</p>
     </div>
     {open&&<div className="text-right"><p className="text-xs font-semibold text-emerald-700">{text('So far','ทำไปแล้ว')}</p><p className="text-xl font-bold tabular-nums text-emerald-700">{hours(elapsed)}</p></div>}
    </div>
    <button type="button" disabled={!!busy} onClick={()=>void punch(open?'out':'in')} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-60 ${open?'bg-rose-600':'bg-emerald-600'}`}>
     {busy==='in'||busy==='out'?<Loader2 className="h-5 w-5 animate-spin"/>:open?<LogOut className="h-5 w-5"/>:<LogIn className="h-5 w-5"/>}
     {busy==='in'||busy==='out'?text('Finding your location…','กำลังหาตำแหน่ง…'):open?text('Clock out','ลงเวลาออก'):text('Clock in','ลงเวลาเข้า')}
    </button>
    <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-slate-500"><MapPin className="h-3 w-3"/>{text(`Your location is saved when you press. It is erased after ${state.settings.locationDays} days.`,`ระบบบันทึกตำแหน่งตอนกด และลบทิ้งหลัง ${state.settings.locationDays} วัน`)}</p>
   </div>}
   {state?.eligible&&<div className="grid grid-cols-2 gap-3">
    <div className="rounded-2xl bg-white p-4 shadow-xs"><p className="text-xs font-semibold text-slate-500">{text('This week','สัปดาห์นี้')}</p><p className="text-2xl font-bold tabular-nums text-slate-900">{hours(state.weekMin)}<span className="text-sm font-medium text-slate-400"> {text('hrs','ชม.')}</span></p></div>
    <div className="rounded-2xl bg-white p-4 shadow-xs"><p className="text-xs font-semibold text-slate-500">{text('This month','เดือนนี้')}</p><p className="text-2xl font-bold tabular-nums text-slate-900">{hours(state.monthMin)}<span className="text-sm font-medium text-slate-400"> {text('hrs','ชม.')}</span></p></div>
   </div>}
   {draft&&<div className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-xs">
    <div className="flex items-center justify-between"><p className="font-bold text-slate-900">{draft.shiftId?text('Fix this shift','แก้ไขเวลากะนี้'):text('Add a missing day','เพิ่มวันที่ลืมลงเวลา')}</p><button type="button" aria-label={text('Close','ปิด')} onClick={()=>setDraft(null)} className="rounded-lg p-1 text-slate-400"><X className="h-5 w-5"/></button></div>
    <label className="mt-3 block text-sm font-medium text-slate-700">{text('Date','วันที่')}<input type="date" value={draft.date} min={minDate} max={state?.today} disabled={!!draft.shiftId} onChange={e=>setDraft({...draft,date:e.target.value})} className={field}/></label>
    <div className="mt-3 grid grid-cols-2 gap-3">
     <label className="block text-sm font-medium text-slate-700">{text('Clock in','เวลาเข้า')}<input type="time" value={draft.in} onChange={e=>setDraft({...draft,in:e.target.value})} className={field}/></label>
     <label className="block text-sm font-medium text-slate-700">{text('Clock out','เวลาออก')}<input type="time" value={draft.out} onChange={e=>setDraft({...draft,out:e.target.value})} className={field}/></label>
    </div>
    <label className="mt-3 block text-sm font-medium text-slate-700">{text('Why does it need fixing?','เหตุผลที่ต้องแก้ไข')}<textarea rows={2} maxLength={500} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})} placeholder={text('e.g. Forgot to clock out','เช่น ลืมกดลงเวลาออก')} className={field}/></label>
    <button type="button" disabled={!!busy||draft.reason.trim().length<3||!draft.in||!draft.out||!draft.date} onClick={()=>void sendFix()} className="mt-4 w-full rounded-xl bg-cyan-600 py-3.5 font-bold text-white disabled:opacity-50">{busy==='fix'?text('Sending…','กำลังส่ง…'):text('Send to my team lead','ส่งให้หัวหน้าทีม')}</button>
   </div>}
   {state?.eligible&&<div className="rounded-2xl bg-white shadow-xs">
    <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-bold text-slate-900">{text('My hours','เวลาทำงานของฉัน')}</h2>{!draft&&<button type="button" onClick={()=>startFix()} className="text-sm font-semibold text-cyan-700">{text('+ Missing day','+ วันที่ลืมลงเวลา')}</button>}</div>
    {state.shifts.length===0&&<p className="px-4 py-5 text-sm text-slate-500">{text('No shifts yet.','ยังไม่มีข้อมูล')}</p>}
    <ul className="divide-y divide-slate-100">{state.shifts.filter(s=>s.id!==open?.id).map(s=><li key={s.id} className="flex items-center gap-3 px-4 py-3">
     <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-slate-900">{dayLabel(s.date,th)}</p>
      <p className="text-xs text-slate-500 tabular-nums">{clock(s.in)} – {s.missedOut?<span className="font-semibold text-rose-600">{text('no clock-out','ไม่ได้ลงเวลาออก')}</span>:clock(s.out)}{s.edited&&<span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{text('fixed','แก้ไขแล้ว')}</span>}</p>
     </div>
     <div className="text-right">
      {s.missedOut?<button type="button" onClick={()=>startFix(s)} className="flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700"><PencilLine className="h-3.5 w-3.5"/>{text('Fix','แก้ไข')}</button>
       :<><p className="font-bold tabular-nums text-slate-900">{hours(s.workedMin)}</p>{s.overtimeMin>0&&<p className="text-[11px] font-semibold text-amber-700">+{hours(s.overtimeMin)} OT</p>}{!s.missedOut&&<button type="button" onClick={()=>startFix(s)} className="text-[11px] font-semibold text-cyan-700">{text('Fix','แก้ไข')}</button>}</>}
     </div>
    </li>)}</ul>
   </div>}
   {!!state?.fixes.length&&<div className="rounded-2xl bg-white p-4 shadow-xs">
    <h2 className="font-bold text-slate-900">{text('My fix requests','คำขอแก้ไขเวลา')}</h2>
    <ul className="mt-2 space-y-2">{state.fixes.map(f=><li key={f.id} className="rounded-xl bg-slate-50 p-3 text-sm">
     <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{dayLabel(f.date,th)} · {clock(f.in)}–{clock(f.out)}</span>{statusChip(f)}</div>
     <p className="mt-1 text-xs text-slate-500">{f.reason}</p>
     {f.note&&<p className="mt-1 text-xs text-slate-700">{text('Note','หมายเหตุ')}: {f.note}</p>}
     {f.status==='pending'&&<button type="button" disabled={!!busy} onClick={()=>void run('cancel',()=>attendanceAction('fix-cancel',{id:f.id}))} className="mt-2 text-xs font-semibold text-rose-700">{text('Cancel request','ยกเลิกคำขอ')}</button>}
    </li>)}</ul>
   </div>}
   {!!state?.team.length&&<div className="rounded-2xl bg-white p-4 shadow-xs">
    <h2 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-4 w-4 text-cyan-600"/>{text('My team','ทีมของฉัน')}</h2>
    <ul className="mt-2 divide-y divide-slate-100">{state.team.map(m=><li key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
     <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{m.name}</span><span className={`text-xs ${m.open?'font-semibold text-emerald-700':'text-slate-500'}`}>{m.open?text(`Working since ${clock(m.open)}`,`ทำงานตั้งแต่ ${clock(m.open)}`):text('Not clocked in','ยังไม่ลงเวลา')}</span></span>
     <span className="text-right text-xs text-slate-500 tabular-nums">{text('Today','วันนี้')} <b className="text-slate-900">{hours(m.todayMin)}</b><br/>{text('Week','สัปดาห์')} <b className="text-slate-900">{hours(m.weekMin)}</b></span>
    </li>)}</ul>
    {state.teamFixes.length>0&&<><h3 className="mt-3 text-sm font-bold text-amber-800">{text('Time fixes to check','คำขอแก้ไขเวลารอตรวจ')}</h3>
     <ul className="mt-2 space-y-2">{state.teamFixes.map(f=><li key={f.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <p className="font-semibold text-slate-900">{f.employee}</p>
      <p className="text-xs text-slate-700">{dayLabel(f.date,th)} · {clock(f.in)}–{clock(f.out)} · {hours(f.workedMin)} {text('hrs','ชม.')}{f.was&&<span className="text-slate-500"> ({text('was','เดิม')} {clock(f.was.in)}–{f.was.missedOut?'?':clock(f.was.out)})</span>}</p>
      <p className="mt-1 text-xs text-slate-600">{f.reason}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
       <button type="button" disabled={!!busy} onClick={()=>void run('d'+f.id,()=>attendanceAction('team-decide',{id:f.id,decision:'approve'}))} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{text('Approve','อนุมัติ')}</button>
       <button type="button" disabled={!!busy} onClick={()=>void run('d'+f.id,()=>attendanceAction('team-decide',{id:f.id,decision:'reject'}))} className="flex items-center justify-center gap-1 rounded-lg bg-white py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200 disabled:opacity-50"><XCircle className="h-4 w-4"/>{text('Reject','ไม่อนุมัติ')}</button>
      </div>
     </li>)}</ul></>}
   </div>}
  </section>
 </main>;
}
