import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import Index from "@/pages/Index";
import LeaveRequest from "@/pages/LeaveRequest";
import NotFound from "@/pages/NotFound";
import RejectForm from "@/pages/RejectForm";
import ProfileSetup from "@/components/ProfileSetup"; 

const queryClient = new QueryClient();
const LIFF_ID = "2008617589-89gR1Y3Y";

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);

  const [localUser, setLocalUser] = useState<{name: string, department: string} | null>(() => {
    const saved = localStorage.getItem("tbs_user_profile");
    return saved ? JSON.parse(saved) : null;
  });

  const params = new URLSearchParams(window.location.search);
  const typeFromUrl = params.get("type");

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

  const handleSaveProfile = (data: {name: string, department: string}) => {
    localStorage.setItem("tbs_user_profile", JSON.stringify(data));
    setLocalUser(data); 
  };

  const LeaveRequestPage = () => (
    <LeaveRequest 
      userId={userProfile?.userId} 
      userName={localUser?.name || userProfile?.displayName} 
      department={localUser?.department} 
      initialLeaveType={typeFromUrl || ""} 
    />
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        
        {/* ✅ ปรับ Router ให้อยู่ด้านนอก เพื่อไม่ให้หน้า Reject โดน Block */}
        <BrowserRouter>
          <Routes>
            {/* 1. หน้า Reject Form ไม่ต้องเช็คข้อมูลประวัติ ทะลุเข้าได้เลย */}
            <Route path="/reject-form" element={<RejectForm />} />

            {/* 2. หน้า Dashboard หลัก (บังคับกรอกประวัติ) */}
            <Route 
              path="/" 
              element={
                !localUser ? (
                  <ProfileSetup defaultName={userProfile?.displayName || ""} onSave={handleSaveProfile} />
                ) : typeFromUrl ? (
                  <LeaveRequestPage />
                ) : (
                  <Index />
                )
              } 
            />

            {/* 3. หน้าลางานตรงๆ (บังคับกรอกประวัติ) */}
            <Route 
              path="/leave-request" 
              element={
                !localUser ? (
                  <ProfileSetup defaultName={userProfile?.displayName || ""} onSave={handleSaveProfile} />
                ) : (
                  <LeaveRequestPage />
                )
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