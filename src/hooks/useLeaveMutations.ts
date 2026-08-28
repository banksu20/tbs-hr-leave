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
}

function describe(error: unknown): string {
  if (error instanceof NetworkError) return "Cannot reach the server";
  if (error instanceof ApiError) {
    if (error.status === 503) return "That workflow is not set up in n8n yet";
    if (error.status === 502) return "n8n did not respond";
    if (error.status === 409) return "That employee already has leave on that date";
    return error.issues?.[0] ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useLeaveMutations(year: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["employees", year] });

  const create = useMutation({
    mutationFn: (draft: LeaveDraftInput) =>
      createLeave({
        userId: draft.empId,
        date: draft.date,
        type: draft.type,
        days: draft.days,
        note: draft.note,
      }),
    onSuccess: () => {
      toast.success("Saved to the server");
      invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateLeave>[1] }) =>
      updateLeave(id, patch),
    onSuccess: () => {
      toast.success("Saved");
      invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLeave(id),
    onSuccess: () => {
      toast.success("Removed");
      invalidate();
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
    onSuccess: () => {
      toast.success("Profile saved");
      invalidate();
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
    onSuccess: () => {
      toast.success("Quota saved");
      invalidate();
    },
    onError: (error) => toast.error(`Not saved: ${describe(error)}`),
  });

  const employeeStatus = useMutation({
    mutationFn: ({ employee, status }: { employee: Employee; status: "active" | "inactive" }) =>
      setEmployeeStatus(employee.id, status),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === "inactive"
          ? `${variables.employee.nickname || variables.employee.name} removed from the roster`
          : `${variables.employee.nickname || variables.employee.name} restored`
      );
      invalidate();
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
