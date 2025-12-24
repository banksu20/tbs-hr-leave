import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer, Palmtree, CalendarCheck, CalendarDays, Calendar } from "lucide-react";
import HolidaysModal from "./HolidaysModal";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";

const LIFF_ID = "2008617589-89gR1Y3Y";

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

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

  const handleSickLeave = () => {
    navigate("/leave-request?type=sick");
  };

  const handleVacationLeave = () => {
    // 3. ✅ แก้เป็น type=vacation ให้ตรงกับ Logic ในหน้าฟอร์ม
    navigate("/leave-request?type=vacation");
  };

  const handleCheckQuota = () => {
    Swal.fire({
      icon: "info",
      title: "เช็ควันลา",
      html: `<p style="font-size: 16px; line-height: 1.6;">หากต้องการตรวจสอบวันลาคงเหลือ<br/>กรุณาเลือก Menu <strong>'เช็ควันลา'</strong><br/>ในแชท LINE</p>`,
      confirmButtonText: "ตกลง",
      confirmButtonColor: "#06C755",
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
      gradient: "from-red-500 to-orange-400",
    },
    {
      title: "ลาพักร้อน",
      subtitle: "Vacation Leave",
      icon: Palmtree,
      onClick: handleVacationLeave,
      gradient: "from-blue-500 to-cyan-400",
    },
    {
      title: "เช็ควันลา",
      subtitle: "My Leave Quota",
      icon: CalendarCheck,
      onClick: handleCheckQuota,
      gradient: "from-purple-500 to-pink-400",
    },
    {
      title: "วันหยุดบริษัท",
      subtitle: "Company Holidays",
      icon: CalendarDays,
      onClick: handleCompanyHolidays,
      gradient: "from-emerald-500 to-teal-400",
    },
  ];

  // กำหนดสีตามจำนวนวันลาคงเหลือ
  const getQuotaColor = () => {
    if (remainingDays === null) return "bg-muted text-muted-foreground";
    if (remainingDays < 3) return "bg-destructive/10 text-destructive";
    return "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="min-h-screen bg-[#06C755]">
      {/* Header */}
      <div className="bg-[#06C755] text-white py-6 px-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">TBS Leave Management System</h1>
            <p className="text-sm opacity-90 mt-1">
              {userName ? `สวัสดี, ${userName}` : "Leave Management System"}
            </p>
          </div>
          {/* Leave Quota Badge */}
          <div className={`px-3 py-2 rounded-xl ${getQuotaColor()} flex items-center gap-2`}>
            <Calendar className="h-4 w-4" />
            {isQuotaLoading ? (
              <Skeleton className="h-4 w-12" />
            ) : remainingDays !== null ? (
              <span className="text-sm font-semibold">{remainingDays} วัน</span>
            ) : (
              <span className="text-sm">-</span>
            )}
          </div>
        </div>
      </div>

      {/* Menu Grid */}
      <div className="px-4 pb-6 -mt-2">
        <Card className="rounded-t-3xl shadow-lg border-none">
          <CardContent className="pt-8 pb-6">
            <div className="grid grid-cols-2 gap-4">
              {menuItems.map((item, index) => (
                <button
                  key={index}
                  onClick={item.onClick}
                  className="group focus:outline-none"
                >
                  <div className="flex flex-col items-center p-4 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-all duration-200 active:scale-95">
                    <div
                      className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-3 shadow-lg group-hover:shadow-xl transition-shadow`}
                    >
                      <item.icon className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-base font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {item.subtitle}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
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