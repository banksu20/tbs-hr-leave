import {leaveErrorMessage} from '@/lib/leaveErrorMessage';
import {useState} from 'react';
import liff from '@line/liff';
import {Upload, FileText, CheckCircle2} from 'lucide-react';
import {useLanguage} from '@/hooks/useLanguage';

export default function LeaveEvidence({requestId,employee=false,canUpload=false}:{requestId:string|number;employee?:boolean;canUpload?:boolean}) {
 const {language}=useLanguage();
 const tr=(en:string,th:string)=>language==='th'?th:en;
 const [documentType,setDocumentType]=useState('certificate');
 const [open,setOpen]=useState(false),[files,setFiles]=useState<{id:string;filename:string}[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const [selected,setSelected]=useState<File|null>(null),[success,setSuccess]=useState(false),[inputKey,setInputKey]=useState(0);
 const headers=()=>employee?{Authorization:`Bearer ${liff.getAccessToken()}`}:{ };
 async function load(){
  const r=await fetch(`/api/leave-evidence?requestId=${encodeURIComponent(requestId)}`,{headers:headers()}),b=await r.json();
  if(!r.ok)throw Error(b.error);setFiles(b.files);
 }
 async function upload(){
  if(!selected||busy)return;
  setError('');setSuccess(false);setBusy(true);
  try{
   const content=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error(tr('Could not read this file.','ไม่สามารถอ่านไฟล์นี้ได้')));reader.readAsDataURL(selected);});
   const r=await fetch('/api/leave-evidence',{method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({requestId:Number(requestId),filename:selected.name,mime:selected.type,content,documentType})});
   if(!r.ok)throw Error((await r.json()).error);
   setSelected(null);setInputKey(k=>k+1);setSuccess(true);
   await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="text-sm">
  <button type="button" aria-expanded={open} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 font-medium text-rose-800" onClick={async()=>{setOpen(!open);if(!open){setError('');setLoading(true);try{await load();}catch(e){setError((e as Error).message);}finally{setLoading(false);}}}}>
   <FileText className="h-4 w-4"/>{open?tr('Hide documents','ซ่อนเอกสาร'):canUpload?tr('Attach medical documents','แนบเอกสารการรักษา'):tr('View attachments','ดูเอกสารแนบ')}
  </button>
  {open&&<div className="mt-3 space-y-3 rounded-2xl border border-rose-100 bg-white p-4">
   {canUpload&&<><p className="font-semibold text-slate-900">{tr('Medical documents','เอกสารการรักษา')}</p><p className="text-xs leading-relaxed text-slate-500">{tr('Attach a clear photo of your medical certificate or bill to this leave request. HR will review the document.','แนบภาพใบรับรองแพทย์หรือใบเสร็จค่ารักษาที่อ่านได้ชัดเจนสำหรับการลาครั้งนี้ ฝ่ายบุคคลจะตรวจสอบเอกสาร')}</p></>}
   {error&&<p role="alert" className="text-red-700">{leaveErrorMessage(error,language)}</p>}
   {success&&<p role="status" className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{tr('Document uploaded.','อัปโหลดเอกสารแล้ว')}</p>}
   {loading?<p role="status">{tr('Loading documents…','กำลังโหลดเอกสาร…')}</p>:!files.length&&<p className="text-xs text-slate-500">{tr('No attachments yet.','ยังไม่มีเอกสารแนบ')}</p>}
   {files.map(f=><button type="button" key={f.id} className="block text-left text-cyan-700 break-all underline" onClick={async()=>{setError('');try{const r=await fetch(`/api/leave-evidence?id=${encodeURIComponent(f.id)}`,{headers:headers()});if(!r.ok)throw Error(tr('Could not download file.','ดาวน์โหลดไฟล์ไม่สำเร็จ'));const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=f.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}}}>{f.filename}</button>)}
   {canUpload&&<div className="space-y-3">
    <label className="block text-sm text-slate-700">{tr('Document type','ประเภทเอกสาร')}<select className="mt-1 block w-full rounded-xl border bg-white p-3" value={documentType} disabled={busy} onChange={e=>setDocumentType(e.target.value)}><option value="certificate">{tr('Medical certificate','ใบรับรองแพทย์')}</option><option value="bill">{tr('Medical bill / receipt','ใบเสร็จค่ารักษา')}</option></select></label>
    <p className="text-xs text-slate-500">{tr('A bill does not replace a medical certificate.','ใบเสร็จค่ารักษาไม่สามารถใช้แทนใบรับรองแพทย์ได้')}</p>
    <label className="block rounded-xl border border-dashed border-rose-200 bg-rose-50/50 p-3 text-sm text-slate-700">
     {tr('Choose a photo or PDF','เลือกภาพถ่ายหรือ PDF')}
     <input key={inputKey} className="mt-2 block w-full min-w-0 text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy||loading||files.length>=3} onChange={e=>{
      const file=e.currentTarget.files?.[0];setSelected(null);setError('');setSuccess(false);if(!file)return;
      if(!['application/pdf','image/png','image/jpeg'].includes(file.type)||file.size===0||file.size>2097152){setError(tr('Choose a JPG, PNG or PDF up to 2 MB.','เลือกไฟล์ JPG, PNG หรือ PDF ขนาดไม่เกิน 2 MB'));e.currentTarget.value='';return;}setSelected(file);
     }}/>
    </label>
    <p className="text-xs text-slate-500">{tr('JPG, PNG or PDF · 2 MB per file · up to 3 files','JPG, PNG หรือ PDF · ไฟล์ละไม่เกิน 2 MB · สูงสุด 3 ไฟล์')}</p>
    {files.length>=3&&<p role="status" className="text-xs text-slate-600">{tr('All 3 attachment slots are used.','แนบเอกสารครบ 3 ไฟล์แล้ว')}</p>}
    <button type="button" disabled={!selected||busy||loading||files.length>=3} onClick={upload} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 font-semibold text-white disabled:opacity-40"><Upload className="h-4 w-4"/>{busy?tr('Uploading…','กำลังอัปโหลด…'):tr('Upload document','อัปโหลดเอกสาร')}</button>
   </div>}
  </div>}
 </div>;
}
