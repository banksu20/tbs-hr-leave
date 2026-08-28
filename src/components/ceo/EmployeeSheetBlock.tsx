import { useEffect, useMemo, useState } from "react";
import { Edit, Trash2 } from "lucide-react";
import { Employee, LeaveRecord } from "@/data/mockEmployees";
import EditableCell from "./EditableCell";
import {
  LEAVE_META,
  LEAVE_TYPES,
  LeaveType,
  formatSheetDate,
  grantedFor,
  isUnlimited,
  needsQuotaReview,
  leavesForYear,
  normalizeDateInput,
  sumLeavesByType,
} from "./leaveSheetUtils";

export interface EmployeeSheetBlockProps {
  employee: Employee;
  year: string;
  compact?: boolean;
  onUpdateLeave: (empId: string, leaveId: string, patch: Partial<LeaveRecord>) => void;
  onAddLeave: (empId: string, draft: { date: string; type: LeaveType; days: number; note: string }) => void;
  onDeleteLeave: (empId: string, leaveId: string) => void;
  onEditProfile: (emp: Employee) => void;
  onQuotaNoteChange?: (empId: string, note: string) => void;
  onRemoveEmployee?: (emp: Employee) => void;
}

const EMPTY_DRAFT = { date: "", sick: "", annual: "", personal: "", note: "" };

export default function EmployeeSheetBlock({
  employee,
  year,
  compact = false,
  onUpdateLeave,
  onAddLeave,
  onDeleteLeave,
  onEditProfile,
  onQuotaNoteChange,
  onRemoveEmployee,
}: EmployeeSheetBlockProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [noteDraft, setNoteDraft] = useState(employee.quotaNote ?? "");

  useEffect(() => {
    setNoteDraft(employee.quotaNote ?? "");
  }, [employee.quotaNote]);
  const gridId = `sheet-${employee.id}`;
  const rows = useMemo(() => leavesForYear(employee.leaves, year), [employee.leaves, year]);

  const quotasKnown = employee.quotasKnown !== false;
  const quotaReview = needsQuotaReview(employee);
  const totals = LEAVE_TYPES.map((type) => {
    const unlimited = isUnlimited(employee, type);
    const granted = grantedFor(employee, type);
    const taken = sumLeavesByType(employee.leaves, type, year);
    return { type, granted, taken, remain: granted - taken, unlimited };
  });

  const overQuota = quotasKnown && !quotaReview && totals.some((t) => !t.unlimited && t.remain < 0);
  const rowPad = compact ? "py-0.5" : "py-1.5";

  const commitDraft = (next: typeof EMPTY_DRAFT) => {
    setDraft(next);
    const date = normalizeDateInput(next.date, year);
    if (!date) return;
    const entered = LEAVE_TYPES.map((t) => ({ type: t, days: parseFloat(next[t]) || 0 })).filter((e) => e.days > 0);
    if (entered.length === 0) return;
    entered.forEach((e) => onAddLeave(employee.id, { date, type: e.type, days: e.days, note: next.note }));
    setDraft(EMPTY_DRAFT);
  };

  const updateDays = (leave: LeaveRecord, type: LeaveType, raw: string) => {
    const days = parseFloat(raw);
    if (!raw.trim() || isNaN(days) || days <= 0) {
      if (leave.type === type) onDeleteLeave(employee.id, leave.id);
      return;
    }
    onUpdateLeave(employee.id, leave.id, { type, days });
  };

  return (
    <section
      className={`w-full min-w-0 bg-white rounded-xl border shadow-xs flex flex-col overflow-hidden ${
        quotaReview
          ? "border-amber-300 ring-1 ring-amber-200"
          : overQuota
            ? "border-rose-300 ring-1 ring-rose-200"
            : "border-slate-200"
      }`}
    >
      <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold truncate">
            {employee.name} <span className="text-[#F5A623]">({employee.nickname})</span>
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate">
            {[
              employee.department,
              employee.empCode || null,
              employee.startDate ? `since ${formatSheetDate(employee.startDate)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {!employee.empCode && (
              <span className="ml-1.5 text-amber-400" title="This employee has no employee number">
                no number
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {quotaReview && (
            <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Set quota
            </span>
          )}
          {overQuota && !quotaReview && (
            <span className="inline-flex items-center gap-1 bg-rose-500/15 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Over Quota
            </span>
          )}
          <button
            onClick={() => onEditProfile(employee)}
            className="text-slate-400 hover:text-white transition-colors"
            title="Edit profile & quotas"
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          {onRemoveEmployee && (
            <button
              onClick={() => onRemoveEmployee(employee)}
              className="text-slate-500 hover:text-rose-400 transition-colors"
              title="Remove from roster"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </header>

      <div className="grow overflow-auto max-h-[420px]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="sticky left-0 z-10 bg-slate-50 text-left font-extrabold text-slate-600 uppercase tracking-wide text-[10px] px-2 py-2 border-r border-slate-200 w-24">
                Date
              </th>
              {LEAVE_TYPES.map((type) => (
                <th key={type} className={`px-2 py-2 border-r border-slate-200 w-[56px] ${LEAVE_META[type].band}`}>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${LEAVE_META[type].chip}`}>
                    {LEAVE_META[type].short}
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-left font-extrabold text-slate-600 uppercase tracking-wide text-[10px] min-w-[110px]">
                Reason / Notes
              </th>
              <th className="w-8" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400 italic font-medium">
                  No leave records in {year}
                </td>
              </tr>
            )}

            {rows.map((leave, rowIdx) => (
              <tr key={leave.id} className="group hover:bg-slate-50/80">
                <td className={`sticky left-0 z-10 bg-white group-hover:bg-slate-50/80 border-r border-slate-200 px-1 ${rowPad}`}>
                  <EditableCell
                    gridId={gridId}
                    cellId={`c:${rowIdx}:0`}
                    value={leave.date}
                    placeholder="YYYY-MM-DD"
                    displayClassName="font-semibold text-slate-800"
                    format={(v) => formatSheetDate(v)}
                    onCommit={(raw) => {
                      const date = normalizeDateInput(raw, year);
                      if (date) onUpdateLeave(employee.id, leave.id, { date });
                    }}
                  />
                </td>

                {LEAVE_TYPES.map((type, colIdx) => (
                  <td key={type} className={`border-r border-slate-200 px-1 ${rowPad} ${LEAVE_META[type].band}`}>
                    <EditableCell
                      gridId={gridId}
                      cellId={`c:${rowIdx}:${colIdx + 1}`}
                      align="center"
                      value={leave.type === type ? String(leave.days) : ""}
                      placeholder=""
                      displayClassName={`font-extrabold ${LEAVE_META[type].text}`}
                      inputClassName={LEAVE_META[type].text}
                      onCommit={(raw) => updateDays(leave, type, raw)}
                    />
                  </td>
                ))}

                <td className={`px-1 ${rowPad}`}>
                  <EditableCell
                    gridId={gridId}
                    cellId={`c:${rowIdx}:4`}
                    value={leave.note || ""}
                    placeholder="Add a note"
                    title={leave.note}
                    displayClassName="text-rose-600 font-medium italic"
                    onCommit={(note) => onUpdateLeave(employee.id, leave.id, { note })}
                  />
                </td>

                <td className="text-center">
                  <button
                    onClick={() => onDeleteLeave(employee.id, leave.id)}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-300 hover:text-rose-600 transition-opacity"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}

            <tr className="bg-sky-50/40 border-t border-dashed border-slate-300">
              <td className="sticky left-0 z-10 bg-sky-50/40 border-r border-slate-200 px-1 py-1.5">
                <EditableCell
                  gridId={gridId}
                  cellId={`c:${rows.length}:0`}
                  value={draft.date}
                  placeholder="+ Add date"
                  displayClassName="font-semibold text-[#00B5E2]"
                  format={(v) => formatSheetDate(v)}
                  onCommit={(v) => commitDraft({ ...draft, date: v })}
                />
              </td>
              {LEAVE_TYPES.map((type, colIdx) => (
                <td key={type} className={`border-r border-slate-200 px-1 py-1.5 ${LEAVE_META[type].band}`}>
                  <EditableCell
                    gridId={gridId}
                    cellId={`c:${rows.length}:${colIdx + 1}`}
                    align="center"
                    value={draft[type]}
                    displayClassName={`font-extrabold ${LEAVE_META[type].text}`}
                    inputClassName={LEAVE_META[type].text}
                    onCommit={(v) => commitDraft({ ...draft, [type]: v })}
                  />
                </td>
              ))}
              <td className="px-1 py-1.5" colSpan={2}>
                <EditableCell
                  gridId={gridId}
                  cellId={`c:${rows.length}:4`}
                  value={draft.note}
                  placeholder="Reason / notes"
                  displayClassName="text-rose-600 font-medium italic"
                  onCommit={(v) => commitDraft({ ...draft, note: v })}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="border-t border-slate-200 bg-slate-50">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {(["granted", "taken", "remain"] as const).map((key) => (
              <tr key={key} className={key === "remain" ? "bg-slate-100 border-t border-slate-200" : ""}>
                <td className="px-2 py-1.5 w-24 border-r border-slate-200 font-extrabold text-slate-500 uppercase tracking-wide text-[10px]">
                  {key === "granted" ? "Quota" : key === "taken" ? `Taken ${year}` : "Remain"}
                  {!quotasKnown && key === "granted" && (
                    <span className="ml-1 text-amber-500 normal-case font-bold" title="Quota is not stored in the database yet">not set</span>
                  )}
                </td>
                {totals.map((t) => (
                  <td
                    key={t.type}
                    className={`px-2 py-1.5 w-[56px] text-center border-r border-slate-200 font-extrabold ${
                      key === "remain" && t.remain < 0 ? "text-rose-600" : LEAVE_META[t.type].text
                    } ${key === "granted" ? "text-slate-500" : ""}`}
                  >
                    {quotasKnown && !t.unlimited && key === "remain" && t.remain < 0 && <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 mr-1 align-middle" />}
                    {key === "taken"
                      ? t.taken
                      : t.unlimited
                        ? <span className="text-slate-400" title="No limit on sick leave">∞</span>
                        : quotasKnown
                          ? t[key]
                          : <span className="text-slate-300">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-[10px] font-bold text-slate-400" colSpan={2}>
                  {key === "granted" && (
                    <input
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onBlur={() => {
                        if (noteDraft !== (employee.quotaNote ?? "")) onQuotaNoteChange?.(employee.id, noteDraft);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setNoteDraft(employee.quotaNote ?? "");
                      }}
                      placeholder="Quota note"
                      title={noteDraft}
                      className="w-full h-6 px-1.5 rounded-sm bg-transparent border border-transparent text-[10px] font-semibold text-rose-600 truncate hover:border-slate-300 hover:bg-white focus:bg-white focus:border-[#00B5E2] focus:outline-none"
                    />
                  )}
                  {key === "taken" && employee.quotas.carriedOver > 0 ? `+${employee.quotas.carriedOver} carried over` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </footer>
    </section>
  );
}
