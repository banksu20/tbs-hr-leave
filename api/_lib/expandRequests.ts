import { cleanString, normalizeDays, normalizeLeaveType, normalizeId } from "./normalize.js";
import { isPlainDate } from "./date.js";
import type { NormalizedLeave } from "./n8nClient.js";

const PLAIN = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

export function parseShortDate(raw: unknown): string | null {
  const value = cleanString(raw);
  if (!value) return null;
  if (PLAIN.test(value)) return value;

  const m = value.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);
  if (!m) return null;

  const monthIdx = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  if (monthIdx < 0) return null;

  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function parseSelectedDates(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((v) => cleanString(v).split("T")[0]).filter(isPlainDate))].sort();
  }

  const text = cleanString(raw);
  if (!text) return [];

  const stripped = text.replace(/^[[{"']+/, "").replace(/[\]}"']+$/, "");
  return [...new Set(stripped
    .split(",")
    .map((token) => cleanString(token).replace(/^["']|["']$/g, "").split("T")[0])
    .filter(isPlainDate))].sort();
}

export function datesBetween(start: string, end: string): string[] {
  if (!isPlainDate(start)) return [];
  if (!isPlainDate(end) || end < start) return [start];

  const out: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));

  for (let guard = 0; guard < 400; guard++) {
    const iso = cursor.toISOString().split("T")[0];
    out.push(iso);
    if (iso >= end) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

export function normalizeRequestStatus(value: unknown): NormalizedLeave["status"] {
  const raw = cleanString(value).toLowerCase();
  if (raw === "approved") return "Approved";
  if (raw.startsWith("reject")) return "Rejected";
  return "Pending";
}

export function expandRequest(raw: unknown, index: number): NormalizedLeave[] {
  if (typeof raw !== "object" || raw === null) return [];
  const row = raw as Record<string, unknown>;

  const type = normalizeLeaveType(row.leave_type ?? row.leaveType ?? row.type);
  if (type !== "sick" && type !== "annual" && type !== "personal") return [];

  const selected = parseSelectedDates(row.selected_dates ?? row.selectedDates);
  const start = cleanString(row.start_date ?? row.startDate).split("T")[0];
  const end = cleanString(row.end_date ?? row.endDate).split("T")[0];

  const single = parseShortDate(row.date);
  const dates =
    selected.length > 0
      ? selected
      : start
        ? datesBetween(start, end || start)
        : single
          ? [single]
          : [];
  if (dates.length === 0) return [];

  const totalDays = normalizeDays(row.leave_days ?? row.leaveDays ?? row.days);
  const perDay = totalDays === null ? 1 : Math.round((totalDays / dates.length) * 100) / 100;
  if (perDay !== 0.25 && perDay !== 0.5 && perDay !== 1) return [];

  const status = normalizeRequestStatus(row.status);
  const note = cleanString(row.reason ?? row.note);
  const requestId = normalizeId(row.id ?? row.request_id);
  const period = row.half_day_period ?? row.halfDayPeriod;

  return dates.map((date, i) => ({
    id: `${requestId || `legacy_${index}`}@${date}`,
    requestId: /^\d+$/.test(requestId) ? requestId : undefined,
    requestDates: dates,
    requestRevision: typeof row.revision === "string" ? row.revision : undefined,
    halfDayPeriod: period === "morning" || period === "afternoon" ? period : null,
    date,
    type,
    days: perDay,
    note,
    status,
  }));
}
