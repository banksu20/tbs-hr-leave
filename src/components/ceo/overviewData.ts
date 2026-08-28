import { Employee } from "@/data/mockEmployees";
import { LEAVE_TYPES, LeaveType, grantedFor, isUnlimited, leavesForYear, sumLeavesByType } from "./leaveSheetUtils";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthRow {
  month: string;
  sick: number;
  annual: number;
  personal: number;
  total: number;
}

export function monthlyTotals(employees: Employee[], year: string): MonthRow[] {
  const rows: MonthRow[] = MONTH_LABELS.map((month) => ({ month, sick: 0, annual: 0, personal: 0, total: 0 }));

  for (const emp of employees) {
    for (const leave of leavesForYear(emp.leaves, year)) {
      const index = Number(leave.date.slice(5, 7)) - 1;
      if (index < 0 || index > 11) continue;
      const days = Number(leave.days) || 0;
      rows[index][leave.type] += days;
      rows[index].total += days;
    }
  }

  return rows.map((r) => ({
    ...r,
    sick: Math.round(r.sick * 100) / 100,
    annual: Math.round(r.annual * 100) / 100,
    personal: Math.round(r.personal * 100) / 100,
    total: Math.round(r.total * 100) / 100,
  }));
}

export interface DepartmentRow {
  department: string;
  days: number;
  headcount: number;
  perPerson: number;
}

export function departmentTotals(employees: Employee[], year: string): DepartmentRow[] {
  const map = new Map<string, { days: number; headcount: number }>();

  for (const emp of employees) {
    const key = emp.department || "Unassigned";
    const entry = map.get(key) ?? { days: 0, headcount: 0 };
    entry.headcount += 1;
    for (const type of LEAVE_TYPES) entry.days += sumLeavesByType(emp.leaves, type, year);
    map.set(key, entry);
  }

  return [...map.entries()]
    .map(([department, { days, headcount }]) => ({
      department,
      days: Math.round(days * 100) / 100,
      headcount,
      perPerson: headcount ? Math.round((days / headcount) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.days - a.days);
}

export interface QuotaRow {
  name: string;
  empCode: string;
  used: number;
  granted: number;
  remaining: number;
  percent: number;
}

export function annualQuotaUsage(employees: Employee[], year: string, limit = 8): QuotaRow[] {
  return employees
    .map((emp) => {
      const granted = grantedFor(emp, "annual");
      const used = sumLeavesByType(emp.leaves, "annual", year);
      if (emp.quotas.annualTotal === null || emp.quotas.annualTotal === undefined) {
        return { name: emp.nickname || emp.name, empCode: emp.empCode, used, granted: 0, remaining: 0, percent: 0 };
      }
      return {
        name: emp.nickname || emp.name,
        empCode: emp.empCode,
        used: Math.round(used * 100) / 100,
        granted,
        remaining: Math.round((granted - used) * 100) / 100,
        percent: granted > 0 ? Math.round((used / granted) * 100) : 0,
      };
    })
    .filter((row) => row.granted > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

export interface OverQuotaRow {
  employee: Employee;
  type: LeaveType;
  over: number;
}

export function overQuotaList(employees: Employee[], year: string): OverQuotaRow[] {
  const out: OverQuotaRow[] = [];

  for (const emp of employees) {
    for (const type of LEAVE_TYPES) {
      if (isUnlimited(emp, type)) continue;
      const granted = grantedFor(emp, type);
      const taken = sumLeavesByType(emp.leaves, type, year);
      if (granted > 0 && taken > granted) {
        out.push({ employee: emp, type, over: Math.round((taken - granted) * 100) / 100 });
      }
    }
  }

  return out.sort((a, b) => b.over - a.over);
}

export function awaitingQuota(employees: Employee[]): Employee[] {
  return employees.filter((emp) => emp.quotas.annualTotal === 0);
}

export function busiestMonth(rows: MonthRow[]): MonthRow | null {
  const withDays = rows.filter((r) => r.total > 0);
  if (withDays.length === 0) return null;
  return withDays.reduce((best, row) => (row.total > best.total ? row : best));
}
