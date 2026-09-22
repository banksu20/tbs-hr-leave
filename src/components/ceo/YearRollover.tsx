import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { applyRollover, previewRollover, type RolloverSettings } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function YearRollover({year}: {year:string}) {
  const [settings,setSettings]=useState<RolloverSettings>({sourceYear:Number(year),carryLimit:5,expiresOn:`${Number(year)+1}-03-31`});
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewRollover>>|null>(null);
  const [approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const client=useQueryClient();
  const change=(next:RolloverSettings)=>{setSettings(next);setPreview(null);setApproved(false);setMessage('');};
  return <section className="bg-white border rounded-xl p-4 space-y-4">
    <h2 className="font-bold text-lg">Year rollover</h2>
    <p className="text-sm text-slate-600">Draft suggestion: carry up to 5 unused annual days, expiring 31 March. Confirm your HR policy before applying. Annual, sick and personal quotas are copied; unused sick/personal leave and old carryover are not carried forward.</p>
    <form className="flex flex-wrap items-end gap-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');setPreview(null);setApproved(false);try{setPreview(await previewRollover(settings));}catch(error){setMessage(error instanceof Error?error.message:'Preview failed');}finally{setBusy(false);}}}>
      <label className="text-sm">Source year<input className="block border rounded p-2" type="number" min="2000" max="2099" required disabled={busy} value={settings.sourceYear} onChange={e=>{const yr=Number(e.target.value);change({...settings,sourceYear:yr,expiresOn:`${yr+1}-03-31`});}}/></label>
      <label className="text-sm">Maximum annual carryover<input className="block border rounded p-2" type="number" min="0" max="365" step="0.25" required disabled={busy} value={settings.carryLimit} onChange={e=>change({...settings,carryLimit:Number(e.target.value)})}/></label>
      <label className="text-sm">Carryover expires on<input className="block border rounded p-2" type="date" required disabled={busy} min={`${settings.sourceYear+1}-01-01`} max={`${settings.sourceYear+1}-12-31`} value={settings.expiresOn} onChange={e=>change({...settings,expiresOn:e.target.value})}/></label>
      <Button disabled={busy}>{busy?'Working…':'Preview next year'}</Button>
    </form>
    <p className="text-sm text-slate-500">Covers all active employees. Existing target-year quotas and incomplete source quotas are skipped. Pending leave reserves days. Carryover is used first for leave dated on or before its expiry; unused carryover expires the following day. Apply becomes available after the source year ends.</p>
    {message&&<p role="status" className="font-medium">{message}</p>}
    {preview&&<><h3 className="font-semibold">Preview for {preview.targetYear} · {preview.rows.filter(r=>r.status==='Ready').length} ready</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Employee','Annual','Sick','Personal','Carryover','Expiry','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.userId} className="border-t">{[r.name,r.annualTotal??'—',r.sickTotal??'—',r.personalTotal??'—',r.carriedOver,r.expiresOn,r.status].map((v,i)=><td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)}/>I have confirmed this policy with HR and reviewed the employee balances.</label>
      <Button disabled={busy||!approved||!preview.rows.some(r=>r.status==='Ready')} onClick={async()=>{
        if(!window.confirm(`Create ${preview.targetYear} quotas using this reviewed policy? Existing quotas will not be overwritten.`))return;
        setBusy(true);setMessage('');
        try{const result=await applyRollover(settings,preview.token);setMessage(`Created ${result.saved} quotas for ${preview.targetYear}.`);setPreview(null);setApproved(false);await Promise.all([client.invalidateQueries({queryKey:['employees']}),client.invalidateQueries({queryKey:['history']})]);}
        catch(error){setMessage(error instanceof Error?error.message:'Rollover failed');setPreview(null);setApproved(false);}
        finally{setBusy(false);}
      }}>Apply rollover</Button>
    </>}
  </section>;
}
