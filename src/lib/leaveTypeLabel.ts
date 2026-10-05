/** Normalize historical labels for display without changing saved leave records. */
export function leaveTypeLabel(value: string, language = 'en'): string {
 const key = value.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
 const aliases: Record<string, string> = {
  annual:'annual', vacation:'annual', 'vacation leave':'annual', 'annual leave':'annual', 'ลาพักร้อน':'annual', 'พักร้อน':'annual',
  sick:'sick', 'sick leave':'sick', 'ลาป่วย':'sick', 'ป่วย':'sick',
  personal:'personal', business:'personal', 'personal leave':'personal', 'ลากิจ':'personal', 'กิจ':'personal', 'ลากิจส่วนตัว':'personal',
 };
 const labels: Record<string, string> = language === 'th'
  ? {annual:'พักร้อน', sick:'ลาป่วย', personal:'ลากิจ'}
  : {annual:'Annual Leave', sick:'Sick Leave', personal:'Personal Leave'};
 return labels[aliases[key]] ?? (language === 'th' ? 'ไม่ทราบประเภทการลา' : 'Unknown leave type');
}
