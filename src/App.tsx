import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react"; // ไอคอนโหลด

import Index from "@/pages/Index";
import LeaveRequest from "@/pages/LeaveRequest";
import NotFound from "@/pages/NotFound";
import RejectForm from "@/pages/RejectForm";
import ProfileSetup from "@/components/ProfileSetup"; 

import { useLanguage } from "./hooks/useLanguage";


const queryClient = new QueryClient();
const LIFF_ID = "2008617589-89gR1Y3Y";

const WEBHOOK_CHECK_USER = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/check-user";
const WEBHOOK_REGISTER_USER = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/register-user";

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [localUser, setLocalUser] = useState<{name: string, department: string} | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); // สถานะรอโหลดข้อมูล

  const params = new URLSearchParams(window.location.search);
  const typeFromUrl = params.get("type");

  const { language, toggleLanguage } = useLanguage();

  useEffect(() => {
    const initializeLiffAndCheckUser = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserProfile(profile);

          // ✅ 1. ยิงไปถาม n8n (Google Sheets) ว่าคนนี้เคยสมัครยัง?
          const res = await fetch(`${WEBHOOK_CHECK_USER}?userId=${profile.userId}`, {
            headers: { "ngrok-skip-browser-warning": "true" }
          });
          const data = await res.json();

          if (data.found) {
            // ถ้าเคยสมัครแล้ว ดึงข้อมูลมาใช้เลย
            setLocalUser({ name: data.name, department: data.department });
            localStorage.setItem("tbs_user_profile", JSON.stringify({ name: data.name, department: data.department })); // เซฟลงเครื่องไว้ใช้เป็น Cache เร็วๆ
          } else {
            // ถ้าไม่เคยสมัคร (localUser จะเป็น null ทำให้หน้า ProfileSetup เด้งขึ้นมา)
            setLocalUser(null);
          }
        }
      } catch (error) {
        console.error("Initialization Error:", error);
      } finally {
        setIsInitializing(false); // ปิดหน้าจอโหลด
      }
    };
    
    initializeLiffAndCheckUser();
  }, []);

  // ✅ 2. ฟังก์ชันเมื่อพนักงานกรอกข้อมูลครั้งแรกเสร็จ
  const handleSaveProfile = async (data: {name: string, department: string}) => {
    setIsInitializing(true);
    try {
      // ส่งข้อมูลไปบันทึกลง Google Sheets
      await fetch(WEBHOOK_REGISTER_USER, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true" 
        },
        body: JSON.stringify({
          userId: userProfile?.userId,
          name: data.name,
          department: data.department
        })
      });

      // บันทึกสำเร็จ -> ให้ทะลุเข้าแอปได้
      setLocalUser(data);
      localStorage.setItem("tbs_user_profile", JSON.stringify(data));
    } catch (error) {
      alert("Failed to save profile. / ไม่สามารถบันทึกข้อมูลได้");
      console.error(error);
    } finally {
      setIsInitializing(false);
    }
  };

  const LeaveRequestPage = () => (
    <LeaveRequest 
      userId={userProfile?.userId} 
      userName={localUser?.name || userProfile?.displayName} 
      department={localUser?.department} 
      initialLeaveType={typeFromUrl || ""} 
    />
  );

  const LanguageToggleBtn = () => (
    <button
      onClick={toggleLanguage}
      className="fixed top-4 right-4 z-50 bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5"
    >
      {language === 'th' ? '🇹🇭 TH' : '🇬🇧 EN'}
    </button>
  );


  // โชว์หน้าจอ Loading ระหว่างรอดึงข้อมูล Google Sheets
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Checking User Profile...</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <LanguageToggleBtn />

        <BrowserRouter>
          <Routes>
            <Route path="/reject-form" element={<RejectForm />} />

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