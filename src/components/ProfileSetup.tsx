import { useState } from "react";
// ✅ Import โลโก้จาก Path ที่ระบุ
import tbsLogo from "@/image/TBS-Logo.png"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { User, Building } from "lucide-react";

// ประกาศ Interface รับค่า Props
interface ProfileSetupProps {
  defaultName: string;
  onSave: (data: { name: string; department: string }) => void;
}

export default function ProfileSetup({ defaultName, onSave }: ProfileSetupProps) {
  const [name, setName] = useState(defaultName || "");
  const [department, setDepartment] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !department) {
      alert("Please fill in all fields / กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    onSave({ name, department });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0 ring-1 ring-slate-200">
        <CardHeader className="text-center space-y-3 pb-6">
          {/* ✅ แก้ไข: ใส่รูปโลโก้แทนไอคอนเดิมและชื่อ Text */}
          <div className="flex justify-center mb-2">
            <img 
              src={tbsLogo} 
              alt="TBS Marketing Logo" 
              className="h-16 w-auto object-contain" // ปรับความสูงตามความเหมาะสม
            />
          </div>
          
          <CardDescription className="text-slate-500 text-sm leading-relaxed px-4">
            Please enter your name and department. This will be saved for your future leave requests.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input Name */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" /> 
                <span className="text-sm font-semibold text-slate-700">
                  Name <span className="text-xs font-normal text-slate-400 ml-1">/ ชื่อ</span>
                </span>
              </label>
              <Input 
                placeholder="mai bok" 
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  // อัปเกรด: ทำให้ตัวอักษรแรกของ "ทุกคำ" เป็นพิมพ์ใหญ่เสมอ
                  setName(val.replace(/\b\w/g, char => char.toUpperCase()));
                }}
                className="h-11 bg-white border-slate-200 focus-visible:ring-blue-500 transition-all"
              />
            </div>

            {/* Select Department */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-500" /> 
                <span className="text-sm font-semibold text-slate-700">
                  Department <span className="text-xs font-normal text-slate-400 ml-1">/ แผนก</span>
                </span>
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="flex h-11 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
              >
                <option value="" disabled className="text-slate-400">-- Select Department --</option>
                <option value="IT">IT</option>
                <option value="SEO">SEO</option>
                <option value="Content">Content</option>
                <option value="PBN">PBN</option>
                <option value="Graphic">Graphic</option>
              </select>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              className="w-full mt-8 h-12 text-md font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-300"
            >
              Save & Continue
              <span className="text-xs font-normal opacity-80 ml-2"></span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}