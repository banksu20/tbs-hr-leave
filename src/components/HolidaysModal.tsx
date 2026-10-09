import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
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
  const { language } = useLanguage();
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const currentYear = Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date()));
  const holidayDate = (value:string) => new Date(value+'T12:00:00+07:00');

  useEffect(() => {
    if (open) {
      fetchHolidays();
    }
  }, [open]);

  const fetchHolidays = async () => {
    setLoading(true);
    setError(false);
    
    try {
      
      const response=await fetch(`/api/company-holidays?year=${currentYear}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok||!data.confirmed)throw Error('Calendar not confirmed');
      setHolidays(data.holidays);
    } catch (err) {
      setError(true);setHolidays([]);
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
            {language==='th'?'ปฏิทินวันหยุด':'Company holidays'} {currentYear}
          </DialogTitle>
        </DialogHeader>
        
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-12 text-slate-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-[#06C755]" />
              <span className="text-xs">{language==='th'?'กำลังอัปเดตข้อมูล...':'Loading holidays…'}</span>
            </div>
          ) : (
            <div className="space-y-2 pb-4 pt-2">
              {error?<p role="alert" className="text-amber-800 text-sm">{language==='th'?'ยังไม่มีข้อมูลวันหยุดบริษัท กรุณาติดต่อฝ่ายบุคคล':'Company holidays are not available yet. Please contact HR.'}</p>:holidays.length > 0 ? (
                holidays.map((holiday, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-green-50/50 border border-slate-100 transition-colors group"
                  >
                    {/* วันที่ */}
                    <div className="min-w-[70px] flex flex-col items-center justify-center bg-white rounded-lg py-1 px-2 border border-slate-100 shadow-sm group-hover:border-green-200">
                       <span className="text-xs text-slate-400 font-medium">
                          {holidayDate(holiday.date).toLocaleDateString(locale, { weekday: 'short', timeZone:'Asia/Bangkok' })}
                       </span>
                       <span className="text-lg font-bold text-[#06C755]">
                          {Number(holiday.date.slice(-2))}
                       </span>
                       <span className="text-xs text-slate-500">
                          {holidayDate(holiday.date).toLocaleDateString(locale, { month: 'short', timeZone:'Asia/Bangkok' })}
                       </span>
                    </div>

                    {/* รายละเอียด */}
                    <div className="flex-1 py-1">
                      <div className="text-sm font-semibold text-slate-700 group-hover:text-green-700">
                        {language==='th'?(holiday.localName||holiday.name):holiday.name}
                      </div>

                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col justify-center items-center py-12 text-red-400 gap-2">
                   <AlertCircle className="h-8 w-8" />
                   <span className="text-xs">{language==='th'?'ไม่พบข้อมูลวันหยุด':'No holidays found'}</span>
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