import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Employee } from "@/data/mockEmployees";
import { searchEmployees } from "@/lib/employeeMatch";
import { LEAVE_META, LEAVE_TYPES, LeaveType, formatSheetDate, normalizeDateInput } from "./leaveSheetUtils";

export interface QuickAddLeaveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  defaultYear: string;
  onSubmit: (empId: string, draft: { date: string; type: LeaveType; days: number; note: string }) => void;
}

const DAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Full day" },
  { value: 0.5, label: "Half day" },
  { value: 0.25, label: "Quarter" },
];

export default function QuickAddLeaveModal({
  open,
  onOpenChange,
  employees,
  defaultYear,
  onSubmit,
}: QuickAddLeaveModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [type, setType] = useState<LeaveType>("annual");
  const [days, setDays] = useState<number>(1);
  const [dateInput, setDateInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    if (selected) return [];
    return searchEmployees(employees, query).slice(0, 6);
  }, [employees, query, selected]);

  const normalizedDate = normalizeDateInput(dateInput, defaultYear);

  const reset = () => {
    setQuery("");
    setSelected(null);
    setType("annual");
    setDays(1);
    setDateInput("");
    setNote("");
    setError("");
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = () => {
    if (!selected) {
      setError("Choose an employee from the list");
      return;
    }
    if (!normalizedDate) {
      setError("Enter a valid date, for example 2026-08-25 or 25 Aug 26");
      return;
    }
    onSubmit(selected.id, { date: normalizedDate, type, days, note });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-white rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-slate-900">Add leave record</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            Search by employee number, name or nickname, then pick from the list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Employee</label>
            {selected ? (
              <div className="mt-1 flex items-center justify-between gap-2 border border-[#00B5E2] bg-sky-50 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900 truncate">
                    {selected.name} <span className="text-amber-600">({selected.nickname})</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-500">
                    {selected.empCode} &bull; {selected.department}
                  </p>
                </div>
                <button
                  onClick={() => { setSelected(null); setQuery(""); }}
                  className="text-slate-400 hover:text-rose-600 shrink-0"
                  aria-label="Clear selected employee"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mt-1">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setError(""); }}
                    placeholder="TBS-001, Julian, Kochakorn…"
                    className="pl-9 h-10 text-sm font-semibold"
                  />
                </div>
                {query && (
                  <div className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {matches.length === 0 && (
                      <p className="px-3 py-3 text-xs text-slate-400 italic font-medium">No employee matches</p>
                    )}
                    {matches.map((emp) => (
                      <button
                        key={emp.id}
                        onClick={() => { setSelected(emp); setError(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-extrabold text-slate-900 truncate">
                            {emp.name} <span className="text-amber-600">({emp.nickname})</span>
                          </span>
                          <span className="block text-[10px] font-bold text-slate-400">{emp.department}</span>
                        </span>
                        <span className="text-[10px] font-mono font-extrabold text-[#00B5E2] shrink-0">{emp.empCode}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Leave type</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {LEAVE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`h-10 rounded-lg text-xs font-extrabold border transition-colors ${
                    type === t
                      ? `${LEAVE_META[t].chip} border-transparent`
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {LEAVE_META[t].short}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Date</label>
              <Input
                value={dateInput}
                onChange={(e) => { setDateInput(e.target.value); setError(""); }}
                placeholder="2026-08-25"
                className="mt-1 h-10 text-sm font-semibold"
              />
              <p className="text-[10px] font-bold mt-1 h-3">
                {dateInput && normalizedDate && (
                  <span className="text-emerald-600 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> {formatSheetDate(normalizedDate)}
                  </span>
                )}
                {dateInput && !normalizedDate && <span className="text-rose-600">Unrecognised date</span>}
              </p>
            </div>

            <div>
              <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Duration</label>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {DAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDays(opt.value)}
                    className={`h-10 rounded-lg text-[11px] font-extrabold border transition-colors ${
                      days === opt.value
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Reason / notes</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="mt-1 h-10 text-sm"
            />
          </div>

          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={() => close(false)} className="font-bold text-xs">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!selected || !normalizedDate}
            className="bg-[#00B5E2] hover:bg-[#0099c4] text-white font-bold text-xs disabled:opacity-40"
          >
            Add record
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
