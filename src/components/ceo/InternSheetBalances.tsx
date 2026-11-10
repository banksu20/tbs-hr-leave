import {useDashboardText} from '@/hooks/useDashboardText';
import {LEAVE_META} from './leaveSheetUtils';
export type InternshipBalance={type:string;total:number;approved:number;pending:number};
export default function InternSheetBalances({balances,universityApproved}:{balances?:InternshipBalance[];universityApproved?:number}){
 const dt=useDashboardText();
 const columns=['sick','annual','personal','university'] as const;
 const number=(n:number)=>Math.round(n*100)/100;
 return <div data-testid="internship-sheet-balances"><table className="w-full border-collapse text-xs"><tbody>{(['total','approved','pending','remaining'] as const).map(key=><tr key={key} className={key==='remaining'?'bg-slate-100 border-t border-slate-200':''}><td className="px-2 py-1.5 w-24 border-r border-slate-200 font-extrabold text-slate-500 uppercase tracking-wide text-[10px]">{dt({total:'Quota',approved:'Used (approved)',pending:'Pending',remaining:'Remain'}[key])}</td>{columns.map(type=>{const b=balances?.find(b=>b.type===type);const value=type==='university'?(key==='approved'?universityApproved:undefined):b?number(key==='remaining'?b.total-b.approved-b.pending:b[key]):undefined;return <td key={type} className={`px-2 py-1.5 w-[56px] text-center border-r border-slate-200 font-extrabold ${key==='remaining'&&value!==undefined&&value<0?'text-rose-600':key==='total'?'text-slate-500':LEAVE_META[type].text}`}>{value??'—'}</td>;})}<td className="px-2 py-1.5 text-[10px] font-bold text-slate-400" colSpan={2}>{key==='total'?dt('Allowances — whole internship (days)'):key==='remaining'?dt('Remaining excludes pending requests.'):''}</td></tr>)}</tbody></table>{!balances&&<p className="px-3 py-2 text-xs text-slate-500">{dt('Total unavailable. Refresh to load.')}</p>}</div>;
}
