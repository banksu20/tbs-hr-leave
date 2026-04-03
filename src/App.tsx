import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react"; 

import Index from "@/pages/Index";
import LeaveRequest from "@/pages/LeaveRequest";
import NotFound from "@/pages/NotFound";
import RejectForm from "@/pages/RejectForm";
import ProfileSetup from "@/components/ProfileSetup"; 

import { useLanguage } from "./hooks/useLanguage";

const queryClient = new QueryClient();
const LIFF_ID = "2008617589-89gR1Y3Y";

// 🔗 Webhook URL
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
const WEBHOOK_CHECK_USER = `${N8N_URL}/webhook/check-user`;
const WEBHOOK_REGISTER_USER = `${N8N_URL}/webhook/register-user`;

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [localUser, setLocalUser] = useState<{name: string, department: string} | null>(null);
  const [isInitializing, setIsInitializing] = useState(true); 

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

          const res = await fetch(`${WEBHOOK_CHECK_USER}?userId=${profile.userId}`, {
            headers: { "ngrok-skip-browser-warning": "true" }
          });
          const data = await res.json();

          if (data.found) {
            setLocalUser({ name: data.name, department: data.department });
            localStorage.setItem("tbs_user_profile", JSON.stringify({ name: data.name, department: data.department }));
          } else {
            setLocalUser(null);
          }
        }
      } catch (error) {
        console.error("Initialization Error:", error);
      } finally {
        setIsInitializing(false); 
      }
    };
    
    initializeLiffAndCheckUser();
  }, []);

  const handleSaveProfile = async (data: {name: string, department: string, pin: string}) => {
    setIsInitializing(true);
    try {
      const res = await fetch(WEBHOOK_REGISTER_USER, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true" 
        },
        body: JSON.stringify({
          userId: userProfile?.userId,
          name: data.name,        
          department: data.department,
          pin: data.pin           
        })
      });

      const result = await res.json();

      if (!res.ok || result.status === "error") {
        throw new Error(result.message || "Invalid PIN / รหัส PIN ไม่ถูกต้อง");
      }

      setLocalUser({ name: data.name, department: data.department });
      localStorage.setItem("tbs_user_profile", JSON.stringify({ name: data.name, department: data.department }));
      
    } catch (error: any) {
      alert(error.message || "Failed to bind account.");
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
      {language === 'th' ? 'TH' : 'EN'}
    </button>
  );

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Loading TBS System...</p>
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
                  <ProfileSetup onSave={handleSaveProfile} />
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
                  <ProfileSetup onSave={handleSaveProfile} />
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