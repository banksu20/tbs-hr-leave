import { Employee } from "@/data/mockEmployees";

const EMP_CODE_ANYWHERE = /TBS[\s-]?0*(\d{1,4})/i;

export function parseEmpNo(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const coded = EMP_CODE_ANYWHERE.exec(raw);
  if (coded) {
    const n = Number(coded[1]);
    return n >= 0 ? n : null;
  }

  if (/^\d{1,4}$/.test(raw)) {
    const n = Number(raw);
    return n >= 0 ? n : null;
  }

  return null;
}

export function formatEmpCode(empNo: number): string {
  return `TBS-${String(empNo).padStart(3, "0")}`;
}

export function empNoOf(emp: Employee): number | null {
  return parseEmpNo(emp.empCode);
}

export function findByEmpNo(employees: Employee[], empNo: number | null): Employee | undefined {
  if (empNo === null) return undefined;
  return employees.find((e) => empNoOf(e) === empNo);
}

export function findEmployeeStrict(employees: Employee[], value: unknown): Employee | undefined {
  return findByEmpNo(employees, parseEmpNo(value));
}

export function nextEmpNo(employees: Employee[]): number {
  const used = employees.map(empNoOf).filter((n): n is number => n !== null);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

export function searchEmployees(employees: Employee[], query: string): Employee[] {
  const q = query.trim().toLowerCase();
  if (!q) return employees;

  const byNumber = parseEmpNo(q);
  if (byNumber !== null) {
    const exact = findByEmpNo(employees, byNumber);
    if (exact) return [exact];
  }

  return employees.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.nickname.toLowerCase().includes(q) ||
      e.empCode.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
  );
}
