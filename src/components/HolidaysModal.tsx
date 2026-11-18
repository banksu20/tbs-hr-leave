import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { CalendarDays, Loader2, AlertCircle, ChevronDown, PartyPopper } from "lucide-react";

interface HolidaysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Holiday {
  date: string;
  localName: string;
  name: string;
}

const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const dayDiff = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

const HolidaysModal = ({ open, onOpenChange }: HolidaysModalProps) => {
  const { language } = useLanguage();
  const th = language === 'th';
  const locale = th ? 'th-TH' : 'en-GB';
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const currentYear = Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date()));
  const holidayDate = (value:string) => new Date(value+'T12:00:00+07:00');
  const fmt = (value: string, options: Intl.DateTimeFormatOptions) => holidayDate(value).toLocaleDateString(locale, { ...options, timeZone: 'Asia/Bangkok' });
  const title = (h: Holiday) => th ? (h.localName || h.name) : (h.name || h.localName);

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response=await fetch(`/api/company-holidays?year=${currentYear}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok||!data.confirmed)throw Error('Calendar not confirmed');
      setHolidays([...data.holidays].sort((a: Holiday, b: Holiday) => a.date.localeCompare(b.date)));
    } catch {
      setError(true);setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [currentYear]);

  useEffect(() => { if (open) { setShowPast(false); void fetchHolidays(); } }, [open, fetchHolidays]);

  const today = bangkokToday();
  const upcoming = holidays.filter(h => h.date >= today);
  const past = holidays.filter(h => h.date < today);
  const next = upcoming[0];
  const rest = upcoming.slice(1);
  const countdown = (date: string) => {
    const n = dayDiff(today, date);
    if (n === 0) return th ? 'วันนี้' : 'Today';
    if (n === 1) return th ? 'พรุ่งนี้' : 'Tomorrow';
    return th ? `อีก ${n} วัน` : `In ${n} days`;
  };

  const groups = (list: Holiday[]) => list.reduce<{ month: string; items: Holiday[] }[]>((acc, h) => {
    const month = h.date.slice(0, 7);
    const last = acc[acc.length - 1];
    if (last?.month === month) last.items.push(h); else acc.push({ month, items: [h] });
    return acc;
  }, []);

  const row = (h: Holiday, dim = false) => {
    return (
      <li key={h.date + title(h)} className={`flex items-center gap-3 py-2.5 ${dim ? 'opacity-50' : ''}`}>
        <div className="w-12 shrink-0 text-center rounded-xl bg-emerald-50 border border-emerald-100 py-1">
          <div className="text-lg font-extrabold leading-none text-emerald-700">{Number(h.date.slice(-2))}</div>
          <div className="text-[10px] font-semibold uppercase text-emerald-600 mt-0.5">{fmt(h.date, { weekday: 'short' })}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-snug">{title(h)}</p>
        </div>
        {!dim && <span className="shrink-0 text-[11px] font-medium text-slate-500">{countdown(h.date)}</span>}
      </li>
    );
  };

  const monthList = (list: Holiday[], dim = false) => groups(list).map(g => (
    <section key={g.month}>
      <h3 className="sticky top-0 bg-white/95 backdrop-blur py-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{fmt(g.month + '-15', { month: 'long' })}</h3>
      <ul className="divide-y divide-slate-100">{g.items.map(h => row(h, dim))}</ul>
    </section>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92%] max-w-md max-h-[85vh] overflow-hidden flex flex-col bg-white rounded-2xl p-5 gap-3">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-lg text-slate-800">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
            {th?'ปฏิทินวันหยุด':'Company holidays'} {currentYear}
          </DialogTitle>
          {!loading && !error && holidays.length > 0 && <p className="text-xs text-slate-500">{th ? `เหลืออีก ${upcoming.length} จาก ${holidays.length} วันในปีนี้` : `${upcoming.length} of ${holidays.length} still to come this year`}</p>}
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-5 px-5">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-12 text-slate-400 gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <span className="text-xs">{th?'กำลังโหลดวันหยุด…':'Loading holidays…'}</span>
            </div>
          ) : error ? (
            <p role="alert" className="text-amber-800 text-sm py-6">{th?'ยังไม่มีข้อมูลวันหยุดบริษัท กรุณาติดต่อฝ่ายบุคคล':'Company holidays are not available yet. Please contact HR.'}</p>
          ) : holidays.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-12 text-slate-400 gap-2">
              <AlertCircle className="h-8 w-8" />
              <span className="text-xs">{th?'ไม่พบข้อมูลวันหยุด':'No holidays found'}</span>
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {next ? (
                <div className="rounded-2xl bg-linear-to-br/srgb from-emerald-500 to-teal-500 text-white p-4 flex items-center gap-4 shadow-sm">
                  <div className="w-16 shrink-0 text-center rounded-xl bg-white/20 py-2">
                    <div className="text-3xl font-extrabold leading-none">{Number(next.date.slice(-2))}</div>
                    <div className="text-[11px] font-semibold uppercase mt-1">{fmt(next.date, { month: 'short' })}</div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-50 flex items-center gap-1"><PartyPopper className="h-3.5 w-3.5" />{th ? 'วันหยุดถัดไป' : 'Next holiday'} · {countdown(next.date)}</p>
                    <p className="text-base font-bold leading-snug mt-0.5">{title(next)}</p>
                    <p className="text-xs text-emerald-50">{fmt(next.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-2">{th ? 'ไม่มีวันหยุดที่เหลือในปีนี้แล้ว' : 'No more holidays this year.'}</p>
              )}

              {rest.length > 0 && <div>{monthList(rest)}</div>}

              {past.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowPast(v => !v)} className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                    {th ? `วันหยุดที่ผ่านไปแล้ว (${past.length})` : `Past holidays (${past.length})`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showPast ? 'rotate-180' : ''}`} />
                  </button>
                  {showPast && <div className="mt-2">{monthList(past, true)}</div>}
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
