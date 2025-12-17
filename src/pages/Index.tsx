import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Dashboard from "@/components/Dashboard"; // ตรวจสอบว่า path นี้ถูกต้อง (ถ้าหาไม่เจอให้ลอง ../components/Dashboard)

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // ดึงค่า type จาก URL (เช่น ?type=sick)
  const type = searchParams.get("type");

  useEffect(() => {
    // ถ้ามี 'type' ติดมา แสดงว่าตั้งใจจะไปหน้าลา
    if (type) {
      console.log("Redirecting to Leave Request:", type);
      // สั่งย้ายหน้าทันที (replace: true จะช่วยไม่ให้กด back แล้ววนกลับมา)
      navigate(`/leave-request?type=${type}`, { replace: true });
    }
  }, [type, navigate]);

  // 🔴 จุดสำคัญ: ถ้ามี type ติดมา "ห้าม" return Dashboard เด็ดขาด
  // ให้ return เป็น div ว่างๆ หรือ Loading แทน
  if (type) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        {/* ใส่ Loading Spin หรือปล่อยว่างไว้ก็ได้ */}
        <div className="text-gray-400">Loading...</div> 
      </div>
    );
  }

  // ✅ ถ้าไม่มี type (เข้าหน้าแรกปกติ) ถึงจะโชว์ Dashboard
  return <Dashboard />;
};

export default Index;