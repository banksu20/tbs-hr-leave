import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Loader2, Calendar as CalendarIcon, User, FileText, ArrowLeft, AlertTriangle } from "lucide-react";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";

// ค่า Config
const LIFF_ID = "2008617589-89gR1Y3Y";
const WEBHOOK_URL = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/submit-leave";

// Interface
interface LeaveRequestFormProps {
  userId?: string;
  userName?: string;
  initialLeaveType?: string;
}

interface FormData {
  userName: string;
  userId: string;
  department: string;
  leaveType: string;
  reason: string;
}

const LeaveRequestForm = ({ userId, userName, initialLeaveType }: LeaveRequestFormProps) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Logic การเลือกประเภทการลา (จาก Props หรือ URL)
  const typeFromUrl = searchParams.get("type") || "";
  const defaultType = initialLeaveType || typeFromUrl;

  // State
  const [isLoading, setIsLoading] = useState(!userId); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(userId || "");

  // ดึงข้อมูล Leave Quota
  const { remainingDays, isLoading: isQuotaLoading } = useLeaveQuota(currentUserId || null);
  const [error, setError] = useState<string | null>(null);

  const [isDepartmentLocked, setIsDepartmentLocked] = useState(false);

  // ตรวจสอบว่าต้อง Lock Leave Type หรือไม่
  const isLeaveTypeLocked = Boolean(defaultType);


  const [formData, setFormData] = useState<FormData>({
    userName: userName || "",
    userId: userId || "",
    department: localStorage.getItem("userDepartment") || "",
    leaveType: defaultType === "sick" ? "sick" : defaultType === "vacation" ? "vacation" : "",
    reason: "",
  });


  // State สำหรับ Multi-select dates
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);


  // คำนวณจำนวนวันลาจากวันที่เลือก
  const requestedDays = selectedDates.length;

  // หา Start Date และ End Date จากวันที่เลือก
  const { startDateTime, endDateTime } = useMemo(() => {
    if (selectedDates.length === 0) {
      return { startDateTime: "", endDateTime: "" };
    }
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    return {
      startDateTime: sortedDates[0].toISOString(),
      endDateTime: sortedDates[sortedDates.length - 1].toISOString(),
    };
  }, [selectedDates]);

  // ใช้ค่า Default 10 วัน ถ้าไม่มีข้อมูลจาก API
  const displayRemainingDays = remainingDays ?? 10;

  // เช็คว่าเกินโควต้าหรือไม่
  const isOverQuota = requestedDays > displayRemainingDays;

 // userEffect: ตรวจสอบ localStorage สำหรับ Department
  useEffect(() => {
    const savedDepartment = localStorage.getItem("userDepartment");
    if (savedDepartment){
      setFormData((prev) => ({
        ...prev, department: savedDepartment
      }));
      setIsDepartmentLocked(true);
    }else{
      setIsDepartmentLocked(false);
    }
  },[])


  // Effect 1: อัปเดตฟอร์มเมื่อได้รับค่าจาก Props (App.tsx)
  useEffect(() => {
    if (userId || userName || initialLeaveType) {
      console.log("Props received:", { userId, userName, initialLeaveType });
      if (userId) setCurrentUserId(userId);
      setFormData((prev) => ({
        ...prev,
        userId: userId || prev.userId,
        userName: userName || prev.userName,
        leaveType: initialLeaveType === "sick" ? "sick" : 
                   initialLeaveType === "vacation" ? "vacation" : 
                   prev.leaveType,
      }));
      setIsLoading(false);
    }
  }, [userId, userName, initialLeaveType]);

  // Effect 2: (Backup) ถ้าไม่มี userId ส่งมา ให้ลอง Init LIFF เอง
  useEffect(() => {
    const initializeLiff = async () => {
      // ถ้ามี userId อยู่แล้ว ไม่ต้องทำอะไร
      if (userId) return;

      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setCurrentUserId(profile.userId);
          setFormData((prev) => ({
            ...prev,
            userName: profile.displayName,
            userId: profile.userId,
          }));
        } else {
          // ถ้าเปิดใน Browser นอก LINE จะให้ Login
           liff.login();
        }
      } catch (err) {
        console.error("LIFF initialization failed:", err);
        setError("Failed to initialize LINE LIFF.");
      } finally {
        setIsLoading(false);
      }
    };

    initializeLiff();
  }, [userId]);


  // ✅ Effect 3: Auto-Reset (เพิ่มส่วนนี้เข้าไป)
  // ถ้าโหลดข้อมูลเสร็จแล้ว (!isQuotaLoading)
  // แต่ไม่เจอวันลา (remainingDays เป็น null หรือ undefined)
  // แปลว่าคนนี้ไม่มีในระบบ (หรือถูกลบไปแล้ว) -> ให้เคลียร์ความจำเครื่อง
  useEffect(() => {
    if (!isQuotaLoading && remainingDays === null) {
      console.log("User not found in Sheet -> Clearing LocalStorage");
      localStorage.removeItem("userDepartment"); // ลบความจำ
      setIsDepartmentLocked(false); // ปลดล็อค
      setFormData(prev => ({ ...prev, department: "" })); // เคลียร์ช่องเลือก
    }
  }, [isQuotaLoading, remainingDays]);

// ฟังก์ชันเมื่อมีการจิ้มเลือกวันที่
  const handleDateSelect = (dates: Date[] | undefined) => {
    const safeDates = dates || [];
    setSelectedDates(safeDates);

    if (safeDates.length > 0) {
      // เรียงวันที่จากน้อยไปมาก
      const sortedDates = [...safeDates].sort((a, b) => a.getTime() - b.getTime());
      
      setFormData((prev) => ({
        ...prev,
        startDateTime: sortedDates[0].toISOString(), // วันแรก
        endDateTime: sortedDates[sortedDates.length - 1].toISOString(), // วันสุดท้าย
        leaveDays: safeDates.length // ✅ ส่งจำนวนวันที่จิ้มจริงไปด้วย
      }));
    } else {
      // กรณีเอาออกหมด
      setFormData((prev) => ({ ...prev, startDateTime: "", endDateTime: "", leaveDays: 0 }));
    }
  };


  
  // Handle Department Change
    const handleDepartmentChange = (value: string) => {
      setFormData((prev) => ({ ...prev, department: value }));
      localStorage.setItem("userDepartment", value); // บันทึกไว้ ครั้งหน้ามาจะได้จำได้
    };
  // Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.department || !formData.leaveType || selectedDates.length === 0 || !formData.reason) {
      Swal.fire({
        icon: "warning",
        title: "Incomplete Form",
        text: "Please fill in all required fields and select at least one leave date.",
        confirmButtonColor: "#06C755",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          userName: formData.userName,
          userId: formData.userId,
          department: formData.department,
          leaveType: formData.leaveType,
          startDateTime: startDateTime,
          endDateTime: endDateTime,
          leaveDays: selectedDates.length,
          selectedDates: selectedDates.map(d => format(d, "yyyy-MM-dd")),
          reason: formData.reason,
          submittedAt: new Date().toISOString(),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.status === "error") {
        throw new Error(result.message || "An error occurred");
      }

      await Swal.fire({
        icon: "success",
        title: "Request Submitted!",
        text: result.message || "Your leave request has been sent successfully.",
        confirmButtonColor: "#06C755",
      });

      // Reset Form (แต่เก็บชื่อไว้)
      setFormData((prev) => ({
        ...prev,
        reason: "",
      }));
      setSelectedDates([]);

      if (liff.isInClient()) {
        liff.closeWindow();
      }
    } catch (err: any) {
      console.error("Submission failed:", err);
      await Swal.fire({
        icon: "error",
        title: "Submission Failed",
        text: err.message || "Failed to submit your request.",
        confirmButtonColor: "#06C755",
      });
      navigate("/")
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Render Error
  if (error) {
    return (
      <div className="min-h-screen bg-[#06C755] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-[#06C755]">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Form
  return (
    <div className="min-h-screen bg-[#06C755]">
      {/* Header */}
      <div className="bg-[#06C755] text-white py-6 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 -ml-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Leave Request</h1>
            <p className="text-sm opacity-90">Submit your leave application</p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="px-4 pb-6 -mt-2">
        <Card className="rounded-t-3xl shadow-lg border-none">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* User Name */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" /> User Name
                </Label>
                <Input value={formData.userName} readOnly className="bg-muted/50" />
              </div>

              {/* Department */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" /> Department *
                </Label>
                <Select
                  value={formData.department}
                  onValueChange={handleDepartmentChange}
                  disabled={isDepartmentLocked}
                >
                  <SelectTrigger className={isDepartmentLocked ? "bg-muted/50" : ""}>
                    <SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="SEO">SEO</SelectItem>
                    <SelectItem value="Content">Content</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Leave Type */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" /> Leave Type *
                </Label>
                <Select
                  value={formData.leaveType}
                  onValueChange={(val) => setFormData({ ...formData, leaveType: val })}
                  disabled={isLeaveTypeLocked}
                >
                  <SelectTrigger className={isLeaveTypeLocked ? "bg-muted/50" : ""}>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="vacation">Vacation Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-select Calendar */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" /> เลือกวันที่ต้องการลา *
                </Label>
                
                <div className="border rounded-xl p-3 bg-background">
                  {/* 👇 ใส่บรรทัดนี้เพื่อแก้เส้นแดง */}
                  {/* @ts-ignore */}
                  <CalendarComponent
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={handleDateSelect} // ✅ เปลี่ยนมาใช้ฟังก์ชันที่เตรียมไว้
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="pointer-events-auto mx-auto"
                    modifiersStyles={{
                      selected: {
                        backgroundColor: "#06C755",
                        color: "white",
                        borderRadius: "50%",
                      },
                    }}
                  />
                </div>

                {/* แสดงสรุปวันที่เลือก */}
                {selectedDates && selectedDates.length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="text-muted-foreground mb-1">
                      คุณเลือกวันลาทั้งหมด: <span className="font-bold text-foreground">{selectedDates.length} วัน</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ({[...selectedDates]
                        .sort((a, b) => a.getTime() - b.getTime())
                        // 👇 อย่าลืม import { th } from "date-fns/locale" ด้านบนด้วยนะครับ
                        .map(d => format(d, "dd/MM/yyyy", { locale: th })) 
                        .join(", ")})
                    </p>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" /> Reason *
                </Label>
                <Textarea
                  placeholder="Describe your reason..."
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="min-h-[100px] resize-none"
                />
              </div>

              {/* Leave Quota Info */}
              <div className={`p-4 rounded-xl border ${isOverQuota ? "bg-destructive/10 border-destructive/30" : "bg-muted/50 border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">วันลาคงเหลือ:</span>
                  </div>
                  {isQuotaLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <span className={`font-bold ${displayRemainingDays < 3 ? "text-destructive" : "text-foreground"}`}>
                      {displayRemainingDays} วัน
                    </span>
                  )}
                </div>
                {/* {requestedDays > 0 && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <span className="text-sm text-muted-foreground">จำนวนวันที่ขอลา:</span>
                    <span className={`font-bold ${isOverQuota ? "text-destructive" : "text-foreground"}`}>
                      {requestedDays} วัน
                    </span>
                  </div>
                )} */}
                {isOverQuota && (
                  <div className="flex items-center gap-2 mt-3 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">จำนวนวันที่ขอเกินโควต้าที่เหลือ</span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isSubmitting || isOverQuota || selectedDates.length === 0}
                className="w-full h-12 text-lg font-semibold bg-[#06C755] hover:bg-[#05a647] text-white rounded-xl shadow-md disabled:opacity-50"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting...</>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeaveRequestForm;