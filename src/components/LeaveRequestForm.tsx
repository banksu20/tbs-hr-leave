import {leaveFormType} from '@/lib/leaveFormType';
import {leaveErrorMessage} from '@/lib/leaveErrorMessage';
import {employeeData} from "@/lib/employeeData";
import {useNotificationLanguage} from '@/hooks/useNotificationLanguage';
import { useState, useEffect, useMemo, useCallback, type ComponentType } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import liff from "@line/liff";
import Swal from "sweetalert2";
import { buildLeaveDateRange, toLocalDateString } from "@/lib/localDate";
import { format } from "date-fns";
import { th, enUS } from "date-fns/locale"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Loader2, Calendar as CalendarIcon, User, FileText, ArrowLeft, AlertTriangle, Clock, Check, Paperclip, Upload, Send, Thermometer, Palmtree, CalendarDays, GraduationCap } from "lucide-react";
import { exceedsBalance, type LeavePolicy } from "@/lib/leavePolicy";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";


const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2008617589-89gR1Y3Y";
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

type FormTone={header:string;solid:string;soft:string;text:string;activeCard:string;focus:string;hex:string;icon:ComponentType<{className?:string}>};
const formTones:Record<string,FormTone>={
  sick:{header:'from-rose-500 to-pink-500',solid:'bg-rose-500',soft:'bg-rose-50',text:'text-rose-600',activeCard:'border-rose-400 bg-rose-50/60',focus:'focus-visible:ring-rose-400',hex:'#f43f5e',icon:Thermometer},
  personal:{header:'from-amber-500 to-orange-500',solid:'bg-amber-500',soft:'bg-amber-50',text:'text-amber-600',activeCard:'border-amber-400 bg-amber-50/60',focus:'focus-visible:ring-amber-400',hex:'#f59e0b',icon:CalendarDays},
  vacation:{header:'from-sky-500 to-indigo-500',solid:'bg-sky-500',soft:'bg-sky-50',text:'text-sky-600',activeCard:'border-sky-400 bg-sky-50/60',focus:'focus-visible:ring-sky-400',hex:'#0ea5e9',icon:Palmtree},
  university:{header:'from-violet-500 to-purple-600',solid:'bg-violet-500',soft:'bg-violet-50',text:'text-violet-600',activeCard:'border-violet-400 bg-violet-50/60',focus:'focus-visible:ring-violet-400',hex:'#8b5cf6',icon:GraduationCap},
};

interface LeaveRequestFormProps {
  userId?: string;
  userName?: string;
  department?: string;
  initialLeaveType?: string;
  pictureUrl?: string;
}

interface FormData {
  userName: string;
  userId: string;
  department: string;
  leaveType: string;
  reason: string;
}

const LeaveRequestForm = ({ userId, userName, department, initialLeaveType, pictureUrl }: LeaveRequestFormProps) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage(); 

  const typeFromUrl = searchParams.get("type") || "";
  const defaultType = initialLeaveType || typeFromUrl;

  const [isLoading, setIsLoading] = useState(!userId); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(userId || "");

  useNotificationLanguage(currentUserId || null);
  const [isIntern,setIsIntern]=useState(false);
  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const [selfRecorded, setSelfRecorded] = useState(false);
  const [uploadError,setUploadError]=useState('');
  const [policyError, setPolicyError] = useState("");
  const [isQuotaLoading, setQuotaLoading] = useState(true);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [emergency,setEmergency]=useState(false);
  const [pictureFailed,setPictureFailed]=useState(false);
  const [overview,setOverview]=useState<{type:string;available:number;total:number}[]>([]);
  const [overviewAttempt,setOverviewAttempt]=useState(0);
  const [evidence,setEvidence]=useState<{id:string;filename:string}[]>([]);
  const [uploading,setUploading]=useState(false);
  const [reasonError, setReasonError] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isDepartmentLocked, setIsDepartmentLocked] = useState(false);


  const [formData, setFormData] = useState<FormData>({
    userName: userName || "",
    userId: userId || "",
    department: department || "",
    leaveType: leaveFormType(defaultType),
    reason: "",
  });

  useEffect(() => { setEmergency(false);setReasonError(false); }, [formData.leaveType]);

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

  const { startDate, endDate, dates: localDates } = useMemo(
    () => buildLeaveDateRange(selectedDates),
    [selectedDates]
  );

  const isOverQuota = exceedsBalance(policy, formData.leaveType);
  const deadlinePassed = !!policy?.deadline && clock>=Date.parse(policy.deadline);
  const isAnnual=['annual','vacation'].includes(formData.leaveType);
  const canEmergency=!selfRecorded && (['sick','personal'].includes(formData.leaveType) || (isAnnual && deadlinePassed));
  const exceptionSelected=canEmergency && emergency;
  const reasonRequired=!selfRecorded && (!isAnnual || exceptionSelected);
  const reasonLabel=exceptionSelected ? (isAnnual ? (language==='th'?'เหตุผลที่ขอลาหลังเวลาที่กำหนด':'Why you are requesting leave after the deadline') : (language==='th'?'เหตุผลในการลาและเหตุที่ต้องขอลาฉุกเฉิน':'Reason for leave and why it is urgent')) : t('reason');
  const late = (deadlinePassed && !(canEmergency&&emergency&&formData.reason.trim())) || (canEmergency&&emergency&&!formData.reason.trim());
  const canSwitchAnnual = formData.leaveType === 'personal' && isOverQuota && !!policy?.annualBalances.length && policy.annualBalances.every(b => b.allowed);
  const policyKey = JSON.stringify([currentUserId, formData.leaveType, localDates, isHalfDay]);
  const [checkedPolicyKey, setCheckedPolicyKey] = useState('');
  const policyReady = !!policy && checkedPolicyKey === policyKey && !isQuotaLoading && !policyError;
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setPolicy(null); setQuotaLoading(true); setPolicyError('');
    if (!currentUserId) {setQuotaLoading(false); return;}
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const timer = window.setTimeout(async () => {
      try {
        const token = liff.getAccessToken();
        if (!token) throw new Error(language === 'th' ? 'กรุณาเปิดแบบฟอร์มผ่าน LINE' : 'Please open this form in LINE.');
        const response = await fetch('/api/leave-policy', {method:'POST', signal:controller.signal,
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
          body:JSON.stringify({type:formData.leaveType||'annual',dates:localDates,daysPerDate:isHalfDay&&localDates.length===1?0.5:1})});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not check your leave balance.');
        if (active) {setPolicy(result);setIsIntern(Boolean(result.isIntern));setSelfRecorded(result.selfRecorded===true);setCheckedPolicyKey(policyKey);}
      } catch (e) {if(active)setPolicyError((e as Error).message);}
      finally {window.clearTimeout(timeout);if(active)setQuotaLoading(false);}
    }, 200);
    return () => {active=false;controller.abort();window.clearTimeout(timer);window.clearTimeout(timeout);};
  }, [policyKey, policyAttempt, language, currentUserId, formData.leaveType, localDates, isHalfDay]);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    const token = liff.getAccessToken();
    if (!token) return;
    Promise.all((['sick','personal','annual'] as const).map(async type => {
      try {
        const response = await fetch('/api/leave-policy', {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify({type,dates:[],daysPerDate:1})});
        const result = await response.json();
        const balance = response.ok && result.ok && !result.unlimited ? result.balances?.[0] : null;
        return balance && balance.known && !balance.unlimited && typeof balance.total === 'number' && typeof balance.available === 'number' ? {type, available:balance.available as number, total:balance.total as number} : null;
      } catch { return null; }
    })).then(rows => { if (active) setOverview(rows.filter((row): row is {type:'sick'|'personal'|'annual';available:number;total:number} => !!row)); });
    return () => { active = false; };
  }, [currentUserId, overviewAttempt]);

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
        leaveType: leaveFormType(initialLeaveType || "") || prev.leaveType,
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
      employeeData('get-leave-history')
      .then(data => {
        if (Array.isArray(data)) {
          const leaves: TakenLeaveRecord[] = [];
          data.forEach((item: {status?:string;leave_days?:number|string;leaveDays?:number|string;is_half_day?:boolean|string;isHalfDay?:boolean|string;half_day_period?:string;halfDayPeriod?:string;period?:string;selected_dates?:string;date?:string}) => {
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
                    const mMap: Record<string,string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
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

  const getDateLeaveStatus = useCallback((date: Date) => {
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
  }, [takenLeaves]);

  const selectedDateStatus = useMemo(() => {
    if (selectedDates.length !== 1) return { hasMorning: false, hasAfternoon: false, isFullyTaken: false };
    return getDateLeaveStatus(selectedDates[0]);
  }, [selectedDates, getDateLeaveStatus]);

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

  const typeOptions = [
    {value:'sick',label:t('sick_leave'),dot:'bg-rose-500',text:'text-rose-700',active:'border-rose-400 bg-rose-50'},
    {value:'personal',label:t('personal_leave'),dot:'bg-amber-500',text:'text-amber-700',active:'border-amber-400 bg-amber-50'},
    {value:'vacation',label:t('annual_leave'),dot:'bg-sky-500',text:'text-sky-700',active:'border-sky-400 bg-sky-50'},
    ...(isIntern?[{value:'university',label:language==='th'?'กิจกรรมมหาวิทยาลัย':'University',dot:'bg-violet-500',text:'text-violet-700',active:'border-violet-400 bg-violet-50'}]:[]),
  ];

  const submitHint = selectedDates.length === 0 ? (language==='th'?'เลือกวันที่ต้องการลาก่อน':'Choose your leave date first.')
    : uploading ? (language==='th'?'รออัปโหลดเอกสารให้เสร็จ':'Wait for the upload to finish.')
    : policyError ? (language==='th'?'ตรวจสอบสิทธิ์ลาไม่สำเร็จ กดลองอีกครั้งด้านบน':'Your allowance could not be checked. Tap Retry above.')
    : !policyReady ? ''
    : formData.leaveType==='university'&&!evidence.length ? (language==='th'?'แนบหลักฐานก่อนส่งคำขอ':'Attach supporting evidence before submitting.')
    : isOverQuota ? (language==='th'?'คำขอนี้เกินสิทธิ์ลาคงเหลือ':'This request is more than your remaining leave.')
    : late ? (exceptionSelected ? (language==='th'?'กรอกเหตุผลก่อนส่งคำขอ':'Enter your reason before submitting.') : (language==='th'?'เลยกำหนดส่งคำขอแล้ว ดูตัวเลือกด้านบน':'The request deadline has passed. See the option above.'))
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date());
    if(!selfRecorded&&localDates.some(date=>date<today)){await Swal.fire({icon:'warning',text:language==='th'?'ไม่สามารถขอลาย้อนหลังได้':'Leave cannot be requested for past dates.',confirmButtonColor:'#00B5E2'});return;}
    setReasonError(reasonRequired && !formData.reason.trim());
    if (!formData.department || !formData.leaveType || selectedDates.length === 0 || (reasonRequired && !formData.reason.trim())) {
      Swal.fire({
        icon: "warning",
        title: language === 'th' ? "ข้อมูลไม่ครบถ้วน" : "Incomplete Form",
        text: language === 'th' ? "กรุณากรอกข้อมูลที่จำเป็นและเลือกวันลาอย่างน้อยหนึ่งวัน" : "Please fill in all required fields and select at least one leave date.",
        confirmButtonColor: "#00B5E2",
      });
      return;
    }

    if (!policyReady || isOverQuota || late || (formData.leaveType==='university'&&!evidence.length)) {
      setClock(Date.now());setPolicyAttempt(n=>n+1);return;
    }
    setIsSubmitting(true);

    try {
      // 1. Submit to n8n Webhook / PostgreSQL Backend
      const response = await fetch(`/api/employee-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${liff.getAccessToken()}` },
        body: JSON.stringify({
          userName: formData.userName,
          userId: formData.userId,
          department: formData.department,
          leaveType: formData.leaveType,
          startDateTime: startDate,
          endDateTime: endDate,
          startDate: startDate,
          endDate: endDate,
          leaveDays: requestedDays, 
          selectedDates: localDates,
          reason: formData.reason.trim(),
          emergencyReason: canEmergency&&emergency?formData.reason.trim():'',
          evidenceIds:evidence.map(f=>f.id),
          submittedAt: new Date().toISOString(),
          isHalfDay: isHalfDay,
          halfDayPeriod: isHalfDay ? halfDayType : null, 
        }),
      });

      const result = await response.json();
      if (!response.ok || result.ok === false || result.status === "error") {
        throw new Error(result.error || result.message || "An error occurred");
      }

      await Swal.fire({
        icon: "success",
        title: result.selfRecorded ? (language === 'th' ? "บันทึกการลาแล้ว" : "Leave Recorded") : (language === 'th' ? "ส่งคำขอสำเร็จ!" : "Request Submitted!"),
        text: result.selfRecorded ? (language === 'th' ? "บันทึกการลาของคุณเป็นอนุมัติแล้ว ไม่ต้องรอการอนุมัติ" : "Your leave is saved as approved. No approval needed.")+(result.ceoNotified?(language==='th'?" แจ้งให้ Dan ทราบแล้ว":" Dan has been notified."):"") : (language === 'th' ? "คำขอลางานของคุณถูกส่งเรียบร้อยแล้ว" : "Your leave request has been sent successfully."),
        confirmButtonColor: "#00B5E2",
      });

      navigate("/"); 
      setFormData((prev) => ({ ...prev, reason: "" }));setEvidence([]);setEmergency(false);setOverviewAttempt(n=>n+1);
      setSelectedDates([]);
      setIsHalfDay(false);

      if (liff.isInClient()) {
        liff.closeWindow();
      }
    } catch (err: unknown) {
      await Swal.fire({
        icon: "error",
        title: language === 'th' ? "เกิดข้อผิดพลาด" : "Submission Failed",
        text: leaveErrorMessage((err instanceof Error ? err.message : ""),language) || (language === 'th' ? "ไม่สามารถส่งคำขอได้" : "Failed to submit your request."),
        confirmButtonColor: "#00B5E2",
      });
      setPolicyAttempt(n=>n+1);
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
            <p className="text-destructive mb-4">{leaveErrorMessage(error,language)}</p>
            <Button onClick={() => window.location.reload()} className="bg-[#00B5E2]">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tone = formTones[formData.leaveType] ?? formTones.vacation;
  const thai = language === 'th';
  const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
  const submitDisabled = isSubmitting || uploading || !policyReady || isOverQuota || late || (formData.leaveType==='university'&&!evidence.length) || selectedDates.length === 0;
  const displayName = (() => {
    const parts = (formData.userName || "").split('|').map(p => p.trim().replace(/[()]/g, ""));
    const validParts = parts.filter(p => p !== "");
    if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) return `${parts[0]} ${parts[1]} (${parts[2]})`;
    if (validParts.length > 1) { const nick = validParts.pop(); return `${validParts.join(" ")} (${nick})`; }
    if (validParts.length === 1) return validParts[0];
    return "Unknown User";
  })();
  const summaryText = selectedDates.length === 0 ? '' : `${requestedDays} ${thai ? 'วัน' : requestedDays === 1 ? 'day' : 'days'}${isHalfDay && selectedDates.length === 1 ? ` · ${halfDayType === 'morning' ? (thai ? 'ช่วงเช้า' : 'Morning') : (thai ? 'ช่วงบ่าย' : 'Afternoon')}` : ''}`;
  const step = (n: number, title: string, Icon: typeof CalendarIcon) => (
    <div className="mb-3 flex items-center gap-2.5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${tone.solid}`}>{n}</span>
      <Icon className="h-4 w-4 text-slate-400" />
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
    </div>
  );

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col font-sans relative">
      <header className={`relative overflow-hidden bg-linear-to-br/srgb ${tone.header} px-4 pt-5 pb-16 text-white rounded-b-[2rem] shrink-0 transition-colors duration-300`}>
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-white/5" />
        <div className="relative md:max-w-2xl md:mx-auto">
          <div className="flex items-center gap-3 pr-14">
            <button
              type="button"
              aria-label={thai?'กลับหน้าหลัก':'Back to home'}
              onClick={() => navigate("/")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 transition hover:bg-white/30 active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight">{t('leave_request')}</h1>
              <p className="text-xs font-medium text-white/80">{t('submit_leave')}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/15 p-3 ring-1 ring-white/20">
            {pictureUrl&&!pictureFailed
              ? <img src={pictureUrl} alt="" aria-hidden referrerPolicy="no-referrer" onError={()=>setPictureFailed(true)} className="h-10 w-10 shrink-0 rounded-xl object-cover bg-white/20"/>
              : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20"><User className="h-5 w-5" aria-hidden /></span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" aria-label={t('user_name')}>{displayName}</p>
              <p className="truncate text-xs text-white/80" aria-label={t('department')}>{formData.department || t('department')}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="relative -mt-10 w-full flex-1 px-4 pb-44 md:max-w-2xl md:mx-auto">
        <form id="leave-form" onSubmit={handleSubmit} className="space-y-3">

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-md shadow-slate-200/50">
            {step(1, t('leave_type'), FileText)}
            <div role="radiogroup" aria-label={t('leave_type')} className={`grid gap-2 ${isIntern?'grid-cols-2 sm:grid-cols-4':'grid-cols-3'}`}>
              {typeOptions.map(o=>{const active=formData.leaveType===o.value;const b=overview.find(x=>x.type===(o.value==='vacation'?'annual':o.value));const ot=formTones[o.value];const Icon=ot.icon;return (
                <button type="button" role="radio" aria-checked={active} key={o.value} disabled={uploading || evidence.length > 0 || isSubmitting} onClick={()=>setFormData(prev=>({...prev,leaveType:o.value}))}
                  className={`relative flex flex-col items-start rounded-2xl border-2 p-3 text-left transition disabled:opacity-60 active:scale-[0.97] ${active?`${ot.activeCard} shadow-sm`:'border-slate-100 bg-white hover:border-slate-200'}`}>
                  {active&&<span className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full text-white ${ot.solid}`}><Check className="h-3 w-3" strokeWidth={3}/></span>}
                  <span className={`grid h-8 w-8 place-items-center rounded-xl ${ot.soft} ${ot.text}`}><Icon className="h-4 w-4"/></span>
                  <span className={`mt-2 text-xs font-bold leading-tight ${active?ot.text:'text-slate-700'}`}>{o.label}</span>
                  {b?<span className="mt-1 leading-none"><span className={`text-lg font-extrabold ${b.available<=0?'text-rose-500':'text-slate-900'}`}>{b.available}</span><span className="text-[11px] font-medium text-slate-400">/{b.total} {thai?'วัน':'left'}</span></span>
                    :<span className="mt-1 text-[11px] leading-tight text-slate-400">{o.value==='university'?(thai?'ต้องแนบหลักฐาน':'Needs evidence'):' '}</span>}
                </button>);})}
            </div>
            {overview.length>0&&<p className="mt-2 text-[11px] text-slate-400">{thai?(isIntern?'จำนวนวันคงเหลือตลอดการฝึกงาน':'จำนวนวันคงเหลือของปีนี้'):(isIntern?'Days left for your whole internship':'Days left this year')}</p>}
            {(uploading || evidence.length > 0) && <p className="mt-2 text-xs text-slate-600">{thai?'หากต้องการเปลี่ยนประเภทการลา ให้รออัปโหลดเสร็จแล้วลบไฟล์แนบด้านล่างก่อน':'To change leave type, wait for uploads to finish and remove the attachments below first.'}</p>}
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-xs">
            {step(2, t('select_date'), CalendarIcon)}
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60">
              <CalendarComponent
                mode="multiple"
                selected={selectedDates}
                onSelect={handleDateSelect}
                disabled={(date) => {
                  const isPastDisabled = toLocalDateString(date) < (selfRecorded ? `${new Date(clock).getFullYear()-1}-01-01` : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date(clock)));
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
                locale={thai ? th : enUS}
                className="w-full p-2"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-3",
                  caption_label: "text-sm font-bold text-slate-800",
                  table: "w-full border-collapse",
                  head_row: "flex w-full",
                  head_cell: "flex-1 text-slate-400 font-medium text-[0.75rem]",
                  row: "flex w-full mt-1",
                  cell: "flex-1 h-10 p-0.5 text-center text-sm relative focus-within:z-20",
                  day: "h-full w-full rounded-xl p-0 font-medium text-slate-700 transition hover:bg-white aria-selected:opacity-100",
                  day_today: "ring-1 ring-slate-300",
                }}
                modifiersStyles={{
                  selected: { backgroundColor: tone.hex, color: "white", borderRadius: "12px" },
                  disabled: { color: "#cbd5e1", opacity: "0.5" },
                  taken: { color: "#ef4444", backgroundColor: "#fee2e2", fontWeight: "bold", borderRadius: "12px", opacity: "0.6" },
                  partiallyTaken: { color: "#d97706", backgroundColor: "#fef3c7", fontWeight: "bold", borderRadius: "12px" },
                }}
              />
            </div>
            {sortedDates.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold text-slate-600">{t('selected')} <span className={`font-bold ${tone.text}`}>{selectedDates.length}</span> {t('days')}</span>
                {sortedDates.map(d => <span key={d.getTime()} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.soft} ${tone.text}`}>{format(d, "EEE d MMM", { locale: thai ? th : undefined })}</span>)}
              </div>
            ) : <p className="mt-3 text-xs text-slate-400">{t('click_to_select_date')}</p>}

            {selectedDates.length === 1 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 animate-in fade-in slide-in-from-top-2">
                <Label className="flex items-center gap-2 text-slate-500 text-[11px] uppercase tracking-wider font-bold">
                  <Clock className="h-3.5 w-3.5" /> {t('duration')}
                </Label>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                  <button type="button" disabled={selectedDateStatus.hasMorning || selectedDateStatus.hasAfternoon} onClick={() => setIsHalfDay(false)}
                    className={cn("h-10 rounded-xl text-xs font-bold transition disabled:opacity-40", !isHalfDay ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{t('full_day')}</button>
                  <button type="button" onClick={() => setIsHalfDay(true)}
                    className={cn("h-10 rounded-xl text-xs font-bold transition", isHalfDay ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{t('half_day')}</button>
                </div>
                {isHalfDay && (
                  <div className="grid grid-cols-2 gap-2 pt-1 animate-in slide-in-from-top-1">
                    <button type="button" disabled={selectedDateStatus.hasMorning} onClick={() => setHalfDayType("morning")}
                      className={cn("h-10 rounded-xl border-2 text-xs font-semibold transition disabled:opacity-40", halfDayType === "morning" ? `${tone.activeCard} ${tone.text}` : "border-slate-100 text-slate-500")}>
                      {thai ? "ช่วงเช้า" : "Morning"} {selectedDateStatus.hasMorning ? (thai?"(ลาแล้ว)":"(already booked)") : ""}
                    </button>
                    <button type="button" disabled={selectedDateStatus.hasAfternoon} onClick={() => setHalfDayType("afternoon")}
                      className={cn("h-10 rounded-xl border-2 text-xs font-semibold transition disabled:opacity-40", halfDayType === "afternoon" ? `${tone.activeCard} ${tone.text}` : "border-slate-100 text-slate-500")}>
                      {thai ? "ช่วงบ่าย" : "Afternoon"} {selectedDateStatus.hasAfternoon ? (thai?"(ลาแล้ว)":"(already booked)") : ""}
                    </button>
                  </div>
                )}
              </div>
            )}
            {policyReady&&policy?.deadline&&selectedDates.length>0&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{thai?'กำหนดส่งคำขอ:':'Request deadline:'} {new Date(policy.deadline).toLocaleString(thai?'th-TH':'en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'})} ({thai?'เวลากรุงเทพฯ':'Bangkok time'}){['personal','university'].includes(formData.leaveType) && <span className="block mt-1">{thai?'ต้องส่งคำขอก่อน 16:30 น. ของวันก่อนวันลา โดยนับรวมวันเสาร์–อาทิตย์และวันหยุด':'Submit before 16:30 on the calendar day before leave, including weekends and holidays.'}</span>}{policy.isIntern && ['annual','vacation'].includes(formData.leaveType) && <span className="block mt-1">{thai?'ลาพักร้อนต้องแจ้งล่วงหน้าอย่างน้อย 3 วันปฏิทิน ก่อน 16:30 น.':'Annual leave requires 3 calendar days’ notice, before 16:30.'}</span>}</p>}
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-xs space-y-3">
            {step(3, reasonLabel, FileText)}
            {canEmergency&&<div>
              <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition ${emergency?'border-amber-300 bg-amber-50':'border-slate-100 hover:border-slate-200'}`}>
                <input type="checkbox" className="peer sr-only" checked={emergency} onChange={e=>{setEmergency(e.target.checked);setReasonError(false);}}/>
                <span className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 ${emergency?'bg-amber-500':'bg-slate-200'}`}><span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${emergency?'translate-x-4':''}`}/></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><AlertTriangle className="h-4 w-4 text-amber-500"/>{isAnnual ? (thai?'ขออนุมัติลาหลังเวลาที่กำหนด':'Request late approval') : (thai?'เหตุฉุกเฉิน':'Emergency request')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{!exceptionSelected
                    ? (isAnnual ? (thai?'เลือกเมื่อเลยกำหนดส่งคำขอลาพักร้อนแล้ว และต้องการให้ผู้อนุมัติพิจารณาเป็นกรณีพิเศษ':'Tick this when the annual leave deadline has passed and you want the approvers to consider it anyway.') : (thai?'เลือกเมื่อเลยกำหนดส่งคำขอแล้วเพราะเหตุฉุกเฉิน เช่น ป่วยกะทันหันหรือเรื่องด่วนของครอบครัว':'Tick this when the request deadline has passed because of an emergency, such as sudden illness or an urgent family matter.'))
                    : (thai?'กรอกเหตุผลในช่องด้านล่าง คำขอยังต้องได้รับการอนุมัติและมีสิทธิ์ลาคงเหลือเพียงพอ':'Use the reason box below. Your request still needs approval and enough remaining leave.')}</span>
                </span>
              </label>
            </div>}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500">
                {reasonLabel} {!reasonRequired ? (thai ? '(ไม่บังคับ)' : '(optional)') : <span className="text-rose-500">*</span>}
              </Label>
              <Textarea
                aria-label={reasonLabel}
                aria-required={reasonRequired}
                aria-invalid={reasonError}
                maxLength={2000}
                placeholder={exceptionSelected ? reasonLabel : t('reason_placeholder')}
                value={formData.reason}
                onChange={(e) => {setFormData({ ...formData, reason: e.target.value });setReasonError(false);}}
                className={`min-h-[96px] resize-none rounded-2xl border-slate-200 bg-slate-50/60 text-sm focus-visible:bg-white ${reasonError&&reasonRequired?'border-rose-300 focus-visible:ring-rose-400':tone.focus}`}
              />
              <div className="flex justify-between text-[11px]">
                {reasonError && reasonRequired ? <p role="alert" className="text-red-700">{thai?'กรุณากรอกเหตุผลในการลา':'Please enter a reason for your leave.'}</p> : <span/>}
                <span className="text-slate-300">{formData.reason.length}/2000</span>
              </div>
            </div>
            {policyReady && late && <p role="alert" className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{exceptionSelected ? (thai?'กรุณากรอกเหตุผลในช่องด้านบน':'Please enter your explanation in the box above.') : canEmergency ? (isAnnual ? (thai?'เลยกำหนดส่งคำขอแล้ว เลือก “ขออนุมัติลาหลังเวลาที่กำหนด” และอธิบายเหตุผลเพื่อส่งให้ผู้อนุมัติพิจารณา':'The deadline has passed. Select “Request late approval” and explain why to send it for approval.') : (thai?'เลยกำหนดส่งคำขอแล้ว หากเป็นเหตุฉุกเฉิน ให้เลือก “เหตุฉุกเฉิน” และอธิบายเหตุผล':'The deadline has passed. For an urgent request, select “Emergency request” and explain why.')) : (thai?'เลยกำหนดส่งคำขอสำหรับวันที่เลือก กรุณาเลือกวันใหม่':'The deadline for these dates has passed. Please choose later dates.')}</p>}
          </section>

          {!selfRecorded&&['sick','university'].includes(formData.leaveType)&&<section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className={`grid h-7 w-7 place-items-center rounded-full ${tone.soft} ${tone.text}`}><Paperclip className="h-3.5 w-3.5"/></span>
              <h2 className="text-sm font-bold text-slate-800">{formData.leaveType==='university'?(thai?'หลักฐานกิจกรรม *':'Activity evidence *'):(thai?'ใบรับรองแพทย์ (แนบภายหลังได้)':'Medical certificate (can be supplied later)')}</h2>
            </div>
            <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed p-4 text-center transition ${uploading||evidence.length>=3?'cursor-not-allowed border-slate-100 opacity-60':'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
              {uploading?<Loader2 className="h-6 w-6 animate-spin text-slate-400"/>:<Upload className="h-6 w-6 text-slate-400"/>}
              <span className="text-sm font-semibold text-slate-700">{uploading?(thai?'กำลังอัปโหลด…':'Uploading…'):(thai?'แตะเพื่อเลือกไฟล์':'Tap to choose a file')}</span>
              <span className="text-[11px] text-slate-400">{thai?'PDF, PNG หรือ JPG · ไฟล์ละไม่เกิน 2 MB · สูงสุด 3 ไฟล์':'PDF, PNG or JPG · up to 2 MB each · up to 3 files'}</span>
              <input aria-label={thai?'เอกสารประกอบ':'Supporting evidence'} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" disabled={uploading||evidence.length>=3} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2097152){setUploadError(thai?'เลือกไฟล์ขนาดไม่เกิน 2 MB':'Choose a file up to 2 MB.');return;}setUploadError('');setUploading(true);try{const content=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});const r=await fetch('/api/leave-evidence',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${liff.getAccessToken()}`},body:JSON.stringify({filename:file.name,mime:file.type,content,documentType:formData.leaveType==='sick'?'certificate':'activity'})});const b=await r.json();if(!r.ok)throw Error(b.error);setEvidence(old=>[...old,{id:b.id,filename:b.filename}]);}catch(err){setUploadError((err as Error).message);}finally{setUploading(false);e.target.value='';}}}/>
            </label>
            {uploadError&&<p role="alert" className="text-red-700 text-xs">{leaveErrorMessage(uploadError,language)}</p>}
            {evidence.map(f=><div key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-slate-400"/><span className="truncate font-medium text-slate-700">{f.filename}</span></span>
              <button type="button" disabled={uploading} className="shrink-0 font-semibold text-rose-600 disabled:opacity-50" onClick={async()=>{setUploading(true);setUploadError('');try{const r=await fetch('/api/leave-evidence?id='+f.id,{method:'DELETE',headers:{Authorization:`Bearer ${liff.getAccessToken()}`}});if(!r.ok)throw Error((await r.json()).error);setEvidence(old=>old.filter(x=>x.id!==f.id));}catch(e){setUploadError((e as Error).message);}finally{setUploading(false);}}}>{thai?'ลบไฟล์':'Remove file'}</button>
            </div>)}
          </section>}

          {policy?.medicalCertificateRequired && <p role="status" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{thai?'ลาป่วยติดต่อกันอย่างน้อย 3 วันทำงาน กรุณาส่งใบรับรองแพทย์ให้ฝ่ายบุคคล':'Sick leave covers at least 3 consecutive working days. Please submit a medical certificate to HR.'}</p>}
          {policyError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{leaveErrorMessage(policyError,language)} <button type="button" className="font-semibold underline" onClick={()=>setPolicyAttempt(n=>n+1)}>{thai?'ลองอีกครั้ง':'Retry'}</button></div>}
          {policyReady && policy && formData.leaveType && (formData.leaveType !== 'sick' || policy.isIntern) && <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-xs space-y-3 text-sm" aria-label={thai?'สรุปสิทธิ์ลา':'Leave allowance summary'}>
            <p className="font-bold text-slate-800">{thai
              ? ({sick:'ลาป่วย',personal:'ลากิจ',vacation:'ลาพักร้อน',annual:'ลาพักร้อน',university:'ลากิจกรรมมหาวิทยาลัย'}[formData.leaveType])
              : ({sick:'Sick leave',personal:'Personal leave',vacation:'Annual leave',annual:'Annual leave',university:'University activity'}[formData.leaveType])}</p>
            {policy.unlimited ? <p>{thai?'ไม่จำกัดวันลา':'No leave limit'}</p> : policy.balances.map(b=><div key={b.year} className="rounded-2xl bg-slate-50 p-3 text-slate-700 space-y-2">
              <p className="text-xs text-slate-500">{policy.isIntern ? (thai?'สิทธิ์ตลอดการฝึกงาน':'Whole internship allowance') : b.year}</p>
              {!b.known ? <p>{thai?'ยังไม่กำหนดสิทธิ์ลา กรุณาติดต่อฝ่ายบุคคล':'Allowance is not configured. Contact HR.'}</p> : b.unlimited ? <p>{thai?'ไม่มีโควตาวันลา ต้องแนบหลักฐานและได้รับอนุมัติ':'No fixed allowance. Evidence and approval are required.'}</p> : <>
                <div className="flex flex-wrap justify-between gap-2 font-semibold">
                  <span>{thai?`คงเหลือ ${b.available} วัน`:`${b.available} days remaining`}</span>
                  <span className={tone.text}>{thai?`คำขอนี้ ${b.requested} วัน`:`This request: ${b.requested} ${b.requested===1?'day':'days'}`}</span>
                </div>
                {b.total ? <div className="h-2 overflow-hidden rounded-full bg-white"><div className="flex h-full"><span className="h-full bg-slate-300" style={{width:`${Math.min(100,(b.approved+b.pending)/b.total*100)}%`}}/><span className={`h-full ${b.allowed?tone.solid:'bg-red-500'}`} style={{width:`${Math.min(100,b.requested/b.total*100)}%`}}/></div></div> : null}
                <p className="text-xs text-slate-500">{thai?`สิทธิ์ทั้งหมด ${b.total} วัน · ใช้แล้ว ${b.approved} วัน · รออนุมัติ ${b.pending} วัน`:`Allowance: ${b.total} days · Used: ${b.approved} · Pending: ${b.pending}`}</p>
                {!b.allowed && <p role="alert" className="text-red-700">{b.available!==null && b.requested>b.available
                  ? (thai?`คำขอนี้เกินสิทธิ์คงเหลือ ${b.requested-b.available} วัน กรุณาลดจำนวนวันที่เลือก`:`This request exceeds your remaining allowance by ${b.requested-b.available} ${b.requested-b.available===1?'day':'days'}. Select fewer days.`)
                  : (policy.isIntern ? (thai?'วันที่เลือกอยู่นอกช่วงฝึกงานของคุณ กรุณาเลือกวันที่ภายในช่วงฝึกงาน หรือติดต่อฝ่ายบุคคลหากวันเริ่มหรือสิ้นสุดไม่ถูกต้อง':'The selected dates are outside your internship period. Choose dates within your internship, or contact HR if your start or end date is incorrect.') : (thai?'วันที่เลือกอยู่นอกช่วงสิทธิ์ลา กรุณาติดต่อฝ่ายบุคคล':'The selected dates are outside your eligible leave period. Contact HR.'))}</p>}
              </>}
            </div>)}
            {policy.isIntern && <p className="text-xs text-slate-500">{thai?'สิทธิ์ลาป่วย ลากิจ และลาพักร้อนแยกจากกัน':'Sick, personal and annual leave have separate allowances.'}</p>}
            {canSwitchAnnual && <Button type="button" variant="outline" className="rounded-xl" onClick={()=>setFormData(prev=>({...prev,leaveType:'vacation'}))}>{thai?'เปลี่ยนเป็นลาพักร้อน':'Switch to annual leave'}</Button>}
          </section>}
        </form>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 p-4 backdrop-blur md:px-6 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.12)]">
        <div className="mx-auto max-w-2xl space-y-2">
          {isQuotaLoading && <p className="text-center text-xs text-slate-500">{thai?'กำลังตรวจสอบสิทธิ์ลา…':'Checking leave allowance…'}</p>}
          {!isQuotaLoading && !isSubmitting && submitHint && <p role="status" className="text-xs text-amber-700 text-center">{submitHint}</p>}
          <div className="flex items-center gap-3">
            {summaryText && <div className="shrink-0 leading-tight"><p className={`text-lg font-extrabold ${tone.text}`}>{summaryText.split(' · ')[0]}</p>{summaryText.includes(' · ')&&<p className="text-[11px] text-slate-500">{summaryText.split(' · ')[1]}</p>}</div>}
            <Button
              type="submit"
              form="leave-form"
              disabled={submitDisabled}
              className={`h-12 flex-1 rounded-2xl text-base font-bold text-white shadow-md transition-all active:scale-[0.98] md:h-14 ${submitDisabled ? "bg-slate-100 text-slate-400 shadow-none cursor-not-allowed" : `bg-linear-to-r/srgb ${tone.header}`}`}
            >
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('submitting')}</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />{t('submit_btn')}</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestForm;
