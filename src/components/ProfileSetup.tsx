import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Building } from "lucide-react";

// ✅ 1. ประกาศ Interface รับค่า Props
interface ProfileSetupProps {
  defaultName: string;
  onSave: (data: { name: string; department: string }) => void;
}

// ✅ 2. ใส่ Props เข้าไปในวงเล็บ
export default function ProfileSetup({ defaultName, onSave }: ProfileSetupProps) {
  const [name, setName] = useState(defaultName || "");
  const [department, setDepartment] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !department) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    onSave({ name, department });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-blue-500">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-blue-600">ลงทะเบียนใช้งานครั้งแรก</CardTitle>
          <CardDescription>
            กรุณาระบุชื่อจริงและแผนกของคุณ ข้อมูลนี้จะถูกบันทึกไว้ใช้ในการลางานครั้งต่อไป
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" /> ชื่อ-นามสกุล
              </label>
              <Input 
                placeholder="tbs eiei" 
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building className="w-4 h-4 text-gray-500" /> แผนก (Department)
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="" disabled>-- เลือกแผนก --</option>
                <option value="IT">IT</option>
                <option value="SEO">SEO</option>
                <option value="Content">Content</option>
                <option value="PBN">PBN</option>
                <option value="Graphic">Graphic</option>
              </select>
            </div>

            <Button type="submit" className="w-full mt-6 bg-blue-600 hover:bg-blue-700">
              บันทึกข้อมูลและเข้าสู่ระบบ
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}