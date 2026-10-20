import {internAllowance} from '@/lib/internAllowance';
import {useLanguage} from '@/hooks/useLanguage';
export default function InternAllowanceSummary({start,end}:{start:string;end:string}) {
 const {language}=useLanguage();const th=language==='th',a=internAllowance(start,end);
 return <p className="text-sm text-slate-600" aria-live="polite">{a
 ? th?`ระยะฝึกงาน ${a.months} เดือน · ลาป่วย ${a.sick} วัน · ลาพักร้อน ${a.annual} วัน · ลากิจ 3 วัน ตลอดการฝึกงาน (คำนวณตามวันที่เริ่มและสิ้นสุด รวมวันสุดท้าย)`
 :`${a.months} months · Sick: ${a.sick} days · Annual: ${a.annual} days · Personal: 3 days for the whole internship. Calculated from both dates, including the last day.`
 :th?'เลือกวันเริ่มและวันสิ้นสุดเพื่อคำนวณสิทธิ์การลา':'Select start and end dates to calculate allowances.'}</p>;
}
