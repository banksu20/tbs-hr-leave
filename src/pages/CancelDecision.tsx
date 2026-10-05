import {leaveTypeLabel} from '@/lib/leaveTypeLabel';
import {useEffect,useState} from 'react';
import liff from '@line/liff';
import {Button} from '@/components/ui/button';
import {useLanguage} from '@/hooks/useLanguage';
interface Request {id:number;name:string;type:string;dates:string[];reason:string;period:string|null;days:number;}
export default function CancelDecision(){
 const {language}=useLanguage();const text=(en:string,th:string)=>language==='th'?th:en;
 const [request,setRequest]=useState<Request|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[reason,setReason]=useState(''),[attempt,setAttempt]=useState(0);
 const [link,setLink]=useState<{id:number;token:string;action:'approve'|'reject'}|null>(null);
 async function call(url:string,body?:unknown){const token=liff.getAccessToken();if(!token)throw Error(text('Please reopen this link in LINE.','กรุณาเปิดลิงก์นี้ใน LINE อีกครั้ง'));const response=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'Decision service unavailable');return data;}
 useEffect(()=>{let active=true;setError('');setRequest(null);void(async()=>{try{
  await liff.init({liffId:'2008617589-89gR1Y3Y'});if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}
  const params=new URLSearchParams(window.location.search);const action=params.get('action');const id=Number(params.get('id'));const token=params.get('token');
  if(!Number.isSafeInteger(id)||id<1||!token||!['approve','reject'].includes(action??''))throw Error('Invalid cancellation link');
  const detail={id,token,action:action as 'approve'|'reject'};
  const data=await call(`/api/cancellations?view=line&id=${id}&token=${encodeURIComponent(token)}`);if(active){setLink(detail);setRequest(data.request);}
 }catch(e){if(active)setError((e as Error).message);}})();return()=>{active=false;};},[attempt]);
 return <main className="min-h-screen bg-amber-50 p-5 flex items-center justify-center"><section className="w-full max-w-md rounded-3xl bg-white border border-amber-200 p-6 shadow-sm space-y-4">
 <h1 className="font-bold text-xl text-amber-900">{text('Leave cancellation','คำขอยกเลิกวันลา')}</h1>
 {error&&<div role="alert"><p className="text-red-700">{error}</p><Button variant="outline" disabled={busy} onClick={()=>setAttempt(n=>n+1)}>{text('Refresh status and retry','ตรวจสอบสถานะและลองอีกครั้ง')}</Button></div>}
 {done?<><p className="text-emerald-800 font-semibold">{link?.action==='approve'?text('Cancellation approved.','อนุมัติการยกเลิกแล้ว'):text('Cancellation rejected. Original leave stays approved.','ไม่อนุมัติการยกเลิก วันลายังคงเดิม')}</p><Button variant="outline" onClick={()=>liff.isInClient()?liff.closeWindow():window.location.assign('/ceo')}>{text('Close','ปิด')}</Button></>:request&&link?<>
 <h2 className="font-semibold">{request.name}</h2><p>{leaveTypeLabel(request.type,language)} · {request.days} {text('day(s)','วัน')} {request.period??''}</p><p>{request.dates.join(', ')}</p>{request.reason&&<p className="text-sm whitespace-pre-wrap">{request.reason}</p>}
 <p className="rounded-xl bg-amber-50 p-3 text-sm">{link.action==='approve'?text('Cancel only these dates and restore the leave balance?','ยกเลิกเฉพาะวันที่แสดงและคืนยอดวันลาใช่ไหม?'):text('Reject cancellation and keep the original leave?','ปฏิเสธการยกเลิกและคงวันลาเดิมใช่ไหม?')}</p>
 <label className="block text-sm">{text('Note (optional)','หมายเหตุ (ไม่บังคับ)')}<textarea disabled={busy} className="border rounded-xl w-full mt-1 p-2" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <Button className="w-full rounded-full bg-amber-400 text-amber-950 hover:bg-amber-500" disabled={busy||!!error} onClick={async()=>{setBusy(true);try{await call('/api/cancellations?view=line',{...link,reason});setDone(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?text('Saving…','กำลังบันทึก…'):link.action==='approve'?text('Confirm cancellation','ยืนยันอนุมัติการยกเลิก'):text('Reject cancellation','ไม่อนุมัติการยกเลิก')}</Button>
 </>:!error&&<p>{text('Checking your LINE account…','กำลังตรวจสอบบัญชี LINE…')}</p>}
 </section></main>;
}
