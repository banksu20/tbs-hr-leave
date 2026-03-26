import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import liff from "@line/liff";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Palmtree, CalendarDays, Calendar, CheckCircle2, Clock, XCircle, Users } from "lucide-react";
import HolidaysModal from "./HolidaysModal";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";
import tbsLogo from "@/image/TBS-Logo.png";
import { useLanguage } from "@/hooks/useLanguage";
import TeamCalendar from "./TeamCalendar";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";

const LIFF_ID = "2008617589-89gR1Y3Y";

const Dashboard = () => {
  const [searchParams] = useSearchParams();
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  
  const [userDept, setUserDept] = useState<string>(""); 
  
  const [countItems, setCountItems] = useState(5);

  const { t } = useLanguage();

  const { remainingDays, sickRemaining, annualTotal, sickTaken, sickTotal, personalRemaining, personalTotal, isLoading: isQuotaLoading } = useLeaveQuota(userId);

  const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });

        if(!liff.isLoggedIn()){
          liff.login();
          return;
        }
        const profile = await liff.getProfile();
        setUserId(profile.userId);
        setUserName(profile.displayName);
        // พอได้ userId แล้ว ไปเรียกฟังก์ชันหาชื่อและแผนก
        fetchRegisteredName(profile.userId);

      } catch (err) { 
        console.error("LIFF error:", err); 
      }
    };
    initLiff();
  }, []);

  useEffect(() => {
    if (userId) {
      setIsHistoryLoading(true);
      fetch(`${N8N_URL}/webhook/get-leave-history?userId=${userId}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      })
        .then(res => res.json())
        .then(data => {
          setLeaveHistory(Array.isArray(data) ? data : []);
          setIsHistoryLoading(false);
        })
        .catch(() => setIsHistoryLoading(false));
    }
  }, [userId]);

  const fetchRegisteredName = async (id: string) => {
    try {
      const res = await fetch(`${N8N_URL}/webhook/check-user?userId=${id}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      if(data.found) {
        setRegisteredName(data.name);
        if (data.department) {
            setUserDept(data.department);
        }
      }
  }catch (err) {
    console.error("Error fetching registered name:", err);
  }
}

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header Profile */}
      <div className="bg-white py-6 px-5 shadow-sm relative rounded-b-3xl">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-emerald-500"></div>
        
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <p className="text-[13px] font-semibold text-slate-400 tracking-wider uppercase mb-1">
              TBS Employee System
            </p>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none mb-2">
              <span className="text-[#00B5E2] capitalize">
                {(() => {
                  const parts = (registeredName || "").split('|').map(p => p.trim().replace(/[()]/g, ""));
                  
                  const validParts = parts.filter(p => p !== "");

                  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
                    return `${parts[0]} ${parts[1]} (${parts[2]})`;
                  }

                  if (validParts.length > 1) {
                    const nick = validParts.pop(); 
                    const name = validParts.join(" "); 
                    return `${name} (${nick})`;
                  }


                  if (validParts.length === 1) {
                    return validParts[0]; 
                  }

                  return "User";
                })()}
              </span>
            </p>
            <div className="inline-flex items-center gap-2 bg-slate-100 px-2.5 py-1 rounded-lg w-fit">
              <div className="bg-[#06C755] p-1 rounded-md shadow-sm">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 10.304c0-4.579-4.82-8.304-10.741-8.304-5.922 0-10.74 3.725-10.74 8.304 0 4.104 3.821 7.535 8.985 8.196.349.075.824.23.943.528.108.272.071.699.035 1.047l-.151 1.043c-.046.323-.211 1.263 1.053.69 1.263-.574 6.817-4.014 9.303-6.87 1.83-2.107 2.313-3.816 2.313-5.634z" />
                </svg>
              </div>
              <span className="text-xs font-medium text-slate-500 truncate max-w-[120px]">
                {userName || "Loading..."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quota & Holiday Grid */}
      <div className="px-4 mt-6 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          
          {/* Sick Quota Card */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-100 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 opacity-[0.03]">
              <Thermometer className="w-24 h-24 text-rose-500" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-rose-50 p-2 rounded-xl text-rose-500">
                <Thermometer className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wide truncate">{t('sick_leave')}</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              {isQuotaLoading ? <Skeleton className="h-8 w-12" /> : (
                <><span className="text-3xl font-extrabold text-slate-800">{sickTaken || 0}</span>
                <span className="text-sm font-medium text-slate-400">{t('days')}</span></>
              )}
            </div>
          </div>

          {/* Annual Quota Card  */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-sky-100 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 opacity-[0.03]">
              <Palmtree className="w-24 h-24 text-sky-500" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-sky-50 p-2 rounded-xl text-sky-500">
                <Palmtree className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-sky-700 uppercase tracking-wide truncate">{t('annual_leave')}</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1 z-10">
              {isQuotaLoading ? <Skeleton className="h-8 w-12" /> : 
                Number(remainingDays) <= 0 ? (
                  <span className="text-[11px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-2 py-1 rounded-md">วันหยุดหมดแล้ว</span>
                ) : (
                  <><span className="text-3xl font-extrabold text-slate-800">{remainingDays}</span>
                  <span className="text-sm font-bold text-slate-300">/ {annualTotal}</span></>
                )}
            </div>
          </div>
        </div>

        {/* Personal Quota Card */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100 relative overflow-hidden flex items-center justify-between">
          <div className="absolute -right-2 -top-8 opacity-[0.03]">
            <CalendarDays className="w-32 h-32 text-amber-500" />
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-amber-50 p-3 rounded-xl text-amber-500">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">{t('personal_leave')}</span>
            </div>
          </div>
          <div className="flex items-baseline gap-1 z-10">
            {isQuotaLoading ? <Skeleton className="h-8 w-16" /> : 
              personalRemaining <= 0 ? (
                <span className="text-[11px] font-bold text-rose-500 bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100">วันหยุดหมดแล้ว</span>
              ) : (
                <><span className="text-3xl font-extrabold text-slate-800">{personalTotal || 0}</span>
                <span className="text-sm font-medium text-slate-400">{t('days')}</span></>
              )}
          </div>
        </div>


        {/* Full width Company Holiday Button */}
        <button 
          onClick={() => setShowHolidaysModal(true)}
          className="col-span-2 bg-gradient-to-r from-emerald-500 to-teal-400 p-4 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold text-white">{t('company_holidays')}</span>
              <span className="text-[11px] font-medium text-emerald-50">Company Holidays</span>
            </div>
          </div>
          <div className="bg-white/20 px-3 py-1.5 rounded-full">
            <span className="text-xs font-semibold text-white">{t('view_calendar')}</span>
          </div>
        </button>

        {/* ปุ่ม Team Leave Calendar */}
        <Dialog>
          <DialogTrigger asChild>
            <button 
              className="col-span-2 bg-gradient-to-r from-blue-500 to-indigo-500 p-4 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform mt-[-4px]"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-xl">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-sm font-bold text-white">{t('team_calendar')}</span>
                  {/*  โชว์ชื่อแผนกในปุ่ม เพื่อให้พนักงานรู้ว่ากำลังดูของแผนกไหน */}
                  <span className="text-[11px] font-medium text-blue-100">
                    {userDept ? `Team Calendar: ${userDept}` : 'Team Leave Calendar'}
                  </span>
                </div>
              </div>
              <div className="bg-white/20 px-3 py-1.5 rounded-full">
                <span className="text-xs font-semibold text-white">{t('view_list')}</span>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="w-[90%] max-w-md rounded-2xl p-0 border-0 overflow-hidden bg-transparent shadow-none">
             <DialogTitle className="sr-only">{t('team_calendar')}</DialogTitle>
             
             {/* โยน userDept เข้าไปให้ TeamCalendar */}
             {userDept ? (
               <TeamCalendar department={userDept} />
             ) : (
               <div className="p-8 bg-white rounded-2xl text-center"><Skeleton className="w-full h-64" /></div>
             )}

          </DialogContent>
        </Dialog>
      </div>

      {/* History Section */}
      <div className="px-4 mt-8 pb-10 flex-1">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-slate-800 uppercase tracking-wide">{t('leave_history')}</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-200/50 px-2 py-1 rounded-md">
            {leaveHistory.length} Items 
          </span> 
        </div>

        <div className="space-y-3">
          {isHistoryLoading ? (
            Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-[1.25rem]" />
            ))
          ) : leaveHistory.length > 0 ? (
            <>
              {leaveHistory.slice(0, countItems).map((item: any, i) => {
                const isSick = item.type.includes('ป่วย') || item.type.toLowerCase().includes('sick');
                const isPersonal = item.type.includes('กิจ') || item.type.toLowerCase().includes('personal');
                
                const isApproved = item.status.includes('Approved');
                const isRejected = item.status.includes('Rejected') || item.status.includes('ปฏิเสธ');
                
                const displayType = isSick ? t('sick_leave') : isPersonal ? 'Personal Leave' : t('annual_leave');

                const formatDisplayDate = (selectedDatesStr: string, fallbackDate: string) => {
                  if (!selectedDatesStr) return fallbackDate;
                  const dateArray = selectedDatesStr.split(',').map(s => s.trim());
                  
                  const datesObj = dateArray.map(dStr => {
                    const parts = dStr.split('-');
                    if(parts.length !== 3) return new Date(dStr);
                    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                  }).filter(d => !isNaN(d.getTime())).sort((a, b) => a.getTime() - b.getTime());

                  if (datesObj.length === 0) return fallbackDate;

                  const groups: any = {};
                  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                  
                  datesObj.forEach(d => {
                    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(d.getDate());
                  });

                  return Object.entries(groups).map(([monthYear, days]: [string, any]) => `${days.join(', ')} ${monthYear}`).join(' / ');
                };

                const finalDateToShow = formatDisplayDate(item.selected_dates, item.date);

                return (
                  <div 
                    key={i} 
                    className="bg-white p-4 rounded-[1.25rem] shadow-sm border border-slate-100 flex items-center justify-between relative overflow-hidden"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isApproved ? 'bg-emerald-400' : isRejected ? 'bg-rose-400' : 'bg-amber-400'}`}></div>
                    
                    <div className="flex items-center gap-3.5 pl-2">
                      <div className={`p-2.5 rounded-xl ${isSick ? 'bg-rose-50 text-rose-500' : isPersonal ? 'bg-amber-50 text-amber-500' : 'bg-sky-50 text-sky-500'}`}>
                        {isSick ? <Thermometer className="h-5 w-5" /> : isPersonal ? <CalendarDays className="h-5 w-5" /> : <Palmtree className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-slate-800 leading-none mb-1.5">{displayType}</p>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Calendar className="h-3 w-3" />
                          <p className="text-[11px] font-medium">{finalDateToShow}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <div className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider ${
                        isApproved ? 'text-emerald-600' : isRejected ? 'text-rose-600' : 'text-amber-600'
                      }`}>
                        {isApproved ? <CheckCircle2 className="w-3.5 h-3.5" /> : isRejected ? <XCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {isApproved ? t('approved') : isRejected ? t('rejected') : t('pending')}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-2 w-full mt-3">
                {countItems < leaveHistory.length && (
                  <button 
                    onClick={() => setCountItems(prev => prev + 5)} 
                    className="flex-1 py-3 rounded-xl bg-sky-50 text-sky-600 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <CalendarDays className="w-4 h-4" />
                    {t('load_more')}
                  </button>
                )}
                
                {countItems > 5 && (
                  <button 
                    onClick={() => setCountItems(5)} 
                    className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    {t('show_less')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10 bg-white rounded-[1.5rem] border border-dashed border-slate-200 mt-2">
              <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-[13px] font-medium text-slate-400">{t('no_history')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 flex flex-col items-center border-t border-slate-100 bg-white mt-auto">
        <img src={tbsLogo} alt="TBS Logo" className="h-8 w-auto" />
        <span className="text-[10px] font-medium text-slate-400 mt-2 tracking-wide">
          © {new Date().getFullYear()} TBS MARKETING
        </span>
      </div>

      <HolidaysModal open={showHolidaysModal} onOpenChange={setShowHolidaysModal} />
    </div>
  );
};

export default Dashboard;