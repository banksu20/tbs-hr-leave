import { useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Employee } from "@/data/mockEmployees";
import { formatSheetDate } from "./leaveSheetUtils";
import EditableCell from "./EditableCell";

export interface QuotaEdit {
  annualTotal?: number;
  personalTotal?: number;
  carriedOver?: number;
  note?: string;
}

export interface ManageRosterProps {
  employees: Employee[];
  variant?: "active" | "removed";
  onQuotaChange: (employee: Employee, patch: QuotaEdit) => void;
  onSetStatus: (employee: Employee, status: "active" | "inactive") => void;
  onOpenSheet: (employee: Employee) => void;
}

const HEAD = "py-2.5 px-3 text-left font-extrabold text-slate-600 uppercase tracking-wide text-[10px] border-b border-slate-200";

export default function ManageRoster({
  employees,
  variant = "active",
  onQuotaChange,
  onSetStatus,
  onOpenSheet,
}: ManageRosterProps) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.nickname.toLowerCase().includes(q) ||
          e.empCode.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q)
      );
  }, [employees, query]);

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">
            {variant === "removed" ? "Removed staff" : "Manage roster"}
          </h2>
          <p className="text-[11px] font-semibold text-slate-400">
            {variant === "removed"
              ? "They keep their leave history. Restore to bring them back."
              : "Click a quota number or note to edit it"}
          </p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, nickname, code…"
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className={`${HEAD} w-24`}>Code</th>
                <th className={HEAD}>Employee</th>
                <th className={`${HEAD} w-28`}>Department</th>
                <th className={`${HEAD} w-24`}>Started</th>
                <th className={`${HEAD} w-20 text-center`}>Annual</th>
                <th className={`${HEAD} w-20 text-center`}>Personal</th>
                <th className={`${HEAD} w-20 text-center`}>Carried</th>
                <th className={`${HEAD} min-w-[150px]`}>Quota note</th>
                <th className={`${HEAD} w-28 text-center`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400 italic font-medium">
                    {variant === "removed" ? "Nobody has been removed" : "No employees match"}
                  </td>
                </tr>
              )}

              {rows.map((emp) => {
                const inactive = emp.status === "inactive";
                const needsQuota = emp.quotas.annualTotal === 0;

                return (
                  <tr key={emp.id} className={`hover:bg-slate-50/70 ${inactive ? "bg-rose-50/40" : ""}`}>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md font-mono font-extrabold text-[11px] border ${
                          inactive
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {emp.empCode || "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <button onClick={() => onOpenSheet(emp)} className="text-left group">
                        <span className="block font-extrabold text-slate-900 group-hover:text-[#00B5E2] truncate">
                          {emp.name} <span className="text-amber-600">({emp.nickname})</span>
                        </span>
                        {needsQuota && !inactive && (
                          <span className="text-[10px] font-extrabold text-amber-600">Quota not set</span>
                        )}
                      </button>
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-600">
                      {emp.department}
                      {inactive && (
                        <span className="ml-1.5 text-[10px] font-extrabold text-rose-600 uppercase">removed</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-500">
                      {emp.startDate ? formatSheetDate(emp.startDate) : "—"}
                    </td>

                    {(["annualTotal", "personalTotal", "carriedOver"] as const).map((field) => (
                      <td key={field} className="py-1 px-1">
                        <EditableCell
                          gridId={`roster-${emp.id}`}
                          cellId={`c:0:${field === "annualTotal" ? 0 : field === "personalTotal" ? 1 : 2}`}
                          align="center"
                          value={emp.quotas[field] === null || emp.quotas[field] === undefined ? "" : String(emp.quotas[field])}
                          placeholder="∞"
                          displayClassName={`font-extrabold ${
                            field === "annualTotal" && needsQuota ? "text-amber-600" : "text-slate-800"
                          }`}
                          onCommit={(raw) => {
                            const parsed = Number(raw);
                            if (!raw.trim() || Number.isNaN(parsed) || parsed < 0) return;
                            if (parsed === (emp.quotas[field] ?? 0)) return;
                            onQuotaChange(emp, { [field]: parsed });
                          }}
                        />
                      </td>
                    ))}

                    <td className="py-1 px-1">
                      <EditableCell
                        gridId={`roster-note-${emp.id}`}
                        cellId="c:0:0"
                        value={emp.quotaNote ?? ""}
                        placeholder="Add a note"
                        title={emp.quotaNote}
                        displayClassName="text-rose-600 font-medium italic"
                        onCommit={(note) => {
                          if (note !== (emp.quotaNote ?? "")) onQuotaChange(emp, { note });
                        }}
                      />
                    </td>

                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {inactive ? (
                          <button
                            onClick={() => onSetStatus(emp, "active")}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-extrabold text-[11px] flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => onSetStatus(emp, "inactive")}
                            title="Remove from roster"
                            className="p-1.5 text-slate-300 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
