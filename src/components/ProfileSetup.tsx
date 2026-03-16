import { useState } from "react";
import tbsLogo from "@/image/TBS-Logo.png"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { User, Building, Smile } from "lucide-react";

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

    // 🌟 นำทั้ง 3 ช่องมารวมกัน คั่นด้วย | (เช่น: Patsawee|Prairumphueng|Satang)
    // เพื่อส่งไปให้ n8n แยกเช็คว่าตรงกับช่องไหนใน Sheet
    const combinedName = `${firstName.trim()}|${lastName.trim()}|${nickName.trim()}`;
    
    onSave({ name: combinedName, department });
  };

  // ฟังก์ชันช่วยทำตัวพิมพ์ใหญ่คำแรกอัตโนมัติ
  const capitalize = (val: string) => val.replace(/\b\w/g, char => char.toUpperCase());

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
        <CardHeader className="text-center space-y-3 pb-6">
          <div className="flex justify-center mb-2">
            <img src={tbsLogo} alt="TBS Marketing Logo" className="h-16 w-auto object-contain" />
          </div>
          <CardDescription className="text-slate-500 text-sm leading-relaxed px-4">
            Please enter your full name and nickname.<br/>
            กรุณากรอกชื่อจริง นามสกุล และชื่อเล่น
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* 🌟 ช่องที่ 1 & 2: ชื่อจริง - นามสกุล (จัดให้อยู่บรรทัดเดียวกัน) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <User className="w-4 h-4 text-blue-500" /> ชื่อจริง
                </label>
                <Input 
                  placeholder="First Name" 
                  value={firstName}
                  onChange={(e) => setFirstName(capitalize(e.target.value))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  นามสกุล
                </label>
                <Input 
                  placeholder="Last Name" 
                  value={lastName}
                  onChange={(e) => setLastName(capitalize(e.target.value))}
                  className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
                />
              </div>
            </div>

            {/* 🌟 ช่องที่ 3: ชื่อเล่น */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Smile className="w-4 h-4 text-blue-500" /> ชื่อเล่น (Nickname)
              </label>
              <Input 
                placeholder="Nickname" 
                value={nickName}
                onChange={(e) => setNickName(capitalize(e.target.value))}
                className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500"
              />
            </div>

            {/* Select Department */}
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Building className="w-4 h-4 text-blue-500" /> แผนก (Department)
              </label>
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