import { useState, useEffect } from "react";
import { Loader2, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { loadCompanyHolidays, savedCompanyHolidays } from "@/lib/companyHolidays";
import { loadTeamMonth, prefetchTeamMonths, savedTeamMonth, teamDepartments, type TeamLeave } from "@/lib/teamCalendar";
interface Holiday {date:string;name:string;localName:string;}

interface CalendarProps {
  department: string;
  userId?: string;
}

const typeStyle: Record<string,{dot:string;chip:string;en:string;th:string}> = {
  sick: {dot:'bg-rose-500',chip:'bg-rose-50 text-rose-700',en:'Sick',th:'ลาป่วย'},
  personal: {dot:'bg-amber-500',chip:'bg-amber-50 text-amber-700',en:'Personal',th:'ลากิจ'},
  annual: {dot:'bg-sky-500',chip:'bg-sky-50 text-sky-700',en:'Annual',th:'ลาพักร้อน'},
  university: {dot:'bg-violet-500',chip:'bg-violet-50 text-violet-700',en:'University',th:'กิจกรรมมหาวิทยาลัย'},
};
const styleFor = (type:string) => typeStyle[type==='vacation'?'annual':type] ?? {dot:'bg-slate-400',chip:'bg-slate-100 text-slate-600',en:type,th:type};
const bangkokToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
const pad = (n:number) => String(n).padStart(2,'0');

export default function TeamCalendar({ department, userId }: CalendarProps) {
  const { language } = useLanguage();
  const th = language === 'th';
  const locale = th ? 'th-TH' : 'en-GB';
  const today = bangkokToday();
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0,4)), month: Number(today.slice(5,7)) - 1 }));
  const [leaveData, setLeaveData] = useState<Record<string,TeamLeave[]>>({});
  const [holidays, setHolidays] = useState<Record<string,Holiday>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [isLoading, setIsLoading] = useState(false);
  const [error,setError] = useState(false);
  const { year, month } = cursor;
  const monthKey = `${year}-${pad(month+1)}`;

  const Boom_userId = "Uc229f2377a2b8839adab478d92c0c26f";
  const cleanDept = department?.trim();
  const isTechTeam = cleanDept === "Web Developer" || cleanDept === "UX/UI Designer";
  const isCreativeTeam = userId === Boom_userId && (cleanDept === "Graphic" || cleanDept === "Content");
  const displayDept = isTechTeam ? "DEV & UX/UI" : isCreativeTeam ? "Graphic & Content" : cleanDept;

  const departmentsKey = teamDepartments(department, userId).join('|');
  useEffect(() => {
    if (!departmentsKey) return;
    const departments = departmentsKey.split('|');
    let active = true;
    const saved = savedTeamMonth(departments, year, month);
    setLeaveData(saved ?? {});setError(false);setIsLoading(!saved);
    loadTeamMonth(departments, year, month)
      .then(data=>{ if(active) setLeaveData(data); })
      .catch(()=>{ if(active&&!saved) setError(true); })
      .finally(()=>{ if(active) setIsLoading(false); });
    prefetchTeamMonths(departments, year, month, 1);
    return ()=>{ active=false; };
  }, [departmentsKey, year, month]);

  useEffect(() => {
    let active = true;
    const show = (list:Holiday[]) => { if(!active) return; const map:Record<string,Holiday>={}; for(const h of list)map[h.date]=h; setHolidays(map); };
    const saved = savedCompanyHolidays(year);
    if (saved) show(saved);
    loadCompanyHolidays(year).then(show).catch(()=>{ if(active&&!saved) setHolidays({}); });
    return () => { active = false; };
  }, [year]);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dateOf = (day:number) => `${monthKey}-${pad(day)}`;
  const asDate = (value:string) => new Date(value+'T12:00:00+07:00');
  const fmt = (value:string, options:Intl.DateTimeFormatOptions) => asDate(value).toLocaleDateString(locale,{...options,timeZone:'Asia/Bangkok'});
  const weekdays = Array.from({length:7},(_,i)=>new Date(Date.UTC(2023,0,1+i)).toLocaleDateString(locale,{weekday:'narrow',timeZone:'UTC'}));

  const go = (delta:number) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    const nextKey = `${next.getUTCFullYear()}-${pad(next.getUTCMonth()+1)}`;
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
    setSelectedDay(today.startsWith(nextKey) ? today : null);
  };
  const goToday = () => { setCursor({ year: Number(today.slice(0,4)), month: Number(today.slice(5,7)) - 1 }); setSelectedDay(today); };

  const holidayName = (h:Holiday) => th ? (h.localName||h.name) : (h.name||h.localName);
  const statusLabel = (s:string) => s==='Approved' ? (th?'อนุมัติแล้ว':'Approved') : (th?'รออนุมัติ':'Pending');
  const periodLabel = (p?:string|null) => p==='morning' ? (th?'ครึ่งเช้า':'Morning') : p==='afternoon' ? (th?'ครึ่งบ่าย':'Afternoon') : '';

  const people = (list:TeamLeave[]) => (
    <ul className="space-y-2">
      {list.map((l,i)=>{const s=styleFor(l.type);return (
        <li key={i} className="flex items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{l.name}</span>
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>{th?s.th:s.en}{periodLabel(l.period)?` · ${periodLabel(l.period)}`:''}</span>
          {l.status!=='Approved'&&<span className="shrink-0 rounded-md border border-dashed border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{statusLabel(l.status)}</span>}
        </li>);})}
    </ul>
  );

  const monthDays = Object.keys(leaveData).filter(d=>d.startsWith(monthKey)&&leaveData[d].length>0).sort();
  const selectedLeaves = selectedDay ? leaveData[selectedDay] ?? [] : [];
  const selectedHoliday = selectedDay ? holidays[selectedDay] : undefined;

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
      <div className="bg-linear-to-r/srgb from-blue-500 to-indigo-500 px-4 pt-5 pb-4 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-100"><Users className="h-3.5 w-3.5"/>{th?'ปฏิทินวันลาของทีม':'Team leave'} · {displayDept}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" aria-label={th?'เดือนก่อน':'Previous month'} onClick={()=>go(-1)} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><ChevronLeft className="h-5 w-5"/></button>
          <div className="text-center">
            <h2 className="text-lg font-bold leading-tight">{fmt(`${monthKey}-15`,{month:'long',year:'numeric'})}</h2>
            {!today.startsWith(monthKey)&&<button type="button" onClick={goToday} className="text-[11px] font-semibold text-blue-100 underline underline-offset-2">{th?'กลับไปวันนี้':'Back to today'}</button>}
          </div>
          <button type="button" aria-label={th?'เดือนถัดไป':'Next month'} onClick={()=>go(1)} className="rounded-full bg-white/15 p-2 hover:bg-white/25"><ChevronRight className="h-5 w-5"/></button>
        </div>
      </div>

      <div className="relative overflow-y-auto p-4 space-y-4 bg-slate-50">
        {isLoading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70"><Loader2 className="h-8 w-8 animate-spin text-indigo-500"/></div>}
        {error && <p role="alert" className="text-sm text-rose-600">{th?'โหลดวันลาของทีมไม่สำเร็จ กรุณาเปิดแอปใน LINE อีกครั้ง':'Unable to load team leave. Please reopen the app in LINE.'}</p>}

        <div className="rounded-2xl bg-white p-3 shadow-xs border border-slate-100">
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 mb-1.5">
            {weekdays.map((w,i)=><div key={i} className={i===0||i===6?'text-slate-300':''}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({length:firstDay},(_,i)=><div key={`b${i}`}/>)}
            {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
              const date=dateOf(day),list=leaveData[date]??[],holiday=holidays[date],weekend=[0,6].includes((firstDay+day-1)%7);
              const selected=selectedDay===date,isToday=date===today;
              return (
                <button type="button" key={day} onClick={()=>setSelectedDay(date)} aria-pressed={selected} aria-label={`${fmt(date,{day:'numeric',month:'long'})}${list.length?`, ${list.length} ${th?'คนลา':'off'}`:''}${holiday?`, ${holidayName(holiday)}`:''}`}
                  className={`relative h-12 rounded-xl flex flex-col items-center justify-center transition-colors
                    ${selected?'bg-indigo-600 text-white':holiday?'bg-emerald-50 text-emerald-700':list.length?'bg-indigo-50 text-slate-800':'hover:bg-slate-50 text-slate-700'}
                    ${weekend&&!selected&&!holiday?'text-slate-300':''}`}>
                  <span className={`text-sm leading-none ${isToday?'font-extrabold':'font-medium'} ${isToday&&!selected?'text-indigo-600':''}`}>{day}</span>
                  {isToday&&!selected&&<span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-indigo-600"/>}
                  <span className="mt-1 flex h-1.5 items-center gap-0.5">
                    {holiday&&!list.length&&<span className={`h-1.5 w-1.5 rounded-full ${selected?'bg-white':'bg-emerald-500'}`}/>}
                    {list.slice(0,3).map((l,j)=><span key={j} className={`h-1.5 w-1.5 rounded-full ${selected?'bg-white':styleFor(l.type).dot}`}/>)}
                    {list.length>3&&<span className={`text-[9px] font-bold leading-none ${selected?'text-white':'text-slate-500'}`}>+{list.length-3}</span>}
                  </span>
                </button>);
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
            {(['sick','personal','annual'] as const).map(k=><span key={k} className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${typeStyle[k].dot}`}/>{th?typeStyle[k].th:typeStyle[k].en}</span>)}
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{th?'วันหยุดบริษัท':'Company holiday'}</span>
          </div>
        </div>

        {selectedDay&&selectedDay.startsWith(monthKey)&&(
          <div className="rounded-2xl bg-white p-4 shadow-xs border border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">{selectedDay===today?(th?'วันนี้ · ':'Today · '):''}{fmt(selectedDay,{weekday:'long',day:'numeric',month:'long'})}</h3>
            {selectedHoliday&&<p className="mt-1 text-xs font-semibold text-emerald-700">🎉 {holidayName(selectedHoliday)}</p>}
            <div className="mt-3">{selectedLeaves.length?people(selectedLeaves):<p className="text-xs text-slate-500">{th?'ไม่มีใครในทีมลาวันนี้':'Everyone in the team is in.'}</p>}</div>
          </div>
        )}

        <div>
          <h3 className="px-1 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{th?'ใครลาบ้างเดือนนี้':"Who's off this month"}</h3>
          {monthDays.length===0?<p className="px-1 text-xs text-slate-500">{isLoading?'':(th?'ยังไม่มีใครลาในเดือนนี้':'No one has leave this month.')}</p>:(
            <div className="rounded-2xl bg-white shadow-xs border border-slate-100 divide-y divide-slate-100">
              {monthDays.map(date=>(
                <button type="button" key={date} onClick={()=>setSelectedDay(date)} className={`flex w-full gap-3 p-3 text-left ${date<today?'opacity-50':''} ${selectedDay===date?'bg-indigo-50/60':''}`}>
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-base font-extrabold leading-none text-slate-800">{Number(date.slice(-2))}</div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mt-0.5">{fmt(date,{weekday:'short'})}</div>
                  </div>
                  <div className="min-w-0 flex-1">{people(leaveData[date])}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
