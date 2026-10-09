// Standalone sample only. Every request is intercepted; no credentials or leave reach a server.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LanguageProvider} from '../../src/hooks/useLanguage';
import DashboardAccess from '../../src/components/ceo/DashboardAccess';
import '../../src/index.css';
let session:any=null;
let internStatus='active';
const accounts=[{id:'demo-admin',username:'admin',role:'admin',active:true},{id:'demo-ceo',username:'ceo',role:'ceo',active:true},{id:'demo-hr',username:'hr',role:'hr',active:true}];
const year=new Date().getFullYear();
const employee=(intern:boolean)=>({id:intern?'demo-intern':'demo-staff',empNo:intern?901:1,empCode:intern?'TBSInterns-001':'TBS-001',name:intern?'Sample Intern':'Sample Employee',nickname:'',department:intern?'AI':'SEO',employmentType:intern?'intern':'employee',internNumber:intern?1:null,status:intern?internStatus:'active',startDate:`${year}-01-01`,quotas:{annualTotal:intern?null:10,sickTotal:intern?null:30,personalTotal:intern?0:3,carriedOver:0},quotasKnown:!intern,leaves:[]});
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin),json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
 if(url.pathname==='/api/auth'){
  if(init?.method==='DELETE'){session=null;return json({ok:true});}
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));session=accounts.find(a=>a.username===b.username);return session?json({ok:true}):json({error:'Use admin, ceo or hr for this demo'},401);}
  return json({required:true,signedIn:!!session,session});
 }
 if(url.pathname==='/api/company-holidays')return json({ok:true,confirmed:true,revision:'demo',holidays:[{date:`${year}-10-13`,name:'Company holiday'}]});
 if(url.pathname==='/api/registration')return json({ok:true,registrations:[]});
 if(url.pathname==='/api/intern-terms')return json({ok:true,terms:[]});
 if(!session)return json({error:'Sign in required'},401);
 if(url.pathname==='/api/employees'){const intern=url.searchParams.get('cohort')==='intern';if(session.role==='hr'&&!intern)return json({error:'Access denied'},403);return json({year,count:1,employees:[employee(intern)]});}
 if(url.pathname==='/api/accounts')return session.role==='admin'?json({accounts,ok:true}):json({error:'Access denied'},403);
 if(url.pathname==='/api/interns'&&init?.method==='POST'){const b=JSON.parse(String(init.body));if(b.action==='archive')internStatus='inactive';if(b.action==='restore')internStatus='active';return json({ok:true});}
 if(url.pathname==='/api/interns')return json({employees:[{id:'demo-intern',name:'Sample Intern',type:'intern',internNumber:1}]});
 if(url.pathname==='/api/history')return json({events:[],nextCursor:null});
 if(url.pathname==='/api/cancellations')return json(url.searchParams.has('delivery')?{pending:0,failed:0,jobs:[]}:{requests:[]});
 throw Error('Live requests are disabled in this preview');
};
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><div className="bg-slate-800 px-4 py-1.5 text-center text-xs text-slate-300">Local preview · Sample data only · Sign in as admin, ceo or hr with any demo password.</div><DashboardAccess/></MemoryRouter></QueryClientProvider></LanguageProvider>);
