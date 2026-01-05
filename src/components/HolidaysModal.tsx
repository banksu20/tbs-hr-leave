import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, Loader2, AlertCircle } from "lucide-react";

interface HolidaysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Holiday {
  date: string; // YYYY-MM-DD
  localName: string; // ชื่อไทย
  name: string; // ชื่ออังกฤษ
}

const HolidaysModal = ({ open, onOpenChange }: HolidaysModalProps) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const currentYear = new Date().getFullYear();

  // 🛠️ ส่วนตั้งค่า: วันหยุดพิเศษของบริษัท (ถ้ามี) เพิ่มตรงนี้ได้เลย
  // ระบบจะเอาไปรวมกับวันหยุดราชการให้อัตโนมัติ
  const companyExtraHolidays: Holiday[] = [
    // { date: `${currentYear}-12-25`, localName: "วันคริสต์มาส", name: "Christmas Day" },
  ];

  // ฟังก์ชันแปลงวันที่เป็นรูปแบบไทย (เช่น "2025-01-01" -> "1 ม.ค.")
  const formatDateTh = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
      });
    } catch (e) {
      return dateString;
    }
  };

  useEffect(() => {
    if (open) {
      fetchHolidays();
    }
  }, [open]);

  const fetchHolidays = async () => {
    setLoading(true);
    setError(false);
    try {
      // ดึงข้อมูลจาก API ฟรี (Nager.Date)
      const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${currentYear}/TH`);
      
      if (!response.ok) throw new Error("API Error");
      
      const data = await response.json();

      // รวมวันหยุดราชการ (API) + วันหยุดบริษัท (Manual)
      const allHolidays = [...data, ...companyExtraHolidays];

      // เรียงลำดับตามวันที่
      allHolidays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setHolidays(allHolidays);
    } catch (err) {
      console.error("Failed to fetch holidays:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-800">
            <CalendarDays className="h-5 w-5 text-[#06C755]" />
            ปฏิทินวันหยุด {currentYear}
          </DialogTitle>
        </DialogHeader>
        
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-12 text-slate-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
              <span className="text-xs">กำลังอัปเดตข้อมูล...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center py-12 text-red-400 gap-2">
              <AlertCircle className="h-8 w-8" />
              <span className="text-xs">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</span>
            </div>
          ) : (
            <div className="space-y-2 pb-4 pt-2">
              {holidays.length > 0 ? (
                holidays.map((holiday, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-green-50/50 border border-slate-100 transition-colors group"
                  >
                    {/* วันที่ */}
                    <div className="min-w-[70px] flex flex-col items-center justify-center bg-white rounded-lg py-1 px-2 border border-slate-100 shadow-sm group-hover:border-green-200">
                       <span className="text-xs text-slate-400 font-medium">
                          {new Date(holiday.date).toLocaleDateString("th-TH", { weekday: 'short' })}
                       </span>
                       <span className="text-lg font-bold text-[#06C755]">
                          {new Date(holiday.date).getDate()}
                       </span>
                       <span className="text-xs text-slate-500">
                          {new Date(holiday.date).toLocaleDateString("th-TH", { month: 'short' })}
                       </span>
                    </div>

                    {/* รายละเอียด */}
                    <div className="flex-1 py-1">
                      <div className="text-sm font-semibold text-slate-700 group-hover:text-green-700">
                        {holiday.localName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 font-light">
                        {holiday.name}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  ไม่พบข้อมูลวันหยุด
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HolidaysModal;