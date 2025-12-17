import { useState, useEffect } from "react";
// ✅ 1. เพิ่ม Navigate เข้ามาใน import
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Index from "./pages/Index";
import LeaveRequest from "./pages/LeaveRequest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const LIFF_ID = "2008617589-89gR1Y3Y";

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);

  // ✅ 2. เช็ค URL ทันทีตั้งแต่บรรทัดแรก (ไม่ต้องรอ useEffect)
  // เพื่อดูว่า user กดมาจากปุ่มลาป่วย/ลาพักร้อน หรือไม่
  const params = new URLSearchParams(window.location.search);
  const typeFromUrl = params.get("type"); // จะได้ค่า 'sick', 'vacation' หรือ null

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserProfile(profile);
          console.log("LIFF Profile:", profile);
        } else {
          // liff.login(); // เปิดไว้ถ้าต้องการบังคับ Login
        }
      } catch (error) {
        console.error("LIFF Init Error:", error);
      }
    };
    initializeLiff();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* ✅ 3. จุดตัดสินใจสำคัญ (Traffic Controller) */}
            <Route 
              path="/" 
              element={
                // ถ้ามี type ติดมาใน URL -> ให้กระโดดไปหน้า /leave-request ทันที (ห้ามโหลด Index)
                typeFromUrl ? (
                  <Navigate to={`/leave-request?type=${typeFromUrl}`} replace />
                ) : (
                  // ถ้าไม่มี -> ค่อยโหลดหน้า Dashboard (Index)
                  <Index />
                )
              } 
            />

            {/* หน้าฟอร์ม: รับค่า User และ Type ที่เตรียมไว้ */}
            <Route 
              path="/leave-request" 
              element={
                <LeaveRequest 
                  userId={userProfile?.userId} 
                  userName={userProfile?.displayName}
                  initialLeaveType={typeFromUrl || ""}
                />
              } 
            />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;