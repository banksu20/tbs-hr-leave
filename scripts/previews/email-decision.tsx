import {createRoot} from 'react-dom/client';
import EmailDecision from '../../src/pages/EmailDecision';
import {LanguageProvider,useLanguage} from '../../src/hooks/useLanguage';
import '../../src/index.css';
const request={id:1302,name:'Phoo Pyae Thaw (Emily)',department:'SEO',type:'annual',dates:['2026-12-16','2026-12-17'],days:2,period:null,reason:'Family trip to Chiang Mai',status:'Pending',balance:'คงเหลือหลังคำขอนี้ / Left after this request: ลาพักร้อน Annual 4/8'};
let used:string|null=null;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(_input,init)=>{
 const body=JSON.parse(String(init?.body??'{}'));
 if(body.token!=='11111111-2222-4333-8444-555555555555')return json({ok:false,statusCode:404,error:'This link is not valid.'},404);
 if(body.action==='review')return json({ok:true,request:{...request,status:used?(used==='approve'?'Approved':'Rejected'):'Pending'},approver:'Dan',expiresAt:'2026-12-07T00:00:00Z',usedAction:used,expired:false,canDecide:!used});
 if(used)return json({ok:false,statusCode:409,error:'This link was already used.'},409);
 used=body.action;return json({ok:true,action:body.action,request:{...request,status:used==='approve'?'Approved':'Rejected'}});
};
function Preview(){const {toggleLanguage,language}=useLanguage();return <><div className="bg-amber-100 p-3 text-sm flex justify-between"><span>Local demo · no live changes</span><button onClick={toggleLanguage} className="underline">{language==='en'?'ภาษาไทย':'English'}</button></div><EmailDecision/></>;}
if(!location.search)history.replaceState(null,'','?id=1302&t=11111111-2222-4333-8444-555555555555&action=approve');
createRoot(document.getElementById('root')!).render(<LanguageProvider><Preview/></LanguageProvider>);
