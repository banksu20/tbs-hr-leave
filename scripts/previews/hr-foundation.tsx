import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import liff from '@line/liff';
import SopCenter from '../../src/pages/SopCenter';
import SopManager from '../../src/components/ceo/SopManager';
import PeopleRoles from '../../src/components/ceo/PeopleRoles';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import '../../src/index.css';
(liff as unknown as {getAccessToken:()=>string}).getAccessToken=()=>'preview';
const now=new Date().toISOString();
const docs=[
 {id:1,titleEn:'Data rules',titleTh:'กติกาข้อมูล',body:'TBS เก็บข้อมูลในระบบ HR เพื่อพัฒนาคน ไม่ใช่จับผิดคน\n\n1. เจ้าตัวเห็นผลของตัวเองเสมอ และเห็นก่อนคนอื่น\n2. ผลประเมินใช้พัฒนาคน ไม่ใช้ตัดสินเงินเดือนหรือเลิกจ้าง',version:1,sortOrder:0,active:true,updatedAt:now},
 {id:2,titleEn:'TBS culture',titleTh:'วัฒนธรรม TBS',body:'ช่วยเหลือกัน ใจบริการลูกค้า ใช้ AI ช่วยงาน',version:2,sortOrder:1,active:true,updatedAt:now},
];
const acks=new Map<number,{version:number;at:string}>([[2,{version:1,at:now}]]);
const staff=['Mint','Bee','Ploy','Ton','Fah'];
let people=[
 {id:'a',code:'TBS-001',name:'Somchai Jaidee',nickname:'Mint',department:'SEO',type:'employee',careerLevel:'manager',managerId:null,roles:[{role:'CM',timeShare:60},{role:'Head of SEO',timeShare:40}],sopPending:1},
 {id:'b',code:'TBS-002',name:'Boonsri Dee',nickname:'Bee',department:'SEO',type:'employee',careerLevel:'operational',managerId:'a',roles:[{role:'CM',timeShare:100}],sopPending:2},
 {id:'c',code:'INT-101',name:'Ploy Sukjai',nickname:'Ploy',department:'Content',type:'intern',careerLevel:null,managerId:'a',roles:[],sopPending:2},
];
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const employeeDocs=()=>docs.filter(d=>d.active).map(d=>({...d,acceptedAt:acks.get(d.id)?.version===d.version?acks.get(d.id)!.at:null,acceptedBefore:!!acks.get(d.id)&&acks.get(d.id)!.version<d.version}));
const hrDocs=()=>docs.map(d=>{const ok=acks.get(d.id)?.version===d.version;return {...d,accepted:ok?1:0,missing:staff.slice(ok?1:0)};});
window.fetch=async(input,init)=>{
 const url=String(input),body=init?.body?JSON.parse(String(init.body)):null;
 await new Promise(r=>setTimeout(r,250));
 if(url.startsWith('/api/sop')){if(body){const d=docs.find(x=>x.id===body.docId)!;acks.set(d.id,{version:d.version,at:new Date().toISOString()});}return json({ok:true,docs:employeeDocs()});}
 if(url.includes('view=sops'))return json({ok:true,sops:hrDocs()});
 if(url.includes('view=people'))return json({ok:true,people});
 if(body?.action==='hr-sop-save'){let notified=0;if(body.id){const d=docs.find(x=>x.id===body.id)!;if(d.body!==body.body||d.titleEn!==body.titleEn||d.titleTh!==body.titleTh){d.version++;notified=body.notify?5:0;}Object.assign(d,{titleEn:body.titleEn,titleTh:body.titleTh,body:body.body,updatedAt:new Date().toISOString()});}else{docs.push({id:docs.length+1,titleEn:body.titleEn,titleTh:body.titleTh,body:body.body,version:1,sortOrder:docs.length,active:true,updatedAt:new Date().toISOString()});notified=body.notify?5:0;}return json({ok:true,notified,sops:hrDocs()});}
 if(body?.action==='hr-sop-active'){docs.find(x=>x.id===body.id)!.active=body.active;return json({ok:true,sops:hrDocs()});}
 if(body?.action==='hr-people-save'){people=people.map(p=>p.id===body.userId?{...p,careerLevel:body.careerLevel||null,managerId:body.managerId||null,roles:body.roles}:p);return json({ok:true,people});}
 return json({ok:false,error:'Unknown'},404);
};
export function Preview(){
 const {toggleLanguage,language}=useLanguage();
 const [tab,setTab]=useState(new URLSearchParams(location.search).get('tab')||'employee');
 return <><div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 p-3 text-sm"><span>Local demo · no live changes</span><span className="flex gap-3">{['employee','sops','people'].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'font-bold underline':''}>{t}</button>)}<button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button></span></div>
  {tab==='employee'?<MemoryRouter><SopCenter/></MemoryRouter>:<div className="min-h-screen bg-slate-100"><div className="mx-auto max-w-4xl p-6">{tab==='sops'?<SopManager/>:<PeopleRoles/>}</div></div>}</>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview/></LanguageProvider>);
