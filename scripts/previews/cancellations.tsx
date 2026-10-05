// Standalone Vite preview; not imported by the production app.
import React from 'react';
import {MemoryRouter} from 'react-router-dom';
import Dashboard from '../../src/components/Dashboard';
import flexCards from './flex-fixtures.json';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import liff from '@line/liff';
import EmployeeCancellations from '../../src/components/EmployeeCancellations';
import CancellationRequests from '../../src/components/ceo/CancellationRequests';
import '../../src/index.css';
import {LanguageProvider} from '../../src/hooks/useLanguage';
// A browser approximation of LINE Flex layout, rendered from actual generated message JSON.
function FlexBlock({block}:{block:any}) {
 const sizes:Record<string,string>={xs:'12px',sm:'14px',md:'16px',xl:'22px'};
 if(block.type==='button')return <button disabled className="w-full rounded-lg border px-4 py-3 font-semibold" style={{background:block.style==='primary'?(block.color??'#06C755'):undefined,color:block.style==='primary'?'white':'#334155'}}>{block.action.label}</button>;
 if(block.type==='separator')return <hr className="border-slate-200"/>;
 if(block.type==='text')return <p style={{fontSize:sizes[block.size]??'16px',color:block.color??'#111827',fontWeight:block.weight==='bold'?700:400,overflowWrap:'anywhere'}}>{block.text}</p>;
 return <div style={{display:'flex',flexDirection:'column',gap:block.spacing==='sm'?8:16,padding:block.paddingAll?20:0,background:block.backgroundColor,borderRadius:block.cornerRadius?12:0}}>{block.contents?.map((child:any,i:number)=><FlexBlock key={i} block={child}/>)}</div>;
}
const year=new Date().getFullYear()+1;
const leaves=[{id:101,status:'Pending',type:'personal',days:1,period:null,dates:[`${year}-01-10`],revision:'a'.repeat(32),cancellation:null as any},
{id:102,status:'Approved',type:'annual',days:2,period:null,dates:[`${year}-01-15`,`${year}-01-16`],revision:'b'.repeat(32),cancellation:null as any}];
let requests:any[]=[];let nextId=1;
// Every fetch is intercepted; this page cannot call the real API.
liff.getAccessToken=()=> 'local-preview-only';
liff.init=async()=>{};
liff.isLoggedIn=()=>true;
liff.getProfile=async()=>({userId:'demo',displayName:'Demo Employee'});
const fullView=new URLSearchParams(location.search).has('full');
const cardsOnly=new URLSearchParams(location.search).has('cards');
window.fetch=async(input,init)=>{
 const url=String(input);
 const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
 if(url.includes('delivery=1'))return json({pending:0,failed:0,jobs:[]});
 if(url.includes('/webhook/check-user'))return json({found:true,name:'Demo Employee',department:'Web Developer'});
 if(url.includes('/webhook/get-quota'))return json({remainingDays:10,annualTotal:12,sickTaken:1,sickTotal:null,sickRemaining:null,personalRemaining:2,personalTotal:3,personalTaken:1});
 if(url.includes('/webhook/get-team-calendar')||url.includes('/publicholidays/'))return json([]);
 if(!url.startsWith('/api/cancellations'))throw new Error('Live requests are disabled in this demo');
 const boss=url.includes('view=boss');
 if(init?.method==='POST'){
  const body=JSON.parse(String(init.body));
  if(boss){const c=requests.find(r=>r.id===body.id);if(!c)return new Response(JSON.stringify({error:'Refresh the demo'}),{status:409});const row=leaves.find(l=>l.id===c.request_id)!;
   c.status=body.action==='approve'?'Approved':'Rejected';c.decision_reason=body.reason;row.cancellation={...c};
   if(body.action==='approve'){row.dates=row.dates.filter(d=>!c.dates.includes(d));row.days=row.dates.length;if(!row.dates.length)row.status='Rejected';}
   requests=requests.filter(r=>r.id!==c.id);
  }else{const row=leaves.find(l=>l.id===body.id)!;if(row.status==='Pending'){row.dates=row.dates.filter(d=>!body.dates.includes(d));row.days=row.dates.length;if(!row.days)row.status='Rejected';}else{const c={id:nextId++,request_id:row.id,name:'Demo Employee',code:999,type:row.type,dates:body.dates,daysPerDate:1,period:null,reason:body.reason,status:'Pending',created_at:new Date().toISOString()};requests.push(c);row.cancellation={...c};}}
  await client.invalidateQueries({queryKey:['cancellations']});return new Response(JSON.stringify({ok:true}),{status:200});
 }
 return new Response(JSON.stringify({ok:true,requests:boss?requests:leaves}),{status:200});
};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const fullEmployee=<MemoryRouter><div className="max-w-md mx-auto bg-white"><div className="sticky top-0 z-40 bg-white border-b px-4 py-3 text-sm font-bold">TBS HR – Leave Request System</div><Dashboard employeePreview/></div></MemoryRouter>;
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={client}><div className="min-h-screen bg-slate-100 p-4 md:p-8"><div className="max-w-6xl mx-auto">{fullView&&<div className="mb-6 rounded-xl bg-amber-100 p-3 text-center text-sm">Full employee page · sample data · no notifications</div>}{fullView&&fullEmployee}<div style={{display:fullView?'none':undefined}}><div style={{display:cardsOnly?'none':undefined}} className="bg-slate-900 text-white rounded-2xl p-5 mb-6"><h1 className="text-2xl font-bold">Leave cancellation preview</h1><p className="mt-2 text-amber-300 font-semibold">Sample data only — no real leave, messages, or calendar events change.</p><p className="text-sm mt-2">Try requesting cancellation on the left, then approve or reject it on the right. Refresh the employee list to see the decision.</p><button className="mt-3 border rounded-lg px-3 py-1" onClick={()=>location.reload()}>Reset demo</button></div><div style={{display:cardsOnly?'none':undefined}} className="grid md:grid-cols-2 gap-6"><div><h2 className="font-bold text-xl px-4">1. Employee view</h2><EmployeeCancellations userId="demo" onChanged={()=>{}}/></div><div><h2 className="font-bold text-xl mb-6">2. Boss view</h2><CancellationRequests/></div></div><section className="mt-8"><h2 className="text-xl font-bold">LINE message scenarios</h2><p className="text-sm text-slate-600 my-3">Local layout preview using the generated Flex message data. LINE may render spacing differently. No messages are sent.</p><div className="grid md:grid-cols-2 gap-6 bg-slate-800 p-5 rounded-2xl">{flexCards.map((card,i)=><div key={i}><p className="text-white font-bold mb-2">{i+1}. {card.scenario}</p><p className="text-slate-300 text-sm mb-3">To: {card.recipient}</p><div className="bg-white rounded-3xl p-6 max-w-sm"><FlexBlock block={card.contents.body}/>{'footer' in card.contents&&<div className="mt-5"><FlexBlock block={card.contents.footer}/></div>}</div></div>)}</div></section></div></div></div><Toaster/></QueryClientProvider></LanguageProvider>);
