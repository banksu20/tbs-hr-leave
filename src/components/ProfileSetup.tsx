import { useState, useEffect } from "react";
import tbsLogo from "@/image/TBS-Logo.png"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import liff from "@line/liff";


interface ProfileSetupProps {
  defaultName: string;
  onSave: (data: { name: string; department: string }) => void;
}

export default function ProfileSetup({ defaultName, onSave }: ProfileSetupProps) {
  // 🌟 สร้าง State แยก 3 ช่อง
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickName, setNickName] = useState("");
  const [department, setDepartment] = useState("");

  const [isLiffInit, setIsLiffInit] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    liff.init({ liffId: "2008617589-89gR1Y3Y" })
    .then(() => {
      setIsLiffInit(true);
      if (liff.isLoggedIn()){
        setIsLoggedIn(true);
      }
    })
    .catch((err) => {
      console.error("LIFF Init failed", err);
    });
  }, []);

  const handleLoginLine = () => {
    liff.login();
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // บังคับให้กรอกอย่างน้อย 1 ช่อง (ไม่ชื่อ ก็ต้องนามสกุล หรือชื่อเล่น)
    if (!firstName.trim() && !lastName.trim() && !nickName.trim()) {
      alert("Please fill at least one name field / กรุณากรอกชื่ออย่างน้อย 1 ช่อง");
      return;
    }
    if (!department) {
      alert("Please select a department / กรุณาเลือกแผนก");
      return;
    }

    const combinedName = `${firstName.trim()}|${lastName.trim()}|${nickName.trim()}`;
    
    onSave({ name: combinedName, department });
  };

  // ฟังก์ชันช่วยทำตัวพิมพ์ใหญ่คำแรกอัตโนมัติ
  const capitalize = (val: string) => val.replace(/\b\w/g, char => char.toUpperCase());

  
  if(!isLiffInit){
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Initializing LIFF...</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="flex justify-center mb-2">
              <img src={tbsLogo} alt="TBS Marketing Logo" className="h-16 w-auto object-contain" />
            </div>
            <CardDescription className="text-slate-600 text-base leading-relaxed px-4 font-medium">
              กรุณาเข้าสู่ระบบด้วย LINE เพื่อดำเนินการต่อ
              <span className="text-slate-400 text-[13px] mt-2 block font-normal">
                Please log in with your LINE account to access the system.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8 px-6">
            <Button 
              onClick={handleLoginLine} 
              className="w-full h-12 text-md font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#06C755" }} // สีเขียวเอกลักษณ์ของ LINE
            >
              เข้าสู่ระบบด้วย LINE
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ถ้า Login แล้วแสดงฟอร์มกรอกข้อมูล
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center mb-2">
            <img src={tbsLogo} alt="TBS Marketing Logo" className="h-16 w-auto object-contain" />
          </div>
          <CardDescription className="text-slate-400 text-sm leading-relaxed px-4">
            ระบุข้อมูลของคุณเพื่อเริ่มต้นใช้งานระบบวันลา<br/>
            <span className="text-slate-500 text-[13px] mt-1 block">
              Please enter your full name and nickname to set up your profile.
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* ชื่อจริง - นามสกุล */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  ชื่อจริง <span className="text-[11px] font-normal text-rose-500">(English Only)</span>
                </label>
                <Input 
                  placeholder="First Name" 
                  value={firstName}
                  onChange={(e) => setFirstName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  นามสกุล <span className="text-[11px] font-normal text-rose-500">(English Only)</span>
                </label>
                <Input 
                  placeholder="Last Name" 
                  value={lastName}
                  onChange={(e) => setLastName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* ชื่อเล่น */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                ชื่อเล่น <span className="text-[11px] font-normal text-rose-500">(English Only)</span>
              </label>
              <Input 
                placeholder="Nickname" 
                value={nickName}
                onChange={(e) => setNickName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
              />
            </div>

            {/* Select Department */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-semibold text-slate-700">แผนก</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                <option value="" disabled className="text-slate-400">-- Select Department --</option>
                <option value="IT">IT</option>
                <option value="SEO">SEO</option>
                <option value="Content">Content</option>
                <option value="PBN">PBN</option>
                <option value="Graphic">Graphic</option>
                <option value="SEM">SEM</option>
                <option value="Sale">Sale</option>
                <option value="Account">Account</option>
              </select>
            </div>

            <Button type="submit" className="w-full mt-8 h-12 text-md font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white shadow-md">
              Save & Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}