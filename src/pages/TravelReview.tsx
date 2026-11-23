import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Flag,Loader2,MapPin,Receipt} from 'lucide-react';
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
 return <main className="min-h-dvh bg-slate-50 px-4 py-8 font-sans">
  <section className="mx-auto w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
   <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">{text('TBS · Travel claim','TBS · เบิกค่าเดินทาง')}</p>
   {loading&&<div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin"/>{text('Loading…','กำลังโหลด…')}</div>}
   {!loading&&!trip&&<div className="space-y-1"><h1 className="text-xl font-bold">{text('Link not valid','ลิงก์ไม่ถูกต้อง')}</h1><p className="text-sm text-slate-600">{error}</p></div>}
   {trip&&<>
    <div><h1 className="text-2xl font-bold leading-tight">{trip.employee}</h1><p className="text-sm text-slate-500">{[trip.department,new Date(trip.date+'T12:00:00+07:00').toLocaleDateString(th?'th-TH':'en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'})].filter(Boolean).join(' · ')}</p></div>
    <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className={`rounded-full px-3 py-1 ${trip.status==='paid'?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-700'}`}>{statusLabel(trip.status,text)}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{trip.purpose==='deal'?text('Deal','ปิดดีล'):text('Customer care','ดูแลลูกค้า')}{trip.dealRef?` · ${trip.dealRef}`:''}</span>
     {trip.flags.map(f=><span key={f} className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-amber-800"><Flag className="h-3 w-3"/>{flagLabel(f,text)}</span>)}</div>
    {trip.decidedBy&&<p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{text(`Checked by ${trip.decidedBy}`,`ตรวจโดย ${trip.decidedBy}`)}{trip.decisionNote?` · ${trip.decisionNote}`:''}</p>}
    <div className="space-y-2"><h2 className="text-sm font-bold text-slate-500">{text('Route','เส้นทาง')}</h2>
     {trip.legs.map(l=><div key={l.id} className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0 text-slate-400"/><span className="flex-1">{pointName(l.from)} → {pointName(l.to)} <span className="text-xs text-slate-400">{time(trip.points.find(p=>p.id===l.to)!.at)}</span>{l.capped&&<span className="block text-xs text-slate-500">{text(`Capped at office distance (actual ${money(l.routeKm)} km)`,`จำกัดเท่าระยะจากออฟฟิศ (จริง ${money(l.routeKm)} กม.)`)}</span>}</span><span className="text-right">{money(l.km)} km{trip.mode==='car'&&<span className="block text-xs text-slate-500">฿{money(l.amount)}</span>}</span></div>)}
     {!trip.legs.length&&<p className="text-sm text-slate-500">{text('No distance recorded.','ไม่มีระยะทาง')}</p>}
    </div>
    <div className="space-y-2"><h2 className="text-sm font-bold text-slate-500">{text('Receipts','ใบเสร็จ')}</h2>
     {trip.receipts.map(r=><div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2 text-sm">
      {r.mime==='application/pdf'?<button type="button" onClick={()=>void openPdf(r.id)} className="grid h-16 w-12 place-items-center rounded-md bg-slate-100 text-xs">PDF</button>:images[r.id]?<a href={images[r.id]} target="_blank" rel="noreferrer"><img src={images[r.id]} alt="" className="h-16 w-12 rounded-md object-cover"/></a>:<span className="grid h-16 w-12 place-items-center rounded-md bg-slate-100"><Receipt className="h-4 w-4 text-slate-400"/></span>}
      <span className="flex-1">{kind(r.kind)}{r.edited&&r.readAmount!=null&&<span className="block text-xs text-amber-700">{text(`Photo read ฿${money(r.readAmount)}, employee entered ฿${money(r.amount)}`,`อ่านจากรูป ฿${money(r.readAmount)} พนักงานกรอก ฿${money(r.amount)}`)}</span>}{r.needsOriginal&&<span className={`block text-xs ${r.originalReceivedAt?'text-emerald-700':'text-amber-700'}`}>{r.originalReceivedAt?text('Original received','ได้รับตัวจริงแล้ว'):text('Waiting for paper original','รอใบเสร็จตัวจริง')}</span>}</span>
      <span className="font-semibold">฿{money(r.amount)}</span></div>)}
     {!trip.receipts.length&&<p className="text-sm text-slate-500">{text('No receipts.','ไม่มีใบเสร็จ')}</p>}
    </div>
    <dl className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
     <div className="flex justify-between"><dt>{text(`Distance ${money(trip.km)} km × ฿${money(trip.rate)}`,`ระยะทาง ${money(trip.km)} กม. × ฿${money(trip.rate)}`)}</dt><dd>฿{money(trip.kmAmount)}</dd></div>
     <div className="flex justify-between"><dt>{text('Receipts','ใบเสร็จ')}</dt><dd>฿{money(trip.receiptAmount)}</dd></div>
     <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><dt>{text('Total','รวม')}</dt><dd>฿{money(trip.total)}</dd></div>
    </dl>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="grid gap-2">
     {trip.originalsWaiting>0&&<button type="button" disabled={busy} onClick={()=>void act('received')} className="rounded-2xl border border-cyan-300 py-3.5 font-bold text-cyan-800 disabled:opacity-50">{text('Paper receipts received','ได้รับใบเสร็จตัวจริงแล้ว')}</button>}
     {['submitted','approved'].includes(trip.status)&&<button type="button" disabled={busy} onClick={()=>void act('paid')} className="rounded-2xl bg-cyan-600 py-4 font-bold text-white disabled:opacity-50">{text(`Mark as paid · ฿${money(trip.total)}`,`จ่ายแล้ว · ฿${money(trip.total)}`)}</button>}
     {trip.status==='paid'&&<p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5"/>{text('Paid','จ่ายแล้ว')}</p>}
    </div>
   </>}
  </section>
 </main>;
}
