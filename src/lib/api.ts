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

export const BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
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
  requestId?: string;
  requestRevision?: string;
  requestDates?: string[];
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
  rolloverNeedsReview?: boolean;
  quotaRevision?: string;
  storedCarriedOver?: number;
  carryoverExpiresOn?: string|null;
  quotasKnown?: boolean;
  quotaNote?: string;
  status?: "active" | "inactive";
  leaves: ApiLeaveRecord[];
}

export interface QuotaResponse {
  year: number;
  annualTotal: number|null;
  sickTotal: number|null;
  personalTotal: number;
  carriedOver: number;
  annualTaken: number;
  sickTaken: number;
  personalTaken: number;
  remainingDays: number|null;
  sickRemaining: number|null;
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
    rolloverNeedsReview: api.rolloverNeedsReview,
    quotaRevision: api.quotaRevision,
    storedCarriedOver: api.storedCarriedOver,
    carryoverExpiresOn: api.carryoverExpiresOn,
    quotasKnown: api.quotasKnown !== false,
    quotaNote: api.quotaNote ?? "",
    status: api.status ?? "active",
    leaves: api.leaves.map((l) => ({
      id: l.id,
      requestId: l.requestId,
      requestRevision: l.requestRevision,
      requestDates: l.requestDates,
      halfDayPeriod: l.halfDayPeriod,
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

export interface RequestTarget {
  scope: "request";
  expectedDates: string[];
  expectedRevision: string;
}
export interface LeaveRequestUpdate extends RequestTarget {
  dates: string[];
  type: LeaveRecord["type"];
  daysPerDate: number;
  halfDayPeriod: "morning" | "afternoon" | null;
  note: string;
  status: LeaveRecord["status"];
}

export async function updateLeave(id: string, patch: LeaveRequestUpdate) {
  return request<{ id: string }>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
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
  expectedRevision: string;
  carryoverExpiresOn?: string|null;
  userId: string;
  year: string | number;
  annualTotal?: number | null;
  sickTotal?: number | null;
  personalTotal?: number;
  carriedOver?: number;
  note?: string;
}

export async function updateQuota(patch: QuotaPatch) {
  return request<{ ok: boolean }>("/api/quota", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteLeave(id: string, target: RequestTarget) {
  return request<{ id: string; deleted: boolean }>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: JSON.stringify(target),
  });
}

export interface ChangeEvent {
  id: string; changedAt: string; entity: string; recordId: string; userId: string;
  employeeName: string; department: string; action: string; actor: string;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  canRestore: boolean;
}
export function fetchHistory(userId?: string, cursor?: string) {
  const query = new URLSearchParams();
  if (userId) query.set("userId", userId);
  if (cursor) query.set("cursor", cursor);
  return request<{events: ChangeEvent[]; nextCursor: string | null}>(`/api/history?${query}`);
}
export function restoreLeave(id: string, cancellationId: string) {
  return request<{ok: boolean}>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({action:"restore", cancellationId}),
  });
}

export interface RolloverOverride { userId: string; carriedOver: number; expiresOn: string|null; note: string; annualTotal?: number; sickTotal?: number|null; personalTotal?: number }
export interface RolloverSettings { sourceYear: number; reconcile?: boolean; expiresOn: string; overrides?: RolloverOverride[] }
export interface RolloverRow { userId: string; name: string; annualTotal: number|null; sickTotal: number|null; personalTotal: number|null; carriedOver: number; expiresOn: string|null; status: string; previousCarryover?: number; sourceAnnual?: number; sourceCarried?: number; unusedAnnual?: number; suggestedCarryover?: number; note?: string; nickname?: string; empNo?: number }
export function previewRollover(settings: RolloverSettings) {
  return request<{ok: boolean; rows: RolloverRow[]; token: string; targetYear: number}>('/api/rollover',{method:'POST',body:JSON.stringify({...settings,action:'preview'})});
}
export function applyRollover(settings: RolloverSettings, token: string) {
  return request<{ok: boolean; saved: number}>('/api/rollover',{method:'POST',body:JSON.stringify({...settings,token,action:'apply'})});
}

export function approveLeave(id: string, expectedRevision: string) {
  return request<{ok: boolean}>(`/api/leave?id=${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify({action:'approve',expectedRevision}),
  });
}

export function rejectLeave(id: string, expectedRevision: string, rejectionReason?: string) {
  return request<{ok: boolean}>(`/api/leave?id=${encodeURIComponent(id)}`, {method:'PATCH',body:JSON.stringify({action:'reject',expectedRevision,rejectionReason})});
}
