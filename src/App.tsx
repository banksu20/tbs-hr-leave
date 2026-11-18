import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import liff from "@line/liff";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react"; // ไอคอนโหลด

import Index from "@/pages/Index";
import ProfileSetup from "@/components/ProfileSetup"; 
import ErrorBoundary from "@/components/ErrorBoundary";
import { loadCompanyHolidays } from "@/lib/companyHolidays";

import { useLanguage } from "./hooks/useLanguage";


const loadLeaveRequest = () => import("@/pages/LeaveRequest");
const LeaveRequest = lazy(loadLeaveRequest);
const InternDecision = lazy(() => import('@/pages/InternDecision'));
const NotFound = lazy(() => import("@/pages/NotFound"));
const SickAcknowledgement = lazy(() => import("@/pages/SickAcknowledgement"));
const CancelDecision = lazy(() => import("@/pages/CancelDecision"));
const RejectForm = lazy(() => import("@/pages/RejectForm"));
const DashboardAccess = lazy(() => import("@/components/ceo/DashboardAccess"));
const pageFallback = <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>;

const queryClient = new QueryClient();
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008617589-89gR1Y3Y";

const WEBHOOK_CHECK_USER = "https://n8n.womenrefugeeroute.org/webhook/check-user";
const WEBHOOK_REGISTER_USER = "https://n8n.womenrefugeeroute.org/webhook/register-user";

const PROFILE_KEY = "tbs_user_profile";
type SavedProfile = { userId: string; displayName: string; pictureUrl?: string; name: string; department: string };
const readSavedProfile = (): SavedProfile | null => {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return value && typeof value.userId === "string" && typeof value.name === "string" && typeof value.department === "string" ? value : null;
  } catch {
    return null;
  }
};
const saveProfile = (profile: SavedProfile) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { void 0; } };
const clearSavedProfile = () => { try { localStorage.removeItem(PROFILE_KEY); } catch { void 0; } };

const App = () => {
  const [userProfile, setUserProfile] = useState<Awaited<ReturnType<typeof liff.getProfile>> | null>(null);
  const [localUser, setLocalUser] = useState<{name: string, department: string} | null>(null);
  const [pendingRegistration,setPendingRegistration] = useState(false);
  const [profileError,setProfileError] = useState('');
  const [isInitializing, setIsInitializing] = useState(true); // สถานะรอโหลดข้อมูล

  const { language, toggleLanguage } = useLanguage();

  useEffect(() => {
    // Reminder links verify LINE identity on their own; they do not need Sheets/profile lookup.
    if(window.location.pathname==='/leave-decision'||window.location.pathname==='/sick-acknowledge'||window.location.pathname==='/ceo'){setIsInitializing(false);return;}
    let shownFromSaved = false;
    const initializeLiffAndCheckUser = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const contextUserId = liff.getContext()?.userId;
          const saved = readSavedProfile();
          if (saved && contextUserId && saved.userId === contextUserId) {
            shownFromSaved = true;
            setUserProfile({ userId: saved.userId, displayName: saved.displayName, pictureUrl: saved.pictureUrl });
            setLocalUser({ name: saved.name, department: saved.department });
            setIsInitializing(false);
          }

          const token = liff.getAccessToken();
          const [profile, res] = await Promise.all([
            liff.getProfile(),
            fetch('/api/registration', { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          setUserProfile(profile);
          if (!res.headers.get("content-type")?.includes("application/json")) {
            throw Error("The profile service is temporarily unavailable. Please try again shortly.");
          }
          const data = await res.json();
          if(!res.ok)throw Error(data.error);
          setPendingRegistration(Boolean(data.pending));
          if (data.pending || data.inactive) clearSavedProfile();
          if(data.inactive){ shownFromSaved = false; throw Error("This profile is inactive. Please contact HR."); }

          if (data.found) {
            setLocalUser({ name: data.name, department: data.department });
            if (!data.pending) saveProfile({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl, name: data.name, department: data.department });
          } else {
            setLocalUser(null);
            clearSavedProfile();
          }
        }
      } catch (error) {
        console.error("Initialization Error:", error);
        if (!shownFromSaved) setProfileError((error as Error).message);
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeLiffAndCheckUser();
  }, []);

  useEffect(() => {
    if (isInitializing) return;
    const timer = window.setTimeout(() => {
      void loadLeaveRequest();
      loadCompanyHolidays(Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date()))).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isInitializing]);

  const handleSaveProfile = async (data: {name: string, department: string, employmentType: 'employee'|'intern'}) => {
    setIsInitializing(true);
    try {
      const [firstName,lastName,nickname]=data.name.split('|');
      const response=await fetch('/api/registration',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${liff.getAccessToken()}`},body:JSON.stringify({firstName,lastName,nickname,department:data.department,employmentType:data.employmentType})});
      const result=await response.json();if(!response.ok)throw Error(result.error);
      setPendingRegistration(Boolean(result.pending));
      if(result.found){
        setLocalUser({name:result.name,department:result.department});
        if(userProfile)saveProfile({userId:userProfile.userId,displayName:userProfile.displayName,pictureUrl:userProfile.pictureUrl,name:result.name,department:result.department});
      }
    } catch (error) {
      alert("Failed to save profile. / ไม่สามารถบันทึกข้อมูลได้");
      console.error(error);
    } finally {
      setIsInitializing(false);
    }
  };

  const leaveRequestPage = (
    <LeaveRequest 
      userId={userProfile?.userId} 
      userName={localUser?.name || userProfile?.displayName} 
      department={localUser?.department} 
      pictureUrl={userProfile?.pictureUrl}
    />
  );

  const LanguageToggleBtn = () => (
    <button
      onClick={toggleLanguage}
      className="fixed top-4 right-4 z-50 bg-white/80 backdrop-blur-md shadow-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5"
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

  if(window.location.pathname!=='/ceo' && (pendingRegistration||profileError))return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><section className="max-w-md rounded-3xl bg-white border p-8 text-center"><h1 className="text-2xl font-bold">{profileError?(language==='th'?'ไม่สามารถโหลดโปรไฟล์ได้':'Unable to load your profile'):(language==='th'?'ได้รับข้อมูลลงทะเบียนแล้ว':'Registration received')}</h1><p className="my-5 text-slate-500">{profileError||(language==='th'?'Dan หรือ Nam จะตรวจสอบและเปิดใช้งานโปรไฟล์ก่อนที่คุณจะขอลาได้':'Dan or Nam will review and activate your profile before you can request leave.')}</p><button className="rounded-xl bg-cyan-600 text-white px-6 py-3" onClick={()=>window.location.reload()}>{language==='th'?'ตรวจสอบอีกครั้ง':'Check again'}</button></section></main>;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <LanguageToggleBtn />

        <BrowserRouter>
          <Suspense fallback={pageFallback}>
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
                ) : (
                  <Index profile={userProfile ? { userId: userProfile.userId, displayName: userProfile.displayName, pictureUrl: userProfile.pictureUrl } : null} registration={localUser} />
                )
              } 
            />

            <Route 
              path="/leave-request" 
              element={
                !localUser ? (
                  <ProfileSetup defaultName={userProfile?.displayName || ""} onSave={handleSaveProfile} />
                ) : (
                  leaveRequestPage
                )
              } 
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;