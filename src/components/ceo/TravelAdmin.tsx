import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Banknote,BellRing,Building2,Car,CheckCircle2,ChevronRight,ExternalLink,FileText,Flag,Home,Loader2,MapPin,Power,Receipt,Search,ShieldCheck,SlidersHorizontal,Users,Wallet,XCircle} from 'lucide-react';
import TravelPayout from './TravelPayout';
import {useDashboardText} from '@/hooks/useDashboardText';
import {useLanguage} from '@/hooks/useLanguage';
import {adminReceiptUrl,decideTrip,findOffice,loadTrip,loadTravelSettings,loadTrips,markTrip,saveTravelAccess,saveTravelSettings,type AdminTrip,type AdminTripRow,type TravelPerson,type TravelSettings} from '@/lib/hrAdmin';
import {flagLabel,money,statusLabel,type Place,type T} from '@/lib/travel';

const field='mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-sky-500';
const filters=['flagged','submitted','approved','paid','rejected',''] as const;

const card='rounded-2xl border border-slate-200 bg-white p-5 shadow-xs';
const tones:Record<string,string>={open:'bg-sky-100 text-sky-800',submitted:'bg-sky-100 text-sky-800',flagged:'bg-amber-100 text-amber-800',approved:'bg-indigo-100 text-indigo-800',rejected:'bg-rose-100 text-rose-800',paid:'bg-emerald-100 text-emerald-800',cancelled:'bg-slate-100 text-slate-600'};
const initials=(n:string)=>n.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
const receiptIssues=(r:AdminTrip['receipts'][number],date:string,dt:(s:string)=>string)=>[r.readIsReceipt===false&&dt('Not a receipt'),r.readDate&&r.readDate!==date&&dt('Other day'),r.wrongTime&&dt('Outside trip time'),r.duplicate&&dt('Used before'),r.wrongKind&&dt('Wrong type')].filter(Boolean) as string[];
const clock=(v:string)=>new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'});

function TripDetailView({id,onBack,onChanged,accounting}:{id:number;onBack:()=>void;onChanged:()=>void;accounting?:boolean}){
 const dt=useDashboardText();const {language}=useLanguage();const text:T=(en,th)=>language==='th'?th:en;
 const [trip,setTrip]=useState<AdminTrip|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{loadTrip(id).then(setTrip).catch(e=>setError((e as Error).message));},[id]);
 const act=async(fn:()=>Promise<AdminTrip>)=>{setBusy(true);setError('');try{setTrip(await fn());onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const pointName=(pid:number)=>{const p=trip?.points.find(x=>x.id===pid);if(!p)return '';if(p.kind==='start_home')return dt('Home');if(p.kind!=='arrive')return dt('Office');return trip?.stops.find(s=>s.id===p.stopId)?.clientName??'';};
 const mapLink=(lat:number,lng:number)=>`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
 const route=trip?.legs.length?[trip.legs[0].from,...trip.legs.map(l=>l.to)]:[];
 const icon=(pid:number)=>{const k=trip?.points.find(x=>x.id===pid)?.kind;return k==='start_home'?<Home className="h-4 w-4"/>:k==='arrive'?<MapPin className="h-4 w-4"/>:<Building2 className="h-4 w-4"/>;};
 return <section className="space-y-4">
  <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/>{dt('All claims')}</button>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {!trip&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
  {trip&&<div className="grid gap-4 lg:grid-cols-[1fr_320px]">
   <div className="space-y-4">
    <div className={card+' flex flex-wrap items-center gap-4'}>
     <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br/srgb from-sky-500 to-indigo-600 font-extrabold text-white">{initials(trip.employee)}</span>
     <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold text-slate-900">{trip.employee}</h2><p className="text-sm text-slate-500">{[trip.department,trip.date,trip.purpose==='deal'?dt('Deal'):dt('Customer care'),trip.dealRef].filter(Boolean).join(' · ')}</p></div>
     <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[trip.status]}`}>{statusLabel(trip.status,text)}</span>
    </div>
    {(trip.flags.length>0||trip.autoClosed)&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900"><Flag className="h-4 w-4"/>{dt('Why this trip needs a check')}</p>
     <div className="flex flex-wrap gap-1.5">{trip.flags.map(f=><span key={f} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">{flagLabel(f,text)}</span>)}{trip.autoClosed&&<span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{dt('Closed automatically at midnight')}</span>}</div></div>}
    <div className={card}><h3 className="mb-4 font-bold text-slate-900">{dt('Route')}</h3>
     {route.length?<ol>{route.map((pid,i)=>{const p=trip.points.find(x=>x.id===pid)!;const leg=trip.legs.find(l=>l.to===pid);const weak=p.accuracy!=null&&p.accuracy>100;return <li key={pid} className="relative flex gap-3 pb-5 last:pb-0">
      {i<route.length-1&&<span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-sky-200"/>}
      <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${i===0||i===route.length-1?'bg-slate-900':'bg-sky-600'}`}>{icon(pid)}</span>
      <div className="min-w-0 flex-1 pt-1.5">
       {leg&&<p className="-mt-1 mb-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">+{dt('{0} km',[money(leg.km)])}{trip.mode==='car'?` · ฿${money(leg.amount)}`:''}</p>}
       <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="font-semibold text-slate-900">{pointName(pid)}</p><span className="text-xs text-slate-400">{clock(p.at)}</span>
        {p.accuracy!=null&&<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${weak?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-500'}`}>{dt('±{0} m',[Math.round(p.accuracy)])}</span>}
        <a className="inline-flex items-center gap-0.5 text-xs font-semibold text-sky-700 hover:underline" href={mapLink(p.lat,p.lng)} target="_blank" rel="noreferrer">{dt('Map')}<ExternalLink className="h-3 w-3"/></a></div>
       {leg?.capped&&<p className="mt-0.5 text-xs text-amber-700">{dt('Capped at office distance (actual {0} km)',[money(leg.routeKm)])}</p>}
      </div></li>;})}</ol>:<p className="text-sm text-slate-500">{dt('No distance recorded.')}</p>}
    </div>
    <div className={card}><h3 className="mb-3 font-bold text-slate-900">{dt('Receipts')}</h3>
     {trip.receipts.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{trip.receipts.map(r=><a key={r.id} href={adminReceiptUrl(r.id)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-100 bg-slate-50 transition hover:border-sky-300">
      {r.mime==='application/pdf'?<span className="grid aspect-[4/3] place-items-center bg-slate-100 text-slate-500"><FileText className="h-6 w-6"/></span>:<img src={adminReceiptUrl(r.id)} alt="" className="aspect-[4/3] w-full object-cover"/>}
      <span className="block space-y-0.5 p-2.5 text-xs"><span className="block text-sm font-extrabold text-slate-900">฿{money(r.amount)}</span>
       {(r.readMerchant||r.readTime||r.readRef)&&<span className="block truncate text-slate-500">{[r.readMerchant,r.readTime,r.readRef&&`#${r.readRef}`].filter(Boolean).join(' · ')}</span>}
       {r.edited&&r.readAmount!=null&&<span className="block font-medium text-amber-700">{dt('Photo read ฿{0}',[money(r.readAmount)])}</span>}
       {receiptIssues(r,trip.date,dt).map(x=><span key={x} className="mr-1 mt-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"><Flag className="h-2.5 w-2.5"/>{x}</span>)}
       {r.needsOriginal&&<span className={`block font-medium ${r.originalReceivedAt?'text-emerald-700':'text-amber-700'}`}>{r.originalReceivedAt?dt('Original received'):dt('Original pending')}</span>}</span></a>)}</div>:<p className="text-sm text-slate-500">{dt('No receipts.')}</p>}
    </div>
   </div>
   <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
    <div className="overflow-hidden rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/10">
     <div className="p-5"><p className="text-xs font-medium text-slate-400">{dt('Total')}</p><p className="text-4xl font-extrabold tracking-tight">฿{money(trip.total)}</p></div>
     <dl className="space-y-2 border-t border-white/10 p-5 text-sm">
      <div className="flex justify-between"><dt className="text-slate-400">{dt('Distance')}</dt><dd className="font-semibold">{dt('{0} km',[money(trip.km)])}{trip.mode==='car'?` · ฿${money(trip.kmAmount)}`:''}</dd></div>
      <div className="flex justify-between"><dt className="text-slate-400">{dt('Receipts')}</dt><dd className="font-semibold">฿{money(trip.receiptAmount)}</dd></div>
     </dl>
    </div>
    {trip.decidedBy&&<p className="flex items-start gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/><span><span className="font-semibold">{dt('Checked by {0}',[trip.decidedBy])}</span>{trip.decisionNote&&<span className="block text-indigo-800/80">{trip.decisionNote}</span>}</span></p>}
    {trip.status==='flagged'&&accounting&&<p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{dt('HR checks this trip before it can be paid.')}</p>}
    {trip.status==='flagged'&&!accounting&&<div className={card+' space-y-3'}><h3 className="font-bold text-slate-900">{dt('Your decision')}</h3>
     <textarea value={note} maxLength={500} rows={3} onChange={e=>setNote(e.target.value)} placeholder={dt('Note (optional)')} className={field+' mt-0'}/>
     <button type="button" disabled={busy} onClick={()=>void act(()=>decideTrip(trip.id,'approve',note))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50"><CheckCircle2 className="h-4 w-4"/>{dt('Approve')}</button>
     <button type="button" disabled={busy} onClick={()=>void act(()=>decideTrip(trip.id,'reject',note))} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white py-3 text-sm font-bold text-rose-700 disabled:opacity-50"><XCircle className="h-4 w-4"/>{dt('Reject')}</button></div>}
    {(trip.originalsWaiting>0||['submitted','approved'].includes(trip.status))&&<div className={card+' space-y-2'}>
     {trip.originalsWaiting>0&&<button type="button" disabled={busy} onClick={()=>void act(()=>markTrip(trip.id,'received'))} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Receipt className="h-4 w-4"/>{dt('Paper receipts received')}</button>}
     {['submitted','approved'].includes(trip.status)&&<button type="button" disabled={busy} onClick={()=>void act(()=>markTrip(trip.id,'paid'))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white disabled:opacity-50"><Banknote className="h-4 w-4"/>{dt('Mark as paid')}</button>}
    </div>}
   </aside>
  </div>}
 </section>;
}

function Settings(){
 const dt=useDashboardText();
 const [s,setS]=useState<TravelSettings|null>(null),[people,setPeople]=useState<TravelPerson[]>([]),[query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[depts,setDepts]=useState(''),[email,setEmail]=useState(''),[notify,setNotify]=useState('');
 const apply=(r:{settings:TravelSettings;people:TravelPerson[]})=>{setS(r.settings);setPeople(r.people);setDepts(r.settings.departments.join(', '));setEmail(r.settings.accountingEmail??'');setNotify(r.settings.payoutNotify??'');};
 useEffect(()=>{loadTravelSettings().then(apply).catch(e=>setError((e as Error).message));},[]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const search=()=>run(async()=>{setPlaces(await findOffice(query));});
 const save=()=>run(async()=>{apply(await saveTravelSettings({officeLat:s!.officeLat,officeLng:s!.officeLng,radius:Number(s!.radius),rate:Number(s!.rate),homeCutoff:s!.homeCutoff,tripKmCap:Number(s!.tripKmCap),accountingEmail:email.trim(),payoutNotify:notify,departments:depts.split(',').map(x=>x.trim()).filter(Boolean)}));setNotice(dt('Saved.'));});
 if(!s)return error?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>;
 const on=s.officeLat!=null;
 return <section className="space-y-4">
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  <div className={`rounded-2xl border p-5 shadow-xs ${on?'border-slate-200 bg-white':'border-amber-200 bg-amber-50'}`}>
   <div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${on?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{on?<CheckCircle2 className="h-5 w-5"/>:<Power className="h-5 w-5"/>}</span><div>
   <h3 className="font-bold text-slate-900">{on?dt('Office location'):dt('Claims are off')}</h3>
   <p className="text-sm text-slate-600">{on?dt('Claims are on. Staff must be within {0} m of this pin to check back in.',[s.radius]):dt('Claims stay off until you set the office pin.')}</p></div></div>
   {on&&<a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${s.officeLat},${s.officeLng}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4"/>{s.officeLat}, {s.officeLng}</a>}
   <div className="mt-3 flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={dt('Office address or Google Maps link')} className={field+' mt-0'}/><button type="button" disabled={busy||query.trim().length<2} onClick={()=>void search()} aria-label={dt('Find')} className="rounded-xl bg-slate-900 px-4 text-white disabled:opacity-50"><Search className="h-4 w-4"/></button></div>
   {places?.length===0&&<p className="mt-2 text-sm text-slate-500">{dt('No place found.')}</p>}
   {places&&places.length>0&&<ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{places.map(p=><li key={`${p.lat},${p.lng}`}><button type="button" onClick={()=>{setS({...s,officeLat:Number(p.lat.toFixed(6)),officeLng:Number(p.lng.toFixed(6))});setPlaces(null);}} className="w-full p-3 text-left text-sm">{p.label}</button></li>)}</ul>}
  </div>
  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:grid-cols-2">
   <h3 className="flex items-center gap-2 font-bold text-slate-900 sm:col-span-2"><SlidersHorizontal className="h-4 w-4 text-slate-400"/>{dt('Rules')}</h3>
   <label className="text-sm font-medium text-slate-700">{dt('Car rate (฿ per km)')}<input type="number" min={1} max={100} step={0.5} value={s.rate} onChange={e=>setS({...s,rate:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium text-slate-700">{dt('Check-in radius (m)')}<input type="number" min={50} max={2000} step={10} value={s.radius} onChange={e=>setS({...s,radius:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium text-slate-700">{dt('Start from home only before')}<input type="time" value={s.homeCutoff} onChange={e=>setS({...s,homeCutoff:e.target.value})} className={field}/></label>
   <label className="text-sm font-medium text-slate-700">{dt('Flag trips over (km)')}<input type="number" min={1} max={5000} value={s.tripKmCap} onChange={e=>setS({...s,tripKmCap:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium text-slate-700 sm:col-span-2">{dt('Accounting email (daily summary)')}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field}/></label>
   <label className="text-sm font-medium text-slate-700 sm:col-span-2"><span className="flex items-center gap-1.5"><BellRing className="h-3.5 w-3.5 text-slate-400"/>{dt('Month-end payout reminder on LINE')}</span><select value={notify} onChange={e=>setNotify(e.target.value)} className={field}><option value="">{dt('Nobody')}</option>{people.filter(p=>/^U[0-9a-f]{32}$/.test(p.id)||p.id===notify).map(p=><option key={p.id} value={p.id}>{p.nickname?`${p.nickname} · ${p.name}`:p.name}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">{dt('Sent on the 1st with last month’s totals.')}</span></label>
   <label className="text-sm font-medium text-slate-700 sm:col-span-2">{dt('Departments that can claim (comma separated)')}<input value={depts} onChange={e=>setDepts(e.target.value)} className={field}/></label>
   <button type="button" disabled={busy} onClick={()=>void save()} className="rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50 sm:col-span-2">{busy?dt('Saving…'):dt('Save')}</button>
  </div>
  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
   <h3 className="flex items-center gap-2 font-bold text-slate-900"><Users className="h-4 w-4 text-slate-400"/>{dt('Who can claim')}</h3>
   <p className="text-sm text-slate-500">{dt('By default everyone in the departments above. Allow or block one person here.')}</p>
   {people.map(p=><div key={p.id} className="flex items-center gap-3 border-t border-slate-100 pt-2 text-sm">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(p.nickname||p.name)}</span>
    <span className="min-w-0 flex-1"><span className="block font-medium">{p.nickname?`${p.nickname} · ${p.name}`:p.name}</span><span className="text-xs text-slate-500">{p.department}</span></span>
    {p.eligible&&<CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={dt('Can claim')}/>}
    <select value={p.override===null?'':String(p.override)} disabled={busy} aria-label={dt('Access')} onChange={e=>void run(async()=>{setPeople(await saveTravelAccess(p.id,e.target.value===''?null:e.target.value==='true'));})} className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs">
     <option value="">{dt('Default')}</option><option value="true">{dt('Allow')}</option><option value="false">{dt('Block')}</option></select>
   </div>)}
  </div>
 </section>;
}

export default function TravelAdmin({accounting=false}:{accounting?:boolean}){
 const dt=useDashboardText();const {language}=useLanguage();const text:T=(en,th)=>language==='th'?th:en;
 const url=new URLSearchParams(location.search);
 const [tab,setTab]=useState<'claims'|'payout'|'settings'>(url.get('tab')==='payout'||accounting?'payout':'claims'),[month,setMonth]=useState(/^20\d{2}-(0[1-9]|1[0-2])$/.test(url.get('month')??'')?url.get('month')!:new Date(Date.now()+7*3600e3).toISOString().slice(0,7)),[status,setStatus]=useState<string>('flagged'),[trips,setTrips]=useState<AdminTripRow[]|null>(null),[all,setAll]=useState<AdminTripRow[]|null>(null),[open,setOpen]=useState<number|null>(null),[error,setError]=useState('');
 const refresh=useCallback(()=>{setTrips(null);setError('');loadTrips(status).then(setTrips).catch(e=>setError((e as Error).message));loadTrips('').then(setAll).catch(()=>undefined);},[status]);
 useEffect(()=>{if(tab==='claims')refresh();},[tab,refresh]);
 const stats=useMemo(()=>{const l=all??[];const sum=(f:(t:AdminTripRow)=>boolean)=>l.filter(f).reduce((s,t)=>s+Number(t.total),0);
  return {flagged:l.filter(t=>t.status==='flagged').length,toPay:sum(t=>t.status==='submitted'||t.status==='approved'),paid:sum(t=>t.status==='paid'),paper:l.reduce((s,t)=>s+t.originalsWaiting,0),count:(f:string)=>f?l.filter(t=>t.status===f).length:l.length};},[all]);
 const tabBtn=(v:'claims'|'payout'|'settings',l:string,icon:React.ReactNode)=><button type="button" onClick={()=>{setTab(v);setOpen(null);}} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab===v?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-800'}`}>{icon}{l}</button>;
 const tiles:[string,string,React.ReactNode,string][]=[[dt('Needs your check'),String(stats.flagged),<Flag key="f" className="h-4 w-4"/>,'bg-amber-100 text-amber-700'],[dt('To pay'),`฿${money(stats.toPay)}`,<Banknote key="b" className="h-4 w-4"/>,'bg-sky-100 text-sky-700'],[dt('Paid · last 60 days'),`฿${money(stats.paid)}`,<CheckCircle2 key="c" className="h-4 w-4"/>,'bg-emerald-100 text-emerald-700'],[dt('Paper receipts due'),String(stats.paper),<Receipt key="r" className="h-4 w-4"/>,'bg-indigo-100 text-indigo-700']];
 return <section className="space-y-5">
  <div className="flex flex-wrap items-end justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br/srgb from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/20"><Car className="h-5 w-5"/></span><div><h2 className="text-xl font-bold text-slate-900">{dt('Travel claims')}</h2><p className="text-sm text-slate-500">{dt('Clean trips go straight to accounting. Flagged trips wait for your check.')}</p></div></div>
   <div className="flex gap-1 rounded-xl bg-slate-100 p-1">{tabBtn('claims',dt('Claims'),<Receipt className="h-4 w-4"/>)}{tabBtn('payout',dt('Monthly payout'),<Wallet className="h-4 w-4"/>)}{!accounting&&tabBtn('settings',dt('Settings'),<SlidersHorizontal className="h-4 w-4"/>)}</div></div>
  {tab==='settings'&&!accounting?<Settings/>:open?<TripDetailView id={open} accounting={accounting} onBack={()=>setOpen(null)} onChanged={refresh}/>:tab==='payout'?<TravelPayout month={month} onMonth={setMonth} onOpen={setOpen}/>:<>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(([k,v,icon,tone])=><div key={k} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{k}</p><span className={`grid h-8 w-8 place-items-center rounded-lg ${tone}`}>{icon}</span></div><p className="mt-2 truncate text-2xl font-extrabold text-slate-900">{all?v:'–'}</p></div>)}</div>
   <div className="flex flex-wrap gap-2">{filters.map(f=><button key={f} type="button" onClick={()=>setStatus(f)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${status===f?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{f?statusLabel(f,text):dt('All')}{all&&<span className={`rounded-full px-1.5 text-[10px] ${status===f?'bg-white/20':'bg-slate-100 text-slate-500'}`}>{stats.count(f)}</span>}</button>)}</div>
   {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
   {trips===null&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
   {trips?.length===0&&<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-2 text-sm text-slate-500">{dt('No claims here.')}</p></div>}
   {!!trips?.length&&<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"><ul className="divide-y divide-slate-100">{trips.map(t=><li key={t.id}><button type="button" onClick={()=>setOpen(t.id)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-sky-50/50">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(t.employee)}</span>
    <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold text-slate-900">{t.employee}</span><span className="text-xs text-slate-400">{t.date}</span></span>
     <span className="block truncate text-sm text-slate-500">{t.clients.join(', ')}</span>
     <span className="mt-1 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[t.status]}`}>{statusLabel(t.status,text)}</span><span className="text-[11px] text-slate-500">{dt('{0} km',[money(t.km)])}</span>
      {t.flags.map(f=><span key={f} className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"><Flag className="h-2.5 w-2.5"/>{flagLabel(f,text)}</span>)}
      {t.originalsWaiting>0&&<span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{dt('Paper due')}</span>}</span></span>
    <span className="text-right text-lg font-extrabold text-slate-900">฿{money(t.total)}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300"/></button></li>)}</ul></div>}
  </>}
 </section>;
}
