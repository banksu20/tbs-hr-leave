export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildLeaveDateRange(selectedDates: Date[]): {
  startDate: string;
  endDate: string;
  dates: string[];
} {
  if (selectedDates.length === 0) {
    return { startDate: "", endDate: "", dates: [] };
  }
  const dates = [...selectedDates]
    .sort((a, b) => a.getTime() - b.getTime())
    .map(toLocalDateString);
  return { startDate: dates[0], endDate: dates[dates.length - 1], dates };
}
