// src/pages/RejectForm.tsx
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import liff from "@line/liff";

const WEBHOOK_SUBMIT_REJECT = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/submit-reject";

// ฟังก์ชันแปลงประเภทการลาให้เป็น 2 ภาษา
const formatLeaveType = (type: string | null) => {
  if (!type) return "-";
  const t = type.toLowerCase();
  if (t.includes('sick')) return 'Sick Leave (ลาป่วย)';
  if (t.includes('vacation') || t.includes('annual')) return 'Annual Leave (ลาพักร้อน)';
  if (t.includes('personal')) return 'Personal Leave (ลากิจ)';
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

  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    liff.init({ liffId: "2008617589-89gR1Y3Y" }).catch((err) => {
      console.error("LIFF Init failed", err);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: "Please enter a reason / กรุณาระบุเหตุผล", variant: "destructive" });
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
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      toast({ title: "Submitted successfully" });
      
      if (liff.isInClient()) {
        liff.closeWindow();
      } else {
        alert("Success! You can close this window. (ส่งข้อมูลสำเร็จ กรุณาปิดหน้าต่างนี้)");
      }

    } catch (error) {
      console.error(error);
      toast({ title: "Error / เกิดข้อผิดพลาด", variant: "destructive" });
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-red-500">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">TBS Marketing</span>
            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md font-medium">Reject Action</span>
          </div>
          <CardTitle className="text-xl text-slate-800">
            Reject Leave Request
            <span className="block text-base font-normal text-slate-600 mt-1">ปฏิเสธการลางาน</span>
          </CardTitle>
          <CardDescription className="text-slate-500 mt-2">
            Please specify the reason for not approving this request. <br/>
            กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อแจ้งให้พนักงานทราบ
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {/* 📋 กล่องสรุปข้อมูล (ช่วยให้ CM ตรวจสอบก่อนพิมพ์) */}
          <div className="bg-slate-100 rounded-lg p-3 mb-5 border border-slate-200">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-slate-500">Employee:</div>
              <div className="col-span-2 font-medium text-slate-700">{userName || "-"}</div>
              
              <div className="text-slate-500">Leave Type:</div>
              <div className="col-span-2 font-medium text-slate-700">{formatLeaveType(type)}</div>
              
              <div className="text-slate-500">Duration:</div>
              <div className="col-span-2 font-medium text-slate-700">{days || "-"} Day(s)</div>

              <div className="text-slate-500">Reason:</div>
              <div className="col-span-2 font-medium text-slate-700">{reason || "-"}</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                Reason / เหตุผล <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Enter the reason for rejection here... / กรุณาใส่เหตุผลที่ไม่อนุมัติที่นี่..."
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
                Cancel / ยกเลิก
              </Button>
              <Button 
                type="submit" 
                variant="destructive" 
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Confirm Reject / ยืนยัน"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}