import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react"; // ไอคอนโหลด

import InternDecision from '@/pages/InternDecision';
import Index from "@/pages/Index";
import LeaveRequest from "@/pages/LeaveRequest";
import NotFound from "@/pages/NotFound";
import SickAcknowledgement from "@/pages/SickAcknowledgement";
import CancelDecision from "@/pages/CancelDecision";
import RejectForm from "@/pages/RejectForm";
import ProfileSetup from "@/components/ProfileSetup"; 
import DashboardAccess from "@/components/ceo/DashboardAccess";
import ErrorBoundary from "@/components/ErrorBoundary";

import { useLanguage } from "./hooks/useLanguage";


const queryClient = new QueryClient();
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008617589-89gR1Y3Y";

const WEBHOOK_CHECK_USER = "https://n8n.womenrefugeeroute.org/webhook/check-user";
const WEBHOOK_REGISTER_USER = "https://n8n.womenrefugeeroute.org/webhook/register-user";

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [localUser, setLocalUser] = useState<{name: string, department: string} | null>(null);
  const [pendingRegistration,setPendingRegistration] = useState(false);
  const [profileError,setProfileError] = useState('');
  const [isInitializing, setIsInitializing] = useState(true); // สถานะรอโหลดข้อมูล

  const params = new URLSearchParams(window.location.search);
  const typeFromUrl = params.get("type");

  const { language, toggleLanguage } = useLanguage();

  useEffect(() => {
    // Reminder links verify LINE identity on their own; they do not need Sheets/profile lookup.
    if(window.location.pathname==='/leave-decision'||window.location.pathname==='/sick-acknowledge'||window.location.pathname==='/ceo'){setIsInitializing(false);return;}
    const initializeLiffAndCheckUser = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserProfile(profile);

          const res = await fetch('/api/registration', {
            headers: { Authorization: `Bearer ${liff.getAccessToken()}` }
          });
          const data = await res.json();
          if(!res.ok)throw Error(data.error);
          setPendingRegistration(Boolean(data.pending));
          if(data.inactive)throw Error("This profile is inactive. Please contact HR.");

          if (data.found) {
            setLocalUser({ name: data.name, department: data.department });
            localStorage.setItem("tbs_user_profile", JSON.stringify({ name: data.name, department: data.department })); // เซฟลงเครื่องไว้ใช้เป็น Cache เร็วๆ
          } else {
            setLocalUser(null);
          }
        }
      } catch (error) {
        setProfileError((error as Error).message);
        console.error("Initialization Error:", error);
      } finally {
        setIsInitializing(false); // ปิดหน้าจอโหลด
      }
    };
    
    initializeLiffAndCheckUser();
  }, []);

  const handleSaveProfile = async (data: {name: string, department: string, employmentType: 'employee'|'intern'}) => {
    setIsInitializing(true);
    try {
      const [firstName,lastName,nickname]=data.name.split('|');
      const response=await fetch('/api/registration',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${liff.getAccessToken()}`},body:JSON.stringify({firstName,lastName,nickname,department:data.department,employmentType:data.employmentType})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      setPendingRegistration(Boolean(result.pending));
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
      {language === 'th' ? 'TH' : 'EN'}
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

  if(window.location.pathname!=='/ceo' && (pendingRegistration||profileError))return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><section className="max-w-md rounded-3xl bg-white border p-8 text-center"><h1 className="text-2xl font-bold">{profileError?'Unable to load your profile':'Registration received'}</h1><p className="my-5 text-slate-500">{profileError||'HR will confirm your details before you can request leave.'}</p><button className="rounded-xl bg-cyan-600 text-white px-6 py-3" onClick={()=>window.location.reload()}>Check again</button></section></main>;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <LanguageToggleBtn />

        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <Routes>
            <Route path="/leave-decision" element={<InternDecision/>}/><Route path="/sick-acknowledge" element={<SickAcknowledgement />} />
            <Route path="/cancel-decision" element={<CancelDecision />} />
            <Route path="/reject-form" element={<RejectForm />} />
            <Route path="/ceo" element={<ErrorBoundary><DashboardAccess /></ErrorBoundary>} />

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