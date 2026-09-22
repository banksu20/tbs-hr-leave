import { expandRequest } from "./expandRequests";
import { cleanString, normalizeDays, normalizeLeaveType, normalizeId, parseEmpNo } from "./normalize";

export const N8N_BASE = process.env.N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

const TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS || 15000);

export class N8nUnavailableError extends Error {
  constructor(public endpoint: string, message: string) {
    super(`n8n endpoint ${endpoint} unavailable: ${message}`);
    this.name = "N8nUnavailableError";
  }
}

export class N8nNotRegisteredError extends Error {
  constructor(public endpoint: string) {
    super(`n8n workflow for ${endpoint} is not active`);
    this.name = "N8nNotRegisteredError";
  }
}

async function callN8n(endpoint: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${N8N_BASE}/webhook/${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(process.env.CEO_WEBHOOK_SECRET ? { "x-ceo-webhook-secret": process.env.CEO_WEBHOOK_SECRET } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new N8nUnavailableError(endpoint, err instanceof Error ? err.message : "network failure");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (response.status === 404) {
    throw new N8nNotRegisteredError(endpoint);
  }

  if (!response.ok) {
    throw new N8nUnavailableError(endpoint, `responded ${response.status}: ${text.slice(0, 200)}`);
  }

  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new N8nUnavailableError(endpoint, `returned non-JSON: ${text.slice(0, 120)}`);
  }
}

export function n8nGet(endpoint: string, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  const suffix = query.toString();
  return callN8n(suffix ? `${endpoint}?${suffix}` : endpoint);
}

export class N8nMutationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function n8nPost(endpoint: string, body: unknown) {
  if (process.env.NODE_ENV === "production" && !process.env.CEO_WEBHOOK_SECRET) {
    throw new N8nMutationError(503, "CEO_WEBHOOK_SECRET is not configured on the server");
  }
  const result = await callN8n(endpoint, { method: "POST", body: JSON.stringify(body) });
  const row = (Array.isArray(result) ? result[0] : result) as Record<string, unknown> | null;
  if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
    throw new N8nMutationError(502, "The workflow did not confirm a saved record");
  }
  if (row.ok === false || row.error) {
    const status = Number(row.statusCode);
    throw new N8nMutationError([404, 409, 422, 503].includes(status) ? status : 502, String(row.error || "The workflow rejected this change"));
  }
  return result;
}

export interface NormalizedLeave {
  id: string;
  requestId?: string;
  requestDates?: string[];
  halfDayPeriod?: "morning" | "afternoon" | null;
  date: string;
  type: "sick" | "annual" | "personal";
  days: number;
  note: string;
  status: "Approved" | "Pending" | "Rejected";
}

export interface NormalizedEmployee {
  id: string;
  empNo: number | null;
  empCode: string | null;
  name: string;
  nickname: string;
  department: string;
  startDate: string;
  quotas: { annualTotal: number | null; sickTotal: number | null; personalTotal: number; carriedOver: number };
  quotasKnown: boolean;
  quotaNote: string;
  status: "active" | "inactive";
  leaves: NormalizedLeave[];
}

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return undefined;
}

function normalizeStatus(value: unknown): NormalizedLeave["status"] {
  const raw = cleanString(value).toLowerCase();
  if (raw === "approved" || raw === "") return "Approved";
  if (raw.startsWith("reject")) return "Rejected";
  return "Pending";
}

export function normalizeName(raw: unknown): { name: string; nickname: string } {
  const value = cleanString(raw);
  if (value.includes("|")) {
    const [first = "", last = "", nick = ""] = value.split("|").map((p) => p.trim());
    return { name: [first, last].filter(Boolean).join(" "), nickname: nick || first };
  }
  const bracket = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (bracket) return { name: bracket[1].trim(), nickname: bracket[2].trim() };
  return { name: value, nickname: "" };
}

export function normalizeLeave(raw: unknown, index: number): NormalizedLeave | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const date = cleanString(pick(row, ["date", "leave_date", "leaveDate"])).split("T")[0];
  const type = normalizeLeaveType(pick(row, ["type", "leave_type", "leaveType"]));
  const days = normalizeDays(pick(row, ["days", "leave_days", "leaveDays"]));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (type !== "sick" && type !== "annual" && type !== "personal") return null;
  if (days === null || days <= 0) return null;

  return {
    id: normalizeId(pick(row, ["id", "record_id", "recordId"])) || `n8n_${index}_${date}_${type}`,
    date,
    type,
    days,
    note: cleanString(pick(row, ["note", "reason"])),
    status: normalizeStatus(pick(row, ["status"])),
  };
}

export function normalizeEmployee(raw: unknown, index: number): NormalizedEmployee | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const id = cleanString(pick(row, ["id", "user_id", "userId", "UserID"]));
  if (!id) return null;

  const empNo = parseEmpNo(
    pick(row, ["tbs_id", "tbsId", "TBS_ID", "emp_no", "empNo", "emp_code", "empCode", "EmployeeNo"])
  );

  const rawName = pick(row, ["name", "user_name", "userName", "Name"]);
  const parsed = normalizeName(rawName);
  const first = cleanString(pick(row, ["first_name", "FirstName", "firstName"]));
  const last = cleanString(pick(row, ["last_name", "LastName", "lastName"]));
  const nick = cleanString(pick(row, ["nickname", "Nickname", "nickName"]));

  const name = [first, last].filter(Boolean).join(" ") || parsed.name || nick || "Unknown";
  const nickname = nick || parsed.nickname || first || "";

  const rawLeaves = pick(row, ["leaves", "records", "leave_records"]);
  const rawRequests = pick(row, ["requests", "leave_requests"]);

  const leaves = Array.isArray(rawLeaves)
    ? rawLeaves.map((l, i) => normalizeLeave(l, i)).filter((l): l is NormalizedLeave => l !== null)
    : [];

  if (Array.isArray(rawRequests)) {
    rawRequests.forEach((r, i) => leaves.push(...expandRequest(r, i)));
  }

  let sawQuota = false;
  const num = (keys: string[], fallback: number) => {
    const value = normalizeDays(pick(row, keys));
    if (value === null) return fallback;
    sawQuota = true;
    return value;
  };

  const sickRaw = pick(row, ["sickTotal", "sick_total"]);
  const quotas = {
    annualTotal: row.annualTotal === null || row.annual_total === null ? null : num(["annualTotal", "annual_total"], 12),
    sickTotal: sickRaw === undefined ? null : normalizeDays(sickRaw),
    personalTotal: num(["personalTotal", "personal_total"], 3),
    carriedOver: num(["carriedOver", "carried_over"], 0),
  };

  return {
    id,
    empNo,
    empCode: empNo === null ? null : `TBS-${String(empNo).padStart(3, "0")}`,
    name,
    nickname,
    department: cleanString(pick(row, ["department", "Department"])) || "General",
    startDate: cleanString(pick(row, ["startDate", "start_date"])).split("T")[0],
    quotas,
    quotasKnown: typeof row.quotasKnown === "boolean" ? row.quotasKnown : sawQuota,
    quotaNote: cleanString(pick(row, ["quotaNote", "quota_note", "note"])),
    status: cleanString(pick(row, ["status", "employeeStatus"])).toLowerCase() === "inactive" ? "inactive" : "active",
    leaves,
  };
}

export function normalizeEmployeeList(payload: unknown): NormalizedEmployee[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.employees)
      ? ((payload as Record<string, unknown>).employees as unknown[])
      : Array.isArray((payload as Record<string, unknown>)?.data)
        ? ((payload as Record<string, unknown>).data as unknown[])
        : [];

  return rows.map((r, i) => normalizeEmployee(r, i)).filter((e): e is NormalizedEmployee => e !== null);
}
