import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Employee } from "@/data/mockEmployees";

export interface RemoveEmployeeDialogProps {
  employee: Employee | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (employee: Employee) => void;
}

export default function RemoveEmployeeDialog({ employee, busy, onCancel, onConfirm }: RemoveEmployeeDialogProps) {
  if (!employee) return null;

  const records = employee.leaves?.length ?? 0;

  return (
    <Dialog open={!!employee} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md bg-white rounded-xl p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-slate-900">Remove from roster</DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium">
            They stop appearing in the dashboard and the team calendar.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 border border-slate-200 rounded-lg p-3">
          <p className="text-sm font-extrabold text-slate-900">
            {employee.name} <span className="text-amber-600">({employee.nickname})</span>
          </p>
          <p className="text-[11px] font-bold text-slate-500 mt-0.5">
            {employee.department}
            {employee.empCode && ` · ${employee.empCode}`}
          </p>
        </div>

        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold text-amber-900">
            Their {records} leave {records === 1 ? "record is" : "records are"} kept, not deleted. If they come back,
            they can be restored with their history intact.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="font-bold text-xs">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(employee)}
            disabled={busy}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
          >
            {busy ? "Removing…" : "Remove"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
