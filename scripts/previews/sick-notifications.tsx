import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import cards from './sick-fixtures.json';
import '../../src/index.css';
function Block({block}:{block:any}){
 if(!block)return null;
 if(block.type==='button')return <button type="button" className="w-full rounded-lg py-3 text-white font-semibold" style={{background:block.color??'#B91C1C'}} onClick={()=>window.alert(block.action.label==='รับทราบ'?'ตัวอย่างเท่านั้น — ระบบจริงจะเปิดหน้ายืนยันรับทราบใน LINE':'Preview only — the real card opens a confirmation screen in LINE.')}>{block.action.label}</button>;
 if(block.type==='text')return <p style={{fontSize:({xs:12,sm:14,lg:18,xl:24,xxl:32} as Record<string,number>)[block.size]??16,lineHeight:1.6,fontWeight:block.weight==='bold'?700:400,color:block.color??'#0f172a',overflowWrap:'anywhere'}}>{block.text}</p>;
 return <div style={{display:'flex',flexDirection:'column',gap:block.spacing==='md'?16:8,padding:block.paddingAll??0,background:block.backgroundColor,borderRadius:block.cornerRadius??0}}>{block.contents?.map((b:any,i:number)=><Block key={i} block={b}/>)}</div>;
}
function Preview(){const [lang,setLang]=useState('en');return <main className="min-h-screen bg-slate-100 p-6"><div className="max-w-6xl mx-auto"><header className="mb-8 flex flex-wrap gap-4 justify-between items-center"><div><h1 className="text-2xl font-bold">Sick leave reminders</h1><p className="text-sm text-slate-500 mt-2">Offline Flex Card preview · sample data · no messages sent</p></div><select aria-label="Employee card language" value={lang} onChange={e=>setLang(e.target.value)} className="rounded-lg border p-2"><option value="en">Employee: English</option><option value="th">Employee: Thai</option></select></header><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6 items-start">{cards.filter(c=>c.audience==='CEO'||c.language===lang).map((c,i)=><section key={i}><h2 className="mb-3 text-sm font-semibold text-slate-600">{c.threshold} days · {c.audience}{c.audience==='CEO'?' · English':''}</h2><div className="rounded-3xl bg-white shadow-sm border border-slate-200 overflow-hidden max-w-sm"><Block block={c.contents.body}/><Block block={c.contents.footer}/></div></section>)}</div></div></main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
