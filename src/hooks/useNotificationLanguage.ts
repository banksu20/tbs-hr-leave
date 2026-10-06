import {useEffect} from 'react';
import liff from '@line/liff';
import {toast} from 'sonner';
import {useLanguage} from '@/hooks/useLanguage';
let latestChange=0;
// Retries retain their original timestamp: a slow older save cannot overwrite a new selection.
export function useNotificationLanguage(userId:string|null){
 const {language}=useLanguage();
 useEffect(()=>{
  if(!userId)return;
  let active=true,attempt=0,warned=false,timer:ReturnType<typeof setTimeout>,controller:AbortController;
  const changedAt=latestChange=Math.max(Date.now(),latestChange+1);
  async function save(){
   controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),10000);
   try{
    const token=liff.getAccessToken();if(!token)throw Error('LINE session not ready');
    const response=await fetch('/api/notification-preferences',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({language,changedAt})});
    if(!response.ok)throw Error('Preference not saved');
    if(active&&warned)toast.success(language==='th'?'บันทึกภาษาแจ้งเตือนแล้ว':'Notification language saved.',{id:'notification-language'});
   }catch{
    if(!active)return;
    if(++attempt>=3&&!warned){warned=true;toast.error(language==='th'?'ยังบันทึกภาษาแจ้งเตือนไม่สำเร็จ กำลังลองใหม่':'Notification language has not saved yet. Retrying…',{id:'notification-language'});}
    timer=setTimeout(save,Math.min(30000,1000*2**Math.min(attempt,5)));
   }finally{clearTimeout(timeout);}
  }
  void save();
  return()=>{active=false;clearTimeout(timer);controller?.abort();};
 },[userId,language]);
}
