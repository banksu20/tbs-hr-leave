import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeaveRequestUpdate } from "@/lib/api";
import { normalizeDateInput } from "./leaveSheetUtils";

export interface LeaveRecordDialogProps {
  initial: LeaveRequestUpdate;
  employeeName: string;
  creating?: boolean;
  onClose: () => void;
  onSave: (value: LeaveRequestUpdate) => Promise<void>;
}

export default function LeaveRecordDialog({ initial, employeeName, creating, onClose, onSave }: LeaveRecordDialogProps) {
  const [form, setForm] = useState(initial);
  const [datesText, setDatesText] = useState(initial.dates.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-lg bg-white">
      <DialogHeader>
        <DialogTitle>{creating ? "Add leave" : "Edit leave request"} — {employeeName}</DialogTitle>
        <DialogDescription>
          {initial.expectedDates.length > 1
            ? `This is one request covering ${initial.expectedDates.length} dates. Saving updates the entire request, including dates outside the selected year.`
            : "Choose the leave date, duration and period before saving."}
        </DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        const dates = datesText.split(/[,\n]+/).map((text) => normalizeDateInput(text.trim(), initial.dates[0].slice(0, 4)));
        if (dates.some((date) => !date) || new Set(dates).size !== dates.length || (creating && dates.length !== 1)) {
          setError(creating ? "Enter one valid date." : "Enter valid, unique dates separated by commas."); return;
        }
        if (form.daysPerDate === 0.5 && !form.halfDayPeriod) { setError("Choose morning or afternoon."); return; }
        setBusy(true); setError("");
        try { await onSave({ ...form, dates: dates as string[] }); onClose(); }
        catch { setError("Not saved. Your entries are retained; check the error message and retry."); }
        finally { setBusy(false); }
      }}>
        <label className="block text-sm">Dates (YYYY-MM-DD, separated by commas)
          <textarea className="w-full border rounded p-2 mt-1" value={datesText} onChange={(e) => setDatesText(e.target.value)} disabled={busy} required />
        </label>
        <label className="block text-sm">Leave type
          <select className="w-full border rounded p-2" value={form.type} disabled={busy} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveRequestUpdate["type"] })}>
            <option value="annual">Annual</option><option value="sick">Sick</option><option value="personal">Personal</option>
          </select>
        </label>
        <label className="block text-sm">Duration on each date
          <select className="w-full border rounded p-2" value={form.daysPerDate} disabled={busy} onChange={(e) => setForm({ ...form, daysPerDate: Number(e.target.value), halfDayPeriod: null })}>
            <option value={1}>Full day</option><option value={0.5}>Half day</option><option value={0.25}>Quarter day</option>
          </select>
        </label>
        {form.daysPerDate === 0.5 && <label className="block text-sm">Half-day period
          <select className="w-full border rounded p-2" required value={form.halfDayPeriod ?? ""} disabled={busy} onChange={(e) => setForm({ ...form, halfDayPeriod: e.target.value as "morning" | "afternoon" })}>
            <option value="" disabled>Choose a period</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
          </select>
        </label>}
        <label className="block text-sm">Reason / notes<Input value={form.note} disabled={busy} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save request"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
