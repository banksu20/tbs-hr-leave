import { Employee, LeaveRecord } from "@/data/mockEmployees";

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues?: string[]) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : "network request failed");
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, `server returned non-JSON: ${text.slice(0, 120)}`);
    }
  }

  if (!response.ok) {
    const body = payload as { error?: string; issues?: string[] } | undefined;
    throw new ApiError(response.status, body?.error ?? `request failed with ${response.status}`, body?.issues);
  }

  return payload as T;
}

export interface ApiLeaveRecord {
  id: string;
  date: string;
  type: LeaveRecord["type"];
  days: number;
  note: string;
  status: LeaveRecord["status"];
  halfDayPeriod: "morning" | "afternoon" | null;
}

export interface ApiEmployee {
  id: string;
  empNo: number | null;
  empCode: string | null;
  name: string;
  nickname: string;
  department: string;
  startDate: string;
  quotas: Employee["quotas"];
  quotasKnown?: boolean;
  quotaNote?: string;
  status?: "active" | "inactive";
  leaves: ApiLeaveRecord[];
}

export interface QuotaResponse {
  year: number;
  annualTotal: number;
  sickTotal: number;
  personalTotal: number;
  carriedOver: number;
  annualTaken: number;
  sickTaken: number;
  personalTaken: number;
  remainingDays: number;
  sickRemaining: number;
  personalRemaining: number;
}

export interface LeaveDraft {
  empNo?: number | string;
  userId: string;
  date: string;
  type: LeaveRecord["type"];
  days: number;
  halfDayPeriod?: "morning" | "afternoon" | null;
  note?: string;
}

export function toEmployee(api: ApiEmployee): Employee {
  return {
    id: api.id,
    empCode: api.empCode ?? "",
    name: api.name,
    nickname: api.nickname,
    department: api.department,
    startDate: api.startDate,
    quotas: api.quotas,
    quotasKnown: api.quotasKnown !== false,
    quotaNote: api.quotaNote ?? "",
    status: api.status ?? "active",
    leaves: api.leaves.map((l) => ({
      id: l.id,
      date: l.date,
      type: l.type,
      days: l.days,
      note: l.note,
      status: l.status,
    })),
  };
}

export interface EmployeesResult {
  employees: Employee[];
  partial: boolean;
  warning?: string;
}

export async function fetchEmployees(year: string, includeInactive = false): Promise<EmployeesResult> {
  const data = await request<{ employees: ApiEmployee[]; partial?: boolean; warning?: string }>(
    `/api/employees?year=${encodeURIComponent(year)}${includeInactive ? "&includeInactive=1" : ""}`
  );
  return {
    employees: data.employees.map(toEmployee),
    partial: data.partial === true,
    warning: data.warning,
  };
}

export async function fetchQuota(params: { userId: string; year?: string }) {
  const query = new URLSearchParams();
  query.set("userId", params.userId);
  if (params.year) query.set("year", params.year);
  return request<QuotaResponse>(`/api/quota?${query.toString()}`);
}

export async function createLeave(draft: LeaveDraft) {
  return request<{ id: string; userId: string }>("/api/leave", {
    method: "POST",
    body: JSON.stringify({
      emp_no: draft.empNo,
      user_id: draft.userId,
      leave_date: draft.date,
      leave_type: draft.type,
      days: draft.days,
      half_day_period: draft.halfDayPeriod ?? null,
      note: draft.note ?? "",
    }),
  });
}

export async function updateLeave(id: string, patch: Partial<Omit<LeaveDraft, "empNo" | "userId">> & { status?: LeaveRecord["status"] }) {
  const body: Record<string, unknown> = {};
  if (patch.date !== undefined) body.leave_date = patch.date;
  if (patch.type !== undefined) body.leave_type = patch.type;
  if (patch.days !== undefined) body.days = patch.days;
  if (patch.halfDayPeriod !== undefined) body.half_day_period = patch.halfDayPeriod;
  if (patch.note !== undefined) body.note = patch.note;
  if (patch.status !== undefined) body.status = patch.status;

  return request<{ id: string }>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function setEmployeeStatus(userId: string, status: "active" | "inactive") {
  return request<{ ok: boolean }>("/api/employees", {
    method: "PATCH",
    body: JSON.stringify({ userId, status }),
  });
}

export interface ProfilePatch {
  userId: string;
  empCode?: string;
  name?: string;
  nickname?: string;
  department?: string;
}

export async function updateEmployeeProfile(patch: ProfilePatch) {
  return request<{ ok: boolean }>("/api/employees", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface QuotaPatch {
  userId: string;
  year: string | number;
  annualTotal?: number | null;
  sickTotal?: number | null;
  personalTotal?: number | null;
  carriedOver?: number | null;
  note?: string;
}

export async function updateQuota(patch: QuotaPatch) {
  return request<{ ok: boolean }>("/api/quota", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteLeave(id: string) {
  return request<{ id: string; deleted: boolean }>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
