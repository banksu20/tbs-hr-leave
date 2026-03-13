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
import { Loader2, Calendar as CalendarIcon, User, FileText, ArrowLeft, AlertTriangle, Clock } from "lucide-react";
import { useLeaveQuota } from "@/hooks/useLeaveQuota";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ค่า Config

const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008617589-89gR1Y3Y";

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://thirstless-ostensively-maryam.ngrok-free.dev";
// Interface
interface LeaveRequestFormProps {
  userId?: string;
  userName?: string;
  department?: string;
  initialLeaveType?: string;
}

interface FormData {
  userName: string;
  userId: string;
  department: string;
  leaveType: string;
  reason: string;
}

const LeaveRequestForm = ({ userId, userName, department, initialLeaveType }: LeaveRequestFormProps) => {
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
  const isLeaveTypeLocked = Boolean(defaultType);

  const [formData, setFormData] = useState<FormData>({
    userName: userName || "",
    userId: userId || "",
    department: department || "",
    leaveType: defaultType === "sick" ? "sick" : defaultType === "vacation" ? "vacation" : "",
    reason: "",
  });

  // State สำหรับ Multi-select dates
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  
  // ✅ State สำหรับเลือกลาครึ่งวัน
  const [isHalfDay, setIsHalfDay] = useState(false);

  // ✅ คำนวณจำนวนวันลา (ถ้าเลือกครึ่งวันจะเป็น 0.5)
  const requestedDays = (selectedDates.length === 1 && isHalfDay) ? 0.5 : selectedDates.length;

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

  const displayRemainingDays = remainingDays ?? 10;
  const isOverQuota = requestedDays > displayRemainingDays;

  useEffect(() => {
    if (department) setIsDepartmentLocked(true);
    else setIsDepartmentLocked(false);
  }, [department]);

  useEffect(() => {
    if (userId || userName || department || initialLeaveType) { 
      if (userId) setCurrentUserId(userId);
      setFormData((prev) => ({
        ...prev,
        userId: userId || prev.userId,
        userName: userName || prev.userName,
        department: department || prev.department, 
        leaveType: initialLeaveType === "sick" ? "sick" : 
                   initialLeaveType === "vacation" ? "vacation" : 
                   prev.leaveType,
      }));
      setIsLoading(false);
    }
  }, [userId, userName, department, initialLeaveType]); 

  useEffect(() => {
    const initializeLiff = async () => {
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
           liff.login();
        }
      } catch (err) {
        setError("Failed to initialize LINE LIFF.");
      } finally {
        setIsLoading(false);
      }
    };
    initializeLiff();
  }, [userId]);

  // ฟังก์ชันเมื่อมีการจิ้มเลือกวันที่
  const handleDateSelect = (dates: Date[] | undefined) => {
    const safeDates = dates || [];
    setSelectedDates(safeDates);

    // ✅ ถ้าไม่ได้เลือกแค่วันเดียว ให้ปิดโหมดครึ่งวันทิ้งไปเลย (บังคับเต็มวัน)
    if (safeDates.length !== 1) {
      setIsHalfDay(false);
    }
  };

  const handleDepartmentChange = (value: string) => {
    setFormData((prev) => ({ ...prev, department: value }));
    localStorage.setItem("userDepartment", value); 
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isReasonRequired = formData.leaveType !== "vacation";
    if (!formData.department || !formData.leaveType || selectedDates.length === 0 || (isReasonRequired && !formData.reason)) {
      Swal.fire({
        icon: "warning",
        title: "Incomplete Form",
        text: "Please fill in all required fields and select at least one leave date.",
        confirmButtonColor: "#00B5E2",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${N8N_URL}/webhook/submit-leave`, {
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
          leaveDays: requestedDays, // ✅ ส่ง 0.5 หรือจำนวนเต็มไปให้ n8n
          selectedDates: selectedDates.map(d => format(d, "yyyy-MM-dd")),
          reason: formData.reason,
          submittedAt: new Date().toISOString(),
          isHalfDay: isHalfDay // ส่ง flag เผื่อให้ n8n รู้ว่าเป็นครึ่งวัน
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
        confirmButtonColor: "#00B5E2",
      });

      navigate("/"); 

      setFormData((prev) => ({ ...prev, reason: "" }));
      setSelectedDates([]);
      setIsHalfDay(false);

      if (liff.isInClient()) {
        liff.closeWindow();
      }
    } catch (err: any) {
      await Swal.fire({
        icon: "error",
        title: "Submission Failed",
        text: err.message || "Failed to submit your request.",
        confirmButtonColor: "#00B5E2",
      });
      navigate("/");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#00B5E2] flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#00B5E2] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-[#00B5E2]">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white text-slate-800 py-6 px-4 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-emerald-500"></div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Leave Request</h1>
            <p className="text-sm text-slate-500">Submit your leave application</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-6 -mt-2 mt-4 flex-1">
        <Card className="rounded-2xl shadow-sm border border-slate-200">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-600">
                  <User className="h-4 w-4" /> User Name
                </Label>
                <Input value={formData.userName} readOnly className="bg-slate-50 border-slate-200 font-medium text-slate-600" />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" /> Department *
                </Label>
                <Select value={formData.department} onValueChange={handleDepartmentChange} disabled={isDepartmentLocked}>
                  <SelectTrigger className={isDepartmentLocked ? "font-medium bg-muted/50" : "font-medium"}>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="SEO">SEO</SelectItem>
                    <SelectItem value="Content">Content</SelectItem>
                    <SelectItem value="PBN">PBN</SelectItem>
                    <SelectItem value="Graphic">Graphic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-slate-600">
                  <FileText className="h-4 w-4" /> Leave Type *
                </Label>
                <Select value={formData.leaveType} onValueChange={(val) => setFormData({ ...formData, leaveType: val })} disabled={isLeaveTypeLocked}>
                  <SelectTrigger className={`font-medium border-slate-200 ${isLeaveTypeLocked ? "bg-slate-50" : "bg-white"}`}>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick">Sick Leave (ลาป่วย)</SelectItem>
                    <SelectItem value="vacation">Annual Leave (ลาพักร้อน)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" /> เลือกวันที่ต้องการลา *
                </Label>
                                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal h-12 rounded-xl border-slate-200 bg-white hover:bg-slate-50 transition-colors",
                        !selectedDates?.length && "text-slate-400"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                      {selectedDates && selectedDates.length > 0 ? (
                        <span className="text-slate-800 font-medium truncate">
                          เลือกแล้ว <span className="text-sky-600 font-bold">{selectedDates.length}</span> วัน 
                          <span className="text-xs text-slate-400 ml-2 font-normal">
                              ({[...selectedDates]
                                .sort((a,b)=>a.getTime()-b.getTime())
                                .map(d => format(d, "dd MMM", { locale: th }))
                                .join(", ")})
                          </span>
                        </span>
                      ) : (
                        <span>กดเพื่อเลือกวันที่</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  
                  <PopoverContent className="w-auto p-0 border-slate-200 shadow-xl" align="start">
                    {/* @ts-ignore */}
                    <CalendarComponent
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="pointer-events-auto bg-white rounded-md"
                      modifiersStyles={{
                        selected: {
                          backgroundColor: "#0ea5e9",
                          color: "white",
                          borderRadius: "50%",
                        },
                      }}
                    />
                  </PopoverContent>
                </Popover>

                {/* ✅ เพิ่มส่วนเลือก เต็มวัน/ครึ่งวัน จะโผล่มาเฉพาะเมื่อเลือกแค่วันเดียว */}
                {selectedDates.length === 1 && (
                  <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                    <Label className="flex items-center gap-2 text-slate-600 text-xs uppercase tracking-wider font-bold">
                      <Clock className="h-3 w-3" /> ระยะเวลา (Duration)
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={!isHalfDay ? "default" : "outline"}
                        className={cn("flex-1 rounded-lg", !isHalfDay ? "bg-sky-500 hover:bg-sky-600 text-white" : "text-slate-500")}
                        onClick={() => setIsHalfDay(false)}
                      >
                        Full Day
                      </Button>
                      <Button
                        type="button"
                        variant={isHalfDay ? "default" : "outline"}
                        className={cn("flex-1 rounded-lg", isHalfDay ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-slate-500")}
                        onClick={() => setIsHalfDay(true)}
                      >
                        Half Day
                      </Button>
                    </div>
                  </div>
                )}

                {selectedDates && selectedDates.length > 0 && (
                  <p className="text-sm font-medium text-slate-600 mt-2 ml-1">
                    * Total duration (สรุปการขอลา): <b className={isHalfDay ? "text-amber-500" : "text-sky-500"}>
                      {selectedDates.length > 1 
                        ? `${requestedDays} Day(s) (วัน)` 
                        : (isHalfDay ? "Half Day (ครึ่งวัน)" : "Full Day (เต็มวัน)")}
                    </b>
                  </p>
                )}
              </div>

              {formData.leaveType !== "vacation" && (
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
              )}

              <div className={`p-4 rounded-xl border ${isOverQuota ? "bg-destructive/10 border-destructive/30" : "bg-muted/50 border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">วันลาคงเหลือ:</span>
                  </div>
                  {isQuotaLoading ? (
                    <Skeleton className="h-5 w-16" />
                  ) : (
                    <span className={`font-medium ${displayRemainingDays < requestedDays ? "text-destructive" : "text-foreground"}`}>
                      {displayRemainingDays} วัน
                    </span>
                  )}
                </div>
                {isOverQuota && (
                  <div className="flex items-center gap-2 mt-3 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">จำนวนวันที่ขอเกินโควต้าที่เหลือ</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || isOverQuota || selectedDates.length === 0}
                className={`w-full h-12 text-lg font-semibold text-white rounded-xl shadow-md transition-all 
                    ${isSubmitting || isOverQuota || selectedDates.length === 0 
                        ? "bg-slate-300 cursor-not-allowed" 
                        : "bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 hover:shadow-lg active:scale-[0.98]"
                    }`}
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