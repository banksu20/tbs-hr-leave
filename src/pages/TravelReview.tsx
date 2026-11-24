import {useCallback,useEffect,useMemo,useState} from 'react';
import {Banknote,Building2,Car,CheckCircle2,Clock,FileText,Flag,Home,Loader2,Lock,MapPin,Receipt,ShieldCheck} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {flagLabel,money,statusLabel,type T,type TripDetail} from '@/lib/travel';

type Reviewed=TripDetail&{employee:string;department:string|null};
function readLink(){
 const params=new URLSearchParams(location.search);
 const id=params.get('id')??'';let token=params.get('t')??'';
 try{if(token)sessionStorage.setItem(`travel-review:${id}`,token);else token=sessionStorage.getItem(`travel-review:${id}`)??'';}catch{void 0;}
 if(params.has('t')){params.delete('t');history.replaceState(null,'',`${location.pathname}?${params.toString()}`);}
 return {id,token};
}

export default function TravelReview(){
 const link=useMemo(readLink,[]);
 const {language}=useLanguage();const th=language==='th';
 const text:T=useCallback((en,thai)=>th?thai:en,[th]);
 const [trip,setTrip]=useState<Reviewed|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[images,setImages]=useState<Record<string,string>>({});
 const post=useCallback(async(action:string,extra:Record<string,string>={})=>fetch('/api/travel-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:link.id,token:link.token,action,...extra})}),[link]);
 const call=useCallback(async(action:'review'|'received'|'paid')=>{
  const r=await post(action);const b=await r.json().catch(()=>({error:'Service unavailable'}));
  if(!r.ok||!b.ok)throw new Error(b?.error||'Service unavailable');
  setTrip(b.trip);
 },[post]);
 useEffect(()=>{
  const meta=document.createElement('meta');meta.name='referrer';meta.content='no-referrer';document.head.appendChild(meta);
  call('review').catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));
  return ()=>{meta.remove();};
 },[call]);
 useEffect(()=>{
  if(!trip)return;let active=true;const made:string[]=[];
  for(const r of trip.receipts)if(r.mime!=='application/pdf'&&!images[r.id])post('receipt',{receiptId:r.id}).then(x=>x.ok?x.blob():null).then(b=>{if(!b||!active)return;const u=URL.createObjectURL(b);made.push(u);setImages(m=>({...m,[r.id]:u}));}).catch(()=>undefined);
  return ()=>{active=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[trip?.id]);
 const act=async(a:'received'|'paid')=>{setBusy(true);setError('');try{await call(a);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const openPdf=async(id:string)=>{const r=await post('receipt',{receiptId:id});if(r.ok)window.open(URL.createObjectURL(await r.blob()),'_blank','noopener');};
 const kind=(k:string)=>({toll:text('Toll','ค่าทางด่วน'),parking:text('Parking','ค่าจอดรถ'),grab:'Grab',taxi:text('Taxi','แท็กซี่'),other:text('Other','อื่นๆ')} as Record<string,string>)[k]??k;
 const time=(v:string)=>new Date(v).toLocaleTimeString(th?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'});
 const pointName=(id:number)=>{const p=trip?.points.find(x=>x.id===id);if(!p)return '';if(p.kind==='start_office')return text('Office','ออฟฟิศ');if(p.kind==='start_home')return text('Home','บ้าน');if(p.kind==='return_office')return text('Office','ออฟฟิศ');return trip?.stops.find(s=>s.id===p.stopId)?.clientName??'';};
 const day=trip?new Date(trip.date+'T12:00:00+07:00'):null;
 const tone=trip?.status==='paid'?'bg-emerald-400/20 text-emerald-100 ring-emerald-300/40':trip?.status==='flagged'?'bg-amber-400/20 text-amber-100 ring-amber-300/40':trip?.status==='rejected'?'bg-rose-400/20 text-rose-100 ring-rose-300/40':'bg-white/15 text-white ring-white/30';
 const initials=(trip?.employee??'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
 const box='rounded-3xl border border-slate-100 bg-white p-5 shadow-md shadow-slate-200/60';
 const nodeIcon=(id:number)=>{const k=trip?.points.find(x=>x.id===id)?.kind;return k==='start_home'?<Home className="h-4 w-4"/>:k==='arrive'?<MapPin className="h-4 w-4"/>:<Building2 className="h-4 w-4"/>;};
 const route=trip?.legs.length?[trip.legs[0].from,...trip.legs.map(l=>l.to)]:[];
 return <main className="min-h-dvh bg-slate-100 pb-12 font-sans">
  <header className="relative overflow-hidden bg-linear-to-br/srgb from-sky-500 via-sky-600 to-indigo-600 px-5 pt-6 pb-24 text-white">
   <span className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10"/><span className="pointer-events-none absolute -bottom-10 left-10 h-32 w-32 rounded-full bg-white/5"/>
   <div className="relative mx-auto flex max-w-2xl items-center justify-between px-4">
    <p className="flex items-center gap-2 text-sm font-bold tracking-wide"><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/20"><Car className="h-4 w-4"/></span>{text('TBS · Travel claim','TBS · เบิกค่าเดินทาง')}</p>
    {trip&&<span className="rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-semibold">#{trip.id}</span>}
   </div>
  </header>
  <div className="relative mx-auto -mt-16 max-w-2xl space-y-4 px-4">
   {loading&&<div className={box+' flex items-center gap-3 text-slate-500'}><Loader2 className="h-5 w-5 animate-spin text-sky-600"/>{text('Loading…','กำลังโหลด…')}</div>}
   {!loading&&!trip&&<div className={box+' text-center'}><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Lock className="h-6 w-6"/></span><h1 className="mt-3 text-xl font-bold text-slate-900">{text('Link not valid','ลิงก์ไม่ถูกต้อง')}</h1><p className="mt-1 text-sm text-slate-600">{error}</p></div>}
   {trip&&day&&<>
    <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-xl shadow-slate-900/20">
     <div className="flex items-start gap-4 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-base font-extrabold">{initials||'?'}</span>
      <div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold">{trip.employee}</h1><p className="text-sm text-slate-400">{[trip.department,day.toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})].filter(Boolean).join(' · ')}</p></div>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${tone}`}>{statusLabel(trip.status,text)}</span>
     </div>
     <div className="flex items-end justify-between gap-4 border-t border-white/10 px-5 py-4">
      <div><p className="text-xs font-medium text-slate-400">{text('Amount to pay','ยอดที่ต้องจ่าย')}</p><p className="text-4xl font-extrabold tracking-tight">฿{money(trip.total)}</p></div>
      <p className="text-right text-xs text-slate-400">{trip.purpose==='deal'?text('Close a deal','ปิดดีล'):text('Customer care','ดูแลลูกค้า')}{trip.dealRef&&<span className="block font-mono text-slate-200">{trip.dealRef}</span>}</p>
     </div>
     <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center">
      <div className="p-3"><dt className="text-[11px] text-slate-400">{text('Distance','ระยะทาง')}</dt><dd className="font-bold">{money(trip.km)} {text('km','กม.')}</dd></div>
      <div className="p-3"><dt className="text-[11px] text-slate-400">{trip.mode==='car'?text(`× ฿${money(trip.rate)}/km`,`× ฿${money(trip.rate)}/กม.`):text('Travel by','เดินทางโดย')}</dt><dd className="font-bold">{trip.mode==='car'?`฿${money(trip.kmAmount)}`:trip.mode==='grab'?'Grab':text('Taxi','แท็กซี่')}</dd></div>
      <div className="p-3"><dt className="text-[11px] text-slate-400">{text('Receipts','ใบเสร็จ')}</dt><dd className="font-bold">฿{money(trip.receiptAmount)}</dd></div>
     </dl>
    </section>
    {(trip.flags.length>0||trip.decidedBy)&&<section className="space-y-2">
     {trip.flags.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900"><Flag className="h-4 w-4"/>{text('Checks raised by the system','ระบบแจ้งเตือน')}</p><div className="flex flex-wrap gap-1.5">{trip.flags.map(f=><span key={f} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{flagLabel(f,text)}</span>)}</div></div>}
     {trip.decidedBy&&<p className="flex items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><span><span className="font-semibold">{text(`Checked by ${trip.decidedBy}`,`ตรวจโดย ${trip.decidedBy}`)}</span>{trip.decisionNote&&<span className="block text-indigo-800/80">{trip.decisionNote}</span>}</span></p>}
    </section>}
    <section className={box}>
     <h2 className="mb-4 font-bold text-slate-900">{text('Route','เส้นทาง')}</h2>
     {route.length?<ol>{route.map((id,i)=>{const leg=trip.legs.find(l=>l.to===id);const at=trip.points.find(p=>p.id===id)?.at;return <li key={id} className="relative flex gap-3 pb-5 last:pb-0">
      {i<route.length-1&&<span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-sky-200"/>}
      <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ${i===0||i===route.length-1?'bg-slate-900 text-white':'bg-sky-600 text-white'}`}>{nodeIcon(id)}</span>
      <div className="min-w-0 flex-1 pt-1.5">
       {leg&&<p className="-mt-1 mb-1 inline-flex flex-wrap items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">+{money(leg.km)} {text('km','กม.')}{trip.mode==='car'?` · ฿${money(leg.amount)}`:''}</p>}
       <div className="flex items-baseline justify-between gap-2"><p className="font-semibold text-slate-900">{pointName(id)}</p>{at&&<span className="shrink-0 text-xs text-slate-400">{time(at)}</span>}</div>
       {leg?.capped&&<p className="text-xs text-amber-700">{text(`Capped at office distance (actual ${money(leg.routeKm)} km)`,`จำกัดเท่าระยะจากออฟฟิศ (จริง ${money(leg.routeKm)} กม.)`)}</p>}
      </div></li>;})}</ol>:<p className="text-sm text-slate-500">{text('No distance recorded.','ไม่มีระยะทาง')}</p>}
    </section>
    <section className={box}>
     <div className="mb-3 flex items-baseline justify-between"><h2 className="font-bold text-slate-900">{text('Receipts','ใบเสร็จ')}</h2><span className="text-xs font-semibold text-slate-500">{trip.receipts.length}</span></div>
     {trip.receipts.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{trip.receipts.map(r=><div key={r.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
      {r.mime==='application/pdf'?<button type="button" onClick={()=>void openPdf(r.id)} className="grid aspect-[4/3] w-full place-items-center bg-slate-100 text-sm font-bold text-slate-500"><span className="flex flex-col items-center gap-1"><FileText className="h-6 w-6"/>PDF</span></button>:images[r.id]?<a href={images[r.id]} target="_blank" rel="noreferrer" className="block"><img src={images[r.id]} alt="" className="aspect-[4/3] w-full object-cover"/></a>:<span className="grid aspect-[4/3] place-items-center bg-slate-100"><Receipt className="h-6 w-6 text-slate-300"/></span>}
      <div className="space-y-1 p-3"><div className="flex items-baseline justify-between gap-2"><span className="text-xs font-semibold text-slate-500">{kind(r.kind)}</span><span className="font-extrabold text-slate-900">฿{money(r.amount)}</span></div>
       {r.edited&&r.readAmount!=null&&<p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{text(`Photo read ฿${money(r.readAmount)}, employee entered ฿${money(r.amount)}`,`อ่านจากรูป ฿${money(r.readAmount)} พนักงานกรอก ฿${money(r.amount)}`)}</p>}
       {r.needsOriginal&&<p className={`flex items-center gap-1 text-[11px] font-semibold ${r.originalReceivedAt?'text-emerald-700':'text-amber-700'}`}>{r.originalReceivedAt?<CheckCircle2 className="h-3 w-3"/>:<Clock className="h-3 w-3"/>}{r.originalReceivedAt?text('Original received','ได้รับตัวจริงแล้ว'):text('Waiting for paper original','รอใบเสร็จตัวจริง')}</p>}
      </div></div>)}</div>:<p className="text-sm text-slate-500">{text('No receipts.','ไม่มีใบเสร็จ')}</p>}
    </section>
    <section className={box}>
     <dl className="space-y-2 text-sm text-slate-600">
      <div className="flex justify-between"><dt>{text(`Distance ${money(trip.km)} km × ฿${money(trip.rate)}`,`ระยะทาง ${money(trip.km)} กม. × ฿${money(trip.rate)}`)}</dt><dd className="font-semibold text-slate-900">฿{money(trip.kmAmount)}</dd></div>
      <div className="flex justify-between"><dt>{text('Receipts','ใบเสร็จ')}</dt><dd className="font-semibold text-slate-900">฿{money(trip.receiptAmount)}</dd></div>
      <div className="flex items-baseline justify-between border-t border-dashed border-slate-200 pt-3"><dt className="font-bold text-slate-900">{text('Total','รวม')}</dt><dd className="text-2xl font-extrabold text-slate-900">฿{money(trip.total)}</dd></div>
     </dl>
     {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
     <div className="mt-4 grid gap-2">
      {trip.originalsWaiting>0&&<button type="button" disabled={busy} onClick={()=>void act('received')} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-sky-200 bg-sky-50 py-3.5 text-sm font-bold text-sky-800 transition active:scale-[.99] disabled:opacity-50"><Receipt className="h-4 w-4"/>{text(`Paper receipts received (${trip.originalsWaiting})`,`ได้รับใบเสร็จตัวจริงแล้ว (${trip.originalsWaiting})`)}</button>}
      {['submitted','approved'].includes(trip.status)&&<button type="button" disabled={busy} onClick={()=>void act('paid')} className="flex items-center justify-center gap-2 rounded-2xl bg-sky-600 py-4 font-bold text-white shadow-lg shadow-sky-600/25 transition active:scale-[.99] disabled:opacity-50">{busy?<Loader2 className="h-5 w-5 animate-spin"/>:<Banknote className="h-5 w-5"/>}{text(`Mark as paid · ฿${money(trip.total)}`,`จ่ายแล้ว · ฿${money(trip.total)}`)}</button>}
      {trip.status==='paid'&&<p className="flex items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-sm font-bold text-white"><CheckCircle2 className="h-6 w-6"/><span>{text('Paid','จ่ายแล้ว')}{trip.paidAt&&<span className="block text-xs font-medium text-emerald-100">{new Date(trip.paidAt).toLocaleString(th?'th-TH':'en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})}</span>}</span></p>}
      {trip.status==='flagged'&&<p className="rounded-2xl bg-amber-50 p-4 text-center text-sm font-medium text-amber-800">{text('Waiting for HR to check this trip before payment.','รอ HR ตรวจทริปนี้ก่อนจ่าย')}</p>}
     </div>
    </section>
    <p className="text-center text-xs text-slate-400">{text('This private link is for TBS accounting only.','ลิงก์นี้สำหรับฝ่ายบัญชี TBS เท่านั้น')}</p>
   </>}
  </div>
 </main>;
}
