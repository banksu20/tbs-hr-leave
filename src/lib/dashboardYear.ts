const key = 'tbs_ceo_selected_year';
export function readDashboardYear(currentYear = new Date().getFullYear()): string {
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^\d{4}$/.test(saved) && Number(saved)>=2000 && Number(saved)<=2100) return saved;
  } catch { /* Use the calendar year when storage is unavailable. */ }
  return String(currentYear);
}
export function saveDashboardYear(year: string) {
  try { localStorage.setItem(key, year); } catch { /* Selection still works for this session. */ }
}
