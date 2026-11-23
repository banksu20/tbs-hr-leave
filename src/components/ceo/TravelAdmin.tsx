import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Flag,Loader2,MapPin,Search} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {useLanguage} from '@/hooks/useLanguage';
import {adminReceiptUrl,decideTrip,findOffice,loadTrip,loadTravelSettings,loadTrips,markTrip,saveTravelAccess,saveTravelSettings,type AdminTrip,type AdminTripRow,type TravelPerson,type TravelSettings} from '@/lib/hrAdmin';
import {flagLabel,money,statusLabel,type Place,type T} from '@/lib/travel';

const field='mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-cyan-500';
const filters=['flagged','submitted','approved','paid','rejected',''] as const;

function TripDetailView({id,onBack,onChanged}:{id:number;onBack:()=>void;onChanged:()=>void}){
 const dt=useDashboardText();const {language}=useLanguage();const text:T=(en,th)=>language==='th'?th:en;
 const [trip,setTrip]=useState<AdminTrip|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{loadTrip(id).then(setTrip).catch(e=>setError((e as Error).message));},[id]);
 const act=async(fn:()=>Promise<AdminTrip>)=>{setBusy(true);setError('');try{setTrip(await fn());onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const pointName=(pid:number)=>{const p=trip?.points.find(x=>x.id===pid);if(!p)return '';if(p.kind==='start_home')return dt('Home');if(p.kind!=='arrive')return dt('Office');return trip?.stops.find(s=>s.id===p.stopId)?.clientName??'';};
 const mapLink=(lat:number,lng:number)=>`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
 return <section className="space-y-4">
  <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-cyan-700"><ArrowLeft className="h-4 w-4"/>{dt('All claims')}</button>
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {!trip&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
  {trip&&<div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
   <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl font-bold">{trip.employee}</h2><p className="text-sm text-slate-500">{[trip.department,trip.date,trip.purpose==='deal'?dt('Deal'):dt('Customer care'),trip.dealRef].filter(Boolean).join(' · ')}</p></div>
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{statusLabel(trip.status,text)}</span></div>
   {trip.flags.length>0&&<div className="flex flex-wrap gap-2">{trip.flags.map(f=><span key={f} className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"><Flag className="h-3 w-3"/>{flagLabel(f,text)}</span>)}{trip.autoClosed&&<span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{dt('Closed automatically at midnight')}</span>}</div>}
   <div className="space-y-2"><h3 className="text-sm font-bold text-slate-500">{dt('Route')}</h3>
    {trip.legs.map(l=>{const to=trip.points.find(p=>p.id===l.to)!;return <div key={l.id} className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0 text-slate-400"/><span className="flex-1">{pointName(l.from)} → {pointName(l.to)} <a className="text-xs text-cyan-700 underline" href={mapLink(to.lat,to.lng)} target="_blank" rel="noreferrer">{dt('Map')}</a> <span className="text-xs text-slate-400">{new Date(to.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'})}{to.accuracy!=null?` · ±${Math.round(to.accuracy)}m`:''}</span>
     {l.capped&&<span className="block text-xs text-slate-500">{dt('Capped at office distance (actual {0} km)',[money(l.routeKm)])}</span>}</span><span className="text-right">{dt('{0} km',[money(l.km)])}</span></div>;})}
    {!trip.legs.length&&<p className="text-sm text-slate-500">{dt('No distance recorded.')}</p>}
   </div>
   <div className="space-y-2"><h3 className="text-sm font-bold text-slate-500">{dt('Receipts')}</h3>
    <div className="flex flex-wrap gap-3">{trip.receipts.map(r=><a key={r.id} href={adminReceiptUrl(r.id)} target="_blank" rel="noreferrer" className="w-28 rounded-xl border border-slate-100 p-2 text-xs">
     {r.mime==='application/pdf'?<span className="grid h-28 place-items-center rounded-lg bg-slate-100">{dt('PDF')}</span>:<img src={adminReceiptUrl(r.id)} alt="" className="h-28 w-full rounded-lg object-cover"/>}
     <span className="mt-1 block font-semibold">฿{money(r.amount)}</span>{r.edited&&r.readAmount!=null&&<span className="block text-amber-700">{dt('Photo read ฿{0}',[money(r.readAmount)])}</span>}
     {r.needsOriginal&&<span className={`block ${r.originalReceivedAt?'text-emerald-700':'text-amber-700'}`}>{r.originalReceivedAt?dt('Original received'):dt('Original pending')}</span>}</a>)}</div>
    {!trip.receipts.length&&<p className="text-sm text-slate-500">{dt('No receipts.')}</p>}
   </div>
   <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div><dt className="text-xs text-slate-500">{dt('Distance')}</dt><dd className="font-semibold">฿{money(trip.kmAmount)}</dd></div><div><dt className="text-xs text-slate-500">{dt('Receipts')}</dt><dd className="font-semibold">฿{money(trip.receiptAmount)}</dd></div><div><dt className="text-xs text-slate-500">{dt('Total')}</dt><dd className="text-lg font-bold">฿{money(trip.total)}</dd></div></dl>
   {trip.decidedBy&&<p className="text-sm text-slate-600">{dt('Checked by {0}',[trip.decidedBy])}{trip.decisionNote?` · ${trip.decisionNote}`:''}</p>}
   {trip.status==='flagged'&&<div className="space-y-2"><textarea value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder={dt('Note (optional)')} className={field}/>
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void act(()=>decideTrip(trip.id,'approve',note))} className="flex-1 rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{dt('Approve')}</button><button type="button" disabled={busy} onClick={()=>void act(()=>decideTrip(trip.id,'reject',note))} className="flex-1 rounded-xl border border-rose-300 py-2.5 text-sm font-bold text-rose-700 disabled:opacity-50">{dt('Reject')}</button></div></div>}
   <div className="flex flex-wrap gap-2">
    {trip.originalsWaiting>0&&<button type="button" disabled={busy} onClick={()=>void act(()=>markTrip(trip.id,'received'))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">{dt('Paper receipts received')}</button>}
    {['submitted','approved'].includes(trip.status)&&<button type="button" disabled={busy} onClick={()=>void act(()=>markTrip(trip.id,'paid'))} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{dt('Mark as paid')}</button>}
   </div>
  </div>}
 </section>;
}

function Settings(){
 const dt=useDashboardText();
 const [s,setS]=useState<TravelSettings|null>(null),[people,setPeople]=useState<TravelPerson[]>([]),[query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[depts,setDepts]=useState(''),[email,setEmail]=useState('');
 const apply=(r:{settings:TravelSettings;people:TravelPerson[]})=>{setS(r.settings);setPeople(r.people);setDepts(r.settings.departments.join(', '));setEmail(r.settings.accountingEmail??'');};
 useEffect(()=>{loadTravelSettings().then(apply).catch(e=>setError((e as Error).message));},[]);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const search=()=>run(async()=>{setPlaces(await findOffice(query));});
 const save=()=>run(async()=>{apply(await saveTravelSettings({officeLat:s!.officeLat,officeLng:s!.officeLng,radius:Number(s!.radius),rate:Number(s!.rate),homeCutoff:s!.homeCutoff,tripKmCap:Number(s!.tripKmCap),accountingEmail:email.trim(),departments:depts.split(',').map(x=>x.trim()).filter(Boolean)}));setNotice(dt('Saved.'));});
 if(!s)return error?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>:<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>;
 const on=s.officeLat!=null;
 return <section className="space-y-4">
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  <div className={`rounded-2xl border p-5 shadow-xs ${on?'border-slate-200 bg-white':'border-amber-200 bg-amber-50'}`}>
   <h3 className="font-bold">{dt('Office location')}</h3>
   <p className="text-sm text-slate-500">{on?dt('Claims are on. Staff must be within {0} m of this pin to check back in.',[s.radius]):dt('Claims stay off until you set the office pin.')}</p>
   {on&&<a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cyan-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${s.officeLat},${s.officeLng}`} target="_blank" rel="noreferrer"><MapPin className="h-4 w-4"/>{s.officeLat}, {s.officeLng}</a>}
   <div className="mt-3 flex gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={dt('Office address or Google Maps link')} className={field+' mt-0'}/><button type="button" disabled={busy||query.trim().length<2} onClick={()=>void search()} aria-label={dt('Find')} className="rounded-xl bg-slate-900 px-4 text-white disabled:opacity-50"><Search className="h-4 w-4"/></button></div>
   {places?.length===0&&<p className="mt-2 text-sm text-slate-500">{dt('No place found.')}</p>}
   {places&&places.length>0&&<ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{places.map(p=><li key={`${p.lat},${p.lng}`}><button type="button" onClick={()=>{setS({...s,officeLat:Number(p.lat.toFixed(6)),officeLng:Number(p.lng.toFixed(6))});setPlaces(null);}} className="w-full p-3 text-left text-sm">{p.label}</button></li>)}</ul>}
  </div>
  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:grid-cols-2">
   <label className="text-sm font-medium">{dt('Car rate (฿ per km)')}<input type="number" min={1} max={100} step={0.5} value={s.rate} onChange={e=>setS({...s,rate:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium">{dt('Check-in radius (m)')}<input type="number" min={50} max={2000} step={10} value={s.radius} onChange={e=>setS({...s,radius:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium">{dt('Start from home only before')}<input type="time" value={s.homeCutoff} onChange={e=>setS({...s,homeCutoff:e.target.value})} className={field}/></label>
   <label className="text-sm font-medium">{dt('Flag trips over (km)')}<input type="number" min={1} max={5000} value={s.tripKmCap} onChange={e=>setS({...s,tripKmCap:e.target.valueAsNumber})} className={field}/></label>
   <label className="text-sm font-medium sm:col-span-2">{dt('Accounting email (daily summary)')}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} className={field}/></label>
   <label className="text-sm font-medium sm:col-span-2">{dt('Departments that can claim (comma separated)')}<input value={depts} onChange={e=>setDepts(e.target.value)} className={field}/></label>
   <button type="button" disabled={busy} onClick={()=>void save()} className="rounded-xl bg-cyan-600 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy?dt('Saving…'):dt('Save')}</button>
  </div>
  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
   <h3 className="font-bold">{dt('Who can claim')}</h3>
   <p className="text-sm text-slate-500">{dt('By default everyone in the departments above. Allow or block one person here.')}</p>
   {people.map(p=><div key={p.id} className="flex items-center gap-3 border-t border-slate-100 pt-2 text-sm">
    <span className="min-w-0 flex-1"><span className="block font-medium">{p.nickname?`${p.nickname} · ${p.name}`:p.name}</span><span className="text-xs text-slate-500">{p.department}</span></span>
    {p.eligible&&<CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={dt('Can claim')}/>}
    <select value={p.override===null?'':String(p.override)} disabled={busy} aria-label={dt('Access')} onChange={e=>void run(async()=>{setPeople(await saveTravelAccess(p.id,e.target.value===''?null:e.target.value==='true'));})} className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs">
     <option value="">{dt('Default')}</option><option value="true">{dt('Allow')}</option><option value="false">{dt('Block')}</option></select>
   </div>)}
  </div>
 </section>;
}

export default function TravelAdmin(){
 const dt=useDashboardText();const {language}=useLanguage();const text:T=(en,th)=>language==='th'?th:en;
 const [tab,setTab]=useState<'claims'|'settings'>('claims'),[status,setStatus]=useState<string>('flagged'),[trips,setTrips]=useState<AdminTripRow[]|null>(null),[open,setOpen]=useState<number|null>(null),[error,setError]=useState('');
 const refresh=useCallback(()=>{setTrips(null);loadTrips(status).then(setTrips).catch(e=>setError((e as Error).message));},[status]);
 useEffect(()=>{if(tab==='claims')refresh();},[tab,refresh]);
 const tabBtn=(v:'claims'|'settings',l:string)=><button type="button" onClick={()=>{setTab(v);setOpen(null);}} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab===v?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-200'}`}>{l}</button>;
 return <section className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{dt('Travel claims')}</h2><p className="text-sm text-slate-500">{dt('Clean trips go straight to accounting. Flagged trips wait for your check.')}</p></div>
   <div className="flex gap-1 rounded-xl bg-slate-100 p-1">{tabBtn('claims',dt('Claims'))}{tabBtn('settings',dt('Settings'))}</div></div>
  {tab==='settings'?<Settings/>:open?<TripDetailView id={open} onBack={()=>setOpen(null)} onChanged={refresh}/>:<>
   <div className="flex flex-wrap gap-2">{filters.map(f=><button key={f} type="button" onClick={()=>setStatus(f)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status===f?'bg-cyan-600 text-white':'bg-white text-slate-600 border border-slate-200'}`}>{f?statusLabel(f,text):dt('All')}</button>)}</div>
   {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
   {trips===null&&!error&&<p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</p>}
   {trips?.length===0&&<p className="rounded-2xl bg-white p-5 text-sm text-slate-500">{dt('No claims here.')}</p>}
   <div className="space-y-2">{trips?.map(t=><button key={t.id} type="button" onClick={()=>setOpen(t.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs hover:border-cyan-300">
    <span className="w-20 shrink-0 text-xs text-slate-500">{t.date}</span>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{t.employee} · {t.clients.join(', ')}</span><span className="text-xs text-slate-500">{statusLabel(t.status,text)} · {dt('{0} km',[money(t.km)])}{t.flags.length?' · '+t.flags.map(f=>flagLabel(f,text)).join(', '):''}</span></span>
    <span className="font-bold">฿{money(t.total)}</span></button>)}</div>
  </>}
 </section>;
}
