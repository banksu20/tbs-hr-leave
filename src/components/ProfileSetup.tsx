import { useState, useEffect } from "react";
import tbsLogo from "@/image/TBS-Logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import liff from "@line/liff";
import {useLanguage} from "@/hooks/useLanguage";


interface ProfileSetupProps {
  defaultName: string;
  onSave: (data: { name: string; department: string; employmentType: 'employee'|'intern' }) => void;
}

export default function ProfileSetup({ defaultName, onSave }: ProfileSetupProps) {
  const {language}=useLanguage();
  const th=language==='th';
  const [initError,setInitError]=useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickName, setNickName] = useState("");
  const [employmentType,setEmploymentType]=useState<'employee'|'intern'>('employee');
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
      setInitError(true);
    });
  }, []);

  const handleLoginLine = () => {
    liff.login();
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      alert("Please enter your first and last name / กรุณากรอกชื่อและนามสกุล");
      return;
    }
    if (!department) {
      alert("Please select a department / กรุณาเลือกแผนก");
      return;
    }

    const combinedName = `${firstName.trim()}|${lastName.trim()}|${nickName.trim()}`;

    onSave({ name: combinedName, department, employmentType });
  };

  const capitalize = (val: string) => val.replace(/\b\w/g, char => char.toUpperCase());


  if(initError)return <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-slate-50"><p role="alert">{th?'เชื่อมต่อ LINE ไม่สำเร็จ กรุณาเปิดหน้านี้ผ่าน LINE อีกครั้ง':'Unable to connect to LINE. Reopen this page through LINE.'}</p><Button onClick={()=>window.location.reload()}>{th?'ลองอีกครั้ง':'Try again'}</Button></div>;
  if(!isLiffInit){
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">{th?'กำลังเชื่อมต่อ LINE…':'Connecting to LINE…'}</p>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#eff6ff,#f8fafc,#f1f5f9)] flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
          <CardHeader className="text-center space-y-3 pb-6">
            <div className="flex justify-center mb-2">
              <img src={tbsLogo} alt="TBS Marketing Logo" className="h-16 w-auto object-contain" />
            </div>
            <CardDescription className="text-slate-600 text-base leading-relaxed px-4 font-medium">
              {th?'กรุณาเข้าสู่ระบบด้วย LINE เพื่อดำเนินการต่อ':'Sign in with LINE to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8 px-6">
            <Button
              onClick={handleLoginLine}
              className="w-full h-12 text-md font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#06C755" }}
            >
              {th?'เข้าสู่ระบบด้วย LINE':'Sign in with LINE'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#eff6ff,#f8fafc,#f1f5f9)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center mb-2">
            <img src={tbsLogo} alt="TBS Marketing Logo" className="h-16 w-auto object-contain" />
          </div>
          <CardDescription className="text-slate-400 text-sm leading-relaxed px-4">
            {th?'กรอกชื่อ นามสกุล ชื่อเล่น และแผนกเพื่อสมัครใช้งานระบบวันลา':'Enter your name, nickname and department to register for leave.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">

            <label className="block text-sm font-semibold text-slate-700">{th?'ประเภทพนักงาน':'Employment type'}<select className="mt-2 w-full border rounded-xl p-3 bg-white" value={employmentType} onChange={e=>setEmploymentType(e.target.value as 'employee'|'intern')}><option value="employee">{th?'พนักงานประจำ':'Full-time'}</option><option value="intern">{th?'นักศึกษาฝึกงาน':'Intern'}</option></select></label>
            {/* ชื่อจริง - นามสกุล */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  {th?'ชื่อจริง':'First name'} <span className="text-[11px] font-normal text-rose-500">{th?'(ภาษาอังกฤษ)':'(English only)'}</span>
                </label>
                <Input
                  aria-label={th?'ชื่อจริง':'First name'} placeholder={th?'ชื่อจริง':'First name'}
                  value={firstName}
                  onChange={(e) => setFirstName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">
                  {th?'นามสกุล':'Last name'} <span className="text-[11px] font-normal text-rose-500">{th?'(ภาษาอังกฤษ)':'(English only)'}</span>
                </label>
                <Input
                  aria-label={th?'นามสกุล':'Last name'} placeholder={th?'นามสกุล':'Last name'}
                  value={lastName}
                  onChange={(e) => setLastName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* ชื่อเล่น */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                {th?'ชื่อเล่น':'Nickname'} <span className="text-[11px] font-normal text-rose-500">{th?'(ภาษาอังกฤษ)':'(English only)'}</span>
              </label>
              <Input
                aria-label={th?'ชื่อเล่น':'Nickname'} placeholder={th?'ชื่อเล่น':'Nickname'}
                value={nickName}
                onChange={(e) => setNickName(capitalize(e.target.value.replace(/[^a-zA-Z\s]/g, '')))}
                className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
              />
            </div>

            {/* Select Department */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-semibold text-slate-700">{th?'แผนก':'Department'}</label>
              <select
                aria-label={th?'แผนก':'Department'}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-hidden"
              >
                <option value="" disabled>{th?'เลือกแผนก':'Select department'}</option>
                <option value="Web Developer">Web Developer</option>
                <option value="UX/UI Designer">UX/UI Designer</option>
                <option value="SEO">SEO</option>
                <option value="Content">Content</option>
                <option value="PBN">PBN</option>
                <option value="Graphic">Graphic</option>
                <option value="SEM">SEM</option>
                <option value="Sale">Sale</option>
                <option value="Account">Account</option>
                <option value="AI">AI</option>
              </select>
            </div>

            <Button type="submit" className="w-full mt-8 h-12 text-md font-semibold bg-linear-to-r/srgb from-blue-600 to-indigo-600 hover:from-blue-700 text-white shadow-md">
              {th?'ส่งข้อมูลสมัคร':'Submit registration'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
