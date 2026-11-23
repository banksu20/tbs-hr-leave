import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ArrowLeft,CheckCircle2,ChevronDown,FileText,Loader2,RefreshCw} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';
import {acceptSop,fetchSops,sopTitle,type SopDoc} from '@/lib/sop';

export default function SopCenter(){
 const navigate=useNavigate();
 const {language}=useLanguage();const th=language==='th';
 const text=(en:string,thai:string)=>th?thai:en;
 const [docs,setDocs]=useState<SopDoc[]|null>(null),[open,setOpen]=useState<number|null>(null),[read,setRead]=useState<Record<number,boolean>>({}),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;fetchSops().then(d=>{if(!active)return;setDocs(d);const first=d.find(x=>!x.acceptedAt);if(first)setOpen(first.id);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);
 const accept=async(d:SopDoc)=>{
  setBusy(d.id);setError('');
  try{const next=await acceptSop(d.id,d.version);setDocs(next);const pending=next.find(x=>!x.acceptedAt);setOpen(pending?pending.id:null);}
  catch(e){const err=e as Error&{docs?:SopDoc[]};if(err.docs)setDocs(err.docs);setRead(r=>({...r,[d.id]:false}));setError(err.message);}
  finally{setBusy(null);}
 };
 const formatDate=(v:string)=>new Date(v).toLocaleDateString(th?'th-TH':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'});
 const pending=docs?.filter(d=>!d.acceptedAt).length??0;
 return <main className="min-h-dvh bg-slate-50 pb-10">
  <header className="bg-linear-to-br from-cyan-500 to-cyan-700 px-5 pt-6 pb-8 text-white">
   <button type="button" onClick={()=>navigate('/')} className="mb-5 flex items-center gap-1 text-sm font-semibold text-cyan-50"><ArrowLeft className="h-4 w-4"/>{text('Back','กลับ')}</button>
   <p className="text-xs font-bold uppercase tracking-wider text-cyan-100">TBS · People &amp; Culture</p>
   <h1 className="mt-1 text-2xl font-bold">{text('Company SOPs','ระเบียบบริษัท')}</h1>
   <p className="mt-1 text-sm text-cyan-50">{docs===null?'':pending?text(`${pending} to read and accept`,`รออ่านและกดยอมรับ ${pending} เรื่อง`):text('All accepted. Thank you!','ยอมรับครบทุกเรื่องแล้ว ขอบคุณค่ะ')}</p>
  </header>
  <section className="-mt-4 space-y-3 px-4">
   {docs===null&&!error&&<div className="flex items-center gap-2 rounded-2xl bg-white p-5 text-slate-500 shadow-xs"><Loader2 className="h-5 w-5 animate-spin"/>{text('Loading…','กำลังโหลด…')}</div>}
   {error&&<p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
   {docs?.length===0&&<p className="rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-xs">{text('No documents yet.','ยังไม่มีเอกสาร')}</p>}
   {docs?.map(d=>{const isOpen=open===d.id;return <article key={d.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xs">
    <button type="button" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?null:d.id)} className="flex w-full items-center gap-3 p-4 text-left">
     <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${d.acceptedAt?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{d.acceptedAt?<CheckCircle2 className="h-5 w-5"/>:d.acceptedBefore?<RefreshCw className="h-5 w-5"/>:<FileText className="h-5 w-5"/>}</span>
     <span className="min-w-0 flex-1">
      <span className="block font-bold leading-snug text-slate-900">{sopTitle(d,th)}</span>
      <span className={`block text-xs font-medium ${d.acceptedAt?'text-emerald-600':'text-amber-700'}`}>{d.acceptedAt?text(`Accepted ${formatDate(d.acceptedAt)}`,`ยอมรับแล้ว ${formatDate(d.acceptedAt)}`):d.acceptedBefore?text('Updated · please read again','มีการแก้ไข · กรุณาอ่านอีกครั้ง'):text('Please read and accept','กรุณาอ่านและกดยอมรับ')}</span>
     </span>
     <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen?'rotate-180':''}`}/>
    </button>
    {isOpen&&<div className="border-t border-slate-100 p-4">
     <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{d.body}</div>
     <p className="mt-4 text-xs text-slate-400">{text(`Version ${d.version} · updated ${formatDate(d.updatedAt)}`,`ฉบับที่ ${d.version} · แก้ไขล่าสุด ${formatDate(d.updatedAt)}`)}</p>
     {!d.acceptedAt&&<div className="mt-4 space-y-3">
      <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-cyan-600" checked={!!read[d.id]} onChange={e=>setRead(r=>({...r,[d.id]:e.target.checked}))}/>{text('I have read and understood this document.','ฉันอ่านและเข้าใจเอกสารนี้แล้ว')}</label>
      <button type="button" disabled={!read[d.id]||busy!==null} onClick={()=>void accept(d)} className="w-full rounded-xl bg-cyan-600 py-3.5 font-bold text-white disabled:opacity-50">{busy===d.id?text('Saving…','กำลังบันทึก…'):text('Accept','ยอมรับ')}</button>
     </div>}
    </div>}
   </article>;})}
  </section>
 </main>;
}
