import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import liff from '@line/liff';
import Attendance from '../../src/pages/Attendance';
import AttendanceAdmin from '../../src/components/ceo/AttendanceAdmin';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import '../../src/index.css';
(liff as unknown as {getAccessToken:()=>string}).getAccessToken=()=>'preview';
Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(ok:PositionCallback)=>setTimeout(()=>ok({coords:{latitude:13.7466,longitude:100.5393,accuracy:12}} as GeolocationPosition),400)}});
const params=new URLSearchParams(location.search);
const role=params.get('as')||'parttimer';
const isoDow=(()=>{const d=new Date(Date.now()+7*3600e3).getUTCDay();return d===0?7:d;})();
const bkk=(d:Date)=>new Date(d.getTime()+7*3600e3).toISOString().slice(0,10);
const today=bkk(new Date());
const day=(n:number)=>bkk(new Date(Date.now()-n*864e5));
const at=(date:string,hhmm:string)=>new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const settings={workMinutes:420,breakMinutes:60,breakAfterMinutes:300,locationDays:90};
const worked=(a:string,b:string|null)=>{if(!b)return 0;const span=Math.floor((+new Date(b)-+new Date(a))/60000);return Math.max(0,span-(span>300?60:0));};
type S={id:number;userId:string;employee:string;date:string;in:string;out:string|null;missedOut:boolean;edited:boolean;inPhoto:boolean;outPhoto:boolean;inLat:number|null;inLng:number|null;outLat:number|null;outLng:number|null};
let seq=50;
const mk=(userId:string,employee:string,date:string,a:string,b:string|null,missed=false):S=>({id:++seq,userId,employee,date,in:at(date,a),out:b?at(date,b):null,missedOut:missed,edited:false,inPhoto:true,outPhoto:!!b,inLat:13.7466,inLng:100.5393,outLat:b?13.7468:null,outLng:b?100.5391:null});
const shifts:S[]=[
 mk('ploy','Ploy Dee (Ploy)',day(1),'09:02','17:05'),mk('ploy','Ploy Dee (Ploy)',day(2),'09:10',null,true),mk('ploy','Ploy Dee (Ploy)',day(3),'08:55','18:20'),mk('ploy','Ploy Dee (Ploy)',day(4),'13:00','17:00'),
 mk('mint','Mint Kaew (Mint)',today,'09:30',null),mk('mint','Mint Kaew (Mint)',day(1),'09:00','16:00'),
];
const fixes=[{id:7,userId:'mint',employee:'Mint Kaew (Mint)',shiftId:null as number|null,date:day(5),in:at(day(5),'10:00'),out:at(day(5),'15:00'),reason:'Phone battery died, worked at the office',status:'pending',decidedBy:null as string|null,decidedAt:null as string|null,note:null as string|null,createdAt:new Date().toISOString(),was:null as null|{in:string;out:string|null;missedOut:boolean}}];
let enabled=params.get('off')===null;
const people=[{id:'ploy',name:'Ploy Dee (Ploy)',department:'SEO',type:'employee',member:true,kind:'part-time',wfhDays:[] as number[]},{id:'mint',name:'Mint Kaew (Mint)',department:'Content',type:'employee',member:true,kind:'wfh',wfhDays:[1,5]},{id:'som',name:'Somchai Jaidee (Som)',department:'Sale',type:'employee',member:false,kind:'part-time',wfhDays:[] as number[]}];
const target=(u:string)=>people.find(p=>p.id===u)?.kind==='wfh'?480:420;
const out=(s:S)=>({...s,workedMin:worked(s.in,s.out),overtimeMin:Math.max(0,worked(s.in,s.out)-target(s.userId))});
const fixOut=(f:typeof fixes[number])=>({...f,workedMin:worked(f.in,f.out)});
const sum=(u:string,from:string)=>shifts.filter(s=>s.userId===u&&s.date>=from).reduce((a,s)=>a+worked(s.in,s.out),0);
const monday=(()=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);})();
const state=()=>{const me=role==='wfh'?'mint':'ploy';const p=people.find(x=>x.id===me)!;const mine=shifts.filter(s=>s.userId===me);const wfhDays=role==='office'?[isoDow%7+1]:p.wfhDays.includes(isoDow)||p.kind!=='wfh'?p.wfhDays:[...p.wfhDays,isoDow].sort();
 const openShift=mine.find(s=>!s.out&&!s.missedOut);
 return {ok:true,enabled,member:true,eligible:enabled,kind:role==='parttimer'?'part-time':'wfh',wfhDays:role==='parttimer'?[]:wfhDays,workToday:role==='parttimer'||wfhDays.includes(isoDow),settings:{...settings,workMinutes:role==='parttimer'?420:480},today,
 open:role==='office'?null:openShift?out(openShift):null,shifts:mine.filter(s=>role!=='office'||s.out||s.missedOut).sort((a,b)=>b.in.localeCompare(a.in)).map(out),weekMin:sum(me,monday),monthMin:sum(me,today.slice(0,8)+'01'),
 fixes:fixes.filter(f=>f.userId===me&&f.status!=='cancelled').map(fixOut),team:[],teamFixes:[]};};
const overview=()=>({ok:true,from:today.slice(0,8)+'01',to:today,today,settings:{...settings,wfhWorkMinutes:480,enabled,updatedAt:new Date().toISOString(),updatedBy:'hr'},people,shifts:shifts.map(out),fixes:fixes.map(fixOut)});
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json'}});
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=String(input);if(!url.startsWith('/api/'))return realFetch(input,init);
 const b=init?.body?JSON.parse(String(init.body)):null;await new Promise(r=>setTimeout(r,300));
 const me=role==='parttimer'?'ploy':'mint';
 const decide=(id:number,act:string)=>{const f=fixes.find(x=>x.id===id)!;f.status=act==='approve'?'approved':'rejected';f.decidedBy='Lek';if(act==='approve'){const s=shifts.find(x=>x.id===f.shiftId);if(s){s.in=f.in;s.out=f.out;s.missedOut=false;s.edited=true;}else shifts.push({...mk(f.userId,f.employee,f.date,'00:00','01:00'),in:f.in,out:f.out,edited:true,inPhoto:false,outPhoto:false,inLat:null,inLng:null,outLat:null,outLng:null});}};
 if(url.startsWith('/api/attendance')){
  if(!b)return json(state());
  if((b.action==='in'||b.action==='out')&&!String(b.photo??'').startsWith('/9j/'))return json({ok:false,error:'Take a photo of yourself at work to clock '+b.action+'.'},422);
  if(b.action==='in'){shifts.push({...mk(me,'Ploy Dee (Ploy)',today,'00:00',null),in:new Date().toISOString()});return json(state());}
  if(b.action==='out'){const s=shifts.find(x=>x.userId===me&&!x.out&&!x.missedOut)!;s.out=new Date(Math.max(Date.now(),+new Date(s.in)+60000)).toISOString();s.outLat=13.7468;s.outLng=100.5391;s.outPhoto=true;return json(state());}
  if(b.action==='fix'){const t=(h:string)=>at(b.date,h);fixes.unshift({id:++seq,userId:me,employee:'Ploy Dee (Ploy)',shiftId:b.shiftId??null,date:b.date,in:t(b.in),out:t(b.out),reason:b.reason,status:'pending',decidedBy:null,decidedAt:null,note:null,createdAt:new Date().toISOString(),was:null});return json(state());}
  if(b.action==='fix-cancel'){fixes.find(f=>f.id===b.id)!.status='cancelled';return json(state());}
 }
 if(url.startsWith('/api/hr-admin')){
  if(!b)return json(overview());
  if(b.action==='attendance-settings-save')enabled=b.enabled;
  if(b.action==='attendance-person-save'){const p=people.find(x=>x.id===b.userId)!;p.member=b.member;if(b.kind){p.kind=b.kind;p.wfhDays=b.wfhDays??[];}}
  if(b.action==='attendance-fix-decide')decide(b.id,b.decision);
  return json(overview());
 }
 return json({ok:false,error:'Unknown demo call'},404);
};
export function Preview(){
 const {toggleLanguage,language}=useLanguage();
 const [tab,setTab]=useState(params.get('tab')||'phone');
 return <><div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 p-3 text-sm"><span>Local demo · no live changes</span><span className="flex gap-3">{['phone','dashboard'].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'font-bold underline':''}>{t}</button>)}<button onClick={toggleLanguage} className="underline">{language==='th'?'EN':'TH'}</button></span></div>
  {tab==='phone'?<div className="mx-auto max-w-md"><MemoryRouter><Attendance/></MemoryRouter></div>:<div className="min-h-screen bg-slate-100"><div className="mx-auto max-w-4xl p-6"><AttendanceAdmin/></div></div>}</>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview/></LanguageProvider>);
