import EmployeeCancellations from "./EmployeeCancellations";
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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

const Dashboard = ({ employeePreview = false }: { employeePreview?: boolean } = {}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  
  const [userDept, setUserDept] = useState<string>(""); 
  

  const { t } = useLanguage();

  const { remainingDays, sickRemaining, annualTotal, sickTaken, sickTotal, personalRemaining, personalTotal, personalTaken, isLoading: isQuotaLoading, refetch: refreshQuota } = useLeaveQuota(userId);

  const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

  const Boom_userId = "Uc229f2377a2b8839adab478d92c0c26f";
  const cleanDept = userDept?.trim();
  const isTechTeam = cleanDept === "Web Developer" || cleanDept === "UX/UI Designer";
  const isCreativeTeam = userId === Boom_userId && (cleanDept === "Graphic" || cleanDept === "Content");
  
  const displayDeptName = isTechTeam ? "DEV & UX/UI" : isCreativeTeam ? "Graphic & Content" : cleanDept;
  const isCeo = !employeePreview && (userId === (import.meta.env.VITE_CEO_USER_ID || "Uc229f2377a2b8839adab478d92c0c26f") || import.meta.env.DEV);

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

  const fetchRegisteredName = async (id: string) => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/check-user?userId=${id}`);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    if(data.found) {
      setRegisteredName(data.name);
      if (data.department) {
          setUserDept(data.department);
      }
    }
  } catch (err) {
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
        {isCeo && (
          <button
            onClick={() => navigate("/ceo")}
            className="w-full bg-slate-900 text-amber-400 p-4 rounded-2xl shadow-sm flex items-center justify-between active:scale-[0.98] transition-transform border border-slate-800"
          >
            <div className="flex items-center gap-3">
              <div className="bg-amber-400/20 p-2.5 rounded-xl text-amber-400 border border-amber-400/30">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-white font-sans">ระบบจัดการหลังบ้าน (CEO Portal)</span>
                <span className="text-[11px] font-medium text-slate-400 font-sans">เข้าสู่ระบบจัดการข้อมูลและวันลาพนักงาน</span>
              </div>
            </div>
            <div className="bg-amber-400 text-slate-950 px-3 py-1.5 rounded-full text-xs font-bold font-sans">
              เข้าใช้งาน ➔
            </div>
          </button>
        )}
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
            {isQuotaLoading ? <Skeleton className="h-8 w-16" /> : (
                <><span className="text-3xl font-extrabold text-slate-800">{personalTaken || 0}</span>
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
                    {userDept ? `Team Calendar: ${displayDeptName}` : 'Team Leave Calendar'}
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
               <TeamCalendar 
               department={userDept}
               userId={userId}
               />
             ) : (
               <div className="p-8 bg-white rounded-2xl text-center"><Skeleton className="w-full h-64" /></div>
             )}

          </DialogContent>
        </Dialog>
      </div>

      <EmployeeCancellations userId={userId} onChanged={refreshQuota} />

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