// src/pages/RejectForm.tsx
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import liff from "@line/liff"; 

const WEBHOOK_SUBMIT_REJECT = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/submit-reject";

export default function RejectForm() {
  const [searchParams] = useSearchParams();
  const rowId = searchParams.get("row"); 
  
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // ✅ ใส่ LIFF ID เรียบร้อยแล้ว
    liff.init({ liffId: "2008617589-89gR1Y3Y" }).catch((err) => {
      console.error("LIFF Init failed", err);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast({ title: "กรุณาระบุเหตุผล", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(WEBHOOK_SUBMIT_REJECT, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true" // 💡 เพิ่มกันเหนียวสำหรับ ngrok
        },
        body: JSON.stringify({
          row: rowId,
          reason: reason,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      toast({ title: "ส่งข้อมูลสำเร็จ" });
      
      if (liff.isInClient()) {
        liff.closeWindow();
      } else {
        alert("ส่งข้อมูลสำเร็จ (กรุณาปิดหน้าต่างนี้)");
      }

    } catch (error) {
      console.error(error);
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-red-500">ปฏิเสธการลางาน</CardTitle>
          <CardDescription>
            กรุณาระบุเหตุผลที่ไม่ไม่อนุมัติการลางาน เพื่อแจ้งให้พนักงานทราบ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">เหตุผลการปฏิเสธ (ไม่อนุมัติ)</label>
              <Textarea
                placeholder="เช่น ช่วงนี้โปรเจกต์กำลังเร่งด่วน..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                onClick={handleCancel}
              >
                ยกเลิก
              </Button>
              <Button 
                type="submit" 
                variant="destructive" 
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "กำลังส่ง..." : "ยืนยันการปฏิเสธ"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}