import { useState } from 'react';
import { previewRollover, applyRollover, type RolloverSettings, type RolloverOverride, type RolloverRow } from '@/lib/api';
import { Button } from '@/components/ui/button';

const draftKey=(year:number)=>`tbs_rollover_preview_v1_${year}`;
export default function YearRollover({year}: {year:string}) {
  const [settings,setSettings]=useState<RolloverSettings>({sourceYear:Number(year),expiresOn:`${Number(year)+1}-03-31`});
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewRollover>>|null>(null);
  const [overrides,setOverrides]=useState<Record<string,RolloverOverride>>({});
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [dirty,setDirty]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const change=(next:RolloverSettings)=>{setSettings(next);setPreview(null);setOverrides({});setDirty(false);setMessage('Settings changed. Generate a new preview before adjusting employees.');};
  const review=async(next=settings,adjustments=overrides)=>{
    setBusy(true);setMessage('');setConfirm(false);setDirty(true);
    try {
      for(const adjustment of Object.values(adjustments)){
        for(const field of ['annualTotal','sickTotal','personalTotal','carriedOver'] as const){
          const value=adjustment[field];
          if(value===undefined||(field==='sickTotal'&&value===null))continue;
          if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>365||value*4!==Math.trunc(value*4))throw new Error('Enter valid allowances in quarter days for every edited employee, including employees hidden by search.');
        }
      }
      const result=await previewRollover({...next,overrides:Object.values(adjustments)});setPreview(result);setDirty(false);}
    catch(error){setMessage(error instanceof Error?error.message:'Preview failed');}finally{setBusy(false);}
  };
  const edit=(row:RolloverRow,patch:Partial<RolloverOverride>)=>{
    setOverrides(current=>({...current,[row.userId]:{userId:row.userId,carriedOver:row.carriedOver,expiresOn:row.expiresOn,note:row.note||'',annualTotal:row.annualTotal??0,sickTotal:row.sickTotal,personalTotal:row.personalTotal??0,...current[row.userId],...patch}}));setDirty(true);setConfirm(false);setMessage('');
  };
  const saveDraft=()=>{
    try{localStorage.setItem(draftKey(settings.sourceYear),JSON.stringify({settings,overrides:Object.values(overrides)}));setMessage('Draft saved in this browser only. No employee allowances changed.');}
    catch{setMessage('Could not save the draft in this browser. Keep this page open to retain your edits.');}
  };
  const loadDraft=async()=>{
    try{const raw=localStorage.getItem(draftKey(settings.sourceYear));if(!raw){setMessage('No saved draft for this source year in this browser.');return;}
      const draft=JSON.parse(raw);if(draft.settings?.sourceYear!==settings.sourceYear||!Array.isArray(draft.overrides))throw Error('Invalid draft');
      const next=Object.fromEntries(draft.overrides.map((o:RolloverOverride)=>[o.userId,o]));setSettings(draft.settings);setOverrides(next);await review(draft.settings,next);
    }catch{setMessage('Could not load this draft. Generate a new preview.');}
  };
  const apply=async()=>{
    if(!preview||dirty||busy||!confirm)return;
    setBusy(true);setMessage('');
    try{
      const result=await applyRollover({...settings,overrides:Object.values(overrides)},preview.token);
      setPreview(null);setOverrides({});setConfirm(false);
      try{localStorage.removeItem(draftKey(settings.sourceYear));}catch{/* Saving succeeded even if local storage is unavailable. */}
      setMessage(`Rollover complete: ${result.saved} employees saved for ${preview.targetYear}. Source-year allowances were not changed.`);
    }catch(error){setMessage(error instanceof Error?error.message:'Rollover failed');setDirty(true);setConfirm(false);}
    finally{setBusy(false);}
  };
  const query=search.trim().toLowerCase();
  const rows=preview?.rows.filter(r=>`${r.name} ${r.nickname||''} ${r.empNo??''} TBS-${String(r.empNo??'').padStart(3,'0')} TBS${String(r.empNo??'').padStart(3,'0')}`.toLowerCase().includes(query))||[];
  return <section className="bg-white border rounded-xl p-4 space-y-4">
    <div><h2 className="font-bold text-lg">Prepare next year’s leave</h2><p className="text-sm text-slate-600">Load a year’s quotas, then edit each employee’s next-year annual, sick and personal allowances, carryover and note.</p></div>
    <details className="rounded-xl bg-sky-50 border border-sky-100 p-3 text-sm"><summary className="font-semibold cursor-pointer">How does rollover work?</summary><p className="mt-2">Example: 12 new annual days + 5 carried days = 17 days available. Unused carried days expire after the selected expiry date. New annual days keep their normal allowance. Unused sick/personal leave and old carryover are not carried forward.</p></details>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void review();}}>
      <label className="text-sm">Source year<input className="block border rounded p-2 w-28" type="number" min="2000" max="2099" required disabled={busy} value={settings.sourceYear} onChange={e=>{const yr=Number(e.target.value);change({...settings,sourceYear:yr,expiresOn:`${yr+1}-03-31`});}}/></label>
      <label className="text-sm">Default expiry<input className="block border rounded p-2" type="date" required disabled={busy} min={`${settings.sourceYear+1}-01-01`} max={`${settings.sourceYear+1}-12-31`} value={settings.expiresOn} onChange={e=>change({...settings,expiresOn:e.target.value})}/></label>
      <Button disabled={busy}>{busy?'Working…':'Load quotas'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>void loadDraft()}>Load browser draft</Button>
    </form>
    <p className="text-sm text-slate-500">Existing next-year allowances and incomplete source quotas are skipped. Pending leave reserves days. There is no company-wide carryover cap. Carryover starts at unused annual leave and can be reduced for each employee. Base annual starts at current annual total minus existing carryover.</p>
    {message&&<p role="status" className="font-medium text-sm">{message}</p>}
    {preview&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void review();}}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Preview for {preview.targetYear} · {preview.rows.filter(r=>r.status==='Ready').length} ready</h3><input aria-label="Search rollover employees" placeholder="Search employee" className="border rounded-lg px-3 py-2 text-sm w-full sm:w-64" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Employee','Current annual − carryover','New annual','Sick','Personal','Unused annual','Carry over','Annual + carryover','Expires on','Note','Status'].map(h=><th className="p-2 whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=>{
        const current={annualTotal:r.annualTotal??0,sickTotal:r.sickTotal,personalTotal:r.personalTotal??0,carriedOver:r.carriedOver,expiresOn:r.expiresOn,note:r.note||'',...overrides[r.userId]};
        const ready=r.status==='Ready'&&r.unusedAnnual!==undefined;

        return <tr key={r.userId} className="border-t align-top"><td className="p-2 min-w-40"><p className="font-medium">{r.name}</p><p className="text-xs text-slate-500">{r.empNo!=null?`TBS-${String(r.empNo).padStart(3,'0')}`:''} {r.nickname}</p></td><td className="p-2 whitespace-nowrap">{r.sourceAnnual??r.annualTotal??'—'} − {r.sourceCarried??0} = {r.annualTotal===null?'—':(r.sourceAnnual??r.annualTotal)-(r.sourceCarried??0)}</td>
          {(['annualTotal','sickTotal','personalTotal'] as const).map(field=><td className="p-2" key={field}><input aria-label={`${field==='annualTotal'?'Annual':field==='sickTotal'?'Sick':'Personal'} allowance for ${r.name}`} className="w-24 border rounded p-2 disabled:bg-slate-100" type="number" min="0" max="365" step="0.25" required disabled={!ready||busy||(field==='sickTotal'&&current.sickTotal===null)} value={current[field]===null||Number.isNaN(current[field])?'':current[field]} onChange={e=>edit(r,{[field]:e.target.value===''?NaN:Number(e.target.value)})}/>{field==='sickTotal'&&<label className="block text-xs mt-1 whitespace-nowrap"><input type="checkbox" aria-label={`Unlimited sick leave for ${r.name}`} disabled={!ready||busy} checked={current.sickTotal===null} onChange={e=>edit(r,{sickTotal:e.target.checked?null:r.sickTotal??30})}/> Unlimited</label>}</td>)}
          <td className="p-2">{r.unusedAnnual??'—'}</td>
          <td className="p-2"><input aria-label={`Carryover for ${r.name}`} className="w-24 border rounded p-2 disabled:bg-slate-100" type="number" min="0" max={Math.min(r.unusedAnnual??0,365)} step="0.25" required disabled={!ready||busy} value={Number.isNaN(current.carriedOver)?'':current.carriedOver} onChange={e=>edit(r,{carriedOver:e.target.value===''?NaN:Number(e.target.value)})}/></td>
          <td className="p-2 font-semibold">{Number.isFinite(current.annualTotal+current.carriedOver)?current.annualTotal+current.carriedOver:'—'}</td>
          <td className="p-2"><input aria-label={`Expiry for ${r.name}`} className="border rounded p-2 disabled:bg-slate-100" type="date" min={`${settings.sourceYear+1}-01-01`} max={`${settings.sourceYear+1}-12-31`} required disabled={!ready||busy} value={current.expiresOn} onChange={e=>edit(r,{expiresOn:e.target.value})}/></td>
          <td className="p-2"><textarea aria-label={`Rollover note for ${r.name}`} className="min-w-48 w-full border rounded p-2 disabled:bg-slate-100" rows={2} maxLength={1000} placeholder="Optional note" disabled={!ready||busy} value={current.note} onChange={e=>edit(r,{note:e.target.value})}/></td><td className="p-2 text-xs">{r.status}</td></tr>;
      })}</tbody></table>{rows.length===0&&<p className="p-4 text-sm text-slate-500">No matching employees.</p>}</div>
      {preview.rows.some(r=>r.unusedAnnual===undefined)&&<p role="alert">The rollover backend needs updating before individual edits are available.</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy}>{dirty?'Check my adjustments':'Refresh preview'}</Button><Button type="button" variant="outline" disabled={busy} onClick={e=>{if(e.currentTarget.form?.reportValidity())saveDraft();}}>Save browser draft</Button><Button type="button" variant="ghost" disabled={busy||Object.keys(overrides).length===0} onClick={()=>{setOverrides({});void review(settings,{});}}>Reset adjustments</Button></div>
      <p role="status" className="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">{dirty?'Check your adjustments before applying.':'Ready to apply the reviewed allowances.'} This applies to all ready employees, including those hidden by search. Existing next-year quotas will not be overwritten.</p>
      <Button type="button" disabled={busy||dirty||!preview.rows.some(r=>r.status==='Ready')} onClick={()=>setConfirm(true)}>Apply rollover to {preview.targetYear}</Button>
      {confirm&&<div role="alert" className="rounded-lg border border-amber-300 p-4 space-y-3"><p>Create {preview.targetYear} allowances for {preview.rows.filter(r=>r.status==='Ready').length} employees using the reviewed values? This saves annual, sick, personal, carryover, expiry and notes.</p><div className="flex gap-2"><Button type="button" disabled={busy} onClick={()=>void apply()}>{busy?'Saving…':'Confirm rollover'}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>Keep reviewing</Button></div></div>}
    </form>}
  </section>;
}
