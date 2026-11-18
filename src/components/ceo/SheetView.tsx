import {useMemo,useState} from "react";
import {Search} from "lucide-react";
import {useDashboardText} from "@/hooks/useDashboardText";
import { Employee, LeaveRecord } from "@/data/mockEmployees";
import EmployeeSheetBlock from "./EmployeeSheetBlock";
import { LeaveType, grantedFor, isUnlimited, sumLeavesByType } from "./leaveSheetUtils";

export interface SheetViewProps {
  employees: Employee[];
  year: string;
  compact: boolean;
  onToggleCompact?: (compact: boolean) => void;
  hideSearch?: boolean;
  onUpdateLeave: (empId: string, leaveId: string, patch: Partial<LeaveRecord>) => void;
  onAddLeave: (empId: string, draft: { date: string; type: LeaveType; days: number; note: string }) => Promise<void>;
  onDeleteLeave: (empId: string, leaveId: string) => void;
  onEditProfile: (emp: Employee) => void;
  onQuotaNoteChange?: (empId: string, note: string) => Promise<void>;
  onAnnualQuotaChange?: (emp: Employee, annualTotal: number) => Promise<unknown>;
  onRemoveEmployee?: (emp: Employee) => void;
}

type Show = "all" | "leave" | "over";

function isOver(employee: Employee, year: string) {
  if (employee.internshipBalances?.length) return employee.internshipBalances.some(b => b.approved + b.pending > b.total);
  if (employee.employmentType === "intern") return false;
  return (["sick", "annual", "personal"] as const).some(type => !isUnlimited(employee, type) && sumLeavesByType(employee.leaves, type, year) > grantedFor(employee, type));
}

export default function SheetView({ employees, year, compact, onToggleCompact, hideSearch, ...handlers }: SheetViewProps) {
  const dt = useDashboardText();
  const [search, setSearch] = useState(""), [show, setShow] = useState<Show>("all");
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter(e => (!query || (e.name + " " + e.nickname + " " + e.empCode + " " + e.department).toLowerCase().includes(query))
      && (show === "all" || (show === "leave" && e.leaves.some(l => l.date.startsWith(year))) || (show === "over" && isOver(e, year))));
  }, [employees, search, show, year]);

  if (employees.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 font-medium italic">
         {dt("No matching employee records found.")} </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hideSearch && <label className="relative flex-1 min-w-56 sm:max-w-sm"><Search aria-hidden className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/><input aria-label={dt("Search sheets")} placeholder={dt("Search name, nickname, code…")} className="border rounded-lg py-2.5 pl-9 pr-3 w-full bg-white" value={search} onChange={e => setSearch(e.target.value)}/></label>}
        <select aria-label={dt("Show")} className="border rounded-lg p-2.5 bg-white" value={show} onChange={e => setShow(e.target.value as Show)}>
          <option value="all">{dt("Show: everyone")}</option>
          <option value="leave">{dt("Show: with leave this year")}</option>
          <option value="over">{dt("Show: over allowance")}</option>
        </select>
        {onToggleCompact && <div role="group" aria-label={dt("Toggle row density")} className="inline-flex rounded-lg border bg-white overflow-hidden ml-auto">
          {([false, true] as const).map(value => <button key={String(value)} type="button" aria-pressed={compact === value} onClick={() => onToggleCompact(value)} className={`px-3 py-2 text-sm ${compact === value ? "bg-cyan-600 text-white" : "hover:bg-slate-50"}`}>{value ? dt("Compact") : dt("Comfortable")}</button>)}
        </div>}
      </div>
      <p className="text-sm text-slate-500">{dt("Showing {0} of {1} sheets. Click a cell to edit; changes are saved to the HR records.", [shown.length, employees.length])}</p>
      {!shown.length && <p className="border border-dashed rounded-xl p-8 text-center text-slate-500 bg-white">{dt("No matching employee records found.")}</p>}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${employees.some(e=>e.employmentType==="intern")?"":"xl:grid-cols-3"} gap-5 items-start`}>
        {shown.map((emp) => (
          <EmployeeSheetBlock key={emp.id} employee={emp} year={year} compact={compact} {...handlers} />
        ))}
      </div>
    </section>
  );
}
