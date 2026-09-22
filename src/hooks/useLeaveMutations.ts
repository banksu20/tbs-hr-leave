import { conflictingLeave } from "@/lib/leaveConflicts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Employee, LeaveRecord } from "@/data/mockEmployees";
import { ApiError, NetworkError, createLeave, deleteLeave, setEmployeeStatus, updateEmployeeProfile, updateLeave, updateQuota } from "@/lib/api";

export interface LeaveDraftInput {
  empId: string;
  date: string;
  type: LeaveRecord["type"];
  days: number;
  note: string;
  halfDayPeriod?: "morning" | "afternoon" | null;
}

function describe(error: unknown): string {
  if (error instanceof NetworkError) return "Cannot reach the server";
  if (error instanceof ApiError) {
    if (error.status === 503) return "That workflow is not set up in n8n yet";
    if (error.status === 502) return "n8n did not respond";
    if (error.status === 409) return error.message || "This request changed. Refresh before saving.";
    return error.issues?.[0] ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useLeaveMutations(year: string) {
  const queryClient = useQueryClient();
  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["employees"] }), queryClient.invalidateQueries({ queryKey: ["history"] })]);

  const checkConflicts = (empId: string | undefined, dates: string[], days: number, period?: string | null, requestId?: string) => {
    const cached = queryClient.getQueriesData<{employees: Employee[]}>({queryKey:["employees"]});
    const leaves = cached.flatMap(([,data]) => data?.employees.filter(e => empId ? e.id === empId : e.leaves.some(l => l.requestId === requestId)).flatMap(e => e.leaves) ?? []);
    const conflicts = conflictingLeave(leaves, dates, days, period, requestId);
    if (conflicts.length) throw new ApiError(409, `Overlapping leave exists on ${[...new Set(conflicts.map(l => l.date))].join(", ")}. Review the existing request before saving.`);
  };

  const create = useMutation({
    mutationFn: (draft: LeaveDraftInput) => {
      checkConflicts(draft.empId, [draft.date], draft.days, draft.halfDayPeriod);
      return createLeave({
        userId: draft.empId,
        date: draft.date,
        type: draft.type,
        days: draft.days,
        note: draft.note,
        halfDayPeriod: draft.halfDayPeriod,
      });
    },
    onSuccess: async () => {
      toast.success("Saved to the server");
      await invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateLeave>[1] }) =>
      { if (patch.status !== "Rejected") checkConflicts(undefined, patch.dates, patch.daysPerDate, patch.halfDayPeriod, id);
        return updateLeave(id, patch); },
    onSuccess: async () => {
      toast.success("Saved");
      await invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const remove = useMutation({
    mutationFn: ({ id, expectedDates, expectedRevision }: { id: string; expectedDates: string[]; expectedRevision: string }) => deleteLeave(id, { scope: "request", expectedDates, expectedRevision }),
    onSuccess: async () => {
      toast.success("Removed");
      await invalidate();
    },
    onError: (error) => toast.error(`Not removed: ${describe(error)}`),
  });

  const profile = useMutation({
    mutationFn: ({
      employee,
      patch,
    }: {
      employee: Employee;
      patch: { empCode?: string; name?: string; nickname?: string; department?: string };
    }) => updateEmployeeProfile({ userId: employee.id, ...patch }),
    onSuccess: async () => {
      toast.success("Profile saved");
      await invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const quota = useMutation({
    mutationFn: ({
      employee,
      patch,
    }: {
      employee: Employee;
      patch: { annualTotal?: number; sickTotal?: number; personalTotal?: number; carriedOver?: number; note?: string };
    }) => updateQuota({ userId: employee.id, year, ...patch }),
    onSuccess: async () => {
      toast.success("Quota saved");
      await invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const employeeStatus = useMutation({
    mutationFn: ({ employee, status }: { employee: Employee; status: "active" | "inactive" }) =>
      setEmployeeStatus(employee.id, status),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.status === "inactive"
          ? `${variables.employee.nickname || variables.employee.name} removed from the roster`
          : `${variables.employee.nickname || variables.employee.name} restored`
      );
      await invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  return {
    create,
    update,
    remove,
    profile,
    quota,
    employeeStatus,
    isSaving: create.isPending || update.isPending || remove.isPending || quota.isPending || profile.isPending || employeeStatus.isPending,
  };
}
