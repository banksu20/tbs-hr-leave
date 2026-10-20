// Inclusive dates; partial months use the days between monthly anniversaries.
export function internAllowance(start: string, end: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? date : null;
  };
  const first = parse(start), last = parse(end);
  if (!first || !last || last < first) return null;
  const finish = new Date(+last + 86400000);
  const anniversary = (months: number) => {
    const base = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + months, 1));
    const max = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(first.getUTCDate(), max));
    return base;
  };
  let whole = (finish.getUTCFullYear() - first.getUTCFullYear()) * 12 + finish.getUTCMonth() - first.getUTCMonth();
  if (anniversary(whole) > finish) whole--;
  const anchor = anniversary(whole), next = anniversary(whole + 1);
  const months = whole + (+finish - +anchor) / (+next - +anchor);
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  return { months: round(months), sick: round(months), annual: round(months / 2), personal: 3 };
}
