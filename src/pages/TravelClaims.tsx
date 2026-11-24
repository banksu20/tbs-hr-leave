import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft,Briefcase,Building2,Camera,Car,CarTaxiFront,Check,CheckCircle2,ChevronRight,Clock,ExternalLink,Flag,Home,ImagePlus,Link2,Loader2,MapPin,Navigation,Plus,Receipt,Search,Smartphone,Trash2,X} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {currentPosition,findPlaces,loadTravel,money,prepareFile,readReceipt,receiptUrl,travelAction,TravelError,type Fix,type Place,type ReceiptKind,type ReceiptRead,type TravelState,type TripDetail,type TripStatus,type TripSummary,flagLabel,statusLabel} from '@/lib/travel';

import type {T} from '@/lib/travel';
type Run=(fn:()=>Promise<TravelState>)=>Promise<void>;
const card='rounded-3xl border border-slate-100 bg-white p-5 shadow-md shadow-slate-200/60';
const input='w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-sky-500';
const primary='flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 py-4 text-[15px] font-bold text-white shadow-lg shadow-sky-600/25 transition active:scale-[.99] disabled:bg-slate-300 disabled:shadow-none';
const secondary='flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-slate-700 transition active:scale-[.99]';
const label='mb-2 block text-[13px] font-semibold text-slate-500';
const kinds:[ReceiptKind,string,string][]=[['toll','Toll','ค่าทางด่วน'],['parking','Parking','ค่าจอดรถ'],['grab','Grab','Grab'],['taxi','Taxi','แท็กซี่'],['other','Other','อื่นๆ']];
const kindName=(k:ReceiptKind,text:T)=>text(...(kinds.find(x=>x[0]===k)!.slice(1) as [string,string]));
const statusTone:Record<TripStatus,string>={open:'bg-sky-100 text-sky-800',submitted:'bg-sky-100 text-sky-800',flagged:'bg-amber-100 text-amber-800',approved:'bg-indigo-100 text-indigo-800',rejected:'bg-rose-100 text-rose-800',paid:'bg-emerald-100 text-emerald-800',cancelled:'bg-slate-100 text-slate-600'};
const mapLink=(lat:number,lng:number)=>`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const clock=(v:string)=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'});

function Segmented<V extends string>({options,value,onChange}:{options:[NoInfer<V>,string,React.ReactNode?][];value:V;onChange:(v:V)=>void}){
 return <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">{options.map(([v,l,icon])=><button key={v} type="button" aria-pressed={value===v} onClick={()=>onChange(v)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition ${value===v?'bg-white text-sky-700 shadow-sm':'text-slate-500'}`}>{icon}{l}</button>)}</div>;
}

function Tiles<V extends string>({options,value,onChange}:{options:[NoInfer<V>,string,string,React.ReactNode][];value:V;onChange:(v:V)=>void}){
 return <div className={`grid gap-2 ${options.length===3?'grid-cols-3':'grid-cols-2'}`}>{options.map(([v,l,sub,icon])=><button key={v} type="button" aria-pressed={value===v} onClick={()=>onChange(v)} className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition ${value===v?'border-sky-500 bg-sky-50 text-sky-800':'border-slate-100 bg-white text-slate-600'}`}>
  <span className={`grid h-9 w-9 place-items-center rounded-xl ${value===v?'bg-sky-600 text-white':'bg-slate-100 text-slate-500'}`}>{icon}</span>
  <span className="text-sm font-bold">{l}</span><span className="text-[11px] text-slate-500">{sub}</span></button>)}</div>;
}

function PlacePicker({text,value,onChange}:{text:T;value:Place|null;onChange:(p:Place|null)=>void}){
 const [way,setWay]=useState<'link'|'search'>('link'),[query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const isLink=/^https?:\/\//i.test(query.trim());
 const canFind=way==='link'?isLink:query.trim().length>=2;
 const switchWay=(w:'link'|'search')=>{setWay(w);setQuery('');setPlaces(null);setError('');};
 const search=async()=>{if(!canFind)return;setBusy(true);setError('');setPlaces(null);try{const p=await findPlaces(query);setPlaces(p);if(p.length===1)onChange(p[0]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(value)return <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white"><MapPin className="h-5 w-5"/></span>
  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold leading-snug text-slate-900">{value.label}</span><a href={mapLink(value.lat,value.lng)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">{text('View on map','ดูบนแผนที่')}<ExternalLink className="h-3 w-3"/></a></span>
  <button type="button" onClick={()=>{onChange(null);setPlaces(null);}} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">{text('Change','เปลี่ยน')}</button></div>;
 return <div className="space-y-2.5">
  <Segmented<'link'|'search'> value={way} onChange={switchWay} options={[['link',text('Maps link','ลิงก์แผนที่'),<Link2 key="l" className="h-4 w-4"/>],['search',text('Search','ค้นหา'),<Search key="s" className="h-4 w-4"/>]]}/>
  <div className="relative">
   {way==='link'?<Link2 className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400"/>:<Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400"/>}
   <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}} inputMode={way==='link'?'url':undefined} placeholder={way==='link'?text('Paste the Google Maps link','วางลิงก์ Google Maps'):text('Place name or address','ชื่อสถานที่หรือที่อยู่')} className={input+' pr-14 pl-10'}/>
   <button type="button" onClick={()=>void search()} disabled={busy||!canFind} aria-label={way==='link'?text('Use link','ใช้ลิงก์'):text('Find','ค้นหา')} className="absolute top-1/2 right-1.5 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl bg-sky-600 text-white transition disabled:bg-slate-200 disabled:text-slate-400">{busy?<Loader2 className="h-5 w-5 animate-spin"/>:way==='link'?<Check className="h-5 w-5"/>:<ChevronRight className="h-5 w-5"/>}</button>
  </div>
  {way==='link'&&!error&&!(query.trim()&&!isLink)&&<p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">{text('Open the place in Google Maps, tap Share, then Copy link.','เปิดสถานที่ใน Google Maps กด แชร์ แล้ว คัดลอกลิงก์')}<a href="https://maps.google.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sky-700">{text('Open Google Maps','เปิด Google Maps')}<ExternalLink className="h-3 w-3"/></a></p>}
  {way==='link'&&query.trim()&&!isLink&&<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{text('This is not a link. Use Search for names and addresses.','นี่ไม่ใช่ลิงก์ ใช้ ค้นหา สำหรับชื่อหรือที่อยู่')}</p>}
  {error&&<p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
  {places?.length===0&&<p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{way==='link'?text('No place found in this link. Try Search.','ไม่พบสถานที่ในลิงก์นี้ ลอง ค้นหา'):text('No place found. Try the full address or a Google Maps link.','ไม่พบสถานที่ ลองพิมพ์ที่อยู่เต็ม หรือใช้ลิงก์ Google Maps')}</p>}
  {places&&places.length>1&&<div className="overflow-hidden rounded-2xl border border-slate-200"><p className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">{text('Choose the right place','เลือกสถานที่ที่ถูกต้อง')}</p>
   <ul className="divide-y divide-slate-100">{places.map(p=><li key={`${p.lat},${p.lng}`}><button type="button" onClick={()=>onChange(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-sky-50"><MapPin className="h-4 w-4 shrink-0 text-sky-600"/><span className="flex-1">{p.label}</span><ChevronRight className="h-4 w-4 text-slate-300"/></button></li>)}</ul></div>}
 </div>;
}

function StartForm({state,text,run}:{state:TravelState;text:T;run:Run}){
 const [client,setClient]=useState(''),[place,setPlace]=useState<Place|null>(null),[purpose,setPurpose]=useState<'deal'|'care'>('deal'),[dealRef,setDealRef]=useState('');
 const [mode,setMode]=useState<'car'|'grab'|'taxi'>('car'),[appointment,setAppointment]=useState(''),[from,setFrom]=useState<'office'|'home'>('office');
 const homeOk=!!appointment&&appointment<state.settings.homeCutoff;
 useEffect(()=>{if(!homeOk&&from==='home')setFrom('office');},[homeOk,from]);
 const ready=client.trim()&&place&&appointment;
 const missing=!client.trim()?text('Add the client name','ใส่ชื่อลูกค้า'):!place?text('Choose where you are going','เลือกสถานที่ที่จะไป'):!appointment?text('Add the appointment time','ใส่เวลานัด'):'';
 const start=()=>run(async()=>{
  const pos=from==='home'?await currentPosition():null;
  return travelAction('start',{purpose,dealRef,mode,startFrom:from,clientName:client.trim(),destLat:place!.lat,destLng:place!.lng,destLabel:place!.label,appointment,...(pos?{lat:pos.lat,lng:pos.lng,accuracy:pos.accuracy}:{})});
 });
 return <section className={card+' space-y-6'}>
  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-700"><Navigation className="h-5 w-5"/></span><div><h2 className="text-lg font-bold text-slate-900">{text('Start a trip','เริ่มทริป')}</h2><p className="text-xs text-slate-500">{text('Tap start when you leave. Distance is measured by road.','กดเริ่มตอนออกเดินทาง ระบบวัดระยะตามถนนจริง')}</p></div></div>
  <div><label className={label} htmlFor="travel-client">{text('Client','ลูกค้า')}</label>
   <div className="relative"><Briefcase className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400"/><input id="travel-client" value={client} maxLength={160} onChange={e=>setClient(e.target.value)} placeholder={text('Company or contact name','ชื่อบริษัทหรือผู้ติดต่อ')} className={input+' pl-10'}/></div></div>
  <div><span className={label}>{text('Where are you going?','ไปที่ไหน')}</span><PlacePicker text={text} value={place} onChange={setPlace}/></div>
  <div><span className={label}>{text('Purpose','วัตถุประสงค์')}</span><Segmented<'deal'|'care'> value={purpose} onChange={setPurpose} options={[['deal',text('Close a deal','ปิดดีล')],['care',text('Customer care','ดูแลลูกค้า')]]}/>
   {purpose==='deal'&&<input value={dealRef} maxLength={120} onChange={e=>setDealRef(e.target.value)} placeholder={text('Deal or quotation no. (optional)','เลขดีลหรือใบเสนอราคา (ไม่บังคับ)')} className={input+' mt-2'}/>}</div>
  <div><span className={label}>{text('Travel by','เดินทางโดย')}</span><Tiles<'car'|'grab'|'taxi'> value={mode} onChange={setMode} options={[['car',text('My car','รถส่วนตัว'),text(`฿${money(state.settings.rate)}/km`,`฿${money(state.settings.rate)}/กม.`),<Car key="c" className="h-5 w-5"/>],['grab','Grab',text('By receipt','ตามใบเสร็จ'),<Smartphone key="g" className="h-5 w-5"/>],['taxi',text('Taxi','แท็กซี่'),text('By receipt','ตามใบเสร็จ'),<CarTaxiFront key="t" className="h-5 w-5"/>]]}/></div>
  <div><label className={label} htmlFor="travel-time">{text('Appointment time','เวลานัด')}</label>
   <div className="relative"><Clock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400"/><input id="travel-time" type="time" value={appointment} onChange={e=>setAppointment(e.target.value)} className={input+' pl-10'}/></div></div>
  {homeOk&&<div><span className={label}>{text('Leaving from','ออกเดินทางจาก')}</span><Segmented<'office'|'home'> value={from} onChange={setFrom} options={[['office',text('Office','ออฟฟิศ'),<Building2 key="o" className="h-4 w-4"/>],['home',text('Home','บ้าน'),<Home key="h" className="h-4 w-4"/>]]}/>
   {from==='home'&&<p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">{text('We record where you are now. Distance from home is paid up to the office-to-client distance.','ระบบจะบันทึกตำแหน่งตอนนี้ ระยะจากบ้านจ่ายไม่เกินระยะจากออฟฟิศถึงลูกค้า')}</p>}</div>}
  <div className="space-y-2"><button type="button" disabled={!ready} onClick={()=>void start()} className={primary}><Navigation className="h-5 w-5"/>{text('Start trip','เริ่มเดินทาง')}</button>
   {missing&&<p className="text-center text-xs text-slate-400">{missing}</p>}</div>
 </section>;
}

function AddReceipt({trip,text,run}:{trip:TripDetail;text:T;run:Run}){
 const ref=useRef<HTMLInputElement>(null),library=useRef<HTMLInputElement>(null);
 const [file,setFile]=useState<{mime:string;content:string;preview:string}|null>(null),[reading,setReading]=useState(false),[kind,setKind]=useState<ReceiptKind>(trip.mode==='car'?'toll':trip.mode),[amount,setAmount]=useState(''),[read,setRead]=useState<{read:ReceiptRead;sig:string}|null>(null),[error,setError]=useState('');
 const pick=async(f:File|undefined)=>{
  if(!f)return;setError('');setReading(true);
  try{const p=await prepareFile(f);setFile(p);const r=await readReceipt(p.mime,p.content).catch(()=>null);setRead(r);if(r?.read.amount)setAmount(String(r.read.amount));if(r?.read.kind)setKind(r.read.kind);}
  catch(e){setError((e as Error).message);}finally{setReading(false);if(ref.current)ref.current.value='';if(library.current)library.current.value='';}
 };
 const clear=()=>{if(file?.preview)URL.revokeObjectURL(file.preview);setFile(null);setAmount('');setRead(null);};
 const value=Number(amount);
 const got=read?.read;
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
 const wrongType=(k:ReceiptKind)=>(trip.mode==='car'&&['grab','taxi'].includes(k))||(trip.mode==='grab'&&['taxi','parking'].includes(k))||(trip.mode==='taxi'&&['grab','parking'].includes(k));
 const warnings=[
  got?.isReceipt===false&&text("This doesn't look like a receipt. If you save it, HR will check the trip.",'รูปนี้ดูไม่ใช่ใบเสร็จ ถ้าบันทึก HR จะตรวจทริปนี้'),
  got?.date&&got.date!==trip.date&&text(`This receipt is dated ${got.date}, not the trip day. HR will check it.`,`ใบเสร็จนี้ลงวันที่ ${got.date} ไม่ใช่วันเดินทาง HR จะตรวจ`),
  wrongType(kind)&&text('This type of receipt does not match how you travelled. HR will check it.','ประเภทใบเสร็จไม่ตรงกับการเดินทาง HR จะตรวจ'),
 ].filter(Boolean) as string[];
 const save=()=>run(async()=>{const s=await travelAction('receipt-add',{tripId:trip.id,kind,mime:file!.mime,content:file!.content,amount:value,...(read?{read:read.read,readSig:read.sig}:{})});clear();return s;});
 return <>
  <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>void pick(e.target.files?.[0])}/>
  <input ref={library} type="file" accept="image/*,application/pdf" className="hidden" onChange={e=>void pick(e.target.files?.[0])}/>
  {!file&&(reading?<div className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/60 text-sky-700"><Loader2 className="h-6 w-6 animate-spin"/><span className="text-xs font-bold">{text('Reading…','กำลังอ่าน…')}</span></div>
   :<div className="flex aspect-[3/4] flex-col overflow-hidden rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/60 text-sky-700">
    <button type="button" onClick={()=>ref.current?.click()} className="flex flex-1 flex-col items-center justify-center gap-1 transition active:bg-sky-100"><Camera className="h-5 w-5"/><span className="text-xs font-bold">{text('Camera','ถ่ายรูป')}</span></button>
    <span className="mx-3 border-t border-dashed border-sky-200"/>
    <button type="button" onClick={()=>library.current?.click()} className="flex flex-1 flex-col items-center justify-center gap-1 transition active:bg-sky-100"><ImagePlus className="h-5 w-5"/><span className="text-xs font-bold">{text('Photos','เลือกรูป')}</span></button>
   </div>)}
  {error&&<p className="col-span-full rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
  {file&&<div className="col-span-full space-y-3 rounded-2xl bg-slate-50 p-3">
   <div className="flex gap-3">{file.preview?<img src={file.preview} alt="" className="h-28 w-20 rounded-xl object-cover shadow-sm"/>:<span className="grid h-28 w-20 place-items-center rounded-xl bg-white text-xs font-bold text-slate-500">PDF</span>}
    <div className="min-w-0 flex-1 space-y-2">
     <div className="flex flex-wrap gap-1.5">{kinds.map(([v,en,th])=><button key={v} type="button" aria-pressed={kind===v} onClick={()=>setKind(v)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind===v?'bg-sky-600 text-white':'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{text(en,th)}</button>)}</div>
     <label className="relative block"><span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold text-slate-400">฿</span><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,''))} placeholder="0.00" aria-label={text('Amount','จำนวนเงิน')} className={input+' bg-white py-2.5 pl-9 text-right text-xl font-bold'}/></label>
    </div></div>
   {(got?.merchant||got?.time||got?.ref)&&<p className="text-xs text-slate-500">{[got.merchant,got.date&&got.time?`${got.date} ${got.time}`:got.time,got.ref&&`#${got.ref}`].filter(Boolean).join(' · ')}</p>}
   {warnings.map(w=><p key={w} className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><Flag className="mt-0.5 h-3 w-3 shrink-0"/>{w}</p>)}
   <p className="text-xs text-slate-500">{got?.amount?<span className="font-semibold text-emerald-700">{text('Amount read from the photo. ','อ่านยอดจากรูปแล้ว ')}</span>:null}{got?.amount?text('Fix it if it is wrong.','แก้ได้ถ้าไม่ถูก'):text('Type the amount on the receipt.','พิมพ์ยอดเงินตามใบเสร็จ')}{['toll','parking','other'].includes(kind)?' '+text('Keep the paper receipt for accounting.','เก็บใบเสร็จตัวจริงไว้ส่งบัญชี'):''}</p>
   <div className="flex gap-2"><button type="button" disabled={!(value>0&&value<=100000)} onClick={()=>void save()} className="flex-1 rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{text('Save receipt','บันทึกใบเสร็จ')}</button><button type="button" onClick={clear} className="rounded-2xl bg-white px-5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">{text('Cancel','ยกเลิก')}</button></div>
  </div>}
 </>;
}

function ReceiptTile({id,amount,kind,needsOriginal,text,onRemove}:{id:string;amount:number;kind:ReceiptKind;needsOriginal:boolean;text:T;onRemove:()=>void}){
 const [url,setUrl]=useState('');
 useEffect(()=>{let u='';let active=true;receiptUrl(id).then(x=>{u=x;if(active)setUrl(x);else URL.revokeObjectURL(x);}).catch(()=>undefined);return()=>{active=false;if(u)URL.revokeObjectURL(u);};},[id]);
 return <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
  {url?<a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="h-full w-full object-cover"/></a>:<span className="grid h-full place-items-center"><Receipt className="h-6 w-6 text-slate-300"/></span>}
  <button type="button" aria-label={text('Remove receipt','ลบใบเสร็จ')} onClick={onRemove} className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm"><Trash2 className="h-3.5 w-3.5"/></button>
  <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-white"><span className="block text-[11px] font-medium opacity-90">{kindName(kind,text)}{needsOriginal?' · '+text('paper','ตัวจริง'):''}</span><span className="block text-sm font-bold">฿{money(amount)}</span></span>
 </div>;
}

type Node={key:string;title:string;sub?:string;icon:React.ReactNode;state:'done'|'next'|'todo';at?:string;leg?:{km:number;amount:number;capped:boolean};stopId?:number};

function OpenTrip({trip,text,run}:{trip:TripDetail;text:T;run:Run}){
 const [adding,setAdding]=useState(false),[client,setClient]=useState(''),[place,setPlace]=useState<Place|null>(null),[confirmCancel,setConfirmCancel]=useState(false);
 const last=trip.points[trip.points.length-1];
 const back=last?.kind==='return_office';
 const next=back?undefined:trip.stops.find(s=>!s.arrivedAt);
 const arrived=trip.points.some(p=>p.kind==='arrive');
 const gpsCheck=async(p:Fix,go:()=>Promise<TravelState>)=>{
  if(p.accuracy>100&&!window.confirm(text(`GPS is weak right now (±${p.accuracy} m). Continue anyway? The trip will be checked by your manager.`,`GPS ไม่แม่นตอนนี้ (±${p.accuracy} ม.) ดำเนินการต่อหรือไม่ ทริปนี้จะต้องให้หัวหน้าตรวจ`)))throw new TravelError(text('Try again when GPS is better.','ลองใหม่เมื่อ GPS ดีขึ้น'),0);
  return go();
 };
 const arrive=(stopId:number)=>run(async()=>{const p=await currentPosition();return gpsCheck(p,()=>travelAction('arrive',{tripId:trip.id,stopId,prevPointId:last.id,...p}));});
 const ret=()=>run(async()=>{const p=await currentPosition();return gpsCheck(p,()=>travelAction('return',{tripId:trip.id,prevPointId:last.id,...p}));});
 const addStop=()=>run(async()=>{const s=await travelAction('add-stop',{tripId:trip.id,clientName:client.trim(),destLat:place!.lat,destLng:place!.lng,destLabel:place!.label});setAdding(false);setClient('');setPlace(null);return s;});
 const legTo=(pointId?:number)=>pointId==null?undefined:trip.legs.find(l=>l.to===pointId);
 const startPoint=trip.points[0];
 const nodes:Node[]=[
  {key:'start',title:trip.startFrom==='home'?text('Left home','ออกจากบ้าน'):text('Left the office','ออกจากออฟฟิศ'),icon:trip.startFrom==='home'?<Home className="h-4 w-4"/>:<Building2 className="h-4 w-4"/>,state:'done',at:startPoint?.at},
  ...trip.stops.map(s=>{const p=trip.points.find(x=>x.kind==='arrive'&&x.stopId===s.id);return {key:`s${s.id}`,title:s.clientName,sub:s.label,icon:s.arrivedAt?<Check className="h-4 w-4"/>:<MapPin className="h-4 w-4"/>,state:s.arrivedAt?'done':next?.id===s.id?'next':'todo',at:p?.at,leg:legTo(p?.id),stopId:s.id} as Node;}),
  ...(back?[{key:'back',title:text('Back at the office','กลับถึงออฟฟิศ'),icon:<Building2 className="h-4 w-4"/>,state:'done',at:last.at,leg:legTo(last.id)} as Node]:[]),
 ];
 return <>
  <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
   <div className="p-5">
    <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-sky-300 uppercase"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"/><span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400"/></span>{text('Trip in progress','กำลังเดินทาง')}</p>
    <p className="mt-2 text-4xl font-extrabold tracking-tight">฿{money(trip.total)}</p>
    <p className="mt-1 text-sm text-slate-300">{trip.clients.join(' · ')}</p>
   </div>
   <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center">
    <div className="p-3"><dt className="text-[11px] text-slate-400">{text('Distance','ระยะทาง')}</dt><dd className="font-bold">{money(trip.km)} {text('km','กม.')}</dd></div>
    <div className="p-3"><dt className="text-[11px] text-slate-400">{trip.mode==='car'?text('Mileage','ค่าระยะทาง'):text('Travel by','เดินทางโดย')}</dt><dd className="font-bold">{trip.mode==='car'?`฿${money(trip.kmAmount)}`:trip.mode==='grab'?'Grab':text('Taxi','แท็กซี่')}</dd></div>
    <div className="p-3"><dt className="text-[11px] text-slate-400">{text('Receipts','ใบเสร็จ')}</dt><dd className="font-bold">฿{money(trip.receiptAmount)}</dd></div>
   </dl>
  </section>

  <section className={card}>
   <h2 className="mb-4 font-bold text-slate-900">{text('Route','เส้นทาง')}</h2>
   <ol>{nodes.map((n,i)=><li key={n.key} className="relative flex gap-3 pb-5 last:pb-0">
    {i<nodes.length-1&&<span className={`absolute top-9 bottom-0 left-[17px] w-0.5 ${nodes[i+1].state==='done'?'bg-sky-500':'bg-slate-200'}`}/>}
    <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.state==='done'?'bg-sky-600 text-white':n.state==='next'?'bg-white text-sky-700 ring-4 ring-sky-200':'bg-slate-100 text-slate-400'}`}>{n.icon}</span>
    <div className="min-w-0 flex-1 pt-1.5">
     {n.leg&&<p className="-mt-1 mb-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">+{money(n.leg.km)} {text('km','กม.')}{trip.mode==='car'?` · ฿${money(n.leg.amount)}`:''}{n.leg.capped?' · '+text('capped','จำกัด'):''}</p>}
     <div className="flex items-baseline justify-between gap-2"><p className={`font-semibold ${n.state==='todo'?'text-slate-400':'text-slate-900'}`}>{n.title}</p>{n.at&&<span className="shrink-0 text-xs text-slate-400">{clock(n.at)}</span>}</div>
     {n.sub&&<p className="truncate text-xs text-slate-500">{n.sub}</p>}
     {n.state==='next'&&n.stopId!=null&&<button type="button" onClick={()=>void arrive(n.stopId!)} className={primary+' mt-3 py-3.5'}><MapPin className="h-5 w-5"/>{text("I've arrived",'ถึงแล้ว')}</button>}
    </div></li>)}</ol>
   {!back&&!next&&!adding&&<div className="mt-5 grid gap-2 border-t border-slate-100 pt-5">
    <button type="button" onClick={()=>void ret()} className={primary}><Building2 className="h-5 w-5"/>{text("I'm back at the office",'กลับถึงออฟฟิศแล้ว')}</button>
    <button type="button" onClick={()=>setAdding(true)} className={secondary}><Plus className="h-4 w-4"/>{text('Go to another client','ไปหาลูกค้าอีกราย')}</button>
   </div>}
   {adding&&<div className="mt-5 space-y-3 rounded-2xl bg-slate-50 p-4">
    <p className="text-sm font-bold text-slate-800">{text('Next client','ลูกค้ารายต่อไป')}</p>
    <div className="relative"><Briefcase className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={client} maxLength={160} onChange={e=>setClient(e.target.value)} placeholder={text('Client','ลูกค้า')} className={input+' bg-white pl-10'}/></div>
    <PlacePicker text={text} value={place} onChange={setPlace}/>
    <div className="flex gap-2"><button type="button" disabled={!client.trim()||!place} onClick={()=>void addStop()} className="flex-1 rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white disabled:bg-slate-300">{text('Add client','เพิ่มลูกค้า')}</button><button type="button" onClick={()=>setAdding(false)} className="rounded-2xl bg-white px-5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">{text('Cancel','ยกเลิก')}</button></div>
   </div>}
  </section>

  <section className={card}>
   <div className="mb-3 flex items-baseline justify-between"><h2 className="font-bold text-slate-900">{text('Receipts','ใบเสร็จ')}</h2><span className="text-xs text-slate-500">{text('Tolls, parking, Grab, taxi','ทางด่วน จอดรถ Grab แท็กซี่')}</span></div>
   <div className="grid grid-cols-3 gap-2">
    {trip.receipts.map(r=><ReceiptTile key={r.id} id={r.id} amount={r.amount} kind={r.kind} needsOriginal={r.needsOriginal} text={text} onRemove={()=>void run(()=>travelAction('receipt-remove',{tripId:trip.id,receiptId:r.id}))}/>)}
    <AddReceipt trip={trip} text={text} run={run}/>
   </div>
  </section>

  <section className="space-y-3 pt-1">
   <button type="button" disabled={!arrived} onClick={()=>void run(()=>travelAction('submit',{tripId:trip.id}))} className="flex w-full items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white shadow-lg shadow-slate-900/20 transition active:scale-[.99] disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">
    <span className="text-left"><span className="block text-[15px] font-bold">{text('Finish and claim','จบทริปและเบิก')}</span><span className="block text-xs opacity-75">{!arrived?text('Check in at a client first','เช็กอินที่ลูกค้าก่อน'):back?text('Sends your claim now','ส่งรายการเบิกทันที'):text('Going home after this? Finish here.','ไม่กลับออฟฟิศ? จบทริปได้เลย')}</span></span>
    <span className="text-xl font-extrabold">฿{money(trip.total)}</span></button>
   {confirmCancel?<div className="flex gap-2 rounded-2xl bg-rose-50 p-2"><button type="button" onClick={()=>void run(()=>travelAction('cancel',{tripId:trip.id}))} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white">{text('Yes, cancel this trip','ยืนยันยกเลิกทริป')}</button><button type="button" onClick={()=>setConfirmCancel(false)} className="rounded-xl bg-white px-5 text-sm font-semibold text-slate-700">{text('Keep','ไม่ยกเลิก')}</button></div>
    :<button type="button" onClick={()=>setConfirmCancel(true)} className="w-full py-2 text-sm font-semibold text-slate-400">{text('Cancel this trip','ยกเลิกทริปนี้')}</button>}
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
  catch(e){const err=e as TravelError;if(err.state)setState(err.state);if(!err.distanceM){setError(err.message);return;}const m=Math.round(err.distanceM),far=m>=1000,client=/client/i.test(err.message);setError(text(`${client?'You are not at the client yet.':'You are not at the office yet.'} (${far?`${money(Math.round(m/100)/10)} km`:`${m} m`} away)`,`${client?'ยังไม่ถึงที่ลูกค้า':'ยังไม่ถึงออฟฟิศ'} (ห่าง ${far?`${money(Math.round(m/100)/10)} กม.`:`${m} ม.`})`));}
  finally{setBusy(false);}
 },[text]);
 const month=useMemo(()=>{
  const ym=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}).slice(0,7);
  const list=(state?.recent??[]).filter(t=>t.date.startsWith(ym)&&!['rejected','cancelled'].includes(t.status));
  return {total:list.reduce((s,t)=>s+Number(t.total),0),trips:list.length,paper:(state?.recent??[]).reduce((s,t)=>s+t.originalsWaiting,0)};
 },[state]);
 const day=(d:string)=>new Date(d+'T12:00:00+07:00');
 return <main className="min-h-dvh bg-slate-50 pb-12">
  <header className="relative overflow-hidden rounded-b-[2rem] bg-linear-to-br/srgb from-sky-500 via-sky-600 to-indigo-600 px-5 pt-6 pb-20 text-white">
   <span className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10"/><span className="pointer-events-none absolute bottom-0 -left-10 h-32 w-32 rounded-full bg-white/5"/>
   <div className="relative md:mx-auto md:max-w-2xl">
    <button type="button" onClick={()=>navigate('/')} className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1.5 pr-3.5 pl-2.5 text-sm font-semibold backdrop-blur-sm"><ArrowLeft className="h-4 w-4"/>{text('Back','กลับ')}</button>
    <p className="text-sm font-medium text-sky-100">{text('Travel claims','เบิกค่าเดินทาง')}</p>
    <h1 className="text-[28px] leading-tight font-extrabold">{text('Client visits','ไปพบลูกค้า')}</h1>
    <div className="mt-4 grid grid-cols-3 gap-2">
     {[[text('This month','เดือนนี้'),`฿${money(month.total)}`],[text('Trips','ทริป'),String(month.trips)],[text('Paper due','ใบเสร็จค้างส่ง'),String(month.paper)]].map(([k,v])=><div key={k} className="rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm"><p className="text-[11px] font-medium text-sky-100">{k}</p><p className="truncate text-lg font-extrabold">{state?v:'–'}</p></div>)}
    </div>
   </div>
  </header>
  <div className="relative -mt-12 space-y-4 px-4 md:mx-auto md:max-w-2xl">
   {state===null&&!error&&<div className={card+' flex items-center gap-3 text-slate-500'}><Loader2 className="h-5 w-5 animate-spin text-sky-600"/>{text('Loading…','กำลังโหลด…')}</div>}
   {error&&<p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800 shadow-md shadow-slate-200/60">{error}</p>}
   {busy&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/10 backdrop-blur-[2px]"><div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-xl"><Loader2 className="h-5 w-5 animate-spin text-sky-600"/>{text('One moment…','สักครู่…')}</div></div>}
   {done&&<section className="overflow-hidden rounded-3xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
    <div className="flex items-center gap-4 p-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20"><CheckCircle2 className="h-7 w-7"/></span><div><p className="text-xs font-semibold text-emerald-100">{text('Claim sent','ส่งเบิกแล้ว')}</p><p className="text-3xl font-extrabold">฿{money(done.total)}</p></div></div>
    <p className="border-t border-white/15 bg-emerald-700/40 px-5 py-3 text-sm">{done.status==='flagged'?text('Your manager will check this trip first.','หัวหน้าจะตรวจทริปนี้ก่อน'):text('Accounting will receive it tomorrow morning.','บัญชีจะได้รับพรุ่งนี้เช้า')}{done.originalsWaiting>0?' '+text('Hand paper receipts to accounting within 7 days.','ส่งใบเสร็จตัวจริงให้บัญชีภายใน 7 วัน'):''}</p>
   </section>}
   {state&&!state.eligible&&<div className={card+' text-center'}><Car className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-sm text-slate-600">{text('Travel claims are not open for your team yet.','ยังไม่เปิดให้ทีมของคุณเบิกค่าเดินทาง')}</p></div>}
   {state?.eligible&&!state.configured&&<div className={card+' text-center'}><Clock className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-sm text-slate-600">{text('HR is still setting up travel claims. Please check back soon.','HR กำลังตั้งค่าระบบเบิกค่าเดินทาง กรุณารอสักครู่')}</p></div>}
   {state?.eligible&&state.configured&&(state.trip?<OpenTrip key={state.trip.id} trip={state.trip} text={text} run={run}/>:<StartForm state={state} text={text} run={run}/>)}
   {!!state?.recent.length&&<section className={card}>
    <h2 className="mb-3 font-bold text-slate-900">{text('Recent claims','รายการเบิกล่าสุด')}</h2>
    <ul className="space-y-2">{state.recent.map(t=><li key={t.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
     <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-center leading-none shadow-sm"><span><span className="block text-lg font-extrabold text-slate-900">{day(t.date).getDate()}</span><span className="block text-[10px] font-semibold text-slate-500 uppercase">{day(t.date).toLocaleDateString(th?'th-TH':'en-GB',{month:'short',timeZone:'Asia/Bangkok'})}</span></span></span>
     <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{t.clients.join(', ')}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[t.status]}`}>{statusLabel(t.status,text)}</span><span className="text-[11px] text-slate-500">{money(t.km)} {text('km','กม.')}</span>{t.originalsWaiting>0&&<span className="text-[11px] font-medium text-amber-700">· {text('paper due','ค้างใบเสร็จ')}</span>}</span>
      {t.status==='flagged'&&t.flags.length>0&&<span className="mt-1 flex items-center gap-1 text-[11px] text-amber-700"><Flag className="h-3 w-3"/>{t.flags.map(f=>flagLabel(f,text)).join(', ')}</span>}</span>
     <span className="text-base font-extrabold text-slate-900">฿{money(t.total)}</span></li>)}</ul>
   </section>}
   {state&&<p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-slate-400"><ImagePlus className="h-3.5 w-3.5"/>{text(`Car ฿${money(state.settings.rate)}/km by road · tolls, parking, Grab and taxi by receipt`,`รถส่วนตัว ฿${money(state.settings.rate)}/กม. ตามถนน · ทางด่วน จอดรถ Grab แท็กซี่ ตามใบเสร็จ`)}</p>}
  </div>
 </main>;
}
