import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { format } from "date-fns";
import { submitLeaveToPostgres } from "@/lib/postgresApi";
import { th, enUS } from "date-fns/locale"; 
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
import { useLanguage } from "@/hooks/useLanguage";


const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008617589-89gR1Y3Y";
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

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
  const { language, t } = useLanguage(); 

  const typeFromUrl = searchParams.get("type") || "";
  const defaultType = initialLeaveType || typeFromUrl;

  const [isLoading, setIsLoading] = useState(!userId); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(userId || "");

  const { remainingDays, isLoading: isQuotaLoading } = useLeaveQuota(currentUserId || null);
  const [error, setError] = useState<string | null>(null);
  const [isDepartmentLocked, setIsDepartmentLocked] = useState(false);
  const isLeaveTypeLocked = Boolean(defaultType);

  const [formData, setFormData] = useState<FormData>({
    userName: userName || "",
    userId: userId || "",
    department: department || "",
    leaveType: defaultType === "sick" ? "sick" : defaultType === "vacation" ? "vacation" : defaultType === "personal" ? "personal" : "",
    reason: "",
  });

  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayType, setHalfDayType] = useState<"morning" | "afternoon">("morning");

  const requestedDays = (selectedDates.length === 1 && isHalfDay) ? 0.5 : selectedDates.length;
  interface TakenLeaveRecord {
    dateStr: string;
    isHalfDay: boolean;
    period?: "morning" | "afternoon" | null;
  }

  const [takenLeaves, setTakenLeaves] = useState<TakenLeaveRecord[]>([]);

  const { startDateTime, endDateTime } = useMemo(() => {
    if (selectedDates.length === 0) return { startDateTime: "", endDateTime: "" };
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    return {
      startDateTime: sortedDates[0].toISOString(),
      endDateTime: sortedDates[sortedDates.length - 1].toISOString(),
    };
  }, [selectedDates]);

  const displayRemainingDays = remainingDays ?? 10;
  const isOverQuota = (formData.leaveType === "sick" || formData.leaveType === "personal") ? false : requestedDays > displayRemainingDays;

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

  useEffect(() => {
    if (currentUserId) {
      fetch(`${N8N_URL}/webhook/get-leave-history?userId=${currentUserId}`, {
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const leaves: TakenLeaveRecord[] = [];
          data.forEach((item: any) => {
            if (item.status && (item.status.includes('Rejected') || item.status.includes('ปฏิเสธ'))) return;
            
            const leaveDays = Number(item.leave_days ?? item.leaveDays ?? (item.is_half_day || item.isHalfDay ? 0.5 : 1));
            const isHalf = leaveDays === 0.5 || item.is_half_day === true || item.is_half_day === 'true' || item.isHalfDay === true || item.isHalfDay === 'true';
            
            const rawPeriod = String(item.half_day_period || item.halfDayPeriod || item.period || '').toLowerCase();
            let period: "morning" | "afternoon" | null = null;
            if (rawPeriod.includes('เช้า') || rawPeriod.includes('morning')) {
              period = 'morning';
            } else if (rawPeriod.includes('บ่าย') || rawPeriod.includes('afternoon')) {
              period = 'afternoon';
            }

            const addDateStr = (dateStr: string) => {
              leaves.push({
                dateStr,
                isHalfDay: isHalf,
                period: isHalf ? period : null,
              });
            };

            if (item.selected_dates && typeof item.selected_dates === 'string' && !item.selected_dates.includes('$')) {
              const dateStrings = item.selected_dates.split(',');
              dateStrings.forEach((dStr: string) => {
                const cleanStr = dStr.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
                  addDateStr(cleanStr);
                }
              });
            }
            else if (item.date && !item.date.includes('ถึง')) {
                const p = item.date.trim().split('-');
                if (p.length === 3) {
                    const mMap: any = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
                    let y = parseInt(p[2], 10);
                    if (y < 100) y += 2000;
                    const m = mMap[p[1].toLowerCase().substring(0, 3)];
                    const d = p[0].padStart(2, '0');
                    if (m) {
                        addDateStr(`${y}-${m}-${d}`);
                    }
                }
            }
          });
          setTakenLeaves(leaves);
        }
      })
      .catch(console.error);
    }
  }, [currentUserId]);

  const getDateLeaveStatus = (date: Date) => {
    const formattedDate = format(date, "yyyy-MM-dd");
    const records = takenLeaves.filter(l => l.dateStr === formattedDate);

    if (records.length === 0) {
      return { isFullyTaken: false, hasMorning: false, hasAfternoon: false };
    }

    const hasFullDay = records.some(r => !r.isHalfDay);
    const hasMorning = records.some(r => r.isHalfDay && r.period === 'morning');
    const hasAfternoon = records.some(r => r.isHalfDay && r.period === 'afternoon');
    const hasUnspecifiedHalf = records.some(r => r.isHalfDay && !r.period);

    const isFullyTaken = hasFullDay || (hasMorning && hasAfternoon) || (hasUnspecifiedHalf && (hasMorning || hasAfternoon));

    return { isFullyTaken, hasMorning, hasAfternoon };
  };

  const selectedDateStatus = useMemo(() => {
    if (selectedDates.length !== 1) return { hasMorning: false, hasAfternoon: false, isFullyTaken: false };
    return getDateLeaveStatus(selectedDates[0]);
  }, [selectedDates, takenLeaves]);

  useEffect(() => {
    if (selectedDates.length === 1) {
      if (selectedDateStatus.hasMorning && !selectedDateStatus.hasAfternoon) {
        setIsHalfDay(true);
        setHalfDayType("afternoon");
      } else if (selectedDateStatus.hasAfternoon && !selectedDateStatus.hasMorning) {
        setIsHalfDay(true);
        setHalfDayType("morning");
      }
    }
  }, [selectedDates, selectedDateStatus]);

  const handleDateSelect = (dates: Date[] | undefined) => {
    const safeDates = dates || [];
    setSelectedDates(safeDates);
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
        title: language === 'th' ? "ข้อมูลไม่ครบถ้วน" : "Incomplete Form",
        text: language === 'th' ? "กรุณากรอกเหตุผลในการลา" : "Please fill in all required fields and select at least one leave date.",
        confirmButtonColor: "#00B5E2",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Submit to n8n Webhook / PostgreSQL Backend
      const response = await fetch(`${N8N_URL}/webhook/submit-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          userName: formData.userName,
          userId: formData.userId,
          department: formData.department,
          leaveType: formData.leaveType,
          startDateTime: startDateTime,
          endDateTime: endDateTime,
          leaveDays: requestedDays, 
          selectedDates: selectedDates.map(d => format(d, "yyyy-MM-dd")),
          reason: formData.reason,
          submittedAt: new Date().toISOString(),
          isHalfDay: isHalfDay,
          halfDayPeriod: isHalfDay ? halfDayType : null, 
        }),
      });

      const result = await response.json();
      if (!response.ok || result.status === "error") {
        throw new Error(result.message || "An error occurred");
      }

      await Swal.fire({
        icon: "success",
        title: language === 'th' ? "ส่งคำขอสำเร็จ!" : "Request Submitted!",
        text: result.message || (language === 'th' ? "คำขอลางานของคุณถูกส่งเรียบร้อยแล้ว" : "Your leave request has been sent successfully."),
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
        title: language === 'th' ? "เกิดข้อผิดพลาด" : "Submission Failed",
        text: err.message || (language === 'th' ? "ไม่สามารถส่งคำขอได้" : "Failed to submit your request."),
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
            <Button onClick={() => window.location.reload()} className="bg-[#00B5E2]">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col font-sans relative">
      
      {/* Header */}
      <div className="bg-white text-slate-800 py-6 px-4 md:px-6 shadow-sm relative overflow-hidden rounded-b-3xl z-10 shrink-0">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-sky-500 via-amber-400 to-emerald-500"></div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => navigate("/")} 
            className="p-2.5 -ml-1 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors text-slate-600 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight">{t('leave_request')}</h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{t('submit_leave')}</p>
          </div>
        </div>
      </div>

      {/* Form Content Area */}
      <div className="px-4 pb-40 md:px-6 md:max-w-2xl md:mx-auto w-full mt-4 flex-1 space-y-4">


        <form id="leave-form" onSubmit={handleSubmit} className="space-y-4">
          
          {/* ข้อมูลส่วนตัวพนักงาน */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <User className="h-4 w-4 text-sky-500" /> {t('user_name')}
              </Label>

              <div className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 font-bold text-sm">
                {(() => {
                  const parts = (formData.userName || "").split('|').map(p => p.trim().replace(/[()]/g, ""));
                  const validParts = parts.filter(p => p !== "");

                  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
                    return `${parts[0]} ${parts[1]} (${parts[2]})`;
                  }
                  if (validParts.length > 1) {
                    const nick = validParts.pop(); 
                    const name = validParts.join(" "); 
                    return `${name} (${nick})`;
                  }
                  if (validParts.length === 1) {
                    return validParts[0]; 
                  }
                  return "Unknown User";
                })()}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                <FileText className="h-4 w-4 text-sky-500" /> {t('department')}
              </Label>
              <div className="px-4 py-3 h-12 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 font-bold text-sm flex items-center">
                {formData.department || t('department')}
              </div>
            </div>
          </div>

          {/* รายละเอียดการลา */}
          <div className={`p-4 rounded-2xl shadow-sm border transition-colors duration-300 ${
            formData.leaveType === 'sick' ? 'bg-rose-50/60 border-rose-100' : 
            formData.leaveType === 'vacation' ? 'bg-sky-50/60 border-sky-100' : 
            formData.leaveType === 'personal' ? 'bg-amber-50/60 border-amber-100' : 
            'bg-white border-slate-100'
          }`}>
            <div className="space-y-4">
              
              {/* ประเภทการลา */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                  <FileText className="h-4 w-4" /> {t('leave_type')}
                </Label>
                <Select value={formData.leaveType} onValueChange={(val) => setFormData({ ...formData, leaveType: val })} disabled={isLeaveTypeLocked}>
                  <SelectTrigger className={`h-12 rounded-xl font-bold border-white bg-white shadow-sm text-sm ${
                    formData.leaveType === 'sick' ? 'text-rose-600 ring-1 ring-rose-100' : 
                    formData.leaveType === 'vacation' ? 'text-sky-600 ring-1 ring-sky-100' : 
                    formData.leaveType === 'personal' ? 'text-amber-600 ring-1 ring-amber-100' : // 🌟 เพิ่มบรรทัดนี้
                    'text-slate-700 border-slate-200'
                  }`}>
                    <SelectValue placeholder={`-- ${t('leave_type')} --`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick" className="font-bold text-rose-600">{t('sick_leave')}</SelectItem>
                    <SelectItem value="vacation" className="font-bold text-sky-600">{t('annual_leave')}</SelectItem>
                    <SelectItem value="personal" className="font-bold text-amber-600">{t('personal_leave')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* เลือกวันที่ */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                  <CalendarIcon className="h-4 w-4" /> {t('select_date')}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal h-12 rounded-xl bg-white border-white shadow-sm text-sm hover:bg-slate-50 transition-colors",
                        !selectedDates?.length && "text-slate-400",
                        formData.leaveType === 'sick' ? 'ring-1 ring-rose-100' : formData.leaveType === 'vacation' ? 'ring-1 ring-sky-100' : 'border-slate-200'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      {selectedDates && selectedDates.length > 0 ? (
                        <span className="text-slate-800 font-medium truncate">
                          {t('selected')} <span className="text-sky-600 font-bold">{selectedDates.length}</span> {t('days')}
                          <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
                              ({[...selectedDates]
                                .sort((a,b)=>a.getTime()-b.getTime())
                                .map(d => format(d, "dd MMM", { locale: language === 'th' ? th : undefined }))
                                .join(", ")})
                          </span>
                        </span>
                      ) : (
                        <span>{t('click_to_select_date')}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-slate-200 shadow-2xl rounded-2xl" align="center">
                    {/* @ts-ignore */}
                    <CalendarComponent
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={handleDateSelect}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        
                        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                        const isPast = checkDate < today;
                        
                        const isPastDisabled = formData.leaveType === 'sick' ? false : isPast;
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        
                        const { isFullyTaken } = getDateLeaveStatus(date);
                        
                        return isPastDisabled || isWeekend || isFullyTaken;
                      }}
                      modifiers={{
                        taken: (date) => getDateLeaveStatus(date).isFullyTaken,
                        partiallyTaken: (date) => {
                          const status = getDateLeaveStatus(date);
                          return !status.isFullyTaken && (status.hasMorning || status.hasAfternoon);
                        }
                      }}
                      initialFocus
                      className="pointer-events-auto bg-white rounded-2xl p-3"
                      modifiersStyles={{
                        selected: {
                          backgroundColor: formData.leaveType === 'sick' ? "#f43f5e" : "#0ea5e9",
                          color: "white",
                          borderRadius: "12px",
                        },
                        disabled:{
                          color: "#cbd5e1",
                          opacity: "0.5",
                        },
                        taken: {
                          color: "#ef4444", 
                          backgroundColor: "#fee2e2", 
                          fontWeight: "bold",
                          borderRadius: "12px",
                          opacity: "0.6" 
                        },
                        partiallyTaken: {
                          color: "#d97706",
                          backgroundColor: "#fef3c7",
                          fontWeight: "bold",
                          borderRadius: "12px",
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>

                {/* เลือก ครึ่งวัน/เต็มวัน */}
                {selectedDates.length === 1 && (
                  <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <Label className="flex items-center gap-2 text-slate-500 text-[10px] uppercase tracking-wider font-bold">
                      <Clock className="h-3 w-3" /> {t('duration')}
                    </Label>
                    
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={!isHalfDay ? "default" : "outline"}
                        disabled={selectedDateStatus.hasMorning || selectedDateStatus.hasAfternoon}
                        className={cn("flex-1 h-10 rounded-xl shadow-sm text-xs font-bold transition-all", !isHalfDay ? (formData.leaveType === 'sick' ? "bg-rose-500 hover:bg-rose-600 text-white" : "bg-sky-500 hover:bg-sky-600 text-white") : "text-slate-500 bg-white border-slate-200 hover:bg-slate-50")}
                        onClick={() => setIsHalfDay(false)}
                      >
                        {t('full_day')}
                      </Button>
                      <Button
                        type="button"
                        variant={isHalfDay ? "default" : "outline"}
                        className={cn("flex-1 h-10 rounded-xl shadow-sm text-xs font-bold transition-all", isHalfDay ? "bg-amber-500 hover:bg-amber-600 text-white border-transparent" : "text-slate-500 bg-white border-slate-200 hover:bg-slate-50")}
                        onClick={() => setIsHalfDay(true)}
                      >
                        {t('half_day')}
                      </Button>
                    </div>

                    {/* ตัวเลือก เช้า/บ่าย จะโชว์ก็ต่อเมื่อกดเลือกปุ่ม "ครึ่งวัน" */}
                    {isHalfDay && (
                      <div className="flex gap-2 pt-1 animate-in slide-in-from-top-1">
                        <Button
                          type="button"
                          variant={halfDayType === "morning" ? "default" : "outline"}
                          disabled={selectedDateStatus.hasMorning}
                          className={cn("flex-1 h-9 rounded-lg text-xs font-semibold transition-all", halfDayType === "morning" ? "bg-slate-800 text-white" : "text-slate-500 bg-white border-slate-200 hover:bg-slate-50")}
                          onClick={() => setHalfDayType("morning")}
                        >
                          {language === 'th' ? "ช่วงเช้า" : "Morning"} {selectedDateStatus.hasMorning ? "(ลาแล้ว)" : ""}
                        </Button>
                        <Button
                          type="button"
                          variant={halfDayType === "afternoon" ? "default" : "outline"}
                          disabled={selectedDateStatus.hasAfternoon}
                          className={cn("flex-1 h-9 rounded-lg text-xs font-semibold transition-all", halfDayType === "afternoon" ? "bg-slate-800 text-white" : "text-slate-500 bg-white border-slate-200 hover:bg-slate-50")}
                          onClick={() => setHalfDayType("afternoon")}
                        >
                          {language === 'th' ? "ช่วงบ่าย" : "Afternoon"} {selectedDateStatus.hasAfternoon ? "(ลาแล้ว)" : ""}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* กล่องเหตุผล */}
              {formData.leaveType !== "vacation" && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                  <Label className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wider">
                    <FileText className="h-4 w-4" /> {t('reason')}
                  </Label>
                  <Textarea
                    placeholder={t('reason_placeholder')}
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className={`min-h-[80px] resize-none rounded-xl bg-white shadow-sm text-sm border-white ${formData.leaveType === 'sick' ? 'ring-1 ring-rose-100 focus-visible:ring-rose-400' : 'border-slate-200 focus-visible:ring-sky-400'}`}
                  />
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 md:px-6 md:py-5 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50">
        <div className="max-w-2xl mx-auto space-y-3">
          
          {(formData.leaveType !== "sick" && formData.leaveType !== "personal") && (
            <div className={`px-4 py-2.5 rounded-xl border flex items-center justify-between transition-colors ${
              isOverQuota ? "bg-rose-50 border-rose-200" : "bg-slate-800 border-slate-800 text-white"
            }`}>
              <div className="flex items-center gap-2">
                <CalendarIcon className={`h-4 w-4 ${isOverQuota ? "text-rose-500" : "text-slate-400"}`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${isOverQuota ? "text-rose-700" : "text-slate-300"}`}>{t('remaining_quota')}</span>
              </div>
              <div className="flex items-center gap-2">
                {isQuotaLoading ? (
                  <Skeleton className="h-5 w-12 bg-slate-600/50 rounded-md" />
                ) : (
                  <>
                    {isOverQuota && <AlertTriangle className="h-4 w-4 text-rose-500 animate-pulse" />}
                    <span className={`text-lg font-extrabold ${isOverQuota ? "text-rose-600" : "text-white"}`}>
                      {displayRemainingDays} <span className="text-[10px] font-medium opacity-80 uppercase ml-0.5">{t('days')}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ปุ่มกดลางาน */}
          <Button
            type="submit"
            form="leave-form" 
            disabled={isSubmitting || isOverQuota || selectedDates.length === 0}
            className={`w-full h-12 md:h-14 text-base font-bold text-white rounded-xl shadow-md transition-all active:scale-[0.98]
                ${isSubmitting || isOverQuota || selectedDates.length === 0 
                  ? "bg-slate-100 text-slate-400 shadow-none cursor-not-allowed" 
                  : formData.leaveType === 'sick' 
                    ? "bg-gradient-to-r from-rose-500 to-pink-600 hover:shadow-rose-500/30"
                    : formData.leaveType === 'personal'
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-amber-500/30"
                      : "bg-gradient-to-r from-sky-500 to-blue-600 hover:shadow-sky-500/30"
                }`}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('submitting')}</>
            ) : (
              t('submit_btn')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestForm;