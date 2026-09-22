import MonthlyExportDialog from "./MonthlyExportDialog";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarDays, Palmtree, TrendingUp, Users } from "lucide-react";
import { Employee } from "@/data/mockEmployees";
import { LEAVE_META, LEAVE_TYPES, LeaveType, sumLeavesByType } from "./leaveSheetUtils";
import {
  annualQuotaUsage,
  awaitingQuota,
  busiestMonth,
  departmentTotals,
  monthlyTotals,
  overQuotaList,
} from "./overviewData";

const SERIES = {
  sick: "#CC0000",
  annual: "#D4A000",
  personal: "#0099FF",
};

const INK = "#334155";
const MUTED = "#94a3b8";
const GRID = "#e2e8f0";

export interface OverviewDashboardProps {
  employees: Employee[];
  year: string;
  departmentCount: number;
  onLeaveToday: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  exportReady: boolean;
  exportScope: string;
}

function Card({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
      <div className="mb-2.5">
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
  const tones = {
    sky: "bg-sky-50 text-[#00B5E2]",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    emerald: "bg-emerald-50 text-emerald-600",
  } as const;

  return (
    <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-xs flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900 mt-0.5">
          {value}
          {unit && <span className="text-xs font-semibold text-slate-500 ml-1">{unit}</span>}
        </p>
        <div className="text-[11px] font-medium mt-1">{detail}</div>
      </div>
      <div className={`p-3 rounded-xl shrink-0 ${tones[tone]}`}>{icon}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-[11px] font-extrabold text-slate-900 mb-1">{label}</p>
      {payload
        .filter((entry: any) => entry.value > 0)
        .map((entry: any) => (
          <p key={entry.dataKey} className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: entry.color }} />
            {entry.name}
            <span className="ml-auto pl-3 font-extrabold text-slate-900">{entry.value}d</span>
          </p>
        ))}
    </div>
  );
}

export default function OverviewDashboard({
  employees,
  year,
  departmentCount,
  onLeaveToday,
  onSelectEmployee,
  exportReady,
  exportScope,
}: OverviewDashboardProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<LeaveType[]>([...LEAVE_TYPES]);
  const months = useMemo(() => monthlyTotals(employees, year, selectedTypes), [employees, year, selectedTypes]);
  const departments = useMemo(() => departmentTotals(employees, year), [employees, year]);
  const quotaUsage = useMemo(() => annualQuotaUsage(employees, year, 6), [employees, year]);
  const overQuota = useMemo(() => overQuotaList(employees, year), [employees, year]);
  const peak = useMemo(() => busiestMonth(months), [months]);
  const newJoiners = useMemo(() => awaitingQuota(employees), [employees]);

  const totals = useMemo(() => {
    const byType = LEAVE_TYPES.map((type) => ({
      type,
      days: employees.reduce((sum, emp) => sum + sumLeavesByType(emp.leaves, type, year), 0),
    }));
    return {
      byType,
      all: Math.round(byType.reduce((sum, t) => sum + t.days, 0) * 100) / 100,
    };
  }, [employees, year]);

  const maxDepartment = departments[0]?.days ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTile
          label="Total staff"
          value={employees.length}
          unit="employees"
          tone="sky"
          icon={<Users className="w-5 h-5" />}
          detail={<span className="text-[#68BD24] font-bold">Across {departmentCount} departments</span>}
        />
        <StatTile
          label="On leave today"
          value={onLeaveToday.length}
          unit="staff"
          tone="amber"
          icon={<Palmtree className="w-5 h-5" />}
          detail={
            <span className="text-slate-500 truncate block max-w-[190px]">
              {onLeaveToday.length > 0 ? onLeaveToday.map((e) => e.nickname).join(", ") : "Nobody is off today"}
            </span>
          }
        />
        <StatTile
          label={newJoiners.length > 0 ? "Quota not set" : "Quota warnings"}
          value={newJoiners.length > 0 ? newJoiners.length : overQuota.length}
          unit={newJoiners.length > 0 ? "new staff" : "alerts"}
          tone={newJoiners.length > 0 ? "amber" : "rose"}
          icon={<AlertTriangle className="w-5 h-5" />}
          detail={
            newJoiners.length > 0 ? (
              <span className="text-amber-600 font-bold truncate block max-w-[190px]">
                {newJoiners.map((e) => e.nickname || e.name).join(", ")}
              </span>
            ) : overQuota.length > 0 ? (
              <span className="text-rose-600 font-bold">Needs review</span>
            ) : (
              <span className="text-emerald-600 font-bold">Everyone within quota</span>
            )
          }
        />
        <StatTile
          label={`Total days taken (${year})`}
          value={totals.all}
          unit="days"
          tone="emerald"
          icon={<CalendarDays className="w-5 h-5" />}
          detail={
            <span className="text-slate-500">
              {totals.byType.map((t, i) => (
                <span key={t.type}>
                  {i > 0 && " · "}
                  {LEAVE_META[t.type].short} {Math.round(t.days * 100) / 100}d
                </span>
              ))}
            </span>
          }
        />
      </div>

      <Card
        title={`Leave taken each month in ${year}`}
        hint={selectedTypes.length === 0 ? "Select at least one leave type" : peak ? `Busiest month is ${peak.month} with ${peak.total} days · selected types, approved leave` : "No approved leave for the selected types"}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Monthly chart leave types">
          <button type="button" aria-pressed={selectedTypes.length === LEAVE_TYPES.length} onClick={() => setSelectedTypes([...LEAVE_TYPES])} className="rounded-md border px-3 py-1.5 text-xs font-bold">All types</button>
          {LEAVE_TYPES.map((type) => (
            <button type="button" key={type} aria-pressed={selectedTypes.includes(type)} onClick={() => setSelectedTypes(current => current.includes(type) ? current.filter(t => t !== type) : LEAVE_TYPES.filter(t => current.includes(t) || t === type))}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold ${selectedTypes.includes(type) ? "bg-slate-100 border-slate-400 text-slate-900" : "text-slate-400 border-slate-200"}`}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES[type], opacity: selectedTypes.includes(type) ? 1 : 0.3 }} />
              {LEAVE_META[type].label}{selectedTypes.includes(type) ? " ✓" : ""}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-xs text-slate-500">Toggle leave types to filter this chart. Department and search filters also apply.</p>
          <button type="button" className="border rounded-md px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => setExportOpen(true)}>Monthly export</button>
        </div>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barSize={22}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: MUTED, fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: MUTED, fontWeight: 700 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
            {selectedTypes.map((type, index) => <Bar key={type} dataKey={type} stackId="a" name={LEAVE_META[type].short} fill={SERIES[type]} stroke="#fff" strokeWidth={2} radius={index === selectedTypes.length - 1 ? [4,4,0,0] : [0,0,0,0]} isAnimationActive={false}>
              {index === selectedTypes.length - 1 && <LabelList dataKey="total" position="top" formatter={(v: number) => v > 0 ? v : ""} style={{fontSize:10,fontWeight:800,fill:INK}} />}
            </Bar>)}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {exportOpen && <MonthlyExportDialog employees={employees} year={year} initialTypes={selectedTypes} scope={exportScope} ready={exportReady} onClose={() => setExportOpen(false)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Days taken by department" hint="Total across all leave types">
          <ResponsiveContainer width="100%" height={Math.max(170, departments.length * 26)}>
            <BarChart data={departments} layout="vertical" margin={{ top: 0, right: 44, left: 8, bottom: 0 }} barSize={11}>
              <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: MUTED, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="department"
                width={92}
                interval={0}
                tick={{ fontSize: 10, fill: INK, fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.12)" }}
                content={({ active, payload }: any) =>
                  active && payload?.length ? (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
                      <p className="text-[11px] font-extrabold text-slate-900">{payload[0].payload.department}</p>
                      <p className="text-[11px] font-semibold text-slate-600">
                        {payload[0].payload.days} days · {payload[0].payload.headcount} staff
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600">
                        {payload[0].payload.perPerson} days per person
                      </p>
                    </div>
                  ) : null
                }
              />
              <Bar dataKey="days" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {departments.map((row) => (
                  <Cell
                    key={row.department}
                    fill="#0099FF"
                    fillOpacity={maxDepartment ? 0.35 + (row.days / maxDepartment) * 0.65 : 0.6}
                  />
                ))}
                <LabelList
                  dataKey="days"
                  position="right"
                  style={{ fontSize: 10, fontWeight: 800, fill: INK }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Annual leave used" hint="Highest usage first, out of each person's own allowance">
          <div className="space-y-2">
            {quotaUsage.length === 0 && (
              <p className="text-xs text-slate-400 italic font-medium py-6 text-center">No annual leave recorded</p>
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
                      {row.used} / {row.granted}d
                      {over && <span className="ml-1">· over</span>}
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
          title={newJoiners.length > 0 ? "Needs attention" : "Over quota"}
          hint={newJoiners.length > 0 ? "New staff without a quota, and anyone over" : "Click to open the record"}
        >
          <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
            {newJoiners.length === 0 && overQuota.length === 0 && (
              <p className="text-xs text-slate-400 italic font-medium py-8 text-center">All within quota</p>
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
                <span className="text-[10px] font-extrabold text-amber-600 shrink-0">Set quota</span>
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
                    {LEAVE_META[type].short}
                  </span>
                  <span className="text-[11px] font-extrabold text-rose-600">+{over}d</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
