import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://thirstless-ostensively-maryam.ngrok-free.dev";

interface CalendarProps {
  department: string;
}

export default function TeamCalendar({ department }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [leaveData, setLeaveData] = useState<any>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!department) return;
    
    setIsLoading(true);
    //  ส่งค่า department แนบไปกับ URL เพื่อให้ n8n รู้ว่าต้องดึงข้อมูลแผนกไหน
    fetch(`${N8N_URL}/webhook/get-team-calendar?department=${department}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
    })
      .then(res => res.json())
      .then(data => {
          setLeaveData(data);
          setIsLoading(false);
      })
      .catch(err => {
          console.error("Error fetching team calendar:", err);
          setIsLoading(false);
      });
  }, [department]);

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
    <Card className="w-full max-w-md mx-auto shadow-2xl border-0 overflow-hidden bg-white">
      <CardHeader className="bg-slate-800 pb-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-300">◀</button>
          <div className="flex flex-col items-center">
            <CardTitle className="text-lg text-white font-bold tracking-wide">
              {currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
            </CardTitle>
            <span className="text-[10px] text-sky-400 font-medium tracking-wider uppercase">Team: {department}</span>
          </div>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-300">▶</button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 bg-slate-50 relative min-h-[300px]">
        
        {isLoading && (
            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center backdrop-blur-[2px]">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
        )}

        {/* หัวตาราง จ-อา */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-3">
          <div className="text-rose-400">Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div className="text-rose-400">Sa</div>
        </div>

        {/* ตัวปฏิทิน */}
        <div className="grid grid-cols-7 gap-1.5">
          {blanks.map(blank => <div key={`blank-${blank}`} className="p-2"></div>)}
          
          {days.map(day => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // ตรวจสอบว่ามีคนลาในวันนี้ไหม
            const dayLeaves = leaveData[dateStr] || [];
            const leaveCount = dayLeaves.length;
            
            let bgClass = "bg-white hover:bg-slate-100 text-slate-700 border-slate-200/60";
            let indicatorClass = "";

            if (leaveCount >= 3) {
                bgClass = "bg-rose-50 border-rose-200 text-rose-700 font-bold";
                indicatorClass = "bg-rose-500";
            } else if (leaveCount > 0) {
                bgClass = "bg-sky-50 border-sky-200 text-sky-700 font-bold";
                indicatorClass = "bg-sky-500";
            }

            const isSelected = selectedDay === dateStr;

            return (
              <div 
                key={day} 
                onClick={() => setSelectedDay(dateStr)}
                className={`p-1.5 h-12 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm ${bgClass} ${isSelected ? 'ring-2 ring-blue-500 shadow-md scale-105' : ''}`}
              >
                <span className="text-sm">{day}</span>
                
                {/* จุดกลมๆ บอกจำนวนคนลา */}
                {leaveCount > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: Math.min(leaveCount, 3) }).map((_, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${indicatorClass}`}></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ส่วนแสดงรายชื่อเมื่อกดเลือกวัน */}
        {selectedDay && (
          <div className="mt-5 p-4 bg-white rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
              <span className="bg-slate-100 p-1.5 rounded-md text-slate-600">📅</span> 
              วันที่ {new Date(selectedDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </h4>
            
            {leaveData[selectedDay] && leaveData[selectedDay].length > 0 ? (
              <ul className="space-y-2.5">
                {leaveData[selectedDay].map((l: any, idx: number) => (
                  <li key={idx} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${l.status === 'Approved' ? 'bg-emerald-500' : 'bg-amber-400'}`}></div>
                      <span className="text-sm text-slate-700 font-semibold">{l.name}</span> 
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-1 bg-slate-100 text-slate-500 rounded-md font-medium">{l.type === 'sick' ? 'Sick' : 'Annual'}</span>
                        <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${l.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                            {l.status === 'Approved' ? 'Approved' : 'Pending'}
                        </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-4 flex flex-col items-center justify-center opacity-60">
                  <span className="text-2xl mb-1">*</span>
                  <p className="text-xs text-slate-500 font-medium">ไม่มีใครลาในวันนี้</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}