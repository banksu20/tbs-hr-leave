const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;

export function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(ZERO_WIDTH, " ").replace(/\s+/g, " ").trim();
}

const THAI_LEAVE_TYPES: Record<string, string> = {
  "ลาพักร้อน": "annual",
  "พักร้อน": "annual",
  "ลาป่วย": "sick",
  "ป่วย": "sick",
  "ลากิจ": "personal",
  "กิจ": "personal",
  "ลากิจส่วนตัว": "personal",
};

export function normalizeId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return cleanString(value);
}

export function normalizeLeaveType(value: unknown): string {
  const trimmed = cleanString(value);
  if (THAI_LEAVE_TYPES[trimmed]) return THAI_LEAVE_TYPES[trimmed];

  const raw = trimmed.toLowerCase();
  if (raw === "vacation" || raw === "annual leave" || raw === "annual") return "annual";
  if (raw === "sick leave" || raw === "sick") return "sick";
  if (raw === "personal leave" || raw === "business" || raw === "personal") return "personal";
  return raw;
}

export function normalizeDays(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = cleanString(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEmpNo(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const raw = cleanString(value).toUpperCase().replace(/^TBS[-\s]?/, "");
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return parsed >= 0 ? parsed : null;
}
