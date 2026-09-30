// Standalone Vite preview; not imported by the production app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import liff from '@line/liff';
import EmployeeCancellations from '../../src/components/EmployeeCancellations';
import CancellationRequests from '../../src/components/ceo/CancellationRequests';
import '../../src/index.css';
import {LanguageProvider} from '../../src/hooks/useLanguage';
const year=new Date().getFullYear()+1;
const leaves=[{id:101,status:'Pending',type:'personal',days:1,period:null,dates:[`${year}-01-10`],revision:'a'.repeat(32),cancellation:null as any},
{id:102,status:'Approved',type:'annual',days:2,period:null,dates:[`${year}-01-15`,`${year}-01-16`],revision:'b'.repeat(32),cancellation:null as any}];
let requests:any[]=[];let nextId=1;
// Every fetch is intercepted; this page cannot call the real API.
liff.getAccessToken=()=> 'local-preview-only';
window.fetch=async(input,init)=>{
 const url=String(input);if(!url.startsWith('/api/cancellations'))throw new Error('Live requests are disabled in this demo');
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
 return new Response(JSON.stringify({ok:true,requests:boss?requests:leaves.filter(l=>l.status!=='Rejected')}),{status:200});
};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={client}><div className="min-h-screen bg-slate-100 p-4 md:p-8"><div className="max-w-6xl mx-auto"><div className="bg-slate-900 text-white rounded-2xl p-5 mb-6"><h1 className="text-2xl font-bold">Leave cancellation preview</h1><p className="mt-2 text-amber-300 font-semibold">Sample data only — no real leave, messages, or calendar events change.</p><p className="text-sm mt-2">Try requesting cancellation on the left, then approve or reject it on the right. Refresh the employee list to see the decision.</p><button className="mt-3 border rounded-lg px-3 py-1" onClick={()=>location.reload()}>Reset demo</button></div><div className="grid md:grid-cols-2 gap-6"><div><h2 className="font-bold text-xl px-4">1. Employee view</h2><EmployeeCancellations userId="demo" onChanged={()=>{}}/></div><div><h2 className="font-bold text-xl mb-6">2. Boss view</h2><CancellationRequests/></div></div></div></div><Toaster/></QueryClientProvider></LanguageProvider>);
