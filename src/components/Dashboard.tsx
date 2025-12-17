import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { Card, CardContent } from "@/components/ui/card";
import { Thermometer, Palmtree, CalendarCheck, CalendarDays } from "lucide-react";
import HolidaysModal from "./HolidaysModal";

const Dashboard = () => {
  const navigate = useNavigate();
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);

  const handleSickLeave = () => {
    navigate("/leave-request?type=sick");
  };

  const handleVacationLeave = () => {
    navigate("/leave-request?type=annual");
  };

  const handleCheckQuota = () => {
    Swal.fire({
      icon: "info",
      title: "เช็ควันลา",
      html: `<p style="font-size: 16px; line-height: 1.6;">หากต้องการตรวจสอบวันลาคงเหลือ<br/>กรุณาพิมพ์ <strong>'เช็ควันลา'</strong><br/>ในแชท LINE</p>`,
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

  return (
    <div className="min-h-screen bg-[#06C755]">
      {/* Header */}
      <div className="bg-[#06C755] text-white py-8 px-4 text-center">
        <h1 className="text-2xl font-bold">Employee Self-Service</h1>
        <p className="text-sm opacity-90 mt-1">ระบบบริการพนักงาน</p>
      </div>

      {/* Menu Grid */}
      <div className="px-4 pb-6 -mt-2">
        <Card className="rounded-t-3xl shadow-lg">
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
