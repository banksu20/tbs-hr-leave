import { Employee, LeaveRecord } from "@/data/mockEmployees";
import EmployeeSheetBlock from "./EmployeeSheetBlock";
import { LeaveType } from "./leaveSheetUtils";

export interface SheetViewProps {
  employees: Employee[];
  year: string;
  compact: boolean;
  onUpdateLeave: (empId: string, leaveId: string, patch: Partial<LeaveRecord>) => void;
  onAddLeave: (empId: string, draft: { date: string; type: LeaveType; days: number; note: string }) => Promise<void>;
  onDeleteLeave: (empId: string, leaveId: string) => void;
  onEditProfile: (emp: Employee) => void;
  onQuotaNoteChange?: (empId: string, note: string) => Promise<void>;
  onRemoveEmployee?: (emp: Employee) => void;
}

export default function SheetView({ employees, year, compact, ...handlers }: SheetViewProps) {
  if (employees.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 font-medium italic">
        No matching employee records found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
      {employees.map((emp) => (
        <EmployeeSheetBlock key={emp.id} employee={emp} year={year} compact={compact} {...handlers} />
      ))}
    </div>
  );
}
