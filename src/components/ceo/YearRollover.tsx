import { useState } from 'react';
import { previewRollover, type RolloverSettings } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function YearRollover({year}: {year:string}) {
  const [settings,setSettings]=useState<RolloverSettings>({sourceYear:Number(year),carryLimit:5,expiresOn:`${Number(year)+1}-03-31`});
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewRollover>>|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const change=(next:RolloverSettings)=>{setSettings(next);setPreview(null);setMessage('');};
  return <section className="bg-white border rounded-xl p-4 space-y-4">
    <h2 className="font-bold text-lg">Prepare next year’s leave</h2>
    <div className="rounded-xl bg-sky-50 border border-sky-100 p-4 text-sm space-y-2">
      <p className="font-semibold">What does year rollover do?</p>
      <p>It creates next year’s allowances for active employees and optionally brings across some unused annual leave.</p>
      <p><strong>Example:</strong> 12 new annual days + 5 carried days = 17 days available. If the carried days expire on 31 March, any unused part of those 5 days disappears after that date. The new 12 days keep their normal allowance.</p>
      <p><strong>Preview</strong> shows the proposed numbers without saving. Saving is currently locked until your boss approves the rules. Existing next-year allowances are skipped.</p>
    </div>
    <p className="text-sm text-slate-600">Draft suggestion: carry up to 5 unused annual days, expiring 31 March. Confirm your HR policy before applying. Annual, sick and personal quotas are copied; unused sick/personal leave and old carryover are not carried forward.</p>
    <form className="flex flex-wrap items-end gap-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');setPreview(null);try{setPreview(await previewRollover(settings));}catch(error){setMessage(error instanceof Error?error.message:'Preview failed');}finally{setBusy(false);}}}>
      <label className="text-sm">Source year<input className="block border rounded p-2" type="number" min="2000" max="2099" required disabled={busy} value={settings.sourceYear} onChange={e=>{const yr=Number(e.target.value);change({...settings,sourceYear:yr,expiresOn:`${yr+1}-03-31`});}}/></label>
      <label className="text-sm">Maximum annual carryover<input className="block border rounded p-2" type="number" min="0" max="365" step="0.25" required disabled={busy} value={settings.carryLimit} onChange={e=>change({...settings,carryLimit:Number(e.target.value)})}/></label>
      <label className="text-sm">Carryover expires on<input className="block border rounded p-2" type="date" required disabled={busy} min={`${settings.sourceYear+1}-01-01`} max={`${settings.sourceYear+1}-12-31`} value={settings.expiresOn} onChange={e=>change({...settings,expiresOn:e.target.value})}/></label>
      <Button disabled={busy}>{busy?'Working…':'Preview next year'}</Button>
    </form>
    <p className="text-sm text-slate-500">Covers all active employees. Existing target-year quotas and incomplete source quotas are skipped. Pending leave reserves days. Carryover is used first for leave dated on or before its expiry; unused carryover expires the following day. This screen cannot create next-year quotas while the policy is unconfirmed.</p>
    {message&&<p role="status" className="font-medium">{message}</p>}
    {preview&&<><h3 className="font-semibold">Preview for {preview.targetYear} · {preview.rows.filter(r=>r.status==='Ready').length} ready</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Employee','Annual','Sick','Personal','Carryover','Expiry','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{preview.rows.map(r=><tr key={r.userId} className="border-t">{[r.name,r.annualTotal??'—',r.sickTotal??'—',r.personalTotal??'—',r.carriedOver,r.expiresOn,r.status].map((v,i)=><td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      <p role="status" className="rounded-lg bg-amber-50 text-amber-900 p-3 text-sm">Preview only. No allowances have been saved. Applying rollover is locked until your boss approves the carryover policy and it is enabled in the system.</p>
    </>}
  </section>;
}
