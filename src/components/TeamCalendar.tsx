import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const N8N_CALENDAR_WEBHOOK = `${import.meta.env.VITE_N8N_WEBHOOK_URL}/webhook/get-team-calendar`;

interface CalendarProps {
  department: string;
}

export default function TeamCalendar({ department }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaveData, setLeaveData] = useState<any>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ดึงข้อมูลจาก n8n เมื่อ Component โหลด หรือเปลี่ยนแผนก
  useEffect(() => {
    if (!department) return;
    
    fetch(`${N8N_CALENDAR_WEBHOOK}?department=${department}`)
      .then(res => res.json())
      .then(data => setLeaveData(data))
      .catch(err => console.error("Error fetching calendar:", err));
  }, [department]);

  // ฟังก์ชันสร้างตารางปฏิทิน
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };
  
  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));

  return (
    <Card className="w-full max-w-md mx-auto shadow-md border-0 ring-1 ring-slate-200 mb-6">
      <CardHeader className="bg-slate-50 pb-4 rounded-t-xl border-b border-slate-100">
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">◀</button>
          <CardTitle className="text-lg text-slate-800 font-bold">
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </CardTitle>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">▶</button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        {/* หัวตาราง จ-อา */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
          <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
        </div>

        {/* ตัวปฏิทิน */}
        <div className="grid grid-cols-7 gap-1">
          {blanks.map(blank => <div key={`blank-${blank}`} className="p-2"></div>)}
          
          {days.map(day => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLeaves = leaveData[dateStr] || [];
            const leaveCount = dayLeaves.length;
            
            // กำหนดสีพื้นหลังถ้ามีคนลา (แดง=เต็ม, ส้ม=ใกล้เต็ม, ฟ้า=ว่าง)
            let bgClass = "bg-white hover:bg-slate-50";
            if (leaveCount >= 3) bgClass = "bg-red-50 text-red-600 font-bold border-red-200";
            else if (leaveCount > 0) bgClass = "bg-orange-50 text-orange-600 font-semibold border-orange-200";

            return (
              <div 
                key={day} 
                onClick={() => setSelectedDay(dateStr)}
                className={`p-2 h-12 rounded-md border flex flex-col items-center justify-center cursor-pointer transition-all ${bgClass} ${selectedDay === dateStr ? 'ring-2 ring-blue-500' : 'border-transparent'}`}
              >
                <span className="text-sm">{day}</span>
                {/* จุดกลมๆ บอกจำนวนคนลา */}
                {leaveCount > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: Math.min(leaveCount, 3) }).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${leaveCount >= 3 ? 'bg-red-500' : 'bg-orange-400'}`}></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* กล่องแสดงรายชื่อคนลาด้านล่าง เมื่อจิ้มวันที่ */}
        {selectedDay && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
            <h4 className="text-sm font-semibold text-slate-700 mb-2 border-b pb-2">
              📅 วันที่ {selectedDay}
            </h4>
            {leaveData[selectedDay] && leaveData[selectedDay].length > 0 ? (
              <ul className="space-y-1">
                {leaveData[selectedDay].map((l: any, idx: number) => (
                  <li key={idx} className="text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span className="text-slate-800 font-medium">{l.name}</span> 
                    <span className="text-xs text-slate-500 px-1.5 py-0.5 bg-slate-200 rounded-md">
                      {l.status === 'Pending' ? '⏳ รออนุมัติ' : '✅ อนุมัติแล้ว'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 text-center py-2">✨ ไม่มีคนลาในแผนกนี้</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}