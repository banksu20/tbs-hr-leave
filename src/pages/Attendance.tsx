import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useNavigate} from 'react-router-dom';
import {AlertTriangle,ArrowLeft,Building2,Camera,Check,CheckCircle2,Clock3,Home,Loader2,LogIn,LogOut,MapPin,PencilLine,Plus,ShieldCheck,X} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {attendanceAction,AttendanceError,clock,dayLabel,hours,loadAttendance,weekdays,type AttendanceState,type Fix,type Shift} from '@/lib/attendance';
import {currentPosition,prepareFile} from '@/lib/travel';

type Draft={shiftId?:number;date:string;in:string;out:string;reason:string};
type Stage='photo'|'location'|'saving';
const field='mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base focus:border-emerald-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-200';
const shell='rounded-3xl bg-white shadow-md shadow-slate-200/60',card=shell+' p-5';
const addDays=(date:string,n:number)=>new Date(new Date(date+'T00:00:00Z').getTime()+n*864e5).toISOString().slice(0,10);
const isoDow=(date:string)=>{const d=new Date(date+'T00:00:00Z').getUTCDay();return d===0?7:d;};

function Ring({value,target,live,label,sub}:{value:number;target:number;live:boolean;label:string;sub:string}){
 const r=54,c=2*Math.PI*r,pct=Math.min(1,target?value/target:0),over=value>target;
 return <div className="relative mx-auto h-40 w-40">
  <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
   <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10"/>
   <circle cx="64" cy="64" r={r} fill="none" stroke={over?'#f59e0b':'#10b981'} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c*(1-pct)} className="transition-[stroke-dashoffset] duration-700"/>
  </svg>
  <div className="absolute inset-0 flex flex-col items-center justify-center">
   {live&&<span className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"/></span>{label}</span>}
   <span className="text-3xl font-extrabold tabular-nums text-slate-900">{hours(value)}</span>
   <span className="text-xs font-medium text-slate-500">{sub}</span>
  </div>
 </div>;
}

export default function Attendance(){
 const navigate=useNavigate();
 const {language}=useLanguage();const th=language==='th';
 const text=useCallback((en:string,thai:string)=>th?thai:en,[th]);
 const [state,setState]=useState<AttendanceState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[now,setNow]=useState(Date.now()),[stage,setStage]=useState<Stage|null>(null),[done,setDone]=useState('');
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t);},[]);
 const load=useCallback(()=>loadAttendance().then(setState).catch(e=>setError((e as Error).message)),[]);
 useEffect(()=>{void load();},[load]);
 const run=async(key:string,fn:()=>Promise<AttendanceState>)=>{
  setBusy(key);setError('');
  try{setState(await fn());return true;}
  catch(e){const err=e as AttendanceError;if(err.state)setState(err.state);setError(err.message);return false;}
  finally{setBusy('');setStage(null);}
 };
 const camera=useRef<HTMLInputElement>(null),[action,setAction]=useState<'in'|'out'>('in');
 const takePhoto=(a:'in'|'out')=>{setAction(a);setError('');setDone('');camera.current?.click();};
 const punch=(file?:File)=>{
  if(!file)return;
  void run(action,async()=>{
   try{
    setStage('photo');const p=await prepareFile(file);if(p.preview)URL.revokeObjectURL(p.preview);
    setStage('location');const f=await currentPosition();
    setStage('saving');const s=await attendanceAction(action,{lat:f.lat,lng:f.lng,accuracy:f.accuracy,photo:p.content});
    setDone(action);return s;
   }finally{if(camera.current)camera.current.value='';}
  });
 };
 useEffect(()=>{if(!done)return;const t=setTimeout(()=>setDone(''),5000);return()=>clearTimeout(t);},[done]);
 const sendFix=async()=>{if(!draft)return;if(await run('fix',()=>attendanceAction('fix',{...draft,reason:draft.reason.trim()})))setDraft(null);};
 const startFix=(s?:Shift)=>setDraft(s?{shiftId:s.id,date:s.date,in:clock(s.in),out:s.out?clock(s.out):'',reason:''}:{date:state?.today??'',in:'09:00',out:'17:00',reason:''});
 const minDate=state?addDays(state.today,-31):'';
 const open=state?.open;
 const elapsed=open?Math.max(0,Math.floor((now-new Date(open.in).getTime())/60000)):0;
 const wfh=state?.kind==='wfh',targetMin=state?.settings.workMinutes??420,officeDay=!!state&&!state.workToday&&!state.open;
 const todayDone=(state?.shifts??[]).filter(s=>s.date===state?.today&&s.id!==open?.id).reduce((a,s)=>a+s.workedMin,0);
 const liveWorked=open?Math.max(0,elapsed-(elapsed>(state?.settings.breakAfterMinutes??300)?(state?.settings.breakMinutes??60):0)):0;
 const todayMin=todayDone+liveWorked;
 const week=useMemo(()=>{
  if(!state)return [];
  const monday=addDays(state.today,1-isoDow(state.today));
  return Array.from({length:7},(_,i)=>{const date=addDays(monday,i);const min=state.shifts.filter(s=>s.date===date).reduce((a,s)=>a+s.workedMin,0)+(date===state.today?liveWorked:0);
   return {date,min,future:date>state.today,today:date===state.today,off:state.kind==='wfh'&&!state.wfhDays.includes(i+1),missed:state.shifts.some(s=>s.date===date&&s.missedOut)};});
 },[state,liveWorked]);
 const weekMax=Math.max(targetMin,...week.map(d=>d.min));
 const nowDate=new Date(now);
 const statusChip=(f:Fix)=>f.status==='pending'?<span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">{text('Waiting for HR','รอ HR')}</span>:f.status==='approved'?<span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">{text('Approved','อนุมัติแล้ว')}</span>:<span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">{text('Not approved','ไม่อนุมัติ')}</span>;
 const steps:[Stage,ReactNode,string][]=[['photo',<Camera key="c" className="h-4 w-4"/>,text('Photo','ถ่ายรูป')],['location',<MapPin key="m" className="h-4 w-4"/>,text('Location','ตำแหน่ง')],['saving',<Check key="s" className="h-4 w-4"/>,text('Saved','บันทึก')]];
 const stageIndex=stage?steps.findIndex(s=>s[0]===stage):-1;
 const history=(state?.shifts??[]).filter(s=>s.id!==open?.id);
 return <main className="min-h-dvh bg-slate-50 pb-16">
  <header className="relative overflow-hidden rounded-b-[2rem] bg-linear-to-br/srgb from-emerald-500 via-teal-600 to-cyan-700 px-5 pt-6 pb-20 text-white">
   <span className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10"/><span className="pointer-events-none absolute bottom-0 -left-10 h-32 w-32 rounded-full bg-white/5"/>
   <div className="relative md:mx-auto md:max-w-2xl">
    <div className="mb-5 flex items-center justify-between gap-2">
     <button type="button" onClick={()=>navigate('/')} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1.5 pr-3.5 pl-2.5 text-sm font-semibold backdrop-blur-sm"><ArrowLeft className="h-4 w-4"/>{text('Back','กลับ')}</button>
     {state?.eligible&&<span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">{wfh?<Home className="h-3.5 w-3.5"/>:<Clock3 className="h-3.5 w-3.5"/>}{wfh?text('Work from home','ทำงานที่บ้าน'):text('Part-time','พาร์ทไทม์')}</span>}
    </div>
    <p className="text-sm font-medium text-emerald-50">{nowDate.toLocaleDateString(th?'th-TH':'en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Bangkok'})}</p>
    <h1 className="text-[40px] leading-none font-extrabold tabular-nums">{nowDate.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})}</h1>
    <div className="mt-4 grid grid-cols-3 gap-2">
     {[[text('Today','วันนี้'),hours(todayMin)],[text('This week','สัปดาห์นี้'),hours((state?.weekMin??0)+liveWorked)],[text('This month','เดือนนี้'),hours((state?.monthMin??0)+liveWorked)]].map(([k,v])=><div key={k} className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm"><p className="text-[11px] font-medium text-emerald-50">{k}</p><p className="truncate text-lg font-extrabold tabular-nums">{state?.eligible?v:'–'}<span className="text-xs font-semibold text-emerald-100"> {text('h','ชม.')}</span></p></div>)}
    </div>
   </div>
  </header>
  <section className="relative -mt-12 space-y-4 px-4 md:mx-auto md:max-w-2xl">
   {state===null&&!error&&<div className={card+' flex items-center gap-3 text-slate-500'}><Loader2 className="h-5 w-5 animate-spin text-emerald-600"/>{text('Loading…','กำลังโหลด…')}</div>}
   {error&&<p role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 shadow-md shadow-slate-200/60"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></p>}
   {done&&<p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 shadow-md shadow-slate-200/60"><CheckCircle2 className="h-5 w-5 shrink-0"/>{done==='in'?text('Clocked in. Have a good day!','ลงเวลาเข้าแล้ว ขอให้เป็นวันที่ดี!'):text('Clocked out. Thanks for your work today!','ลงเวลาออกแล้ว ขอบคุณสำหรับวันนี้!')}</p>}
   {state&&!state.eligible&&<div className={card+' text-center'}>
    <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Clock3 className="h-7 w-7"/></span>
    <p className="mt-3 text-lg font-bold text-slate-900">{text('Clock-in is not open for you yet','ยังไม่เปิดให้คุณลงเวลา')}</p>
    <p className="mt-1 text-sm text-slate-500">{text('HR will let you know when it starts.','HR จะแจ้งเมื่อเริ่มใช้งาน')}</p>
   </div>}
   {state?.eligible&&officeDay&&<div className={card+' text-center'}>
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-linear-to-br/srgb from-slate-100 to-slate-200 text-slate-500"><Building2 className="h-8 w-8"/></span>
    <p className="mt-3 text-xl font-extrabold text-slate-900">{text('Office day today','วันนี้เข้าออฟฟิศ')}</p>
    <p className="mt-1 text-sm text-slate-500">{text('No clock-in needed. Come back on your work-from-home days.','ไม่ต้องลงเวลา กลับมาลงเวลาในวันทำงานที่บ้าน')}</p>
    <p className="mt-3 text-xs font-semibold text-slate-500">{text('Your work-from-home days','วันทำงานที่บ้านของคุณ')}: <span className="text-emerald-700">{weekdays(state.wfhDays,th)}</span></p>
   </div>}
   {state?.eligible&&!officeDay&&<div className={card}>
    <div className="flex items-center justify-between">
     <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${open?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{open?text(`Working since ${clock(open.in)}`,`ทำงานตั้งแต่ ${clock(open.in)}`):text('Not clocked in','ยังไม่ได้ลงเวลา')}</span>
     <span className="text-xs font-medium text-slate-500">{text(`Goal ${hours(targetMin)} h`,`เป้าหมาย ${hours(targetMin)} ชม.`)}</span>
    </div>
    <div className="mt-3"><Ring value={todayMin} target={targetMin} live={!!open} label={text('Live','กำลังทำงาน')} sub={todayMin>=targetMin?text('Goal reached','ครบเป้าแล้ว'):text(`${hours(targetMin-todayMin)} h to go`,`อีก ${hours(targetMin-todayMin)} ชม.`)}/></div>
    <button type="button" disabled={!!busy} onClick={()=>takePhoto(open?'out':'in')} className={`mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-lg font-extrabold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-70 ${open?'bg-linear-to-r/srgb from-rose-500 to-rose-600 shadow-rose-200':'bg-linear-to-r/srgb from-emerald-500 to-teal-600 shadow-emerald-200'}`}>
     {busy==='in'||busy==='out'?<Loader2 className="h-5 w-5 animate-spin"/>:open?<LogOut className="h-5 w-5"/>:<LogIn className="h-5 w-5"/>}
     {busy==='in'||busy==='out'?text('Saving…','กำลังบันทึก…'):open?text('Clock out','ลงเวลาออก'):text('Clock in','ลงเวลาเข้า')}
     {!busy&&<span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold"><Camera className="h-3.5 w-3.5"/>{text('Photo','ถ่ายรูป')}</span>}
    </button>
    <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" onChange={e=>punch(e.target.files?.[0])}/>
    <ol className="mt-4 grid grid-cols-3 gap-2">{steps.map(([k,icon,label],i)=>{const active=stageIndex===i,passed=stageIndex>i;return <li key={k} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-center transition ${active?'bg-emerald-50 text-emerald-700':passed?'text-emerald-600':'text-slate-400'}`}>
     <span className={`grid h-8 w-8 place-items-center rounded-full ${active?'bg-emerald-500 text-white':passed?'bg-emerald-100':'bg-slate-100'}`}>{active?<Loader2 className="h-4 w-4 animate-spin"/>:passed?<Check className="h-4 w-4"/>:icon}</span>
     <span className="text-[11px] font-bold">{i+1}. {label}</span>
    </li>;})}</ol>
    <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-[11px] leading-snug text-slate-500"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600"/>{text(`Take a photo of yourself at work. Your photo and location go only to HR and are erased after ${state.settings.locationDays} days.`,`ถ่ายรูปตัวเองขณะทำงาน รูปและตำแหน่งส่งถึง HR เท่านั้น และลบทิ้งหลัง ${state.settings.locationDays} วัน`)}</p>
   </div>}
   {state?.eligible&&<div className={card}>
    <div className="flex items-baseline justify-between"><h2 className="font-bold text-slate-900">{text('This week','สัปดาห์นี้')}</h2><span className="text-xs font-medium text-slate-500">{text(`Goal ${hours(targetMin)} h a day`,`เป้าหมายวันละ ${hours(targetMin)} ชม.`)}</span></div>
    <div className="mt-4 grid grid-cols-7 gap-2">
     {week.map((d,i)=><div key={d.date} className="flex flex-col items-center gap-1">
      <span className="h-4 text-[10px] font-semibold tabular-nums text-slate-500">{d.min?hours(d.min):''}</span>
      <div className="relative flex h-24 w-full items-end rounded-lg bg-slate-50">
       <span className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-400/70" style={{bottom:`${targetMin/weekMax*100}%`}}/>
       <div className={`w-full rounded-lg transition-all ${d.missed?'bg-rose-300':d.min>targetMin?'bg-amber-400':d.today?'bg-emerald-500':'bg-emerald-300'}`} style={{height:d.min?`${Math.max(6,d.min/weekMax*100)}%`:'0%'}}/>
      </div>
      <span className={`text-[11px] font-bold ${d.today?'text-emerald-700':d.off?'text-slate-300':'text-slate-500'}`}>{weekdays([i+1],th)}</span>
     </div>)}
    </div>
   </div>}
   {state?.eligible&&<div className={shell}>
    <div className="flex items-center justify-between px-5 pt-5 pb-2"><h2 className="font-bold text-slate-900">{text('My hours','เวลาทำงานของฉัน')}</h2><button type="button" onClick={()=>startFix()} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><Plus className="h-3.5 w-3.5"/>{text('Missing day','วันที่ลืมลงเวลา')}</button></div>
    {history.length===0&&<p className="px-5 pb-5 text-sm text-slate-500">{text('No shifts yet. Your days will show here.','ยังไม่มีข้อมูล วันทำงานจะแสดงที่นี่')}</p>}
    <ul className="divide-y divide-slate-100 pb-1">{history.map(s=>{const d=new Date(s.date+'T00:00:00+07:00');return <li key={s.id} className="flex items-center gap-3 px-5 py-3">
     <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl ${s.missedOut?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}><span className="text-lg leading-none font-extrabold">{d.toLocaleDateString('en-GB',{day:'numeric',timeZone:'Asia/Bangkok'})}</span><span className="text-[10px] font-bold uppercase">{d.toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',timeZone:'Asia/Bangkok'})}</span></span>
     <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-slate-900">{clock(s.in)} <span className="text-slate-300">→</span> {s.missedOut?<span className="text-rose-600">{text('no clock-out','ไม่ได้ลงเวลาออก')}</span>:clock(s.out)}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
       {(s.inPhoto||s.outPhoto)&&<span className="inline-flex items-center gap-0.5"><Camera className="h-3 w-3"/>{text('Photo','รูป')}</span>}
       {s.edited&&<span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{text('fixed by HR','HR แก้ไขแล้ว')}</span>}
       {s.overtimeMin>0&&<span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">+{hours(s.overtimeMin)} OT</span>}
      </p>
     </div>
     {s.missedOut?<button type="button" onClick={()=>startFix(s)} className="flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"><PencilLine className="h-3.5 w-3.5"/>{text('Fix','แก้ไข')}</button>
      :<div className="text-right"><p className="text-lg font-extrabold tabular-nums text-slate-900">{hours(s.workedMin)}</p><button type="button" onClick={()=>startFix(s)} className="text-[11px] font-semibold text-slate-400 hover:text-emerald-700">{text('Fix','แก้ไข')}</button></div>}
    </li>;})}</ul>
   </div>}
   {!!state?.fixes.length&&<div className={card}>
    <h2 className="font-bold text-slate-900">{text('My fix requests','คำขอแก้ไขเวลา')}</h2>
    <ul className="mt-3 space-y-2">{state.fixes.map(f=><li key={f.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
     <div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{dayLabel(f.date,th)} · <span className="tabular-nums">{clock(f.in)}–{clock(f.out)}</span></span>{statusChip(f)}</div>
     <p className="mt-1 text-xs text-slate-500">{f.reason}</p>
     {f.note&&<p className="mt-1 text-xs text-slate-700">{text('HR note','หมายเหตุจาก HR')}: {f.note}</p>}
     {f.status==='pending'&&<button type="button" disabled={!!busy} onClick={()=>void run('cancel',()=>attendanceAction('fix-cancel',{id:f.id}))} className="mt-2 text-xs font-semibold text-rose-700">{text('Cancel request','ยกเลิกคำขอ')}</button>}
    </li>)}</ul>
   </div>}
  </section>
  {draft&&<div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center" onClick={()=>setDraft(null)}>
   <div role="dialog" aria-modal="true" aria-label={draft.shiftId?text('Fix this shift','แก้ไขเวลากะนี้'):text('Add a missing day','เพิ่มวันที่ลืมลงเวลา')} onClick={e=>e.stopPropagation()} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl">
    <span className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-slate-200 sm:hidden"/>
    <div className="flex items-center justify-between"><p className="text-lg font-extrabold text-slate-900">{draft.shiftId?text('Fix this shift','แก้ไขเวลากะนี้'):text('Add a missing day','เพิ่มวันที่ลืมลงเวลา')}</p><button type="button" aria-label={text('Close','ปิด')} onClick={()=>setDraft(null)} className="rounded-full bg-slate-100 p-1.5 text-slate-500"><X className="h-4 w-4"/></button></div>
    <p className="mt-1 text-sm text-slate-500">{text('HR checks it before your hours change.','HR จะตรวจก่อนเปลี่ยนชั่วโมงทำงาน')}</p>
    <label className="mt-4 block text-sm font-semibold text-slate-700">{text('Date','วันที่')}<input type="date" value={draft.date} min={minDate} max={state?.today} disabled={!!draft.shiftId} onChange={e=>setDraft({...draft,date:e.target.value})} className={field}/></label>
    <div className="mt-3 grid grid-cols-2 gap-3">
     <label className="block text-sm font-semibold text-slate-700">{text('Clock in','เวลาเข้า')}<input type="time" value={draft.in} onChange={e=>setDraft({...draft,in:e.target.value})} className={field}/></label>
     <label className="block text-sm font-semibold text-slate-700">{text('Clock out','เวลาออก')}<input type="time" value={draft.out} onChange={e=>setDraft({...draft,out:e.target.value})} className={field}/></label>
    </div>
    <label className="mt-3 block text-sm font-semibold text-slate-700">{text('Why does it need fixing?','เหตุผลที่ต้องแก้ไข')}<textarea rows={2} maxLength={500} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})} placeholder={text('e.g. Forgot to clock out','เช่น ลืมกดลงเวลาออก')} className={field}/></label>
    <div className="mt-2 flex flex-wrap gap-1.5">{[text('Forgot to clock out','ลืมกดลงเวลาออก'),text('Phone battery died','แบตโทรศัพท์หมด'),text('No internet','ไม่มีอินเทอร์เน็ต')].map(r=><button key={r} type="button" onClick={()=>setDraft({...draft,reason:r})} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{r}</button>)}</div>
    <button type="button" disabled={!!busy||draft.reason.trim().length<3||!draft.in||!draft.out||!draft.date} onClick={()=>void sendFix()} className="mt-5 w-full rounded-2xl bg-linear-to-r/srgb from-emerald-500 to-teal-600 py-3.5 font-extrabold text-white shadow-lg shadow-emerald-200 disabled:opacity-50">{busy==='fix'?text('Sending…','กำลังส่ง…'):text('Send to HR','ส่งให้ HR')}</button>
   </div>
  </div>}
 </main>;
}
