import {useDashboardText} from "@/hooks/useDashboardText";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import MonthlyExportDialog from "./MonthlyExportDialog";
import OverviewAttention from "./OverviewAttention";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, Palmtree, Users, Check, ChevronsUpDown, Download } from "lucide-react";
import { Employee } from "@/data/mockEmployees";
import { LEAVE_META, LEAVE_TYPES, LeaveType, sumLeavesByType } from "./leaveSheetUtils";
import {
  annualQuotaUsage,
  awaitingQuota,
  busiestMonth,
  monthlyTotals,
  dailyTotals,
  MONTH_LABELS,
  overQuotaList,
} from "./overviewData";

const SERIES = {
  university: "#7c3aed",
  sick: "#CC0000",
  annual: "#D4A000",
  personal: "#0099FF",
};

const INK = "#334155";
const MUTED = "#94a3b8";
const GRID = "#e2e8f0";

export interface OverviewDashboardProps {
  showQuota?: boolean;
  employees: Employee[];
  year: string;
  departmentCount: number;
  onLeaveToday: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  exportReady: boolean;
  exportScope: string;
  onOpenApprovals?: () => void;
}

function Card({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-3">
      <div className="mb-1.5">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        {hint && <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  unit,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  detail: React.ReactNode;
  tone: "sky" | "amber" | "rose" | "emerald";
  icon: React.ReactNode;
}) {
  const dt = useDashboardText();
  const tones = {
    sky: "bg-sky-50 text-[#00B5E2]",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    emerald: "bg-emerald-50 text-emerald-600",
  } as const;

  return (
    <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{dt(label)}</p>
        <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
          {value}
          {unit && <span className="text-xs font-semibold text-slate-500 ml-1">{unit}</span>}
        </p>
        <div className="text-[11px] font-medium mt-1">{detail}</div>
      </div>
      <div className={`p-2 rounded-lg shrink-0 ${tones[tone]}`}>{icon}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter }: {active?:boolean;payload?:{value?:number|string;dataKey?:string|number;name?:string|number;color?:string}[];label?:string|number;labelFormatter?:(label:string|number)=>React.ReactNode}) {
 const dt = useDashboardText();

  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-[11px] font-extrabold text-slate-900 mb-1">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload
        .filter((entry) => Number(entry.value) > 0)
        .map((entry) => (
          <p key={entry.dataKey} className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
            {entry.name}
            <span className="ml-auto pl-3 font-extrabold text-slate-900">{entry.value}{dt("d")}</span>
          </p>
        ))}
    </div>
  );
}

export default function OverviewDashboard({
  showQuota = true,
  employees: availableEmployees,
  year,
  departmentCount,
  onLeaveToday,
  onSelectEmployee,
  exportReady,
  exportScope,
  onOpenApprovals,
}: OverviewDashboardProps) {
 const dt = useDashboardText();

  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [employeeId,setEmployeeId] = useState('');
  const [month,setMonth] = useState('all');
  const activeEmployeeId = availableEmployees.some(e=>e.id===employeeId) ? employeeId : '';
  const employees = useMemo(()=>availableEmployees.filter(e=>!activeEmployeeId||e.id===activeEmployeeId),[availableEmployees,activeEmployeeId]);
  const period = month==='all' ? year : `${dt(MONTH_LABELS[Number(month)-1])} ${year}`;
  const [exportOpen, setExportOpen] = useState(false);
  const availableTypes = useMemo<LeaveType[]>(()=>exportScope==='Interns'?[...LEAVE_TYPES,'university']:LEAVE_TYPES,[exportScope]);
  const [selectedTypes, setSelectedTypes] = useState<LeaveType[]>(availableTypes);
  const periodEmployees = useMemo(()=>employees.map(e=>({...e,leaves:e.leaves.filter(l=>(month==='all'||Number(l.date.slice(5,7))===Number(month))&&selectedTypes.includes(l.type))})),[employees,month,selectedTypes]);
  const months = useMemo(() => month === 'all' ? monthlyTotals(periodEmployees, year, selectedTypes) : dailyTotals(periodEmployees, year, Number(month), selectedTypes), [periodEmployees, year, selectedTypes,month]);
  const todayEmployees = onLeaveToday.filter(e=>employees.some(p=>p.id===e.id));
  const people = exportScope === 'Interns' ? "interns" : "staff";
  const [showAllPeople, setShowAllPeople] = useState(false);
  const peopleRows = useMemo(() => periodEmployees.map(employee => {
    const byType = availableTypes.map(type => Math.round(sumLeavesByType(employee.leaves, type, year) * 100) / 100);
    return { employee, byType, total: Math.round(byType.reduce((sum, days) => sum + days, 0) * 100) / 100 };
  }).sort((a, b) => b.total - a.total || a.employee.name.localeCompare(b.employee.name)), [periodEmployees, availableTypes, year]);
  const quotaUsage = useMemo(() => annualQuotaUsage(employees, year, 4), [employees, year]);
  const overQuota = useMemo(() => overQuotaList(employees, year), [employees, year]);
  const peak = useMemo(() => busiestMonth(months), [months]);
  const newJoiners = useMemo(() => awaitingQuota(employees), [employees]);

  const totals = useMemo(() => {
    const byType = availableTypes.map((type) => ({
      type,
      days: periodEmployees.reduce((sum, emp) => sum + sumLeavesByType(emp.leaves, type, year), 0),
    }));
    return {
      byType,
      all: Math.round(byType.reduce((sum, t) => sum + t.days, 0) * 100) / 100,
    };
  }, [periodEmployees, year, availableTypes]);


  return (
    <div className="space-y-3">
      <OverviewAttention employees={availableEmployees} onSelectEmployee={onSelectEmployee} onOpenApprovals={onOpenApprovals} />
      <div className={`grid grid-cols-2 ${showQuota ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3`}>
        <StatTile
          label={people === "interns" ? dt("Total interns") : dt("Total staff")}
          value={employees.length}
          unit={people === "interns" ? dt("interns") : dt("employees")}
          tone="sky"
          icon={<Users className="w-5 h-5" />}
          detail={<span className="text-[#68BD24] font-bold">{dt("Across")} {new Set(employees.map(e=>e.department)).size}  {dt("departments")}</span>}
        />
        <StatTile
          label={dt("On leave today")}
          value={todayEmployees.length}
          unit={people === "interns" ? dt("interns") : dt("staff")}
          tone="amber"
          icon={<Palmtree className="w-5 h-5" />}
          detail={
            <span className="text-slate-500 truncate block max-w-[190px]">
              {todayEmployees.length > 0 ? todayEmployees.map((e) => e.nickname).join(", ") : dt("Nobody is off today")}
            </span>
          }
        />
        {showQuota && <>
        <StatTile
          label={newJoiners.length > 0 ? dt("Quota not set") : dt("Quota warnings")}
          value={newJoiners.length > 0 ? newJoiners.length : overQuota.length}
          unit={newJoiners.length > 0 ? dt("new staff") : dt("alerts")}
          tone={newJoiners.length > 0 ? "amber" : "rose"}
          icon={<AlertTriangle className="w-5 h-5" />}
          detail={
            newJoiners.length > 0 ? (
              <span className="text-amber-600 font-bold truncate block max-w-[190px]">
                {newJoiners.map((e) => e.nickname || e.name).join(", ")}
              </span>
            ) : overQuota.length > 0 ? (
              <span className="text-rose-600 font-bold">{dt("Needs review")}</span>
            ) : (
              <span className="text-emerald-600 font-bold">{dt("Everyone within quota")}</span>
            )
          }
        />
        </>}
        <StatTile
          label={dt("Days taken ({0})", [period])}
          value={totals.all}
          unit={dt("days")}
          tone="emerald"
          icon={<CalendarDays className="w-5 h-5" />}
          detail={
            <span className="text-slate-500">
              {totals.byType.map((t, i) => (
                <span key={t.type}>
                  {i > 0 && " · "}
                  {dt(LEAVE_META[t.type].short)} {Math.round(t.days * 100) / 100}{dt("d")} </span>
              ))}
            </span>
          }
        />
      </div>

      <Card
        title={dt("Leave taken · {0}", [period])}
        hint={selectedTypes.length === 0 ? dt("Select at least one leave type") : peak ? month==='all' ? dt("Busiest month is {0} with {1} days · approved leave", [dt(peak.month), peak.total]) : dt("{0} approved days · daily breakdown", [totals.all]) : dt("No approved leave for the selected types")}
      >
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-center mb-3">
        <Popover open={employeeOpen} onOpenChange={setEmployeeOpen}>
          <PopoverTrigger asChild>
            <button type="button" role="combobox" aria-label={dt("Overview employee")} aria-expanded={employeeOpen} className="h-8 w-[210px] max-w-full px-2.5 border border-slate-200 rounded-md bg-white text-xs font-semibold flex items-center gap-2 hover:border-sky-400">
              <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="truncate flex-1 text-left">{employees.find(e => e.id === activeEmployeeId)?.name || dt("All employees")}</span>
              <ChevronsUpDown className="h-3 w-3 text-slate-400 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0 w-[300px]">
            <Command filter={(value, search) => search.toLowerCase().trim().split(/\s+/).every(part => value.toLowerCase().includes(part)) ? 1 : 0}>
              <CommandInput aria-label={dt("Search overview employees")} placeholder={dt("Search name or employee code…")} />
              <CommandList>
                <CommandEmpty>{dt("No employees found.")}</CommandEmpty>
                <CommandItem value="all employees" onSelect={() => { setEmployeeId(''); setEmployeeOpen(false); }}><Check className={`mr-2 h-4 w-4 ${activeEmployeeId ? 'opacity-0' : ''}`} />{dt("All employees")}</CommandItem>
                {availableEmployees.map(e => <CommandItem key={e.id} value={`${e.id} ${e.name} ${e.nickname} ${e.empCode}`} onSelect={() => { setEmployeeId(e.id); setEmployeeOpen(false); }}><Check className={`mr-2 h-4 w-4 ${activeEmployeeId === e.id ? '' : 'opacity-0'}`} /><span className="flex-1">{e.name}</span><span className="text-xs text-slate-400">{e.empCode}</span></CommandItem>)}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <label className="text-xs font-semibold text-slate-500 flex items-center gap-2">{dt("Month")}<select aria-label={dt("Overview month")} className="border rounded-md h-8 px-2 text-xs text-slate-900" value={month} onChange={e=>setMonth(e.target.value)}><option value="all">{dt("All year")}</option>{MONTH_LABELS.map((m,i)=><option key={m} value={i+1}>{dt(m)} {year}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-500 flex items-center gap-2">{dt("Leave type")}<select aria-label={dt("Overview leave type")} className="border rounded-md h-8 px-2 text-xs text-slate-900" value={selectedTypes.length===availableTypes.length?'all':selectedTypes[0]} onChange={e=>setSelectedTypes(e.target.value==='all'?[...availableTypes]:[e.target.value as LeaveType])}><option value="all">{dt("All types")}</option>{availableTypes.map(t=><option key={t} value={t}>{dt(LEAVE_META[t].label)}</option>)}</select></label>
        <button type="button" className="ml-auto h-8 flex items-center gap-1.5 rounded-md px-3 text-xs font-bold bg-slate-900 text-white hover:bg-slate-700" onClick={() => setExportOpen(true)}><Download className="h-3.5 w-3.5" />{dt("Export")}</button>
      </div>
        <div className="h-[170px] xl:h-[clamp(110px,16vh,200px)]"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} maxBarSize={month === "all" ? 26 : 18}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis interval="preserveStartEnd" minTickGap={6} dataKey="month" tickFormatter={value=>dt(String(value))} tick={{ fontSize: 11, fill: MUTED, fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: MUTED, fontWeight: 700 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} labelFormatter={label => month === "all" ? `${dt(label)} ${year}` : `${dt(label)} ${period}`} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
            {selectedTypes.map((type, index) => <Bar key={type} dataKey={type} stackId="a" name={dt(LEAVE_META[type].short)} fill={SERIES[type]} stroke="#fff" strokeWidth={2} radius={index === selectedTypes.length - 1 ? [4,4,0,0] : [0,0,0,0]} isAnimationActive={false}>
              {index === selectedTypes.length - 1 && <LabelList dataKey="total" position="top" formatter={(v: number) => v > 0 ? v : ""} style={{fontSize:10,fontWeight:800,fill:INK}} />}
            </Bar>)}
          </BarChart>
        </ResponsiveContainer></div>
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">{selectedTypes.map(type => <span key={type} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{background: SERIES[type]}} />{dt(LEAVE_META[type].short)}</span>)}</div>
      </Card>

      {exportOpen && <MonthlyExportDialog employees={employees} year={year} initialMonth={month==='all'?undefined:Number(month)} initialTypes={selectedTypes} scope={exportScope} ready={exportReady} onClose={() => setExportOpen(false)} />}

      <div className={`grid grid-cols-1 ${showQuota ? "lg:grid-cols-3" : ""} gap-3`}>
        <Card title={dt("Leave by person")} hint={dt("Approved leave · {0}", [period])}>
          {peopleRows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 pr-2 font-medium">{people === "interns" ? dt("Intern") : dt("Employee")}</th>{availableTypes.map(type => <th key={type} className="py-1.5 px-2 font-medium text-right">{dt(LEAVE_META[type].short)}</th>)}<th className="py-1.5 pl-2 font-medium text-right">{dt("Total")}</th></tr></thead>
            <tbody>{(showAllPeople ? peopleRows : peopleRows.slice(0, 6)).map(row => <tr key={row.employee.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onSelectEmployee(row.employee)}>
              <td className="py-1.5 pr-2 font-medium text-slate-800 truncate max-w-[180px]">{row.employee.nickname || row.employee.name}</td>
              {row.byType.map((days, index) => <td key={availableTypes[index]} className={`py-1.5 px-2 text-right tabular-nums ${days ? "text-slate-800" : "text-slate-300"}`}>{days}</td>)}
              <td className="py-1.5 pl-2 text-right font-bold tabular-nums">{row.total}</td>
            </tr>)}</tbody>
          </table></div> : <p className="text-sm text-slate-400 text-center py-4">{dt("No employees match these filters")}</p>}
          {peopleRows.length > 6 && <button type="button" className="mt-2 text-sm text-cyan-700 underline" onClick={() => setShowAllPeople(v => !v)}>{showAllPeople ? dt("Show fewer") : dt("Show all {0}", [peopleRows.length])}</button>}
        </Card>

        {showQuota && <>
        <Card title={dt("Annual leave used")} hint={dt("Full year · top 4 by allowance used")}>
          <div className="space-y-2">
            {quotaUsage.length === 0 && (
              <p className="text-xs text-slate-400 italic font-medium py-6 text-center">{dt("No annual leave recorded")}</p>
            )}
            {quotaUsage.map((row) => {
              const over = row.remaining < 0;
              const width = Math.min(100, row.percent);
              return (
                <div key={row.empCode || row.name}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[11px] font-extrabold text-slate-700 truncate">
                      {row.name}
                      <span className="ml-1.5 font-mono text-[10px] text-slate-400">{row.empCode}</span>
                    </span>
                    <span className={`text-[11px] font-extrabold shrink-0 ${over ? "text-rose-600" : "text-slate-500"}`}>
                      {row.used} / {row.granted}{dt("d")} {over && <span className="ml-1">{dt("· over")}</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, background: over ? "#CC0000" : "#D4A000" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          title={newJoiners.length > 0 ? dt("Needs attention") : dt("Over quota")}
          hint={newJoiners.length > 0 ? dt("New staff without a quota, and anyone over") : dt("Click to open the record")}
        >
          <div className="divide-y divide-slate-100 max-h-[130px] overflow-y-auto">
            {newJoiners.length === 0 && overQuota.length === 0 && (
              <p className="text-xs text-slate-400 italic font-medium py-8 text-center">{dt("All within quota")}</p>
            )}
            {newJoiners.map((employee) => (
              <button
                key={`new-${employee.id}`}
                onClick={() => onSelectEmployee(employee)}
                className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-extrabold text-slate-900 truncate">
                    {employee.nickname || employee.name}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-400 truncate">{employee.department}</span>
                </span>
                <span className="text-[10px] font-extrabold text-amber-600 shrink-0">{dt("Set quota")}</span>
              </button>
            ))}
            {overQuota.map(({ employee, type, over }) => (
              <button
                key={`${employee.id}-${type}`}
                onClick={() => onSelectEmployee(employee)}
                className="w-full flex items-center justify-between gap-2 py-2 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-extrabold text-slate-900 truncate">
                    {employee.nickname || employee.name}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-400 truncate">{employee.department}</span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${LEAVE_META[type].chip}`}>
                    {dt(LEAVE_META[type].short)}
                  </span>
                  <span className="text-[11px] font-extrabold text-rose-600">+{over}{dt("d")}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
        </>}
      </div>
    </div>
  );
}
