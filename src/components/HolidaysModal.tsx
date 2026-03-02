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

  // 🛡️ ข้อมูลสำรอง (Fallback) กรณี API ใช้งานไม่ได้
  // จะได้ไม่ขึ้นหน้า Error ให้ user ตกใจ
  const fallbackHolidays: Holiday[] = [
    { date: `${currentYear}-01-01`, localName: "วันขึ้นปีใหม่", name: "New Year's Day" },
    { date: `${currentYear}-02-12`, localName: "วันมาฆบูชา (ประมาณการ)", name: "Makha Bucha Day" },
    { date: `${currentYear}-04-06`, localName: "วันจักรี", name: "Chakri Memorial Day" },
    { date: `${currentYear}-04-13`, localName: "วันสงกรานต์", name: "Songkran Festival" },
    { date: `${currentYear}-04-14`, localName: "วันสงกรานต์", name: "Songkran Festival" },
    { date: `${currentYear}-04-15`, localName: "วันสงกรานต์", name: "Songkran Festival" },
    { date: `${currentYear}-05-01`, localName: "วันแรงงานแห่งชาติ", name: "Labor Day" },
    { date: `${currentYear}-05-04`, localName: "วันฉัตรมงคล", name: "Coronation Day" },
    { date: `${currentYear}-06-03`, localName: "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี", name: "Queen's Birthday" },
    { date: `${currentYear}-07-28`, localName: "วันเฉลิมพระชนมพรรษา ร.10", name: "King's Birthday" },
    { date: `${currentYear}-08-12`, localName: "วันแม่แห่งชาติ", name: "Mother's Day" },
    { date: `${currentYear}-10-13`, localName: "วันคล้ายวันสวรรคต ร.9", name: "King Bhumibol Memorial Day" },
    { date: `${currentYear}-10-23`, localName: "วันปิยมหาราช", name: "Chulalongkorn Day" },
    { date: `${currentYear}-12-05`, localName: "วันพ่อแห่งชาติ", name: "Father's Day" },
    { date: `${currentYear}-12-10`, localName: "วันรัฐธรรมนูญ", name: "Constitution Day" },
    { date: `${currentYear}-12-31`, localName: "วันสิ้นปี", name: "New Year's Eve" },
  ];

  const companyExtraHolidays: Holiday[] = [];

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
      // แก้ไข: ใช้ Proxy (allorigins.win) เพื่อหลบ CORS Error
      const targetUrl = `https://date.nager.at/api/v3/publicholidays/${currentYear}/TH`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) throw new Error("API Error");
      
      const data = await response.json();

      // รวมวันหยุด + เรียงลำดับ
      const allHolidays = [...data, ...companyExtraHolidays];
      allHolidays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setHolidays(allHolidays);
    } catch (err) {
      console.warn("API Failed, using fallback data:", err);
      // ✅ ถ้า API พัง ให้ใช้ข้อมูลสำรองแทน (User จะได้ไม่เจอ Error)
      setHolidays(fallbackHolidays); 
      // ไม่ต้อง Set Error เป็น true เพื่อให้หน้าจอแสดงผลได้ปกติ
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
                // กรณีสุดวิสัยจริงๆ ที่ไม่มีข้อมูลเลย
                <div className="flex flex-col justify-center items-center py-12 text-red-400 gap-2">
                   <AlertCircle className="h-8 w-8" />
                   <span className="text-xs">ไม่พบข้อมูลวันหยุด</span>
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