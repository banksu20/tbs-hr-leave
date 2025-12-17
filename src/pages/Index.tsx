import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Dashboard from "@/components/Dashboard"; // (หรือ Component Dashboard เดิมของคุณ)

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // ดึงค่า type จาก URL (เช่น ?type=sick)
  const type = searchParams.get("type");

  useEffect(() => {
    // 🚦 ตำรวจจราจร: ถ้ามี 'type' ติดมา แสดงว่าตั้งใจจะไปหน้าลา ไม่ใช่หน้าหลัก
    if (type) {
      console.log("Redirecting to Leave Request...");
      // สั่งย้ายไปหน้า leave-request ทันที
      navigate(`/leave-request?type=${type}`);
    }
  }, [type, navigate]);

  // 🙈 ถ้ามี type อยู่ อย่าเพิ่งโชว์ Dashboard ให้โชว์หน้าจอว่างๆ หรือ Loading แทน
  // เพื่อป้องกันอาการ "หน้าหลักแวบขึ้นมา" (Flash)
  if (type) {
    return <div className="min-h-screen bg-white" />; // จอขาวรอ Redirect
  }

  // ✅ ถ้าไม่มี type (เปิดเข้ามาปกติ) ให้โชว์ Dashboard ตามเดิม
  return <Dashboard />;
};

export default Index;