// Isolated preview: every fetch is mocked, including submission and language preferences.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import liff from '@line/liff';
import LeaveRequestForm from '../../src/components/LeaveRequestForm';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';

import '../../src/index.css';
const scenario=new URLSearchParams(location.search).get('scenario')||'personal';
liff.getAccessToken=()=> 'local-preview-only';
liff.isInClient=()=>false;
window.fetch=async(input,init)=>{
 const url=String(input),json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
 if(url.includes('/get-leave-history'))return json([]);
 if(url.includes('/check-user'))return json({found:true,name:'Demo Employee',department:'AI'});
 if(url.includes('/api/sick-language'))return json({ok:true});
 if(url==='/api/leave-policy'){
  if(scenario==='error')return json({error:'Could not check leave allowance. Please try again.'},503);
  const body=JSON.parse(String(init?.body));
  const balance=(type:string)=>({year:new Date().getFullYear(),type,total:type==='annual'?10:3,approved:type==='annual'?2:2.5,pending:0,available:type==='annual'?8:.5,requested:body.dates.length*body.daysPerDate,allowed:type==='annual'||body.dates.length*body.daysPerDate<=.5,known:true,unlimited:false});
  const type=body.type==='vacation'?'annual':body.type;
  return json({ok:true,unlimited:scenario==='unlimited',balances:[balance(type)],annualBalances:[balance('annual')],isIntern:scenario==='intern',deadline:body.dates.length?new Date(Date.parse(body.dates[0]+'T'+(type==='sick'?'08:30':'16:30')+':00+07:00')-(type==='sick'?0:scenario==='intern'&&type==='annual'?3:1)*86400000).toISOString():null,medicalCertificateRequired:scenario==='medical'&&body.dates.length>0});
 }
 if(url==='/api/leave-evidence')return json({ok:true,id:crypto.randomUUID(),filename:'demo-evidence.pdf'});
 if(url.includes('/api/leave-evidence?'))return json({ok:true});
 if(url==='/api/employee-request')return json({ok:false,error:'Preview only. No request or message was sent.'},409);
 throw Error('Live requests are disabled in this preview: '+url);
};
function Preview(){const {toggleLanguage,language}=useLanguage();return <><div className="bg-amber-100 p-3 text-sm flex flex-wrap justify-between gap-2"><span>Local demo · no live changes</span><button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button><nav className="flex gap-3">{['personal','medical','intern','unlimited','error'].map(s=><a key={s} className="underline" href={'?scenario='+s}>{s}</a>)}</nav></div><LeaveRequestForm userId="demo" userName="Demo Employee" department="AI" initialLeaveType={scenario==='medical'?'sick':'personal'}/></>}
createRoot(document.getElementById('root')!).render(<LanguageProvider><MemoryRouter><Preview/></MemoryRouter></LanguageProvider>);
