// Isolated preview: every fetch is mocked, including submission and language preferences.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import liff from '@line/liff';
import LeaveRequestForm from '../../src/components/LeaveRequestForm';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';

import '../../src/index.css';
const scenario=new URLSearchParams(location.search).get('scenario')||'personal';
liff.getAccessToken=()=> 'local-preview-only';
liff.isInClient=()=>false;
window.fetch=async(input,init)=>{
 const url=String(input),json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
 if(url.includes('action=get-leave-history'))return json([]);
 if(url.includes('action=check-user'))return json({found:true,name:'Demo Employee',department:'AI'});
 if(url.includes('/api/notification-preferences')||url.includes('/api/sick-language'))return json({ok:true});
 if(url==='/api/leave-policy'){
  if(scenario==='error')return json({error:'Could not check leave allowance. Please try again.'},503);
  const body=JSON.parse(String(init?.body));
  const balance=(type:string)=>{
   const total=scenario==='intern'?(type==='sick'?4:type==='annual'?2:type==='university'?null:3):(type==='annual'?10:3);
   const approved=scenario==='intern'?(type==='sick'?4:0):(type==='annual'?2:2.5);
   const available=total===null?null:total-approved,requested=body.dates.length*body.daysPerDate;
   return {year:new Date().getFullYear(),type,total,approved,pending:0,available,requested,allowed:available===null||requested<=available,known:true,unlimited:type==='university'};
  };
  const type=body.type==='vacation'?'annual':body.type;
  return json({ok:true,unlimited:scenario==='unlimited',balances:[balance(type)],annualBalances:[balance('annual')],isIntern:scenario==='intern',deadline:body.dates.length?new Date(Date.parse(body.dates[0]+'T'+(type==='sick'?'08:30':'16:30')+':00+07:00')-(type==='sick'?0:scenario==='intern'&&type==='annual'?3:1)*86400000).toISOString():null,medicalCertificateRequired:scenario==='medical'&&body.dates.length>0});
 }
 if(url==='/api/leave-evidence')return json({ok:true,id:crypto.randomUUID(),filename:'demo-evidence.pdf'});
 if(url.includes('/api/leave-evidence?'))return json({ok:true});
 if(url==='/api/employee-request')return json({ok:false,error:'Preview only. No request or message was sent.'},409);
 throw Error('Live requests are disabled in this preview: '+url);
};
export function Preview(){const {toggleLanguage,language}=useLanguage();return <><div className="bg-amber-100 p-3 text-sm flex flex-wrap justify-between gap-2"><span>Local demo · no live changes</span><button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button><nav className="flex gap-3">{['personal','medical','intern','unlimited','error'].map(s=><a key={s} className="underline" href={'?scenario='+s}>{s}</a>)}</nav></div><LeaveRequestForm userId="demo" userName="Demo Employee" department="AI" initialLeaveType={scenario==='medical'?'sick':'personal'}/></>}
createRoot(document.getElementById('root')!).render(<LanguageProvider><MemoryRouter initialEntries={['/request']}><Routes><Route path="/request" element={<Preview/>}/><Route path="/" element={<main className="min-h-screen bg-slate-50 p-8"><section className="mx-auto max-w-xl rounded-3xl border bg-white p-8"><h1 className="text-2xl font-bold">Demo employee home</h1><p className="my-4 text-slate-500">You’re back at the employee home. Try another leave request below.</p><Link className="inline-block rounded-xl bg-cyan-600 px-5 py-3 text-white" to="/request">Request leave</Link></section></main>}/></Routes></MemoryRouter></LanguageProvider>);
