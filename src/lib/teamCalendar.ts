import { employeeData } from "@/lib/employeeData";

export interface TeamLeave { name: string; status: string; type: string; period?: string | null; }
export type TeamMonth = Record<string, TeamLeave[]>;

const FRESH_MS = 60 * 1000;
const requests = new Map<string, { at: number; request: Promise<TeamMonth> }>();
const CREATIVE_LEAD = "Uc229f2377a2b8839adab478d92c0c26f";

export function teamDepartments(department: string, userId?: string): string[] {
  const dept = department?.trim() || "";
  if (dept === "Web Developer" || dept === "UX/UI Designer") return ["Web Developer", "UX/UI Designer"];
  if (userId === CREATIVE_LEAD && (dept === "Graphic" || dept === "Content")) return ["Graphic", "Content"];
  return dept ? [department] : [];
}

const keyFor = (departments: string[], year: number, month: number) => `tbs-team-calendar-${departments.join("+")}-${year}-${month}`;

export function savedTeamMonth(departments: string[], year: number, month: number): TeamMonth | null {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(departments, year, month)) || "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function loadTeamMonth(departments: string[], year: number, month: number): Promise<TeamMonth> {
  const key = keyFor(departments, year, month);
  const existing = requests.get(key);
  if (existing && Date.now() - existing.at < FRESH_MS) return existing.request;
  const request = Promise.all(departments.map(department => employeeData("get-team-calendar", { department, year: String(year), month: String(month + 1) })))
    .then(results => {
      const merged: TeamMonth = {};
      for (const data of results) for (const [date, leaves] of Object.entries(data ?? {})) if (Array.isArray(leaves)) merged[date] = [...(merged[date] || []), ...leaves];
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch { void 0; }
      return merged;
    });
  request.catch(() => requests.delete(key));
  requests.set(key, { at: Date.now(), request });
  return request;
}

export function prefetchTeamMonths(departments: string[], year: number, month: number, around = 0) {
  if (!departments.length) return;
  for (let offset = -around; offset <= around; offset++) {
    const date = new Date(Date.UTC(year, month + offset, 1));
    loadTeamMonth(departments, date.getUTCFullYear(), date.getUTCMonth()).catch(() => undefined);
  }
}
