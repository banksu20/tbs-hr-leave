import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Dashboard from "@/components/Dashboard";
import { Loader2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  // 🔥 1. เช็คจาก URL ของ Browser โดยตรง (ทำงานทันที เร็วกว่า State)
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type"); // เช่น sick, vacation

  // ตัวแปรเช็คสถานะ: ถ้ามี type แปลว่า "กำลังจะย้ายห้อง" (ห้ามโชว์ Dashboard)
  const isRedirecting = !!type; 

  useEffect(() => {
    if (isRedirecting) {
      console.log("Redirecting to:", type);
      // สั่งย้ายไปหน้า Leave Request ทันที
      navigate(`/leave-request?type=${type}`, { replace: true });
    }
  }, [isRedirecting, type, navigate]);

  // 🛑 2. จุดสำคัญที่สุด: ถ้ากำลังจะย้ายห้อง ให้ Return จอโหลดทันที (ห้ามไปบรรทัดล่าง)
  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center">
        {/* ใส่ Spinner สีขาวหมุนๆ ให้รู้ว่ากำลังทำงาน */}
        <Loader2 className="h-12 w-12 text-white animate-spin" />
      </div>
    );
  }

  // ✅ 3. ถ้าไม่มี type (คนเข้าหน้าแรกปกติ) ถึงจะยอมให้โชว์ Dashboard
  return <Dashboard />;
};

export default Index;