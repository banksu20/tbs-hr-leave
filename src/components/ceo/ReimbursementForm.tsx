import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,ArrowLeft,FileText,Loader2,Plus,Printer,RotateCcw,Save,Trash2} from 'lucide-react';
import {useDashboardText} from '@/hooks/useDashboardText';
import {adminReceiptUrl,loadTravelForm,resetTravelForm,saveTravelForm,type Evidence,type FormRow,type ReimbursementForm as Form,type TravelFormData} from '@/lib/hrAdmin';
import {bahtText} from '@/lib/bahtText';
import {accountText,bankEn,banks} from '@/lib/banks';

const F={
 company:'The Business SEO Co., Ltd. (Trading as TBS Marketing)',
 address:'No. 1023 TPS Building, Floor 4, Pattanakarn Road, Suanluang Sub District, Suanluang District, Bangkok, 10250 Thailand',
 titleTh:'ใบขอเบิกค่าใช้จ่าย',titleEn:'Reimbursement Form',
 dateTh:'วันที่',dateEn:'Date',meTh:'ข้าพเจ้า',meEn:'I',idTh:'บัตรประชาชนเลขที่',idEn:'Tax ID/Passport No.',posTh:'ตำแหน่ง',posEn:'Position',deptTh:'แผนก',deptEn:'Department',
 certTh:'ขอเบิกค่าใช้จ่ายดังรายละเอียดในตาราง ซึ่งข้าพเจ้ารับรองว่ารายจ่ายที่ขอเบิกข้าพเจ้าได้จ่ายไปในงานของบริษัท เดอะ บิสซิเนส เอสอีโอ จำกัด โดยแท้จริง ซึ่งบางรายการไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้ขายได้',
 certEn:'Request for reimbursement as detailed in the table. I certify that the expenditures requested by me have actually been paid for the work of The Business SEO Co., Ltd., which some items may not collect receipts from the seller.',
 paidTh:['ทั้งนี้ ข้าพเจ้าได้จ่ายเงินไปตั้งแต่วันที่','ถึงวันที่'],paidEn:['In this regard, I have paid the money from the date of','to the date of'],
 colDate:['วัน/เดือน/ปี','Date'],colDetail:['รายละเอียดรายจ่าย/ชื่อร้านค้า','Expense details/Seller name'],colAmount:['จำนวนเงิน(บาท)','Amount (baht)'],colRemark:['หมายเหตุ','Remark'],
 total:'รวมทั้งสิ้น',bankTh:'โดยให้โอนเงินเข้าบัญชี ธนาคาร',noTh:'เลขที่',bankEn:'by transferring money to the account',noEn:'No.',
 signTh:'ลงชื่อ',signEn:'Sign',approveTh:'อนุมัติโดย',approveEn:'Approved by',
 evidence:'หลักฐานการจ่ายเงิน / Payment evidence',pdf:'ไฟล์ PDF · พิมพ์แยกแล้วแนบ / PDF file · print separately and attach',
 kinds:{toll:'ค่าทางด่วน / Toll',parking:'ค่าจอดรถ / Parking',grab:'Grab',taxi:'แท็กซี่ / Taxi',other:'อื่นๆ / Other'} as Record<string,string>,
};
const css=`
.rf-overlay{position:fixed;inset:0;z-index:60;overflow:auto;background:#e2e8f0}
.rf-sheet{width:210mm;height:297mm;margin:0 auto 24px;padding:12mm 14mm;box-sizing:border-box;background:#fff;color:#000;box-shadow:0 4px 24px rgba(15,23,42,.15);overflow:hidden;font-size:12.5px;line-height:1.55;font-family:'Sarabun','TH Sarabun New',Tahoma,sans-serif}
.rf-in{border:0;border-bottom:1px dotted #94a3b8;background:#f8fafc;padding:0 3px;font:inherit;color:inherit;min-width:0}
.rf-in:focus{outline:2px solid #0ea5e9;background:#fff}
.rf-print{display:none}
.rf-table{width:100%;border-collapse:collapse;margin-top:6px}
.rf-table th,.rf-table td{border:1px solid #000;padding:1px 4px;height:22px;vertical-align:middle}
.rf-table th{font-weight:600;text-align:center;line-height:1.25}
.rf-table th small{display:block;font-size:10px;font-weight:600}
.rf-table td .rf-in{width:100%;background:transparent;border-bottom:0}
@page{size:A4;margin:0}
@media print{
 html,body{background:#fff!important}
 #root{display:none!important}
 .rf-overlay{position:static;overflow:visible;background:#fff}
 .rf-toolbar,.rf-screen{display:none!important}
 .rf-print{display:inline!important}
 .rf-sheet{margin:0;box-shadow:none;break-after:page}
 .rf-sheet:last-child{break-after:auto}
 .rf-in{border:0!important;background:transparent!important;padding:0!important;appearance:none}
 select.rf-in{display:none!important}
}`;
const thDate=(d:string|null)=>d?new Date(d+'T00:00:00+07:00').toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}):'..........';
const enDate=(d:string|null)=>d?new Date(d+'T00:00:00+07:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}):'..........';
const dmy=(d:string|null)=>d?d.split('-').reverse().join('/'):'';
const num=(v:FormRow['amount'])=>{const n=typeof v==='number'?v:parseFloat(String(v??''));return Number.isFinite(n)?n:0;};
const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const chunk=<X,>(l:X[],n:number)=>Array.from({length:Math.ceil(l.length/n)},(_,i)=>l.slice(i*n,i*n+n));

function DateField({value,onChange,show}:{value:string|null;onChange:(v:string|null)=>void;show:(v:string|null)=>string}){
 return <><input type="date" className="rf-in rf-screen" value={value??''} onChange={e=>onChange(e.target.value||null)}/><span className="rf-print">{show(value)}</span></>;
}

function EvidenceCard({e}:{e:Evidence}){
 const dt=useDashboardText();
 const head=`#${e.n} · ${dmy(e.date)} · ${F.kinds[e.kind]??e.kind}${e.merchant?` · ${e.merchant}`:''} · ฿${fmt(e.amount)}`;
 return <div style={{border:'1px solid #000',display:'flex',flexDirection:'column',minHeight:0}}>
  <div style={{borderBottom:'1px solid #000',padding:'2px 6px',fontWeight:600,fontSize:11.5}}>{head}</div>
  <div style={{flex:1,minHeight:0,display:'grid',placeItems:'center',padding:4}}>
   {e.mime==='application/pdf'?<div style={{textAlign:'center',fontSize:11}}><FileText style={{margin:'0 auto',width:28,height:28}}/><p>{F.pdf}</p><a className="rf-screen" href={adminReceiptUrl(e.id)} target="_blank" rel="noreferrer" style={{color:'#0369a1',textDecoration:'underline'}}>{dt('Open PDF')}</a></div>
    :<img src={adminReceiptUrl(e.id)} alt={head} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>}
  </div>
 </div>;
}

export default function ReimbursementForm({month,userId,onClose}:{month:string;userId:string;onClose:()=>void}){
 const dt=useDashboardText();
 const [data,setData]=useState<TravelFormData|null>(null),[form,setForm]=useState<Form|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[confirmReset,setConfirmReset]=useState(false);
 const take=(d:TravelFormData)=>{setData(d);setForm(d.form);setDirty(false);};
 useEffect(()=>{loadTravelForm(month,userId).then(take).catch(e=>setError((e as Error).message));},[month,userId]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!dirty)onClose();};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k);},[dirty,onClose]);
 const set=<K extends keyof Form>(k:K,v:Form[K])=>{setForm(f=>f&&{...f,[k]:v});setDirty(true);};
 const setRow=(i:number,patch:Partial<FormRow>)=>{setForm(f=>f&&{...f,rows:f.rows.map((r,j)=>j===i?{...r,...patch}:r)});setDirty(true);};
 const total=useMemo(()=>(form?.rows??[]).reduce((a,r)=>a+num(r.amount),0),[form]);
 const run=async(label:string,fn:()=>Promise<TravelFormData>)=>{setBusy(label);setError('');try{take(await fn());return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy('');}};
 const save=()=>form?run('save',()=>saveTravelForm(month,userId,form)):Promise.resolve(false);
 const print=async()=>{if(dirty&&!await save())return;setTimeout(()=>window.print(),300);};
 const pad=Math.max(0,11-(form?.rows.length??0));
 const pages=chunk(data?.evidence??[],4);
 const inp=(k:'nameTh'|'nameEn'|'position'|'department'|'approver',w:string)=><input className="rf-in" style={{width:w}} value={form?.[k]??''} onChange={e=>set(k,e.target.value)}/>;
 const shell=<div className="rf-overlay" role="dialog" aria-modal="true" aria-label={dt('Reimbursement form')}>
  <style>{css}</style>
  <div className="rf-toolbar sticky top-0 z-10 mb-6 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-xs backdrop-blur">
   <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
    <button type="button" onClick={()=>{if(!dirty||window.confirm(dt('Close without saving your changes?')))onClose();}} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-4 w-4"/>{dt('Back')}</button>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{dt('Reimbursement form')}{form?` · ${form.nameTh}`:''}</p><p className="text-xs text-slate-500">{data?.saved?dt('Saved by {0}',[data.saved.updatedBy]):dt('Filled from the claims. Check, edit, then print.')}{dirty?` · ${dt('Unsaved changes')}`:''}</p></div>
    {confirmReset?<><button type="button" disabled={!!busy} onClick={()=>{setConfirmReset(false);void run('reset',()=>resetTravelForm(month,userId));}} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{dt('Yes, start over')}</button><button type="button" onClick={()=>setConfirmReset(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{dt('Cancel')}</button></>
     :<button type="button" disabled={!data||!!busy} onClick={()=>setConfirmReset(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"><RotateCcw className="h-4 w-4"/>{dt('Start over from claims')}</button>}
    <button type="button" disabled={!dirty||!!busy} onClick={()=>void save()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{dt('Save')}</button>
    <button type="button" disabled={!form||!!busy} onClick={()=>void print()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"><Printer className="h-4 w-4"/>{dt('Print / save PDF')}</button>
   </div>
   {error&&<p role="alert" className="mx-auto mt-2 max-w-4xl rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}
   {data?.payeeMissing&&<p className="mx-auto mt-2 flex max-w-4xl items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0"/>{dt('This person has not added their ID and bank details yet. Fill them in here and save; they will be remembered.')}</p>}
  </div>
  {!form?<p className="flex items-center justify-center gap-2 p-10 text-sm text-slate-600">{error?'':<><Loader2 className="h-4 w-4 animate-spin"/>{dt('Loading…')}</>}</p>:<>
   <section className="rf-sheet">
    <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
     <img src="/tbs-icon.png" alt="TBS" style={{height:56}}/>
     <p style={{flex:1,textAlign:'right',fontSize:11,lineHeight:1.4}}>{F.company}<br/>{F.address}</p>
    </div>
    <h1 style={{textAlign:'center',fontSize:22,fontWeight:700,margin:'14px 0 6px'}}>{F.titleTh} {F.titleEn}</h1>
    <div style={{marginLeft:'55%'}}>
     <div>{F.dateTh} <DateField value={form.formDate} onChange={v=>set('formDate',v)} show={thDate}/></div>
     <div>{F.dateEn} <span className="rf-print">{enDate(form.formDate)}</span><span className="rf-screen">{enDate(form.formDate)}</span></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'55% 45%',marginTop:8}}>
     <div>{F.meTh} {inp('nameTh','70%')}</div><div>{F.idTh} <input className="rf-in rf-screen" style={{width:'48%'}} value={form.idNo} onChange={e=>set('idNo',e.target.value)}/><span className="rf-print">{form.idNo}</span></div>
     <div>{F.meEn} {inp('nameEn','78%')}</div><div>{F.idEn} {form.idNo||'..........'}</div>
     <div>{F.posTh} {inp('position','70%')}</div><div>{F.deptTh} {inp('department','60%')}</div>
     <div>{F.posEn} {form.position||'..........'}</div><div>{F.deptEn} {form.department||'..........'}</div>
    </div>
    <p style={{marginTop:10}}>{F.certTh}</p>
    <p>{F.certEn}</p>
    <p>{F.paidTh[0]} <DateField value={form.from} onChange={v=>set('from',v)} show={thDate}/> {F.paidTh[1]} <DateField value={form.to} onChange={v=>set('to',v)} show={thDate}/></p>
    <p>{F.paidEn[0]} {enDate(form.from)} {F.paidEn[1]} {enDate(form.to)}</p>
    <table className="rf-table">
     <colgroup><col style={{width:'16%'}}/><col style={{width:'46%'}}/><col style={{width:'18%'}}/><col style={{width:'20%'}}/></colgroup>
     <thead><tr><th>{F.colDate[0]}<small>{F.colDate[1]}</small></th><th>{F.colDetail[0]}<small>{F.colDetail[1]}</small></th><th>{F.colAmount[0]}<small>{F.colAmount[1]}</small></th><th>{F.colRemark[0]}<small>{F.colRemark[1]}</small></th></tr></thead>
     <tbody>
      {form.rows.map((r,i)=><tr key={i}>
       <td><DateField value={r.date} onChange={v=>setRow(i,{date:v})} show={dmy}/></td>
       <td><input className="rf-in" value={r.detail} onChange={e=>setRow(i,{detail:e.target.value})}/></td>
       <td style={{textAlign:'right'}}><input className="rf-in rf-screen" style={{textAlign:'right'}} inputMode="decimal" value={r.amount??''} onChange={e=>setRow(i,{amount:e.target.value})}/><span className="rf-print">{r.amount===null||r.amount===''?'':fmt(num(r.amount))}</span></td>
       <td><div style={{display:'flex',alignItems:'center',gap:2}}><input className="rf-in" value={r.remark} onChange={e=>setRow(i,{remark:e.target.value})}/><button type="button" className="rf-screen" aria-label={dt('Remove row')} onClick={()=>{setForm(f=>f&&{...f,rows:f.rows.filter((_,j)=>j!==i)});setDirty(true);}} style={{color:'#e11d48',padding:2}}><Trash2 style={{width:13,height:13}}/></button></div></td>
      </tr>)}
      {Array.from({length:pad},(_,i)=><tr key={'pad'+i}><td/><td/><td/><td/></tr>)}
      <tr><td style={{fontWeight:700,border:0}}>{F.total}</td><td style={{textAlign:'center',fontWeight:700}}>{bahtText(total)}</td><td style={{textAlign:'right',fontWeight:700}}>{fmt(total)}</td><td style={{border:0}}/></tr>
     </tbody>
    </table>
    <button type="button" className="rf-screen" onClick={()=>{setForm(f=>f&&{...f,rows:[...f.rows,{date:null,detail:'',amount:null,remark:''}]});setDirty(true);}} style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600,color:'#0369a1'}}><Plus style={{width:13,height:13}}/>{dt('Add row')}</button>
    <p style={{marginTop:12}}>{F.bankTh}<select className="rf-in" value={banks.some(b=>b[0]===form.bank)?form.bank:''} onChange={e=>set('bank',e.target.value)}><option value="">{dt('Choose a bank…')}</option>{banks.map(([th])=><option key={th} value={th}>{th}</option>)}</select><span className="rf-print">{form.bank||'..........'}</span> {F.noTh} <input className="rf-in rf-screen" style={{width:150}} value={form.account} onChange={e=>set('account',e.target.value)}/><span className="rf-print">{accountText(form.account)}</span></p>
    <p>{F.bankEn} {bankEn(form.bank)||'..........'} {F.noEn} {accountText(form.account)||'..........'}</p>
    <div style={{display:'grid',gridTemplateColumns:'50% 50%',marginTop:28}}>
     <div>{F.signTh} ............................................<br/>{F.signEn} ( {form.nameTh} )</div>
     <div>{F.approveTh} ............................................<br/>{F.approveEn} ( {inp('approver','55%')} )</div>
    </div>
   </section>
   {pages.map((p,i)=><section key={i} className="rf-sheet" style={{display:'flex',flexDirection:'column'}}>
    <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,borderBottom:'2px solid #000',paddingBottom:4,marginBottom:8}}><span>{F.evidence}</span><span>{form.nameTh} · {month} · {i+1}/{pages.length}</span></div>
    <div style={{flex:1,minHeight:0,display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr',gap:8}}>{p.map(e=><EvidenceCard key={e.id} e={e}/>)}</div>
   </section>)}
  </>}
 </div>;
 return createPortal(shell,document.body);
}
