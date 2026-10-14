// Local-only preview using production registration and review components.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import liff from '@line/liff';
import ProfileSetup from '../../src/components/ProfileSetup';
import RegistrationReview from '../../src/components/ceo/RegistrationReview';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import '../../src/index.css';
liff.init=async()=>{};liff.isLoggedIn=()=>true;liff.getAccessToken=()=> 'demo';
let registrations:{user_id:string;first_name:string;last_name:string;nickname:string;department:string;employment_type:string;active:boolean}[]=[],role='hr',currentId='';
let activationNotice=(text:string)=>{};
const sample=(type:string)=>({user_id:crypto.randomUUID(),first_name:'Sample',last_name:type==='intern'?'Intern':'Employee',nickname:'',department:'AI',employment_type:type,active:false});
window.fetch=async(input,init)=>{
 const u=new URL(String(input),location.origin);
 if(u.pathname!=='/api/registration')throw Error('Live requests are disabled in this demo');
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(init?.method==='PATCH'){
  const b=JSON.parse(String(init.body)),r=registrations.find(r=>r.user_id===b.userId);
  if(!r)return json({error:'Registration not found'},404);
  if(r.employment_type!=='intern')return json({error:'HR only manages interns'},403);
  if(r.employment_type==='intern'&&(![4,6].includes(b.months)||!b.startDate||!b.endDate||b.endDate<=b.startDate))return json({error:'Choose a programme and an end date after the start date.'},422);
  Object.assign(r,b,{active:true});activationNotice(`${r.first_name} ${r.last_name} activated · ${r.employment_type==='intern'?'TBSInterns-001':'TBS-001'} (sample)`);
  return json({ok:true});
 }
 return json({ok:true,registrations:registrations.filter(r=>!r.active&&r.employment_type==='intern')});
};
export function Demo(){
 const [view,setView]=useState('employee'),[version,setVersion]=useState(0),[notice,setNotice]=useState('');
 activationNotice=setNotice;
 const current=registrations.find(r=>r.user_id===currentId);
 function switchView(v:string){role=v;setView(v);setNotice('');setVersion(n=>n+1);}
 function seed(v:string){registrations=[sample('intern')];currentId='';switchView(v);}
 return <><div className="p-3 bg-slate-800 text-slate-200 text-xs text-center">Local demo · No records or notifications are sent</div><nav className="flex flex-wrap justify-center gap-3 bg-white p-3 border-b">{[['employee','Employee registration'],['hr','Nam · Intern review'],['admin','Admin · Intern review']].map(([v,label])=><button key={v} className={`rounded-lg px-3 py-2 text-sm ${view===v?'bg-cyan-600 text-white':'bg-slate-100'}`} onClick={()=>switchView(v)}>{label}</button>)}<button className="text-sm underline" onClick={()=>{registrations=[];currentId='';switchView('employee');}}>Restart</button></nav>
 <div className="max-w-3xl mx-auto px-6 py-4 flex flex-wrap gap-3"><button className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={()=>seed('admin')}>Try Admin review with samples</button><button className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={()=>seed('hr')}>Try Nam’s intern review with samples</button></div>
 {view!=='employee'?<div className="max-w-3xl mx-auto p-6"><p className="mb-4 text-sm text-slate-600">{view==='hr'?'Nam reviews new intern registrations, confirms the 4- or 6-month programme and internship dates, then activates the profile. Full-time registrations are hidden here.':'Full-time staff can use their profile immediately after registering. Admin reviews intern programmes and dates here; annual allowances for full-time staff are managed separately in the dashboard.'}</p>{notice&&<p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</p>}<RegistrationReview key={`${view}-${version}`}/></div>:!current?<ProfileSetup defaultName="Demo Employee" onSave={data=>{const [first_name,last_name,nickname]=data.name.split('|');currentId=crypto.randomUUID();registrations.push({user_id:currentId,first_name,last_name,nickname,department:data.department,employment_type:data.employmentType,active:data.employmentType==='employee'});setVersion(n=>n+1);}}/>:<main className="min-h-[70vh] grid place-items-center p-6 bg-slate-50"><section className="bg-white border rounded-3xl p-8 max-w-md"><h1 className="font-bold text-2xl">{current.active?'Your profile is ready':'Registration received'}</h1><p className="text-slate-500 my-4">{current.active?`${current.first_name} · ${current.employment_type==='intern'?'TBSInterns-001':'TBS-001'}`:'Your profile is awaiting review. Switch to the review tab to try activation.'}</p></section></main>}</>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><Demo/></QueryClientProvider>);
