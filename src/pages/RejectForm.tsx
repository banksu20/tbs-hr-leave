// src/pages/RejectForm.tsx
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import liff from "@line/liff";

//  1. Import ระบบภาษา
import { useLanguage } from "@/hooks/useLanguage";


const WEBHOOK_SUBMIT_REJECT = "https://unphotographed-dionna-laudable.ngrok-free.dev/webhook/submit-reject";

// ฟังก์ชันแปลงประเภทการลาให้เป็น 2 ภาษา
const formatLeaveType = (type: string | null, language: string) => {
  if (!type) return "-";
  const t = type.toLowerCase();
  
  if (language === 'th') {
    if (t.includes('sick')) return 'ลาป่วย';
    if (t.includes('vacation') || t.includes('annual')) return 'ลาพักร้อน';
    if (t.includes('personal')) return 'ลากิจ';
  } else {
    if (t.includes('sick')) return 'Sick Leave';
    if (t.includes('vacation') || t.includes('annual')) return 'Annual Leave';
    if (t.includes('personal')) return 'Personal Leave';
  }
  return type;
};

export default function RejectForm() {
  const [searchParams] = useSearchParams();
  const rowId = searchParams.get("row"); 
  const userId = searchParams.get("userId");
  const userName = searchParams.get("userName");
  const col = searchParams.get("col");
  const days = searchParams.get("days");
  const type = searchParams.get("type");
  const takenRow = searchParams.get("takenRow");
  const remainRow = searchParams.get("remainRow");
  const leaveReason = searchParams.get("leaveReason") || searchParams.get("reason");
  const dbId = searchParams.get("db_id") || "";
  const leaveDate = searchParams.get("leaveDate");

  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  //  2. ดึงฟังก์ชัน t() และสลับภาษามาใช้
  const { language, toggleLanguage, t } = useLanguage();

  useEffect(() => {
    liff.init({ liffId: "2008617589-89gR1Y3Y" }).catch((err) => {
      console.error("LIFF Init failed", err);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: t('enter_reason_alert'), variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(WEBHOOK_SUBMIT_REJECT, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true" 
        },
        body: JSON.stringify({
          row: rowId,
          reason: reason,
          userId: userId,
          col: col,
          days: days,
          type: type,
          takenRow: takenRow,
          remainRow: remainRow,
          dbId: dbId,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      if (liff.isInClient()) {
        toast({ title: "Success" });
        liff.closeWindow();
      } else {
        alert(t('success_alert'));
      }

    } catch (error) {
      console.error(error);
      toast({ title: "รายการนี้ถูกดำเนินการ (อนุมัติหรือปฏิเสธ) ไปแล้ว ไม่สามารถทำรายการซ้ำได้", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (liff.isInClient()) {
      liff.closeWindow(); 
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative">
      
      {/*  ปุ่มเปลี่ยนภาษาแบบลอย มุมขวาบน */}
      <button
        type="button"
        onClick={toggleLanguage}
        className="absolute top-4 right-4 z-50 bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5"
      >
        {language === 'th' ? 'TH' : 'EN'}
      </button>

      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-red-500">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">TBS Marketing</span>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md font-medium">{t('reject_action')}</span>
          </div>
          <CardTitle className="text-xl text-slate-800">
            {t('reject_title')}
          </CardTitle>
          <CardDescription className="text-slate-500 mt-2">
            {t('reject_desc')}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {/* 📋 กล่องสรุปข้อมูล */}
          <div className="bg-slate-100 rounded-lg p-3 mb-5 border border-slate-200">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-slate-500">{t('emp_name')}</div>
              <div className="col-span-2 font-medium text-slate-700">{userName || "-"}</div>
              
              <div className="text-slate-500">{t('leave_type')}</div>
              <div className="col-span-2 font-medium text-slate-700">{formatLeaveType(type, language)}</div>
              
              <div className="text-slate-500">{t('leave_date')}</div>
              <div className="col-span-2 font-medium text-slate-700">
                {leaveDate ? leaveDate.replace(/to/g, language === 'th' ? 'ถึง' : 'to') : "-"}
              </div>
              
              <div className="text-slate-500">{t('leave_duration')}</div>
              <div className="col-span-2 font-medium text-slate-700">
                {days === "0.5" 
                  ? t('half_day') 
                  : days === "1" 
                    ? `1 ${t('days')} (${t('full_day')})` 
                    : `${days || "-"} ${t('days')}`
                }
              </div>

              <div className="text-slate-500">{t('leave_reason')}</div>
              <div className="col-span-2 font-medium text-slate-700">{leaveReason || "-"}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                {t('reason_label')} <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder={t('reject_reason_placeholder')} 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[100px] resize-none focus-visible:ring-red-500"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full text-slate-600 border-slate-300 hover:bg-slate-100"
                onClick={handleCancel}
              >
                {t('cancel_btn')}
              </Button>
              <Button 
                type="submit" 
                variant="destructive" 
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? "..." : t('confirm_reject_btn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}