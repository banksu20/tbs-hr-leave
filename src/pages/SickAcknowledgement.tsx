import {useEffect,useRef,useState} from 'react';
import liff from '@line/liff';
import {CheckCircle2,AlertTriangle} from 'lucide-react';
import {LIFF_ID} from '@/lib/liffConfig';
import {useLanguage} from '@/hooks/useLanguage';
import {useNotificationLanguage} from '@/hooks/useNotificationLanguage';
import {Button} from '@/components/ui/button';
interface Reminder {leaveType?:'personal'|'sick';isolatedTest?:boolean;acknowledged:boolean;name:string;total:number;threshold:number;year:number;language:'en'|'th';audience:'employee'|'ceo'}
export default function SickAcknowledgement(){
 const [reminder,setReminder]=useState<Reminder|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 const saveLocked=useRef(false);
 const {language}=useLanguage();
 const [accountId,setAccountId]=useState<string|null>(null);
 useNotificationLanguage(reminder?.audience==='employee'?accountId:null);
 const text=(en:string,th:string)=>reminder?.audience!=='ceo'&&language==='th'?th:en;
 async function call(save=false){
  const params=new URLSearchParams(window.location.search),id=params.get('id'),token=params.get('token');
  if(!id||!token)throw Error('Invalid reminder link');
  const accessToken=liff.getAccessToken();if(!accessToken)throw Error('Please reopen this card in LINE.');
  const response=await fetch('/api/sick-acknowledgements'+(save?'':`?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`),{
   method:save?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},...(save?{body:JSON.stringify({id,token})}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save. Please try again.');return data;
 }
 useEffect(()=>{let active=true;setError('');void(async()=>{try{
  await liff.init({liffId:LIFF_ID});
  if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}
  const result=await call();if(active){setReminder(result);if(result.audience==='employee')setAccountId(result.accountId);}
 }catch(e){if(active)setError((e as Error).message);}})();return()=>{active=false;};},[attempt]);
 const informational=reminder?.audience==='ceo';
 const done=reminder?.acknowledged;
 return <main className="min-h-screen bg-red-50 px-5 py-16 flex items-center justify-center"><section className="w-full max-w-sm rounded-3xl bg-white border border-red-100 p-6 shadow-sm space-y-5">
 {done?<CheckCircle2 className="text-emerald-600 h-9 w-9" aria-hidden="true"/>:<AlertTriangle className="text-red-700 h-9 w-9" aria-hidden="true"/>}
 <h1 className="font-bold text-xl">{informational?'Sick leave notice':done?text('Already acknowledged','รับทราบแล้ว'):reminder?.leaveType==='personal'?text('Personal leave reminder','แจ้งเตือนวันลากิจ'):text('Sick leave reminder','แจ้งเตือนวันลาป่วย')}</h1>
 {reminder?.isolatedTest&&<p className="text-xs text-slate-500">{text('Isolated delivery test. Your actual sick leave balance is unchanged.','ทดสอบการแจ้งเตือนเท่านั้น ยอดวันลาป่วยจริงไม่เปลี่ยนแปลง')}</p>}
 {reminder&&(!done||informational)&&<><p className="font-semibold break-words">{reminder.name}</p><p className="rounded-xl bg-red-50 p-4 text-red-800"><strong className="text-3xl">{reminder.total}</strong> {reminder.leaveType==='personal'?text('personal leave days','วันลากิจ'):text('sick days','วันลาป่วย')} · {reminder.year}</p><p className="text-sm text-slate-600">{informational?'For your information. No acknowledgement is required.':text('Acknowledge to confirm you have read this notice. This does not change leave or balances.','กดรับทราบเพื่อยืนยันว่าได้อ่านแล้ว โดยไม่เปลี่ยนแปลงวันลาหรือยอดคงเหลือ')}</p></>}
 {done&&!informational&&<p className="text-sm text-slate-600">{reminder?.leaveType==='personal'?text('Your acknowledgement has been saved.','บันทึกการรับทราบแล้ว'):text('Your acknowledgement has been saved. You may receive another notice at a higher threshold.','บันทึกการรับทราบแล้ว หากถึงเกณฑ์ถัดไปอาจมีการแจ้งเตือนใหม่')}</p>}
 {error&&<div role="alert" className="space-y-2"><p className="text-sm text-red-700">{error}</p>{!reminder&&<Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>{text('Try again','ลองอีกครั้ง')}</Button>}</div>}
 {!reminder&&!error&&<p className="text-sm text-slate-600">Checking your LINE account…</p>}
 {reminder&&!informational&&<Button className={done?"w-full rounded-full bg-slate-200 text-slate-600 disabled:opacity-100":"w-full rounded-full bg-red-700 hover:bg-red-800"} disabled={busy||done} onClick={async()=>{if(saveLocked.current||done)return;saveLocked.current=true;setBusy(true);setError('');try{await call(true);setReminder(r=>r?{...r,acknowledged:true}:r);}catch(e){saveLocked.current=false;setError((e as Error).message);}finally{setBusy(false);}}}>{done?text('Already acknowledged','รับทราบแล้ว'):busy?text('Saving…','กำลังบันทึก…'):text('Acknowledge','รับทราบ')}</Button>}
 {(done||informational)&&liff.isInClient()&&<Button variant="outline" className="w-full rounded-full" onClick={()=>liff.closeWindow()}>{text('Close','ปิด')}</Button>}
 </section></main>;
}
