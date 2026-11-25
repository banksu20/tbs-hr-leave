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
 {id:1,titleEn:'Data rules',titleTh:'กติกาข้อมูล',body:"TBS เก็บข้อมูลในระบบ HR เพื่อใช้จัดการวันลา การเบิกค่าเดินทาง และเอกสารของบริษัท ไม่ได้ใช้เพื่อเฝ้าดูพนักงาน การกดยอมรับเอกสารนี้ หมายถึงคุณยินยอมตามกติกาด้านล่าง\n\n1. ข้อมูลที่เก็บ\n- ชื่อ รหัสพนักงาน แผนก วันเริ่มงาน และบัญชี LINE ของคุณ เพื่อให้ระบบส่งข้อความถึงคุณได้\n- คำขอลา ผลอนุมัติ วันลาคงเหลือ และเอกสารที่คุณแนบ เช่น ใบรับรองแพทย์\n- สำหรับนักศึกษาฝึกงาน: มหาวิทยาลัยและเอกสารฝึกงาน\n- การเบิกค่าเดินทาง: ลูกค้า งาน ระยะทาง รูปใบเสร็จ และยอดเงิน\n- การกดยอมรับเอกสารบริษัท เช่น เอกสารนี้ (ยอมรับฉบับไหน เมื่อไร)\n\n2. ตำแหน่งที่อยู่\nแอปอ่านตำแหน่งเฉพาะตอนคุณกด เริ่มทริป (เมื่อออกจากบ้าน) ถึงแล้ว หรือ กลับถึงออฟฟิศแล้ว ตำแหน่งนั้นจะบันทึกไว้กับทริปเพื่อตรวจการเบิก ระบบไม่ติดตามตำแหน่งระหว่างทาง และไม่อ่านตำแหน่งนอกการเบิกค่าเดินทาง\n\n3. ใบเสร็จและระยะทาง\nระบบอ่านยอดเงิน วันที่ และชื่อร้านจากรูปใบเสร็จโดยอัตโนมัติ ถ้ามีจุดผิดปกติ HR จะตรวจ ระยะทางวัดตามถนนด้วย Google Maps\n\n4. ใครเห็นอะไร\n- คุณเห็นวันลาและรายการเบิกของตัวเองในแอป\n- ผู้อนุมัติและ HR เห็นคำขอลาที่ต้องพิจารณา\n- HR และผู้บริหารเห็นข้อมูล HR ในแดชบอร์ด\n- ฝ่ายบัญชีเห็นเฉพาะรายการเบิกค่าเดินทาง\n\n5. สิ่งที่ไม่มีในระบบ\nไม่มีข้อมูลเงินเดือน ไม่มีคะแนนประเมินผลงาน และไม่มีแบบทดสอบบุคลิกภาพ ระบบไม่อ่านแชต LINE ของคุณ\n\n6. ถ้ามีการเปลี่ยนแปลง\nถ้าบริษัทจะเก็บหรือใช้ข้อมูลเพิ่ม จะแก้เอกสารนี้และขอให้ทุกคนกดยอมรับใหม่ก่อน\n\n7. คำถามหรือแก้ไขข้อมูล\nติดต่อหัวหน้า People & Culture ได้ทุกเมื่อ ถ้าข้อมูลของคุณไม่ถูกต้อง แจ้ง HR เพื่อแก้ไข",bodyEn:"TBS keeps data in the HR system to run leave, travel claims and company documents. It is not used to watch you. By accepting this document, you agree to the rules below.\n\n1. What we keep\n- Your name, staff code, department, start date, and your LINE account so the system can message you.\n- Leave requests, approvals, leave balances, and any documents you attach, such as a medical certificate.\n- For interns: your university and internship documents.\n- Travel claims: the client, purpose, distance, receipt photos and amounts.\n- Which company documents you accepted, such as this one, and when.\n\n2. Location\nThe app reads your location only when you tap Start trip (when leaving from home), I've arrived, or I'm back at the office. That point is saved with the trip to check the claim. Nothing tracks you between taps, and your location is never read outside travel claims.\n\n3. Receipts and distance\nThe system reads the amount, date and shop name from receipt photos automatically. HR checks anything that looks wrong. Distance is measured by road with Google Maps.\n\n4. Who sees what\n- You see your own leave and claims in the app.\n- Approvers and HR see the leave requests they need to decide.\n- HR and management see HR data on the dashboard.\n- Accounting sees travel claims only.\n\n5. What is not in the system\nNo salary data, no performance scores and no personality tests. The system does not read your LINE chats.\n\n6. If this changes\nIf the company wants to keep or use more data, this document will be updated and everyone will be asked to accept it again first.\n\n7. Questions or corrections\nContact the head of People & Culture any time. If anything about you is wrong, tell HR and it will be fixed.",version:2,sortOrder:0,active:true,updatedAt:now},
 {id:2,titleEn:'TBS culture',titleTh:'วัฒนธรรม TBS',body:'ช่วยเหลือกัน ใจบริการลูกค้า ใช้ AI ช่วยงาน',bodyEn:'',version:2,sortOrder:1,active:true,updatedAt:now},
];
const acks=new Map<number,{version:number;at:string}>([[2,{version:1,at:now}]]);
const staff=['Mint','Bee','Ploy','Ton','Fah'];
let people=[
 {id:'a',code:'TBS-001',name:'Somchai Jaidee',nickname:'Mint',department:'SEO',type:'employee',careerLevel:'manager',managerId:null,roles:[{role:'CM',timeShare:60},{role:'Head of SEO',timeShare:40}],sopPending:1,workEmail:'mint@example.com' as string|null},
 {id:'b',code:'TBS-002',name:'Boonsri Dee',nickname:'Bee',department:'SEO',type:'employee',careerLevel:'operational',managerId:'a',roles:[{role:'CM',timeShare:100}],sopPending:2},
 {id:'c',code:'INT-101',name:'Ploy Sukjai',nickname:'Ploy',department:'Content',type:'intern',careerLevel:null,managerId:'a',roles:[],sopPending:2},
];
const alerts={pcEmail:null as string|null,sickCount:3,sickWindowDays:90,leadNotice:false,leadDaysAhead:3};
const alertJson=()=>{const leads=new Set(people.map(p=>p.managerId).filter(Boolean));return {...alerts,leads:leads.size,leadsWithEmail:people.filter(p=>leads.has(p.id)&&p.workEmail).length};};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const employeeDocs=()=>docs.filter(d=>d.active).map(d=>({...d,acceptedAt:acks.get(d.id)?.version===d.version?acks.get(d.id)!.at:null,acceptedBefore:!!acks.get(d.id)&&acks.get(d.id)!.version<d.version}));
const hrDocs=()=>docs.map(d=>{const ok=acks.get(d.id)?.version===d.version;return {...d,accepted:ok?1:0,missing:staff.slice(ok?1:0)};});
window.fetch=async(input,init)=>{
 const url=String(input),body=init?.body?JSON.parse(String(init.body)):null;
 await new Promise(r=>setTimeout(r,250));
 if(url.startsWith('/api/sop')){if(body){const d=docs.find(x=>x.id===body.docId)!;acks.set(d.id,{version:d.version,at:new Date().toISOString()});}return json({ok:true,docs:employeeDocs()});}
 if(url.includes('view=sops'))return json({ok:true,sops:hrDocs()});
 if(url.includes('view=people'))return json({ok:true,people});
 if(url.includes('view=alerts'))return json({ok:true,alerts:alertJson()});
 if(body?.action==='people-alerts-save'){Object.assign(alerts,{...body,pcEmail:body.pcEmail||null});return json({ok:true,alerts:alertJson()});}
 if(body?.action==='hr-sop-save'){let notified=0;if(body.id){const d=docs.find(x=>x.id===body.id)!;if(d.body!==body.body||d.bodyEn!==body.bodyEn||d.titleEn!==body.titleEn||d.titleTh!==body.titleTh){d.version++;notified=body.notify?5:0;}Object.assign(d,{titleEn:body.titleEn,titleTh:body.titleTh,body:body.body,bodyEn:body.bodyEn,updatedAt:new Date().toISOString()});}else{docs.push({id:docs.length+1,titleEn:body.titleEn,titleTh:body.titleTh,body:body.body,bodyEn:body.bodyEn,version:1,sortOrder:docs.length,active:true,updatedAt:new Date().toISOString()});notified=body.notify?5:0;}return json({ok:true,notified,sops:hrDocs()});}
 if(body?.action==='hr-sop-active'){docs.find(x=>x.id===body.id)!.active=body.active;return json({ok:true,sops:hrDocs()});}
 if(body?.action==='hr-people-save'){people=people.map(p=>p.id===body.userId?{...p,careerLevel:body.careerLevel||null,managerId:body.managerId||null,roles:body.roles,workEmail:body.workEmail||null}:p);return json({ok:true,people});}
 return json({ok:false,error:'Unknown'},404);
};
export function Preview(){
 const {toggleLanguage,language}=useLanguage();
 const [tab,setTab]=useState(new URLSearchParams(location.search).get('tab')||'employee');
 return <><div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 p-3 text-sm"><span>Local demo · no live changes</span><span className="flex gap-3">{['employee','sops','people'].map(t=><button key={t} onClick={()=>setTab(t)} className={tab===t?'font-bold underline':''}>{t}</button>)}<button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button></span></div>
  {tab==='employee'?<MemoryRouter><SopCenter/></MemoryRouter>:<div className="min-h-screen bg-slate-100"><div className="mx-auto max-w-4xl p-6">{tab==='sops'?<SopManager/>:<PeopleRoles/>}</div></div>}</>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview/></LanguageProvider>);
