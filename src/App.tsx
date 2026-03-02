import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom"; // ❌ ไม่ต้องใช้ Navigate แล้ว
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

  // ⚡️ เช็ค URL ทันที! (Real-time Check)
  // ไม่ว่าจะเข้าลิงก์ไหน ถ้ามี ?type=... ติดมา เราจะรู้ทันทีตรงนี้
  const params = new URLSearchParams(window.location.search);
  const typeFromUrl = params.get("type"); // sick, vacation, etc.

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserProfile(profile);
        }
      } catch (error) {
        console.error("LIFF Init Error:", error);
      }
    };
    initializeLiff();
  }, []);

  // สร้าง Component ฟอร์มเตรียมไว้ (เพื่อลด code ซ้ำ)
  const LeaveRequestPage = () => (
    <LeaveRequest 
      userId={userProfile?.userId} 
      userName={userProfile?.displayName}
      initialLeaveType={typeFromUrl || ""} 
    />
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* 🔥 จุดแก้สำคัญ: ทางแยกวัดใจ */}
            <Route 
              path="/" 
              element={
                // ถ้ามี type ติดมา -> ให้ "กลายร่าง" เป็นหน้าฟอร์มทันที (ไม่ต้อง Redirect)
                // Dashboard (Index) จะไม่มีวันได้เกิด
                typeFromUrl ? <LeaveRequestPage /> : <Index />
              } 
            />

            {/* เผื่อกรณีเข้าผ่านลิงก์ /leave-request โดยตรง */}
            <Route path="/leave-request" element={<LeaveRequestPage />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;