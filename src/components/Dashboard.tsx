import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { Card, CardContent } from "@/components/ui/card";
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

  // ดึงข้อมูล Leave Quota
  const { remainingDays, isLoading: isQuotaLoading } = useLeaveQuota(userId);

  // Init LIFF เพื่อดึง userId
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserId(profile.userId);
          setUserName(profile.displayName);
        }
      } catch (err) {
        console.error("LIFF init failed:", err);
      }
    };
    initLiff();
  }, []);

  // เช็คว่าต้องเปิด Modal อัตโนมัติไหม
  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "holidays") {
      setShowHolidaysModal(true);
    }
  }, [searchParams]);


useEffect(() => {
  if (userId) {
    setIsHistoryLoading(true);
    fetch(`https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/get-leave-history?userId=${userId}`, {
      method: "GET", // หรือ POST ตามที่ตั้งค่าใน n8n
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Content-Type": "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      })
      .then((data) => {
        console.log("History Data:", data); // ตรวจสอบข้อมูลที่ได้ใน Console
        setLeaveHistory(Array.isArray(data) ? data : []);
        setIsHistoryLoading(false);
      })
      .catch((err) => {
        console.error("Fetch history failed:", err);
        setIsHistoryLoading(false);
      });
  }
}, [userId]);


  const handleSickLeave = () => {
    navigate("/leave-request?type=sick");
  };

  const handleVacationLeave = () => {
    // 3. ✅ แก้เป็น type=vacation ให้ตรงกับ Logic ในหน้าฟอร์ม
    navigate("/leave-request?type=vacation");
  };

const handleCheckQuota = () => {
    // 1. ถ้าข้อมูลยังโหลดไม่เสร็จ ให้ขึ้น Loading
    if (isQuotaLoading) {
        Swal.fire({
            title: 'กำลังตรวจสอบข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading() }
        });
        return;
    }

    // 2. แสดงข้อมูลวันลาคงเหลือ (ใช้ Theme สีฟ้า TBS)
    Swal.fire({
      // เปลี่ยน icon เป็น question หรือ info
      icon: 'info',
      title: "วันลาพักร้อนคงเหลือ",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center; padding-top: 10px;">
            <div style="font-size: 56px; font-weight: 800; color: #0ea5e9; line-height: 1;">
                ${remainingDays !== null ? remainingDays : "-"}
            </div>
            <div style="font-size: 18px; color: #64748b; margin-top: 5px; font-weight: 500;">วัน</div>
            
            <div style="width: 100%; height: 1px; background-color: #e2e8f0; margin: 15px 0;"></div>
            
            <p style="font-size: 14px; color: #64748b;">
                ชื่อผู้ใช้งาน: <strong style="color: #334155;">${userName || "ไม่ระบุ"}</strong>
            </p>
        </div>
      `,
      confirmButtonText: "OK",
      confirmButtonColor: "#0ea5e9", // สีฟ้า TBS Style
      customClass: {
        popup: 'rounded-3xl shadow-xl', // ปรับมุมมนให้สวย
        title: 'text-slate-700 font-bold'
      }
    });
  };

  const handleCompanyHolidays = () => {
    setShowHolidaysModal(true);
  };

  const menuItems = [
    {
      title: "ลาป่วย",
      subtitle: "Sick Leave",
      icon: Thermometer,
      onClick: handleSickLeave,
      gradient: "from-rose-500 to-red-400",
    },
    {
      title: "ลาพักร้อน",
      subtitle: "Annual Leave",
      icon: Palmtree,
      onClick: handleVacationLeave,
      gradient: "from-sky-500 to-blue-400",
    },
    {
      title: "เช็ควันลา",
      subtitle: "My Leave Quota",
      icon: CalendarCheck,
      onClick: handleCheckQuota,
      gradient: "from-amber-500 to-orange-400",
    },
    {
      title: "วันหยุดบริษัท",
      subtitle: "Company Holidays",
      icon: CalendarDays,
      onClick: handleCompanyHolidays,
      gradient: "from-emerald-500 to-green-400",
    },
  ];

  // กำหนดสีตามจำนวนวันลาคงเหลือ
  const getQuotaColor = () => {
    if (remainingDays === null) return "bg-muted text-muted-foreground";
    if (remainingDays < 3) return "bg-destructive/10 text-destructive";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
<div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Header */}
      <div className="bg-white text-slate-800 py-6 px-4 shadow-sm relative overflow-hidden">
        {/* (Optional) เพิ่มแถบสี Brand ด้านบนสุดตกแต่ง */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-emerald-500"></div>

        <div className="flex items-center justify-between">
          <div>
             {/* เปลี่ยนสี Text ให้เข้มขึ้นเพราะพื้นขาว */}
            <h1 className="text-2xl font-bold text-slate-800">TBS Leave System</h1>
            <p className="text-sm text-slate-500 mt-1">
              {userName ? `สวัสดี, ${userName}` : "Leave Management System"}
            </p>
          </div>
          
          {/* Leave Quota Badge */}
          {/* ปรับสี Badge ให้อ่อนลงเพื่อให้เข้ากับพื้นขาว */}
          <div className={`px-3 py-2 rounded-xl border ${remainingDays !== null && remainingDays < 3 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-sky-50 border-sky-100 text-sky-600'} flex items-center gap-2`}>
            <Calendar className="h-4 w-4" />
            {isQuotaLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : remainingDays !== null ? (
              <span className="text-sm font-bold">{remainingDays} วัน</span>
            ) : (
              <span className="text-sm">-</span>
            )}
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="px-4 pb-6 -mt-2 flex-1 mt-4"> {/* เพิ่ม mt-4 ให้ห่าง Header นิดนึง */}
        {/* เปลี่ยน Card พื้นหลังเป็น Transparent หรือขาวล้วน */}
        <div className="grid grid-cols-2 gap-4">
            {menuItems.map((item, index) => (
            <button
                key={index}
                onClick={item.onClick}
                className="group focus:outline-none"
            >
                <div className="flex flex-col items-center p-4 rounded-2xl bg-white shadow-sm border border-slate-100 hover:shadow-md transition-all duration-200 active:scale-95 h-full">
                {/* Icon Container */}
                <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-md group-hover:scale-110 transition-transform`}
                >
                    <item.icon className="h-7 w-7 text-white" />
                </div>
                <span className="text-base font-semibold text-slate-700">
                    {item.title}
                </span>
                <span className="text-xs text-slate-400 mt-0.5">
                    {item.subtitle}
                </span>
                </div>
            </button>
            ))}
        </div>
      </div>

            {/* Leave History Section */}
    <div className="px-4 pb-10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800">รายการลาล่าสุด</h3>
        <span className="text-xs text-slate-500">3 รายการล่าสุด</span>
      </div>

      <div className="space-y-3">
        {isHistoryLoading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : leaveHistory.length > 0 ? (
          leaveHistory.map((item, index) => (
            <div key={index} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* ไอคอนแสดงประเภทการลา */}
                <div className={`p-2 rounded-xl ${item.type === 'ลาป่วย' ? 'bg-rose-50 text-rose-500' : 'bg-sky-50 text-sky-500'}`}>
                  {item.type === 'ลาป่วย' ? <Thermometer className="h-5 w-5" /> : <Palmtree className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.type}</p>
                  <p className="text-[11px] text-slate-400">{item.date}</p>
                </div>
              </div>

              {/* Badge แสดงสถานะ */}
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold border 
                ${item.status === 'Approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 
                  item.status === 'Rejected' ? 'bg-rose-50 border-rose-100 text-rose-600' : 
                  'bg-amber-50 border-amber-100 text-amber-600'}`}>
                {item.status === 'Approved' ? 'อนุมัติแล้ว' : item.status === 'Rejected' ? 'ปฏิเสธ' : 'รอตรวจสอบ'}
              </span>
            </div>
          ))
        ) : (
          <div className="text-center py-6 bg-white rounded-2xl border border-dashed border-slate-200">
            <p className="text-sm text-slate-400">ไม่พบประวัติการลา</p>
          </div>
        )}
      </div>
    </div>


      {/* Logo Section */}
      <div className="py-8 flex flex-col items-center justify-center">
        {/* ✅ 4. โลโก้บนพื้นเทาอ่อน จะดูเด่นชัดขึ้น ไม่ต้องใส่กรอบขาวรองหลังแล้ว */}
        <img 
          src={tbsLogo} 
          alt="TBS Marketing" 
          className="h-10 w-auto object-contain" 
        />
        <span className="text-[10px] text-slate-400 mt-2">© 2025{new Date().getFullYear() > 2025 ? ` - ${new Date().getFullYear()}` : ""} TBS Marketing All Rights Reserved.</span>
      </div>

      {/* Holidays Modal */}
      <HolidaysModal
        open={showHolidaysModal}
        onOpenChange={setShowHolidaysModal}
      />
    </div>
  );
};

export default Dashboard;