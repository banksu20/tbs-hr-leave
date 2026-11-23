import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft,Building2,Camera,Car,CheckCircle2,Flag,Home,Loader2,MapPin,Navigation,Plus,Receipt,Search,Trash2,X} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {currentPosition,findPlaces,loadTravel,money,prepareFile,readReceipt,receiptUrl,travelAction,TravelError,type Fix,type Place,type ReceiptKind,type TravelState,type TripDetail,type TripSummary,flagLabel,statusLabel} from '@/lib/travel';

import type {T} from '@/lib/travel';
const card='rounded-2xl border border-slate-100 bg-white p-4 shadow-xs';
const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] focus:outline-hidden focus:ring-2 focus:ring-cyan-500';
const primary='w-full rounded-xl bg-cyan-600 py-3.5 font-bold text-white disabled:opacity-50';
const kinds:[ReceiptKind,string,string][]=[['toll','Toll','ค่าทางด่วน'],['parking','Parking','ค่าจอดรถ'],['grab','Grab','Grab'],['taxi','Taxi','แท็กซี่'],['other','Other','อื่นๆ']];

function PlacePicker({text,value,onChange}:{text:T;value:Place|null;onChange:(p:Place|null)=>void}){
 const [query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const search=async()=>{if(query.trim().length<2)return;setBusy(true);setError('');setPlaces(null);try{const p=await findPlaces(query);setPlaces(p);if(p.length===1)onChange(p[0]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(value)return <div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700"/><span className="min-w-0 flex-1 text-slate-800">{value.label}</span><button type="button" aria-label={text('Change place','เปลี่ยนสถานที่')} onClick={()=>{onChange(null);setPlaces(null);}} className="rounded-lg p-1 text-slate-500"><X className="h-4 w-4"/></button></div>;
 return <div className="space-y-2">
  <div className="flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}} placeholder={text('Address, place name or Google Maps link','ที่อยู่ ชื่อสถานที่ หรือลิงก์ Google Maps')} className={input}/>
   <button type="button" onClick={()=>void search()} disabled={busy||query.trim().length<2} aria-label={text('Find','ค้นหา')} className="shrink-0 rounded-xl bg-slate-900 px-4 text-white disabled:opacity-50">{busy?<Loader2 className="h-5 w-5 animate-spin"/>:<Search className="h-5 w-5"/>}</button></div>
  {error&&<p className="text-sm text-rose-700">{error}</p>}
  {places?.length===0&&<p className="text-sm text-slate-500">{text('No place found. Try the full address or paste a Google Maps link.','ไม่พบสถานที่ ลองพิมพ์ที่อยู่เต็ม หรือวางลิงก์ Google Maps')}</p>}
  {places&&places.length>1&&<ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{places.map(p=><li key={`${p.lat},${p.lng}`}><button type="button" onClick={()=>onChange(p)} className="flex w-full gap-2 p-3 text-left text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/>{p.label}</button></li>)}</ul>}
 </div>;
}

function Choice<V extends string>({options,value,onChange}:{options:[NoInfer<V>,string,React.ReactNode?][];value:V;onChange:(v:V)=>void}){
 return <div className={`grid gap-2 ${options.length===3?'grid-cols-3':'grid-cols-2'}`}>{options.map(([v,l,icon])=><button key={v} type="button" aria-pressed={value===v} onClick={()=>onChange(v)} className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold ${value===v?'border-cyan-600 bg-cyan-50 text-cyan-800':'border-slate-200 bg-white text-slate-600'}`}>{icon}{l}</button>)}</div>;
}

function StartForm({state,text,run}:{state:TravelState;text:T;run:(fn:()=>Promise<TravelState>)=>Promise<void>}){
 const [client,setClient]=useState(''),[place,setPlace]=useState<Place|null>(null),[purpose,setPurpose]=useState<'deal'|'care'>('deal'),[dealRef,setDealRef]=useState('');
 const [mode,setMode]=useState<'car'|'grab'|'taxi'>('car'),[appointment,setAppointment]=useState(''),[from,setFrom]=useState<'office'|'home'>('office');
 const homeOk=!!appointment&&appointment<state.settings.homeCutoff;
 useEffect(()=>{if(!homeOk&&from==='home')setFrom('office');},[homeOk,from]);
 const ready=client.trim()&&place&&appointment;
 const start=()=>run(async()=>{
  const pos=from==='home'?await currentPosition():null;
  return travelAction('start',{purpose,dealRef,mode,startFrom:from,clientName:client.trim(),destLat:place!.lat,destLng:place!.lng,destLabel:place!.label,appointment,...(pos?{lat:pos.lat,lng:pos.lng,accuracy:pos.accuracy}:{})});
 });
 return <section className={card+' space-y-4'}>
  <h2 className="text-lg font-bold">{text('Start a trip','เริ่มทริป')}</h2>
  <label className="block space-y-1.5 text-sm font-medium text-slate-700">{text('Client','ลูกค้า')}<input value={client} maxLength={160} onChange={e=>setClient(e.target.value)} className={input}/></label>
  <div className="space-y-1.5 text-sm font-medium text-slate-700">{text('Where are you going?','ไปที่ไหน')}<PlacePicker text={text} value={place} onChange={setPlace}/></div>
  <div className="space-y-1.5 text-sm font-medium text-slate-700">{text('Purpose','วัตถุประสงค์')}<Choice<'deal'|'care'> value={purpose} onChange={setPurpose} options={[['deal',text('Deal','ปิดดีล')],['care',text('Customer care','ดูแลลูกค้า')]]}/></div>
  {purpose==='deal'&&<label className="block space-y-1.5 text-sm font-medium text-slate-700">{text('Deal or quotation no. (optional)','เลขดีลหรือใบเสนอราคา (ไม่บังคับ)')}<input value={dealRef} maxLength={120} onChange={e=>setDealRef(e.target.value)} className={input}/></label>}
  <div className="space-y-1.5 text-sm font-medium text-slate-700">{text('Travel by','เดินทางโดย')}<Choice<'car'|'grab'|'taxi'> value={mode} onChange={setMode} options={[['car',text('My car','รถส่วนตัว'),<Car key="c" className="h-4 w-4"/>],['grab','Grab'],['taxi',text('Taxi','แท็กซี่')]]}/></div>
  <label className="block space-y-1.5 text-sm font-medium text-slate-700">{text('Appointment time','เวลานัด')}<input type="time" value={appointment} onChange={e=>setAppointment(e.target.value)} className={input}/></label>
  {homeOk&&<div className="space-y-1.5 text-sm font-medium text-slate-700">{text('Leaving from','ออกเดินทางจาก')}<Choice<'office'|'home'> value={from} onChange={setFrom} options={[['office',text('Office','ออฟฟิศ'),<Building2 key="o" className="h-4 w-4"/>],['home',text('Home','บ้าน'),<Home key="h" className="h-4 w-4"/>]]}/>
   {from==='home'&&<p className="text-xs font-normal text-slate-500">{text('We record where you are now. Distance from home is paid up to the office-to-client distance.','ระบบจะบันทึกตำแหน่งตอนนี้ ระยะจากบ้านจ่ายไม่เกินระยะจากออฟฟิศถึงลูกค้า')}</p>}</div>}
  <button type="button" disabled={!ready} onClick={()=>void start()} className={primary}>{text('Start trip','เริ่มเดินทาง')}</button>
 </section>;
}

function AddReceipt({trip,text,run}:{trip:TripDetail;text:T;run:(fn:()=>Promise<TravelState>)=>Promise<void>}){
 const ref=useRef<HTMLInputElement>(null);
 const [file,setFile]=useState<{mime:string;content:string;preview:string}|null>(null),[reading,setReading]=useState(false),[kind,setKind]=useState<ReceiptKind>(trip.mode==='car'?'toll':trip.mode),[amount,setAmount]=useState(''),[read,setRead]=useState<{amount:number|null;date:string|null}|null>(null),[error,setError]=useState('');
 const pick=async(f:File|undefined)=>{
  if(!f)return;setError('');setReading(true);
  try{const p=await prepareFile(f);setFile(p);const r=await readReceipt(p.mime,p.content).catch(()=>({amount:null,date:null,kind:null}));setRead(r);if(r.amount)setAmount(String(r.amount));if(r.kind)setKind(r.kind);}
  catch(e){setError((e as Error).message);}finally{setReading(false);if(ref.current)ref.current.value='';}
 };
 const clear=()=>{if(file?.preview)URL.revokeObjectURL(file.preview);setFile(null);setAmount('');setRead(null);};
 const value=Number(amount);
 const save=()=>run(async()=>{const s=await travelAction('receipt-add',{tripId:trip.id,kind,mime:file!.mime,content:file!.content,amount:value,readAmount:read?.amount??null,readDate:read?.date??null});clear();return s;});
 return <div className="space-y-3">
  <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e=>void pick(e.target.files?.[0])}/>
  {!file&&<button type="button" disabled={reading} onClick={()=>ref.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300 bg-cyan-50 py-3 text-sm font-semibold text-cyan-800 disabled:opacity-60">{reading?<Loader2 className="h-4 w-4 animate-spin"/>:<Camera className="h-4 w-4"/>}{reading?text('Reading receipt…','กำลังอ่านใบเสร็จ…'):text('Add receipt photo','ถ่ายรูปใบเสร็จ')}</button>}
  {error&&<p className="text-sm text-rose-700">{error}</p>}
  {file&&<div className="space-y-3 rounded-xl border border-slate-200 p-3">
   <div className="flex items-start gap-3">{file.preview?<img src={file.preview} alt="" className="h-20 w-16 rounded-lg object-cover"/>:<span className="grid h-20 w-16 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">PDF</span>}
    <div className="min-w-0 flex-1 space-y-2">
     <select value={kind} onChange={e=>setKind(e.target.value as ReceiptKind)} className={input+' py-2'}>{kinds.map(([v,en,th])=><option key={v} value={v}>{text(en,th)}</option>)}</select>
     <label className="flex items-center gap-2"><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,''))} placeholder="0.00" aria-label={text('Amount','จำนวนเงิน')} className={input+' py-2 text-right'}/><span className="text-sm text-slate-500">฿</span></label>
    </div></div>
   <p className="text-xs text-slate-500">{read?.amount?text('Amount read from the photo. Fix it if it is wrong.','อ่านยอดจากรูปแล้ว แก้ได้ถ้าไม่ถูก'):text('Type the amount on the receipt.','พิมพ์ยอดเงินตามใบเสร็จ')}{['toll','parking','other'].includes(kind)?' '+text('Keep the paper receipt for accounting.','เก็บใบเสร็จตัวจริงไว้ส่งบัญชี'):''}</p>
   <div className="flex gap-2"><button type="button" disabled={!(value>0&&value<=100000)} onClick={()=>void save()} className="flex-1 rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{text('Save receipt','บันทึกใบเสร็จ')}</button><button type="button" onClick={clear} className="rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">{text('Cancel','ยกเลิก')}</button></div>
  </div>}
 </div>;
}

function ReceiptThumb({id}:{id:string}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let u='';let active=true;receiptUrl(id).then(x=>{u=x;if(active)setUrl(x);else URL.revokeObjectURL(x);}).catch(()=>undefined);return()=>{active=false;if(u)URL.revokeObjectURL(u);};},[id]);
 return url?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="h-12 w-10 rounded-md object-cover"/></a>:<span className="grid h-12 w-10 place-items-center rounded-md bg-slate-100"><Receipt className="h-4 w-4 text-slate-400"/></span>;
}

function OpenTrip({trip,text,run}:{trip:TripDetail;text:T;run:(fn:()=>Promise<TravelState>)=>Promise<void>}){
 const [adding,setAdding]=useState(false),[client,setClient]=useState(''),[place,setPlace]=useState<Place|null>(null),[confirmCancel,setConfirmCancel]=useState(false);
 const last=trip.points[trip.points.length-1];
 const back=last?.kind==='return_office';
 const next=back?undefined:trip.stops.find(s=>!s.arrivedAt);
 const arrived=trip.points.some(p=>p.kind==='arrive');
 const arrive=(stopId:number)=>run(async()=>{const p=await currentPosition();return gpsCheck(p,()=>travelAction('arrive',{tripId:trip.id,stopId,prevPointId:last.id,...p}));});
 const ret=()=>run(async()=>{const p=await currentPosition();return gpsCheck(p,()=>travelAction('return',{tripId:trip.id,prevPointId:last.id,...p}));});
 const gpsCheck=async(p:Fix,go:()=>Promise<TravelState>)=>{
  if(p.accuracy>100&&!window.confirm(text(`GPS is weak right now (±${p.accuracy} m). Continue anyway? The trip will be checked by your manager.`,`GPS ไม่แม่นตอนนี้ (±${p.accuracy} ม.) ดำเนินการต่อหรือไม่ ทริปนี้จะต้องให้หัวหน้าตรวจ`)))throw new TravelError(text('Try again when GPS is better.','ลองใหม่เมื่อ GPS ดีขึ้น'),0);
  return go();
 };
 const addStop=()=>run(async()=>{const s=await travelAction('add-stop',{tripId:trip.id,clientName:client.trim(),destLat:place!.lat,destLng:place!.lng,destLabel:place!.label});setAdding(false);setClient('');setPlace(null);return s;});
 return <>
  <section className={card+' space-y-4'}>
   <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold">{text('Trip in progress','ทริปที่กำลังเดินทาง')}</h2><span className="text-sm font-semibold text-cyan-700">{money(trip.km)} km · ฿{money(trip.total)}</span></div>
   <ol className="space-y-3">
    <li className="flex items-center gap-3 text-sm text-slate-600"><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100">{trip.startFrom==='home'?<Home className="h-4 w-4"/>:<Building2 className="h-4 w-4"/>}</span>{trip.startFrom==='home'?text('Left from home','ออกจากบ้าน'):text('Left the office','ออกจากออฟฟิศ')}</li>
    {trip.stops.map(s=><li key={s.id} className="flex items-start gap-3">
     <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${s.arrivedAt?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{s.arrivedAt?<CheckCircle2 className="h-4 w-4"/>:<MapPin className="h-4 w-4"/>}</span>
     <div className="min-w-0 flex-1"><p className="font-semibold">{s.clientName}</p><p className="truncate text-xs text-slate-500">{s.label}</p>
      {next?.id===s.id&&<button type="button" onClick={()=>void arrive(s.id)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 font-bold text-white"><Navigation className="h-4 w-4"/>{text("I've arrived",'ถึงแล้ว')}</button>}
     </div></li>)}
    {back&&<li className="flex items-center gap-3 text-sm text-emerald-700"><span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100"><Building2 className="h-4 w-4"/></span>{text('Back at the office','กลับถึงออฟฟิศแล้ว')}</li>}
   </ol>
   {!back&&!next&&!adding&&<div className="grid gap-2">
    <button type="button" onClick={()=>void ret()} className={primary}>{text('Back at the office','กลับถึงออฟฟิศ')}</button>
    <button type="button" onClick={()=>setAdding(true)} className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700"><Plus className="h-4 w-4"/>{text('Go to another client','ไปหาลูกค้าอีกราย')}</button>
   </div>}
   {adding&&<div className="space-y-3 rounded-xl bg-slate-50 p-3">
    <input value={client} maxLength={160} onChange={e=>setClient(e.target.value)} placeholder={text('Client','ลูกค้า')} className={input}/>
    <PlacePicker text={text} value={place} onChange={setPlace}/>
    <div className="flex gap-2"><button type="button" disabled={!client.trim()||!place} onClick={()=>void addStop()} className="flex-1 rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{text('Add client','เพิ่มลูกค้า')}</button><button type="button" onClick={()=>setAdding(false)} className="rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600">{text('Cancel','ยกเลิก')}</button></div>
   </div>}
  </section>
  <section className={card+' space-y-3'}>
   <h2 className="font-bold">{text('Receipts','ใบเสร็จ')}</h2>
   {trip.receipts.map(r=><div key={r.id} className="flex items-center gap-3 text-sm"><ReceiptThumb id={r.id}/><span className="flex-1">{text(...(kinds.find(k=>k[0]===r.kind)!.slice(1) as [string,string]))}{r.needsOriginal&&<span className="block text-xs text-amber-700">{text('Paper receipt needed','ต้องส่งใบเสร็จตัวจริง')}</span>}</span><span className="font-semibold">฿{money(r.amount)}</span>
    <button type="button" aria-label={text('Remove receipt','ลบใบเสร็จ')} onClick={()=>void run(()=>travelAction('receipt-remove',{tripId:trip.id,receiptId:r.id}))} className="rounded-lg p-2 text-slate-400"><Trash2 className="h-4 w-4"/></button></div>)}
   <AddReceipt trip={trip} text={text} run={run}/>
  </section>
  <section className="space-y-2">
   <button type="button" disabled={!arrived} onClick={()=>void run(()=>travelAction('submit',{tripId:trip.id}))} className={primary+' bg-slate-900'}>{text(`Finish and claim ฿${money(trip.total)}`,`จบทริปและเบิก ฿${money(trip.total)}`)}</button>
   {!arrived&&<p className="text-center text-xs text-slate-500">{text('Check in at a client first.','เช็กอินที่ลูกค้าก่อน')}</p>}
   {back||!arrived?null:<p className="text-center text-xs text-slate-500">{text('Going home after this client? You can finish now.','ไม่กลับออฟฟิศ? กดจบทริปได้เลย')}</p>}
   {confirmCancel?<div className="flex gap-2"><button type="button" onClick={()=>void run(()=>travelAction('cancel',{tripId:trip.id}))} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white">{text('Yes, cancel this trip','ยืนยันยกเลิกทริป')}</button><button type="button" onClick={()=>setConfirmCancel(false)} className="rounded-xl border border-slate-200 px-4 text-sm font-semibold">{text('Keep','ไม่ยกเลิก')}</button></div>
    :<button type="button" onClick={()=>setConfirmCancel(true)} className="w-full py-2 text-sm font-semibold text-slate-500 underline">{text('Cancel trip','ยกเลิกทริป')}</button>}
  </section>
 </>;
}

export default function TravelClaims(){
 const navigate=useNavigate();
 const {language}=useLanguage();const th=language==='th';
 const text:T=useCallback((en,thai)=>th?thai:en,[th]);
 const [state,setState]=useState<TravelState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<TripSummary|null>(null);
 useEffect(()=>{let active=true;loadTravel().then(s=>{if(active)setState(s);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);
 const run=useCallback(async(fn:()=>Promise<TravelState>)=>{
  setBusy(true);setError('');
  try{const s=await fn();setState(s);if(s.submitted)setDone(s.submitted);}
  catch(e){const err=e as TravelError;if(err.state)setState(err.state);setError(err.distanceM?text(`${err.message} (${Math.round(err.distanceM)} m away)`,`ยังไม่ถึงออฟฟิศ (ห่าง ${Math.round(err.distanceM)} ม.)`):err.message);}
  finally{setBusy(false);}
 },[text]);
 const date=(d:string)=>new Date(d+'T12:00:00+07:00').toLocaleDateString(th?'th-TH':'en-GB',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'});
 return <main className="min-h-dvh bg-slate-50 pb-10">
  <header className="bg-linear-to-br from-cyan-500 to-cyan-700 px-5 pt-6 pb-8 text-white">
   <button type="button" onClick={()=>navigate('/')} className="mb-5 flex items-center gap-1 text-sm font-semibold text-cyan-50"><ArrowLeft className="h-4 w-4"/>{text('Back','กลับ')}</button>
   <p className="text-xs font-bold uppercase tracking-wider text-cyan-100">TBS · {text('Travel claims','เบิกค่าเดินทาง')}</p>
   <h1 className="mt-1 text-2xl font-bold">{text('Client visits','ไปพบลูกค้า')}</h1>
   {state&&<p className="mt-1 text-sm text-cyan-50">{text(`Car ฿${money(state.settings.rate)}/km · tolls, parking and Grab by receipt`,`รถส่วนตัว ฿${money(state.settings.rate)}/กม. · ทางด่วน จอดรถ Grab ตามใบเสร็จ`)}</p>}
  </header>
  <div className="-mt-4 space-y-3 px-4">
   {state===null&&!error&&<div className={card+' flex items-center gap-2 text-slate-500'}><Loader2 className="h-5 w-5 animate-spin"/>{text('Loading…','กำลังโหลด…')}</div>}
   {error&&<p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
   {busy&&<div className="fixed inset-0 z-50 grid place-items-center bg-white/60"><Loader2 className="h-8 w-8 animate-spin text-cyan-700"/></div>}
   {done&&<div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="h-6 w-6 shrink-0"/><div><p className="font-bold">{text(`Claim sent · ฿${money(done.total)}`,`ส่งเบิกแล้ว · ฿${money(done.total)}`)}</p><p className="text-sm">{done.status==='flagged'?text('Your manager will check this trip first.','หัวหน้าจะตรวจทริปนี้ก่อน'):text('Accounting will receive it tomorrow morning.','บัญชีจะได้รับพรุ่งนี้เช้า')}{done.originalsWaiting>0?' '+text('Hand paper receipts to accounting within 7 days.','ส่งใบเสร็จตัวจริงให้บัญชีภายใน 7 วัน'):''}</p></div></div>}
   {state&&!state.eligible&&<p className={card+' text-sm text-slate-600'}>{text('Travel claims are not open for your team yet.','ยังไม่เปิดให้ทีมของคุณเบิกค่าเดินทาง')}</p>}
   {state?.eligible&&!state.configured&&<p className={card+' text-sm text-slate-600'}>{text('HR is still setting up travel claims. Please check back soon.','HR กำลังตั้งค่าระบบเบิกค่าเดินทาง กรุณารอสักครู่')}</p>}
   {state?.eligible&&state.configured&&(state.trip?<OpenTrip key={state.trip.id} trip={state.trip} text={text} run={run}/>:<StartForm state={state} text={text} run={run}/>)}
   {!!state?.recent.length&&<section className={card+' space-y-2'}>
    <h2 className="font-bold">{text('Recent claims','รายการเบิกล่าสุด')}</h2>
    {state.recent.map(t=><div key={t.id} className="flex items-center gap-3 border-t border-slate-100 pt-2 text-sm first:border-0 first:pt-0">
     <span className="w-14 shrink-0 text-xs text-slate-500">{date(t.date)}</span>
     <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.clients.join(', ')}</span><span className={`text-xs ${t.status==='rejected'?'text-rose-700':t.status==='flagged'?'text-amber-700':'text-slate-500'}`}>{statusLabel(t.status,text)}{t.status==='flagged'&&t.flags.length?<> · <Flag className="inline h-3 w-3"/> {t.flags.map(f=>flagLabel(f,text)).join(', ')}</>:null}</span></span>
     <span className="font-semibold">฿{money(t.total)}</span></div>)}
   </section>}
  </div>
 </main>;
}
