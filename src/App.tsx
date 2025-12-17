import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import liff from "@line/liff"; 
import Index from "./pages/Index";
import LeaveRequest from "./pages/LeaveRequest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [leaveType, setLeaveType] = useState<string>("");

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        // ใส่ LIFF ID ของคุณตรงนี้
        await liff.init({ liffId: "2008617589-89gR1Y3Y" });

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setUserProfile(profile);
          console.log("LIFF Profile:", profile);
        }

        const params = new URLSearchParams(window.location.search);
        const typeParam = params.get("type");
        if (typeParam) {
          setLeaveType(typeParam);
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
            <Route path="/" element={<Index />} />
            <Route 
              path="/leave-request" 
              element={
                <LeaveRequest 
                  userId={userProfile?.userId} 
                  userName={userProfile?.displayName}
                  initialLeaveType={leaveType}
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