export const TZ = "Asia/Bangkok";

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayInBangkok(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function isPlainDate(value: string): boolean {
  const m = PLAIN_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(plainDate: string, days: number): string {
  const [y, m, d] = plainDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isWithinWindow(
  plainDate: string,
  reference: string = todayInBangkok(),
  backDays = 730,
  forwardDays = 365
): boolean {
  return plainDate >= addDays(reference, -backDays) && plainDate <= addDays(reference, forwardDays);
}
