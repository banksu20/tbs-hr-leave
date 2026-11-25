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
const iso=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const sampleInterns=[
 {id:'demo-intern-2',code:'TBSInterns-002',name:'Kirin Example',department:'SEO',status:'active',start:iso(-100),end:iso(18),supervisors:['demo-lead-4'],used:[1.5,1,3],leaves:[{date:iso(3),type:'personal',days:1,note:'Family event\n(TH) งานครอบครัว',status:'Pending'},{date:iso(-20),type:'sick',days:1,note:'Fever',status:'Approved'}]},
 {id:'demo-intern-3',code:'TBSInterns-003',name:'Yanisa Example',department:'Content',status:'active',start:iso(-30),end:iso(90),supervisors:[],used:[0,0,0],leaves:[]},
 {id:'demo-intern-4',code:'TBSInterns-004',name:'Sai Example',department:'AI',status:'active',start:iso(-60),end:iso(60),supervisors:['demo-lead-3','demo-lead'],used:[4.5,1,1],leaves:[{date:iso(-5),type:'sick',days:0.5,note:'Clinic visit',status:'Approved',halfDayPeriod:'morning'}]},
 {id:'demo-intern-5',code:'TBSInterns-005',name:'Past Example',department:'Graphic',status:'inactive',start:iso(-200),end:iso(-40),supervisors:['demo-lead-2'],used:[2,2,1],leaves:[]},
];
const sampleEmployees=()=>sampleInterns.map((s,n)=>({id:s.id,empNo:902+n,empCode:s.code,name:s.name,nickname:'',department:s.department,employmentType:'intern',internNumber:2+n,status:s.status,startDate:s.start,quotas:{annualTotal:null,sickTotal:null,personalTotal:0,carriedOver:0},quotasKnown:false,leaves:s.leaves.map((l,i)=>({id:`${s.id}-leave-${i}`,requestId:`${s.id}-request-${i}`,requestRevision:'demo-revision',requestDates:[l.date],...l}))}));
const sampleTerms=()=>sampleInterns.map(s=>({user_id:s.id,universityApproved:0,months:4,start_date:s.start,end_date:s.end,internshipBalances:['sick','annual','personal'].map((type,i)=>({type,total:[4,2,3][i],approved:s.used[i],pending:0}))}));
const sampleStaff=()=>[
 {id:'demo-staff-2',code:'TBS-002',name:'Alexander Example',nickname:'Alex',department:'SEO',start:`${year-3}-03-01`,quotas:{annualTotal:12,sickTotal:30,personalTotal:3,carriedOver:2},leaves:[{date:iso(-12),type:'annual',days:1,note:'Family trip',status:'Approved'},{date:iso(-11),type:'annual',days:1,note:'Family trip',status:'Approved'},{date:iso(6),type:'personal',days:1,note:'Bank appointment\n(TH) ไปธนาคาร',status:'Pending'}]},
 {id:'demo-staff-3',code:'TBS-003',name:'Kochakorn Example',nickname:'Nam',department:'Web Developer',start:`${year-1}-06-15`,quotas:{annualTotal:10,sickTotal:30,personalTotal:3,carriedOver:0},leaves:[{date:iso(-40),type:'personal',days:1,note:'Moving house',status:'Approved'},{date:iso(-39),type:'personal',days:1,note:'Moving house',status:'Approved'},{date:iso(-38),type:'personal',days:1,note:'Moving house',status:'Approved'},{date:iso(-30),type:'personal',days:1,note:'Emergency',status:'Approved'},{date:iso(-3),type:'sick',days:0.5,note:'Dentist',status:'Approved',halfDayPeriod:'afternoon'},{date:iso(1),type:'sick',days:1,note:'ไข้หวัดใหญ่\n(EN) Flu',status:'Pending'},{date:iso(0),type:'annual',days:1,note:'Day off',status:'Approved'}]},
 {id:'demo-staff-4',code:'TBS-004',name:'Natthanon Example',nickname:'Nate',department:'Graphic',start:'',quotas:{annualTotal:null,sickTotal:null,personalTotal:3,carriedOver:0},known:false,leaves:[]},
].map(s=>({id:s.id,empNo:Number(s.code.slice(4)),empCode:s.code,name:s.name,nickname:s.nickname,department:s.department,employmentType:'employee',internNumber:null,status:'active',startDate:s.start,quotas:s.quotas,quotasKnown:s.known!==false,leaves:s.leaves.map((l,i)=>({id:`${s.id}-leave-${i}`,requestId:`${s.id}-request-${i}`,requestRevision:'demo-revision',requestDates:[l.date],...l}))}));
const quotaMode=new URLSearchParams(location.search).get('quota')??'low';
let quotaSettings={alertEmail:null as string|null,warnPct:80,reservePct:5};
const lineQuota=()=>{const used={ok:120,warn:250,low:287,full:300,unknown:14}[quotaMode]??287;const limit=quotaMode==='unknown'?null:300;const state=quotaMode==='unknown'?'unknown':used>=300?'full':used>=285?'low':used>=240?'warn':'ok';
 return {state,limit,used,threshold:limit?285:null,percent:limit?Math.round(used*100/300):null,checkedAt:quotaMode==='unknown'?null:new Date(Date.now()-6e5).toISOString(),checkError:null,resetsAt:'2026-11-30T15:00:00Z',held:state==='low'?3:state==='full'?5:0,heldMessages:state==='low'?50:state==='full'?52:0,...quotaSettings};};
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin),json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
 if(url.pathname==='/api/auth'){
  if(init?.method==='DELETE'){session=null;return json({ok:true});}
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));session=accounts.find(a=>a.username===b.username);return session?json({ok:true}):json({error:'Use admin, ceo or hr for this demo'},401);}
  return json({required:true,signedIn:!!session,session});
 }
 if(url.pathname==='/api/company-holidays')return json({ok:true,confirmed:true,revision:'demo',holidays:[{date:`${year}-10-13`,name:'Company holiday'}]});
 if(url.pathname==='/api/registration')return json({ok:true,registrations:[]});
 if(url.pathname==='/api/intern-terms')return json({ok:true,terms:[{user_id:'demo-intern',universityApproved:0,months:4,start_date:`${year}-01-01`,end_date:`${year}-04-30`},...sampleTerms()],supervisors:[{userId:'demo-lead',name:'Sample Supervisor (Lead)'},{userId:'demo-lead-2',name:'Second Supervisor'},{userId:'demo-lead-3',name:'Alexander Example (Alex)'},{userId:'demo-lead-4',name:'Natthanon Example (Nate)'}],internSupervisors:{'demo-intern':['demo-lead'],...Object.fromEntries(sampleInterns.filter(i=>i.supervisors.length).map(i=>[i.id,i.supervisors]))}});
 if(!session)return json({error:'Sign in required'},401);
 if(url.pathname==='/api/employees'){const intern=url.searchParams.get('cohort')==='intern';if(session.role==='hr'&&!intern)return json({error:'Access denied'},403);const list=intern?[...(internDeleted?[]:[employee(true)]),...sampleEmployees()]:[employee(false),...sampleStaff()];return json({year,count:list.length,employees:list});}
 if(url.pathname==='/api/leave'&&init?.method==='PATCH'&&url.searchParams.get('id')==='demo-request'){pendingDemo=false;return json({ok:true});}
 if(url.pathname==='/api/accounts')return ['admin','ceo'].includes(session.role)?json({accounts,ok:true}):json({error:'Access denied'},403);
 if(url.pathname==='/api/interns'&&init?.method==='POST'){const b=JSON.parse(String(init.body));if(b.action==='delete'){if(internStatus!=='inactive'||b.confirmation!=='TBSInterns-001')return json({error:'Archive the intern and enter TBSInterns-001 to confirm.'},422);internDeleted=true;return json({ok:true});}if(b.action==='archive')internStatus='inactive';if(b.action==='restore')internStatus='active';return json({ok:true});}
 if(url.pathname==='/api/interns')return json({employees:[{id:'demo-intern',name:'Sample Intern',type:'intern',internNumber:1}]});
 if(url.pathname==='/api/history')return json({events:[{id:'demo-decision',changedAt:new Date().toISOString(),entity:'leave_requests',recordId:'123',userId:'demo-intern',employeeName:url.searchParams.get('cohort')==='intern'?'Sample Intern':'Sample Employee',department:'AI',action:'reject',actor:'Nam · LINE',before:{status:'Pending'},after:{status:'Rejected',rejection_reason:'Please choose another day.',leave_type:'personal',leave_days:0.5,selected_dates:'2026-10-20'},canRestore:false}],nextCursor:null});
 if(url.pathname==='/api/cancellations'){
  if(init?.method==='POST'){const b=JSON.parse(String(init.body));if(b.kind==='quota'){quotaSettings={alertEmail:b.alertEmail||null,warnPct:b.warnPct,reservePct:b.reservePct};return json({ok:true,lineQuota:lineQuota()});}demoRetried=true;return json({ok:true});}
  return json(url.searchParams.has('delivery')?{pending:demoRetried?0:1,failed:demoRetried?0:1,calendar:{lastSuccess:new Date().toISOString(),error:demoRetried?null:'Sample connection failure',running:false,failures:demoRetried?0:1},lineQuota:lineQuota(),jobs:demoRetried?[]:[{id:'sample',kind:'line',name:'Sample Employee',status:'Retry scheduled',attempts:1,blocked:false,running:false,needsResend:false,error:'Sample LINE delivery failure',updatedAt:new Date().toISOString()}]}:{requests:[]});
 }
 if(url.pathname==='/api/hr-admin'&&url.searchParams.get('view')==='trips')return json({ok:true,trips:url.searchParams.get('status')==='flagged'?[{id:1,status:'flagged'},{id:2,status:'flagged'}]:[]});
 if(url.pathname==='/api/hr-admin'&&url.searchParams.get('view')==='attendance')return json({ok:true,fixes:[{id:1,status:'pending'}]});
 throw Error('Live requests are disabled in this preview');
};
export function DemoLanguage(){const {language,toggleLanguage}=useLanguage();return <button className="fixed bottom-3 right-3 z-50 rounded-full border bg-white px-4 py-2 shadow" onClick={toggleLanguage}>{language==='th'?'EN':'ไทย'}</button>;}
createRoot(document.getElementById('root')!).render(<LanguageProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><div className="bg-slate-800 px-4 py-1.5 text-center text-xs text-slate-300">Local preview · Sample data only · Sign in as admin, ceo or hr with any demo password.</div><DemoLanguage/><DashboardAccess/></MemoryRouter></QueryClientProvider></LanguageProvider>);
