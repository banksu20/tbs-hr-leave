import { Employee, LeaveRecord } from "@/data/mockEmployees";

export type LeaveType = "sick" | "annual" | "personal";

export const LEAVE_TYPES: LeaveType[] = ["sick", "annual", "personal"];

export const LEAVE_META: Record<LeaveType, { label: string; short: string; chip: string; band: string; text: string; ring: string }> = {
  sick: {
    label: "Sick Leave",
    short: "Sick",
    chip: "bg-[#CC0000] text-white",
    band: "bg-rose-50/60",
    text: "text-rose-700",
    ring: "focus-visible:ring-rose-400",
  },
  annual: {
    label: "Annual Leave",
    short: "Annual",
    chip: "bg-[#D4A000] text-white",
    band: "bg-amber-50/60",
    text: "text-amber-800",
    ring: "focus-visible:ring-amber-400",
  },
  personal: {
    label: "Personal Leave",
    short: "Personal",
    chip: "bg-[#0099FF] text-white",
    band: "bg-sky-50/60",
    text: "text-sky-800",
    ring: "focus-visible:ring-sky-400",
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatSheetDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

export function normalizeDateInput(raw: string, fallbackYear: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const named = value.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]*(\d{2,4})?$/);
  if (named) {
    const monthIdx = MONTHS.findIndex((m) => m.toLowerCase() === named[2].slice(0, 3).toLowerCase());
    if (monthIdx >= 0) {
      let year = named[3] || fallbackYear;
      if (year.length === 2) year = `20${year}`;
      return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
    }
  }

  const slashed = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashed) {
    let year = slashed[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${slashed[2].padStart(2, "0")}-${slashed[1].padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }

  return null;
}

export function isCountedLeave(l: LeaveRecord) {
  return l.status === "Approved" || !l.status;
}

export function leavesForYear(leaves: LeaveRecord[] | undefined, year: string) {
  if (!Array.isArray(leaves)) return [];
  return leaves
    .filter((l) => l.date && l.date.startsWith(year) && isCountedLeave(l))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function sumLeavesByType(leaves: LeaveRecord[] | undefined, type: LeaveType, year: string) {
  return leavesForYear(leaves, year)
    .filter((l) => l.type === type)
    .reduce((sum, l) => sum + (Number(l.days) || 0), 0);
}

function quotaValue(emp: Employee, type: LeaveType): number | null | undefined {
  if (type === "sick") return emp.quotas.sickTotal;
  if (type === "personal") return emp.quotas.personalTotal;
  return emp.quotas.annualTotal;
}

export function needsQuotaReview(emp: Employee) {
  return emp.quotas.annualTotal === 0;
}

export function isUnlimited(emp: Employee, type: LeaveType) {
  const value = quotaValue(emp, type);
  return value === null || value === undefined;
}

export function grantedFor(emp: Employee, type: LeaveType) {
  if (type === "sick") return emp.quotas.sickTotal ?? 0;
  if (type === "personal") return emp.quotas.personalTotal ?? 0;
  return (emp.quotas.annualTotal ?? 0) + (emp.quotas.carriedOver ?? 0);
}

export function formatDays(days: number) {
  if (!days) return "";
  return Number.isInteger(days) ? String(days) : String(days);
}
