// Standalone sample only. Every request is intercepted; no credentials or leave reach a server.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import DashboardAccess from '../../src/components/ceo/DashboardAccess';
import '../../src/index.css';
let session:{id:string;username:string;role:string;active:boolean}|null=null;
let internStatus='active';
let demoRetried=false;
let internDeleted=false;
const accounts=[{id:'demo-admin',username:'admin',role:'admin',active:true},{id:'demo-ceo',username:'ceo',role:'ceo',active:true},{id:'demo-hr',username:'hr',role:'hr',active:true}];
const year=new Date().getFullYear();
const approvalDemo=new URLSearchParams(location.search).get('scenario')==='approvals';
let pendingDemo=approvalDemo;
const demoDates=[`${year}-10-27`,`${year}-10-28`];
const employee=(intern:boolean)=>({id:intern?'demo-intern':'demo-staff',empNo:intern?901:1,empCode:intern?'TBSInterns-001':'TBS-001',name:intern?'Sample Intern':'Sample Employee',nickname:'',department:intern?'AI':'SEO',employmentType:intern?'intern':'employee',internNumber:intern?1:null,status:intern?internStatus:'active',startDate:`${year}-01-01`,quotas:{annualTotal:intern?null:10,sickTotal:intern?null:30,personalTotal:intern?0:3,carriedOver:0},quotasKnown:!intern,leaves:intern&&pendingDemo?demoDates.map((date,i)=>({id:`demo-leave-${i}`,requestId:'demo-request',requestRevision:'demo-revision',requestDates:demoDates,date,type:'personal',days:1,note:'Sample two-day request',status:'Pending'})):[]});
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin),json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
 if(url.pathname==='/api/auth'){
  if(init?.method==='DELETE'){session=null;return json({ok:true});}
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));session=accounts.find(a=>a.username===b.username);return session?json({ok:true}):json({error:'Use admin, ceo or hr for this demo'},401);}
  return json({required:true,signedIn:!!session,session});
 }
 if(url.pathname==='/api/company-holidays')return json({ok:true,confirmed:true,revision:'demo',holidays:[{date:`${year}-10-13`,name:'Company holiday'}]});
 if(url.pathname==='/api/registration')return json({ok:true,registrations:[]});
 if(url.pathname==='/api/intern-terms')return json({ok:true,terms:[{user_id:'demo-intern',months:4,start_date:`${year}-01-01`,end_date:`${year}-04-30`}]});
 if(!session)return json({error:'Sign in required'},401);
 if(url.pathname==='/api/employees'){const intern=url.searchParams.get('cohort')==='intern';if(session.role==='hr'&&!intern)return json({error:'Access denied'},403);return json({year,count:intern&&internDeleted?0:1,employees:intern&&internDeleted?[]:[employee(intern)]});}
 if(url.pathname==='/api/leave'&&init?.method==='PATCH'&&url.searchParams.get('id')==='demo-request'){pendingDemo=false;return json({ok:true});}
 if(url.pathname==='/api/accounts')return ['admin','ceo'].includes(session.role)?json({accounts,ok:true}):json({error:'Access denied'},403);
 if(url.pathname==='/api/interns'&&init?.method==='POST'){const b=JSON.parse(String(init.body));if(b.action==='delete'){if(internStatus!=='inactive'||b.confirmation!=='TBSInterns-001')return json({error:'Archive the intern and enter TBSInterns-001 to confirm.'},422);internDeleted=true;return json({ok:true});}if(b.action==='archive')internStatus='inactive';if(b.action==='restore')internStatus='active';return json({ok:true});}
 if(url.pathname==='/api/interns')return json({employees:[{id:'demo-intern',name:'Sample Intern',type:'intern',internNumber:1}]});
 if(url.pathname==='/api/history')return json({events:[{id:'demo-decision',changedAt:new Date().toISOString(),entity:'leave_requests',recordId:'123',userId:'demo-intern',employeeName:url.searchParams.get('cohort')==='intern'?'Sample Intern':'Sample Employee',department:'AI',action:'reject',actor:'Nam · LINE',before:{status:'Pending'},after:{status:'Rejected',rejection_reason:'Please choose another day.',leave_type:'personal',leave_days:0.5,selected_dates:'2026-10-20'},canRestore:false}],nextCursor:null});
 if(url.pathname==='/api/cancellations'){
  if(init?.method==='POST'){demoRetried=true;return json({ok:true});}
  return json(url.searchParams.has('delivery')?{pending:demoRetried?0:1,failed:demoRetried?0:1,calendar:{lastSuccess:new Date().toISOString(),error:demoRetried?null:'Sample connection failure',running:false,failures:demoRetried?0:1},jobs:demoRetried?[]:[{id:'sample',kind:'line',name:'Sample Employee',status:'Retry scheduled',attempts:1,blocked:false,running:false,needsResend:false,error:'Sample LINE delivery failure',updatedAt:new Date().toISOString()}]}:{requests:[]});
 }
 throw Error('Live requests are disabled in this preview');
};
export function DemoLanguage(){const {language,toggleLanguage}=useLanguage();return <button className="fixed bottom-3 right-3 z-50 rounded-full border bg-white px-4 py-2 shadow" onClick={toggleLanguage}>{language==='th'?'EN':'ไทย'}</button>;}
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><div className="bg-slate-800 px-4 py-1.5 text-center text-xs text-slate-300">Local preview · Sample data only · Sign in as admin, ceo or hr with any demo password.</div><DemoLanguage/><DashboardAccess/></MemoryRouter></QueryClientProvider></LanguageProvider>);
