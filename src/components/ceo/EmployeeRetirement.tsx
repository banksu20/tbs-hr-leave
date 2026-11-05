import {useCallback,useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useDashboardText} from '@/hooks/useDashboardText';
type Row={id:string;code:string;name:string;status:string};
 async function call(action:string,row?:Row,confirmation?:string){const r=await fetch('/api/interns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,userId:row?.id,confirmation})}),b=await r.json();if(!r.ok)throw Error(b.error);return b;}

export default function EmployeeRetirement(){
 const dt=useDashboardText(),client=useQueryClient();
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const load=useCallback(async()=>{setRows((await call('employee-retirement-list')).employees);},[]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 async function change(action:string,row:Row){
  let confirmation;
  if(action==='employee-permanent-delete'){
   confirmation=window.prompt(dt('Permanently delete {0} ({1})? This removes their profile, leave history and documents. Delivered messages and external calendar/sheet records are not erased. Type {1} to confirm.',[row.name,row.code]));
   if(confirmation!==row.code)return;
  }else if(!window.confirm(dt('Change employment status for {0}?',[row.name])))return;
  setBusy(true);setError('');try{await call(action,row,confirmation??undefined);await load();await client.invalidateQueries({queryKey:['employees']});}catch(e){setError(dt((e as Error).message));}finally{setBusy(false);}
 }
 return <section className="bg-white border rounded-2xl p-5 space-y-4"><h1 className="font-bold text-xl">{dt('Employee records')}</h1><p className="text-sm text-slate-500">{dt('Archive first. Permanent deletion is available only after pending and current/future leave is resolved.')}</p><input className="border rounded-lg p-3 w-full" aria-label={dt('Search')} placeholder={dt('Search')} value={search} onChange={e=>setSearch(e.target.value)}/>{error&&<p role="alert" className="text-red-700">{error}</p>}{rows.filter(r=>(r.name+' '+r.code).toLowerCase().includes(search.toLowerCase())).map(r=><div key={r.id} className="border-t pt-3 flex flex-wrap items-center gap-3"><div className="mr-auto"><p className="font-semibold">{r.name}</p><p className="text-sm text-slate-500">{r.code} · {dt(r.status==='inactive'?'Archived':'Active')}</p></div><button disabled={busy} className="border rounded-lg px-3 py-2 text-sm" onClick={()=>void change(r.status==='inactive'?'employee-retirement-restore':'employee-retirement-archive',r)}>{dt(r.status==='inactive'?'Restore':'Archive')}</button>{r.status==='inactive'&&<button disabled={busy} className="border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm" onClick={()=>void change('employee-permanent-delete',r)}>{dt('Permanently delete')}</button>}</div>)}</section>;
}
