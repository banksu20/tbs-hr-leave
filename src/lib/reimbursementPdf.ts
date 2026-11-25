import type {Content,TableCell,TDocumentDefinitions} from 'pdfmake/interfaces';
import {adminReceiptUrl,type Evidence,type ReimbursementForm} from '@/lib/hrAdmin';
import {bahtText} from '@/lib/bahtText';
import {accountText,bankEn} from '@/lib/banks';
import {F,dmy,enDate,fmt,num,thDate} from '@/lib/reimbursementText';

export const maxEmailPdf=4200000;

function loadImage(src:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Could not load a receipt image.'));i.src=src;});
}
async function picture(url:string,max:number,type:'image/jpeg'|'image/png'){
 const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Could not load a receipt image.');
 const local=URL.createObjectURL(await r.blob());
 try{
  const img=await loadImage(local);
  const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));
  const g=c.getContext('2d');if(!g)throw Error('Could not load a receipt image.');
  if(type==='image/jpeg'){g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);}
  g.drawImage(img,0,0,c.width,c.height);
  return c.toDataURL(type,0.72);
 }finally{URL.revokeObjectURL(local);}
}
const chunk=<X,>(l:X[],n:number)=>Array.from({length:Math.ceil(l.length/n)},(_,i)=>l.slice(i*n,i*n+n));

export async function reimbursementDocument(form:ReimbursementForm,evidence:Evidence[],month:string):Promise<TDocumentDefinitions>{
 const [logo,...shots]=await Promise.all([picture('/tbs-icon.png',300,'image/png'),...evidence.map(e=>e.mime==='application/pdf'?Promise.resolve(''):picture(adminReceiptUrl(e.id),1100,'image/jpeg'))]);
 const total=form.rows.reduce((a,r)=>a+num(r.amount),0);
 const head=(th:string,en:string):TableCell=>({stack:[{text:th,bold:true},{text:en,bold:true,fontSize:8.5}],alignment:'center'});
 const rows:TableCell[][]=form.rows.map(r=>[dmy(r.date),r.detail,{text:r.amount===null||r.amount===''?'':fmt(num(r.amount)),alignment:'right'},r.remark]);
 for(let i=form.rows.length;i<11;i++)rows.push([' ','','','']);
 const first:Content[]=[
  {columns:[{image:logo,width:46},{text:[F.company,'\n',F.address],alignment:'right',fontSize:8.5,margin:[40,0,0,0]}]},
  {text:`${F.titleTh} ${F.titleEn}`,alignment:'center',fontSize:17,bold:true,margin:[0,12,0,6]},
  {columns:[{width:'55%',text:''},{width:'*',stack:[`${F.dateTh} ${thDate(form.formDate)}`,`${F.dateEn} ${enDate(form.formDate)}`]}]},
  {columns:[
   {width:'55%',stack:[`${F.meTh} ${form.nameTh||'..........'}`,`${F.meEn} ${form.nameEn||'..........'}`,`${F.posTh} ${form.position||'..........'}`,`${F.posEn} ${form.position||'..........'}`]},
   {width:'*',stack:[`${F.idTh} ${form.idNo||'..........'}`,`${F.idEn} ${form.idNo||'..........'}`,`${F.deptTh} ${form.department||'..........'}`,`${F.deptEn} ${form.department||'..........'}`]},
  ],margin:[0,6,0,0]},
  {text:F.certTh,margin:[0,8,0,0]},{text:F.certEn},
  {text:`${F.paidTh[0]} ${thDate(form.from)} ${F.paidTh[1]} ${thDate(form.to)}`},
  {text:`${F.paidEn[0]} ${enDate(form.from)} ${F.paidEn[1]} ${enDate(form.to)}`},
  {table:{headerRows:1,widths:['16%','46%','18%','20%'],body:[
   [head(F.colDate[0],F.colDate[1]),head(F.colDetail[0],F.colDetail[1]),head(F.colAmount[0],F.colAmount[1]),head(F.colRemark[0],F.colRemark[1])],
   ...rows,
   [{text:F.total,bold:true,border:[false,false,false,false]},{text:bahtText(total),bold:true,alignment:'center'},{text:fmt(total),bold:true,alignment:'right'},{text:'',border:[false,false,false,false]}],
  ]},layout:{paddingTop:()=>2,paddingBottom:()=>2},margin:[0,6,0,0]},
  {text:`${F.bankTh} ${form.bank||'..........'} ${F.noTh} ${accountText(form.account)||'..........'}`,margin:[0,12,0,0]},
  {text:`${F.bankEn} ${bankEn(form.bank)||'..........'} ${F.noEn} ${accountText(form.account)||'..........'}`},
  {columns:[
   {text:`${F.signTh} ............................................\n${F.signEn} ( ${form.nameTh} )`},
   {text:`${F.approveTh} ............................................\n${F.approveEn} ( ${form.approver||'                              '} )`},
  ],margin:[0,30,0,0]},
 ];
 const pages=chunk(evidence.map((e,i)=>({e,shot:shots[i]})),4);
 const card=({e,shot}:{e:Evidence;shot:string}):TableCell=>({stack:[
  {text:`#${e.n} · ${dmy(e.date)} · ${F.kinds[e.kind]??e.kind}${e.merchant?` · ${e.merchant}`:''} · ฿${fmt(e.amount)}`,bold:true,fontSize:9,margin:[0,0,0,4]},
  shot?{image:shot,fit:[245,320],alignment:'center'}:{text:F.pdf,alignment:'center',fontSize:9,margin:[0,140,0,0]},
 ]});
 const evidencePages:Content[]=pages.map((p,i):Content=>({stack:[
  {columns:[{text:F.evidence,bold:true},{text:`${form.nameTh} · ${month} · ${i+1}/${pages.length}`,alignment:'right',bold:true}],margin:[0,0,0,4]},
  {canvas:[{type:'line',x1:0,y1:0,x2:515,y2:0,lineWidth:1.5}],margin:[0,0,0,8]} as Content,
  {table:{widths:['*','*'],heights:[350,350],body:chunk([...p.map(card),...Array.from({length:(2-p.length%2)%2},()=>({text:''}) as TableCell)],2)},layout:{paddingTop:()=>4,paddingLeft:()=>4,paddingRight:()=>4}},
 ],pageBreak:'before'}));
 return {
  pageSize:'A4',pageMargins:[40,34,40,30],
  info:{title:`${F.titleEn} ${form.nameEn||form.nameTh} ${month}`,author:'TBS HR'},
  defaultStyle:{font:'Sarabun',fontSize:10.5,lineHeight:1.15,color:'#000000'},
  content:[...first,...evidencePages],
 };
}

export async function reimbursementPdfBase64(form:ReimbursementForm,evidence:Evidence[],month:string){
 const [pdfMake,doc]=await Promise.all([import('@/lib/downloadReportPdf').then(m=>m.loadPdfMake()),reimbursementDocument(form,evidence,month)]);
 return pdfMake.createPdf(doc).getBase64();
}
