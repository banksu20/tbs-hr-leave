import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays } from "lucide-react";

interface HolidaysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const holidays2025 = [
  { date: "1 ม.ค.", name: "วันขึ้นปีใหม่", nameEn: "New Year's Day" },
  { date: "10 ก.พ.", name: "วันมาฆบูชา", nameEn: "Makha Bucha Day" },
  { date: "6 เม.ย.", name: "วันจักรี", nameEn: "Chakri Memorial Day" },
  { date: "13-15 เม.ย.", name: "วันสงกรานต์", nameEn: "Songkran Festival" },
  { date: "1 พ.ค.", name: "วันแรงงานแห่งชาติ", nameEn: "Labor Day" },
  { date: "4 พ.ค.", name: "วันฉัตรมงคล", nameEn: "Coronation Day" },
  { date: "12 พ.ค.", name: "วันวิสาขบูชา", nameEn: "Visakha Bucha Day" },
  { date: "3 มิ.ย.", name: "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี", nameEn: "Queen's Birthday" },
  { date: "28 ก.ค.", name: "วันเฉลิมพระชนมพรรษา ร.10", nameEn: "King's Birthday" },
  { date: "12 ส.ค.", name: "วันแม่แห่งชาติ", nameEn: "Mother's Day" },
  { date: "13 ต.ค.", name: "วันคล้ายวันสวรรคต ร.9", nameEn: "King Bhumibol Memorial Day" },
  { date: "23 ต.ค.", name: "วันปิยมหาราช", nameEn: "Chulalongkorn Day" },
  { date: "5 ธ.ค.", name: "วันพ่อแห่งชาติ", nameEn: "Father's Day" },
  { date: "10 ธ.ค.", name: "วันรัฐธรรมนูญ", nameEn: "Constitution Day" },
  { date: "31 ธ.ค.", name: "วันสิ้นปี", nameEn: "New Year's Eve" },
];

const HolidaysModal = ({ open, onOpenChange }: HolidaysModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-[#06C755]" />
            วันหยุดบริษัท 2025
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <div className="space-y-2 pb-4">
            {holidays2025.map((holiday, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="min-w-[70px] text-sm font-semibold text-[#06C755]">
                  {holiday.date}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {holiday.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {holiday.nameEn}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HolidaysModal;
