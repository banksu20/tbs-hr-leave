import { useMemo, useState } from 'react';
import type { Employee } from '@/data/mockEmployees';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LEAVE_META, LEAVE_TYPES, type LeaveType } from './leaveSheetUtils';
import { MONTH_LABELS } from './overviewData';
import { buildMonthlyReport } from '@/lib/monthlyReport';

export default function MonthlyExportDialog({employees,year,initialTypes,scope,ready,onClose}: {
  employees: Employee[]; year: string; initialTypes: LeaveType[]; scope: string; ready: boolean; onClose:()=>void;
}) {
  const [month,setMonth]=useState(new Date().getMonth()+1);
  const [types,setTypes]=useState<LeaveType[]>(initialTypes);
  const [selected,setSelected]=useState(()=>new Set(employees.map(e=>e.id)));
  const [search,setSearch]=useState('');
  const [downloaded,setDownloaded]=useState(false);
  const [pdfBusy,setPdfBusy]=useState(false);
  const [pdfError,setPdfError]=useState('');
  const selectedEmployees=employees.filter(e=>selected.has(e.id));
  const choices=employees.filter(e=>`${e.empCode} ${e.name} ${e.nickname} ${e.department}`.toLowerCase().includes(search.toLowerCase().trim()));
  const report=useMemo(()=>selectedEmployees.length&&types.length?buildMonthlyReport(selectedEmployees,year,month,types,scope):null,[selectedEmployees,year,month,types,scope]);
  function download(){
    if(!report||!ready)return;
    const url=URL.createObjectURL(new Blob([report.csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=report.filename;document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloaded(true);
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!pdfBusy)onClose();}}>
    <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Monthly leave export · {year}</DialogTitle><DialogDescription>Choose whose report to export. Approved leave only; pending and cancelled leave are excluded. No email is sent.</DialogDescription></DialogHeader>
      <p className="text-sm text-slate-600">{scope}. Employee choices follow the dashboard department and search filters.</p>
      <fieldset disabled={pdfBusy} className="contents">
      <div className="flex flex-wrap gap-4 items-center">
        <label className="text-sm font-medium">Report month <select className="border rounded p-2" value={month} onChange={e=>{setMonth(Number(e.target.value));setDownloaded(false);}}>{MONTH_LABELS.map((m,i)=><option key={m} value={i+1}>{m} {year}</option>)}</select></label>
        <fieldset className="flex flex-wrap gap-3"><legend className="text-sm font-medium mb-1">Leave types</legend>{LEAVE_TYPES.map(t=><label key={t} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={types.includes(t)} onChange={e=>{setTypes(current=>e.target.checked?LEAVE_TYPES.filter(v=>current.includes(v)||v===t):current.filter(v=>v!==t));setDownloaded(false);}}/>{LEAVE_META[t].short}</label>)}</fieldset>
      </div>
      <div className="border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-sm">Employees ({selectedEmployees.length} selected)</h3>
          <Button variant="outline" size="sm" onClick={()=>{setSelected(new Set(employees.map(e=>e.id)));setDownloaded(false);}}>Select all {employees.length}</Button>
          <Button variant="outline" size="sm" onClick={()=>{setSelected(new Set());setDownloaded(false);}}>Clear selection</Button>
        </div>
        <input aria-label="Find employees to export" className="w-full border rounded p-2 text-sm" placeholder="Find name, nickname or employee code" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="grid sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto">
          {choices.map(e=><label key={e.id} className="flex gap-2 text-sm items-start p-1"><input type="checkbox" checked={selected.has(e.id)} onChange={event=>{setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(e.id);else next.delete(e.id);return next;});setDownloaded(false);}}/><span>{e.name} <span className="text-slate-500">{e.empCode} · {e.department}</span></span></label>)}
          {!choices.length&&<p className="text-sm text-slate-500">No employees match this search.</p>}
        </div>
        <p className="text-xs text-slate-500">Searching this list does not change your selection.</p>
      </div>
      </fieldset>
      {!ready&&<p role="alert" className="text-amber-800">Refresh live data before exporting. Incomplete or cached data cannot be exported.</p>}
      {!report&&<p role="status" className="text-sm">Select at least one employee and leave type.</p>}
      {report&&<><h3 className="font-semibold">Preview: {report.period} · {report.total} days</h3><p className="text-xs text-slate-500">One row per selected employee, including those with zero leave. Names and totals are included; leave reasons are not.</p>
        <div className="overflow-auto max-h-60"><table className="w-full text-sm text-left"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-2">Employee</th>{report.types.map(t=><th className="p-2" key={t}>{LEAVE_META[t].short}</th>)}<th className="p-2">Total days</th></tr></thead><tbody>{report.rows.map((r,i)=><tr key={i} className="border-t"><td className="p-2">{r.name} · {r.employeeCode}</td>{report.types.map(t=><td className="p-2" key={t}>{r[t]}</td>)}<td className="p-2 font-semibold">{r.total}</td></tr>)}</tbody></table></div>
      </>}
      {downloaded&&<p role="status" className="text-sm text-emerald-700">Download started. Check your browser’s downloads.</p>}
      {pdfError&&<p role="alert" className="text-sm text-red-700">{pdfError}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={pdfBusy} onClick={onClose}>Close</Button><Button disabled={!report||!ready||pdfBusy} onClick={download}>Download CSV</Button>
        <Button disabled={!report||!ready||pdfBusy} onClick={async()=>{
          if(!report||!ready)return;
          setPdfBusy(true);setPdfError('');setDownloaded(false);
          try { const {downloadReportPdf}=await import('@/lib/downloadReportPdf');await downloadReportPdf(report);setDownloaded(true); }
          catch(error){setPdfError(error instanceof Error?error.message:'PDF download failed. Try again.');}
          finally{setPdfBusy(false);}
        }}>{pdfBusy?'Preparing PDF…':'Download PDF'}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
