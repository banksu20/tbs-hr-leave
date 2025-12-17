import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "@/components/Dashboard";

const Index = () => {
  const navigate = useNavigate();
  
  // 🚀 เช็ค URL ทันทีตั้งแต่เริ่ม (เร็วกว่าใช้ useSearchParams)
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const action = params.get("action");

  // ถ้ามี "type" (เช่น type=sick) แสดงว่าต้องย้ายหน้า -> ให้ซ่อน Dashboard ไว้ก่อน (false)
  // ถ้าไม่มี "type" (หรือเป็น action=holidays) -> ให้โชว์ Dashboard ได้เลย (true)
  const [showDashboard, setShowDashboard] = useState(!type);

  useEffect(() => {
    if (type) {
      // ⚡ ถ้ามี type ให้ดีดไปหน้า leave-request ทันที
      navigate(`/leave-request?type=${type}`, { replace: true });
    } else {
      // ถ้าไม่มี type (เช่น เข้าหน้าแรกเฉยๆ หรือกดดูวันหยุด) ให้โชว์ Dashboard
      setShowDashboard(true);
    }
  }, [type, navigate]);

  // 🙈 ถ้ายังไม่ให้โชว์ Dashboard (กำลังย้ายหน้า) ให้ขึ้นจอสีเขียวรอไว้
  if (!showDashboard) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center">
         {/* ไม่ต้องใส่ text ก็ได้ หรือใส่ Loading เล็กๆ */}
      </div>
    );
  }

  // ✅ ถ้าตรวจสอบแล้วว่าให้อยู่หน้านี้ได้ ก็โชว์ Dashboard
  return <Dashboard />;
};

export default Index;