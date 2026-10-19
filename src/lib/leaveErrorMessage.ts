// Translate known API failures without hiding unexpected diagnostic details.
export function leaveErrorMessage(message: string, language: 'en'|'th'): string {
 const rules: [RegExp,string,string][] = [
  [/internship dates or leave allowance/i,'Check that your dates fall within your internship and that this leave type has enough days remaining.','ตรวจสอบว่าวันที่เลือกอยู่ในช่วงฝึกงาน และสิทธิ์ลาประเภทนี้มีวันคงเหลือเพียงพอ'],
  [/overlapping leave/i,'You already have leave on these dates or during this half-day. Choose different dates or a different half-day.','คุณมีวันลาในวันที่หรือช่วงครึ่งวันที่เลือกแล้ว กรุณาเลือกวันหรือช่วงเวลาอื่น'],
  [/request deadline has passed/i,'The deadline for these dates has passed. Choose later dates. For urgent sick or personal leave, select Emergency request and explain why.','เลยกำหนดส่งคำขอสำหรับวันที่เลือกแล้ว กรุณาเลือกวันใหม่ หากเป็นการลาป่วยหรือลากิจฉุกเฉิน ให้เลือกเหตุฉุกเฉินและระบุรายละเอียด'],
  [/configure your internship dates/i,'HR needs to set your internship dates before you can request leave.','ฝ่ายบุคคลต้องกำหนดวันเริ่มและสิ้นสุดการฝึกงานก่อนจึงจะขอลาได้'],
  [/insufficient .*leave|not enough leave/i,'There are not enough days remaining for this leave type. Pending requests also reserve days.','วันลาคงเหลือของประเภทนี้ไม่เพียงพอ โดยคำขอที่รออนุมัติจะกันสิทธิ์ไว้ด้วย'],
  [/please enter a reason/i,'Please enter a reason for this leave request.','กรุณาระบุเหตุผลสำหรับคำขอลานี้'],
  [/past dates|past date/i,'You cannot request leave for past dates.','ไม่สามารถขอลาย้อนหลังได้'],
  [/please .*LINE|failed to initialize LINE/i,'Please reopen this form through LINE and sign in again.','กรุณาเปิดแบบฟอร์มผ่าน LINE และเข้าสู่ระบบอีกครั้ง'],
  [/could not check.*(balance|allowance|policy)/i,'Unable to check your leave allowance. Please try again.','ไม่สามารถตรวจสอบสิทธิ์ลาได้ กรุณาลองอีกครั้ง'],
  [/failed to fetch|networkerror|load failed|aborted/i,'Connection interrupted. Check your internet connection and try again.','การเชื่อมต่อขัดข้อง กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'],
  [/could not load cancellations/i,'Unable to load your leave history. Please try again.','ไม่สามารถโหลดประวัติการลาได้ กรุณาลองอีกครั้ง'],
 ];
 const match=rules.find(([pattern])=>pattern.test(message));
 return match ? match[language==='th'?2:1] : message;
}
