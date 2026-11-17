export function halfDayLabel(period: string | null | undefined, language: 'en' | 'th' = 'en'): string {
  if (period === 'morning') return language === 'th' ? 'ช่วงเช้า' : 'Morning';
  if (period === 'afternoon') return language === 'th' ? 'ช่วงบ่าย' : 'Afternoon';
  return language === 'th' ? 'ครึ่งวัน' : 'Half day';
}
