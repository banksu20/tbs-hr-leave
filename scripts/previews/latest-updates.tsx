import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import liff from '@line/liff';
import LeaveEvidence from '../../src/components/LeaveEvidence';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import cards from './personal-fixtures.json';
import '../../src/index.css';
let attachments:any[]=[];let updateReminder=(received:boolean)=>{};
liff.getAccessToken=()=> 'isolated-demo';
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin);
 if(url.pathname!=='/api/leave-evidence')throw Error('Network disabled in this demo');
 const json=(b:unknown)=>new Response(JSON.stringify(b),{headers:{'Content-Type':'application/json'}});
 if(init?.method==='POST'){
  const b=JSON.parse(String(init.body));attachments.push({...b,id:crypto.randomUUID()});
  updateReminder(attachments.some(f=>f.documentType==='certificate'));
  return json({ok:true});
 }
 if(url.searchParams.has('id')){const f=attachments.find(f=>f.id===url.searchParams.get('id'));return new Response(Uint8Array.from(atob(f.content),c=>c.charCodeAt(0)),{headers:{'Content-Type':f.mime}});}
 return json({files:attachments.map(({id,filename,documentType})=>({id,filename,documentType}))});
};
function Block({block,ack,onAck}:{block:any;ack:boolean;onAck:()=>void}){
 if(!block)return null;
 if(block.type==='button')return <button disabled={ack} onClick={onAck} className="mt-3 w-full rounded-xl bg-rose-700 px-4 py-3 font-semibold text-white disabled:bg-slate-300">{ack?'Acknowledged ✓':block.action.label}</button>;
 if(block.type==='text')return <p style={{color:block.color,fontWeight:block.weight==='bold'?700:400,fontSize:block.size==='xs'?12:16}}>{block.text}</p>;
 return <div className="space-y-3">{block.contents?.map((b:any,i:number)=><Block key={i} block={b} ack={ack} onAck={onAck}/>)}</div>;
}
function Demo(){
 const {language,toggleLanguage}=useLanguage();const [certificate,setCertificate]=useState(false),[ack,setAck]=useState(false),[key,setKey]=useState(0);
 updateReminder=setCertificate;
 const [tab,setTab]=useState('uploads');
 const tabs=[['uploads','Medical uploads'],['notice','Personal reminder'],['registration','Registration'],['dashboard','Dashboard & roles'],['policy','Leave rules'],['cards','Approval cards'],['sick','Sick reminders'],['calendar','Employee calendar']];
 const urls:Record<string,string>={registration:'intern-registration.html',dashboard:'dashboard-access.html',policy:'leave-policy.html',cards:'cancellations.html?cards=1',sick:'sick-notifications.html',calendar:'cancellations.html?full=1'};
 const card=cards[language];
 return <main className="min-h-screen bg-slate-100 text-slate-900"><header className="bg-slate-900 text-white px-6 py-7"><div className="max-w-6xl mx-auto"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">TBS HR · Try the updates</h1><button className="rounded-xl border border-slate-600 px-4 py-2" onClick={toggleLanguage}>{language==='en'?'ภาษาไทย':'English'}</button></div><p className="mt-2 text-sm text-slate-300">Sample data only. No LINE messages, real leave changes or document uploads to the server.</p></div></header><nav className="max-w-6xl mx-auto flex flex-wrap gap-2 px-4 py-4">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold ${tab===id?'bg-cyan-600 text-white':'bg-white text-slate-600'}`}>{label}</button>)}</nav>
 {urls[tab]?<><div style={{padding:"8px 24px 16px",textAlign:"right"}}><a href={urls[tab]} target="_blank" rel="noreferrer" className="text-cyan-700 underline text-sm">Open this demo in a full page ↗</a></div><iframe key={tab} title={tabs.find(t=>t[0]===tab)?.[1]} src={urls[tab]} className="w-full border-0" style={{display:"block",height:"max(780px, 85vh)",width:"100%",border:0}}/></>:<div className="max-w-5xl mx-auto px-5 pb-10 grid md:grid-cols-2 gap-6">
 {tab==='uploads'?<><section className="rounded-3xl border border-rose-100 bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-bold">Sick Leave</h2><span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">Approved</span></div><p className="my-4 text-slate-500">5–7 October 2026 · 3 days · Sample request</p><LeaveEvidence key={key} requestId={999} employee canUpload/></section><section className="rounded-3xl border bg-white p-6"><h2 className="text-lg font-bold">Try the document check</h2><ol className="list-decimal ml-5 mt-4 space-y-3 text-sm text-slate-600"><li>Open “Attach medical documents”.</li><li>Choose Medical bill / receipt and a sample JPG, PNG or PDF. Tap Upload.</li><li>Repeat using Medical certificate to see the reminder change.</li></ol><div role="status" className={`mt-5 rounded-xl p-4 ${certificate?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-900'}`}>{certificate?'Certificate attached · unsent reminder cleared.':'Certificate still needed · a bill does not clear the reminder.'}</div><p className="mt-3 text-xs text-slate-500">This demo simulates the server result. Files stay in this page’s memory and disappear when you reset or reload.</p><button className="mt-5 text-sm underline" onClick={()=>{attachments=[];setCertificate(false);setKey(k=>k+1);}}>Reset attachments</button></section></>:<><section className="rounded-3xl bg-white p-6 border"><Block block={card.contents.body} ack={ack} onAck={()=>setAck(true)}/><Block block={card.contents.footer} ack={ack} onAck={()=>setAck(true)}/></section><section className="rounded-3xl bg-white border p-6"><h2 className="font-bold text-xl">Personal leave reminder</h2><p className="mt-4 text-slate-600">This sample employee has used 2 of 3 days, with 1 day left. The card is generated by the real message formatter.</p><ul className="list-disc ml-5 mt-4 space-y-3 text-sm text-slate-600"><li>Sent to the employee at the next 08:30 run.</li><li>One notice per year for full-time staff, or per internship.</li><li>No daily repeats, even if it is not acknowledged.</li><li>Acknowledgement does not change leave balances.</li></ul><button className="mt-5 underline text-sm" onClick={()=>setAck(false)}>Reset acknowledgement</button></section></>}
 </div>}</main>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Demo/></LanguageProvider>);
