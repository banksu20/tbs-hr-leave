export interface CompanyHoliday {
  date: string;
  localName: string;
  name: string;
}

const requests = new Map<number, Promise<CompanyHoliday[]>>();
const storageKey = (year: number) => `tbs-company-holidays-${year}`;

export function savedCompanyHolidays(year: number): CompanyHoliday[] | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(year)) || 'null');
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function loadCompanyHolidays(year: number): Promise<CompanyHoliday[]> {
  const existing = requests.get(year);
  if (existing) return existing;
  const request = fetch(`/api/company-holidays?year=${year}&cached=1`)
    .then(async response => {
      const data = await response.json();
      if (!response.ok || !data.confirmed || !Array.isArray(data.holidays)) throw new Error('Calendar not confirmed');
      const holidays = [...data.holidays].sort((a: CompanyHoliday, b: CompanyHoliday) => a.date.localeCompare(b.date));
      try { localStorage.setItem(storageKey(year), JSON.stringify(holidays)); } catch { void 0; }
      return holidays;
    });
  request.catch(() => requests.delete(year));
  requests.set(year, request);
  return request;
}
