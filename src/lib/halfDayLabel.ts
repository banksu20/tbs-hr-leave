export function halfDayLabel(period: string | null | undefined, language: 'en' | 'th' = 'en'): string {
  if (period === 'morning') return language === 'th' ? 'ครึ่งวัน · ช่วงเช้า' : 'Half day · Morning';
  if (period === 'afternoon') return language === 'th' ? 'ครึ่งวัน · ช่วงบ่าย' : 'Half day · Afternoon';
  return language === 'th' ? 'ครึ่งวัน · ไม่ได้ระบุช่วงเวลา' : 'Half day · Period not recorded';
}
