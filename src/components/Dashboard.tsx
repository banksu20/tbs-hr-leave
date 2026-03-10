import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Palmtree, CalendarCheck, CalendarDays, Calendar } from "lucide-react";
import HolidaysModal from "./HolidaysModal";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";
import tbsLogo from "@/image/TBS-Logo.png";

const LIFF_ID = "2008617589-89gR1Y3Y";

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  // ดึงข้อมูล Leave Quota (รองรับทั้ง Annual และ Sick)
  const { remainingDays, sickRemaining, isLoading: isQuotaLoading } = useLeaveQuota(userId);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserId(profile.userId);
          setUserName(profile.displayName);
        }
      } catch (err) { console.error("LIFF error:", err); }
    };
    initLiff();
  }, []);

  useEffect(() => {
    if (userId) {
      setIsHistoryLoading(true);
      fetch(`https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/get-leave-history?userId=${userId}`, {
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

  const handleCheckQuota = () => {
    if (isQuotaLoading) return;
    Swal.fire({
      title: "วันลาคงเหลือของคุณ",
      html: `
        <div style="padding: 10px 0;">
          <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #0ea5e9;">${remainingDays ?? 0}</div>
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">ANNUAL (DAYS)</div>
            </div>
            <div style="width: 1px; background: #e2e8f0;"></div>
            <div>
              <div style="font-size: 32px; font-weight: 800; color: #f43f5e;">${sickRemaining ?? 0}</div>
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">SICK (DAYS)</div>
            </div>
          </div>
          <div style="font-size: 13px; color: #94a3b8; background: #f8fafc; padding: 10px; border-radius: 12px;">
             User: <strong>${userName || "Guest"}</strong>
          </div>
        </div>
      `,
      confirmButtonText: "Close",
      confirmButtonColor: "#0ea5e9",
      customClass: { popup: 'rounded-3xl shadow-xl' }
    });
  };

  const menuItems = [
    { title: "ลาป่วย", subtitle: "Sick Leave", icon: Thermometer, gradient: "from-rose-500 to-red-400", onClick: () => navigate("/leave-request?type=sick") },
    { title: "ลาพักร้อน", subtitle: "Annual Leave", icon: Palmtree, gradient: "from-sky-500 to-blue-400", onClick: () => navigate("/leave-request?type=vacation") },
    { title: "เช็ควันลา", subtitle: "My Leave Quota", icon: CalendarCheck, gradient: "from-amber-500 to-orange-400", onClick: handleCheckQuota },
    { title: "วันหยุดบริษัท", subtitle: "Company Holidays", icon: CalendarDays, gradient: "from-emerald-500 to-green-400", onClick: () => setShowHolidaysModal(true) },
  ];

  const TbsTextLogo = () => (
    <>
      <span style={{ color: "#25D6F7" }}>T</span>
      <span style={{ color: "#FFA100" }}>B</span>
      <span style={{ color: "#5BD825" }}>S</span>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white py-6 px-4 shadow-sm relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-emerald-500"></div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-slate-800"><TbsTextLogo /> Leave System</h1>
            <p className="text-sm text-slate-500 mt-1">{userName ? `Hi, ${userName}` : "Welcome"}</p>
          </div>
          <div className="flex gap-2">
            <div className="bg-sky-50 border border-sky-100 px-2 py-1.5 rounded-xl flex items-center gap-1.5">
              <Palmtree className="h-3.5 w-3.5 text-sky-500" />
              <div className="flex flex-col leading-none">
                <span className="text-[10px] uppercase font-medium text-sky-400">Annual</span>
                <span className="text-sm font-extralight text-sky-700">{remainingDays} d</span>
              </div>
            </div>
            <div className="bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <div className="relative">
                <Thermometer className="h-4 w-4 text-rose-500" />
              </div >
              <div className="flex flex-col leading-none">
                <span className="text-[10px] uppercase font-medium text-rose-400">Sick</span>
                <span className="text-sm font-extralight text-rose-700">{sickRemaining} d</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="px-4 grid grid-cols-2 gap-4 mt-6">
        {menuItems.map((item, i) => (
          <button key={i} onClick={item.onClick} className="flex flex-col items-center p-4 rounded-2xl bg-white shadow-sm border border-slate-100 active:scale-95 transition-all">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-md`}>
              <item.icon className="h-7 w-7 text-white" />
            </div>
            <span className="text-base font-semimedium text-slate-700">{item.title}</span>
            <span className="text-xs text-slate-400">{item.subtitle}</span>
          </button>
        ))}
      </div>

      {/* History Section */}
      <div className="px-4 mt-10 pb-10 flex-1">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-6 bg-sky-500 rounded-full"></div>
            <h3 className="text-lg font-medium text-slate-800">รายการลาล่าสุด</h3>
          </div>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">3 items</span>
        </div>

        <div className="space-y-4">
          {isHistoryLoading ? (
            <Skeleton className="h-24 w-full rounded-[2rem]" />
          ) : leaveHistory.length > 0 ? (
            leaveHistory.map((item: any, i) => {
              // ตรวจสอบเงื่อนไขประเภทและสถานะ
              const isSick = item.type.includes('ป่วย') || item.type.toLowerCase().includes('sick');
              const isApproved = item.status.includes('Approved');
              const isRejected = item.status.includes('Rejected');

              return (
                <div 
                  key={i} 
                  className="group bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-md hover:border-sky-100 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    {/* Icon พร้อมพื้นหลัง Soft Color */}
                    <div className={`p-3.5 rounded-2xl transition-transform group-hover:scale-110 ${
                      isSick ? 'bg-rose-50 text-rose-500' : 'bg-sky-50 text-sky-500'
                    }`}>
                      {isSick ? <Thermometer className="h-6 w-6" /> : <Palmtree className="h-6 w-6" />}
                    </div>

                    <div>
                      <p className="text-base font-medium text-slate-800 leading-none mb-1.5">{item.type}</p>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Calendar className="h-3 w-3" />
                        <p className="text-[11px] font-medium">{item.date}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge ทรงแคปซูล */}
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight border shadow-sm ${
                    isApproved ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 
                    isRejected ? 'bg-rose-50 border-rose-100 text-rose-600' : 
                    'bg-amber-50 border-amber-100 text-amber-600'
                  }`}>
                    {isApproved ? 'อนุมัติแล้ว' : isRejected ? 'ปฏิเสธ' : 'รอตรวจสอบ'}
                  </div>
                </div>
              );
            })
          ) : (
            /* Empty State */
            <div className="text-center py-12 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
              <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <CalendarCheck className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-400">ไม่พบประวัติการลาของคุณ</p>
            </div>
          )}
        </div>
      </div>

      <div className="py-8 flex flex-col items-center">
        <img src={tbsLogo} alt="TBS Logo" className="h-10 w-auto opacity-80" />
        <span className="text-[10px] text-slate-400 mt-2">© 2025 - {new Date().getFullYear()} TBS Marketing</span>
      </div>

      <HolidaysModal open={showHolidaysModal} onOpenChange={setShowHolidaysModal} />
    </div>
  );
};

export default Dashboard;