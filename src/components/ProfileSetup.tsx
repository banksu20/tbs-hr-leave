import { useState, useEffect } from "react";
import tbsLogo from "@/image/TBS-Logo.png"; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import liff from "@line/liff";
import { Loader2, UserCheck, Lock } from "lucide-react";

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

interface ProfileSetupProps {
  onSave: (data: { name: string; department: string; pin: string }) => void;
}

interface Employee {
  name: string;
  department: string;
}

export default function ProfileSetup({ onSave }: ProfileSetupProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [pin, setPin] = useState("");
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLiffInit, setIsLiffInit] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 1. ดึงรายชื่อพนักงานจาก n8n
  useEffect(() => {
    fetch(`${N8N_URL}/webhook/get-employees`, {
        headers: { "ngrok-skip-browser-warning": "true" }
    })
      .then(res => res.json())
      .then(data => {
        setEmployees(data);
        setIsLoadingEmployees(false);
      })
      .catch(err => {
        console.error("Failed to fetch employees", err);
        setIsLoadingEmployees(false);
      });
  }, []);

  // 2. Initial LIFF
  useEffect(() => {
    liff.init({ liffId: "2008617589-89gR1Y3Y" })
    .then(() => {
      setIsLiffInit(true);
      if (liff.isLoggedIn()) setIsLoggedIn(true);
    })
    .catch((err) => console.error("LIFF Init failed", err));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return alert("Please select your name / กรุณาเลือกชื่อของคุณ");
    if (pin.length < 4) return alert("Please enter 4-digit PIN / กรุณากรอกรหัส PIN 4 หลัก");

    // หาแผนกของพนักงานที่เลือก
    const emp = employees.find(sh => sh.name === selectedEmployee);
    
    // ส่งข้อมูลไปที่หน้า App.tsx เพื่อทำการ Save (ผูก Account)
    onSave({ 
        name: selectedEmployee, 
        department: emp?.department || "", 
        pin: pin 
    });
  };

  if(!isLiffInit || isLoadingEmployees) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <p className="text-slate-500 font-medium">Initializing System...</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
          <CardHeader className="text-center pb-6">
            <img src={tbsLogo} alt="TBS Logo" className="h-16 mx-auto mb-4" />
            <CardDescription className="text-slate-600 font-medium text-md">
                กรุณาเข้าสู่ระบบด้วย LINE เพื่อดำเนินการต่อ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => liff.login()} className="w-full h-12 bg-[#06C755] hover:opacity-90">
              Log in with LINE
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 ring-1 ring-slate-200 rounded-3xl overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
        <CardHeader className="text-center pt-8 pb-4">
          <img src={tbsLogo} alt="TBS Logo" className="h-14 mx-auto mb-4" />
          <h2 className="text-2xl font-extrabold text-slate-800">Setup Profile</h2>
          <p className="text-slate-400 text-sm mt-1">Select your name to bind with LINE</p>
        </CardHeader>

        <CardContent className="px-6 pb-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dropdown เลือกชื่อ */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-500" /> Employee Name
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all appearance-none cursor-pointer shadow-sm"
              >
                <option value="">-- Choose your name --</option>
                {employees.map((emp, idx) => (
                  <option key={idx} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* ช่องกรอก PIN */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Lock className="h-4 w-4 text-blue-500" /> Security PIN
              </label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="h-12 rounded-xl text-center text-2xl tracking-[1em] font-bold border-slate-200 focus-visible:ring-blue-500"
              />
            </div>

            <Button type="submit" className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 active:scale-[0.98] transition-transform mt-4">
              Bind Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}