import type { Employee } from '@/data/mockEmployees';
import { LEAVE_META, LEAVE_TYPES, type LeaveType, leavesForYear } from '@/components/ceo/leaveSheetUtils';

export interface MonthlyReportRow {
  employeeCode: string;
  name: string;
  department: string;
  sick: number;
  annual: number;
  personal: number;
  total: number;
}
export interface MonthlyReport {
  period: string;
  types: LeaveType[];
  scope: string;
  rows: MonthlyReportRow[];
  total: number;
  filename: string;
  csv: string;
}
const round=(value:number)=>Math.round(value*100)/100;
// Quote all cells and neutralize spreadsheet formula prefixes in text values.
export function csvCell(value: string|number): string {
  const text=typeof value==='string'&&/^[\s\uFEFF]*[=+@-]/.test(value)?`'${value}`:String(value);
  return `"${text.replace(/"/g,'""')}"`;
}
export function buildMonthlyReport(employees: Employee[], year: string, month: number, types: LeaveType[], scope: string): MonthlyReport {
  if(!/^\d{4}$/.test(year)||!Number.isInteger(month)||month<1||month>12)throw Error('Select a valid month and year');
  const chosen=LEAVE_TYPES.filter(t=>types.includes(t));
  if(!chosen.length)throw Error('Select at least one leave type');
  const period=`${year}-${String(month).padStart(2,'0')}`;
  const rows=employees.map(employee=>{
    const row:MonthlyReportRow={employeeCode:employee.empCode,name:employee.name,department:employee.department,sick:0,annual:0,personal:0,total:0};
    for(const leave of leavesForYear(employee.leaves,year)){
      if(!leave.date.startsWith(period+'-')||!chosen.includes(leave.type))continue;
      const days=Number(leave.days);
      if(!Number.isFinite(days)||days<=0)continue;
      row[leave.type]+=days;row.total+=days;
    }
    for(const key of [...LEAVE_TYPES,'total'] as const)row[key]=round(row[key]);
    return row;
  }).sort((a,b)=>a.employeeCode.localeCompare(b.employeeCode,undefined,{numeric:true})||a.name.localeCompare(b.name));
  const total=round(rows.reduce((sum,row)=>sum+row.total,0));
  const headers=['Month','Scope','Status','Employee code','Employee name','Department',...chosen.map(t=>`${LEAVE_META[t].short} days`),'Total selected days'];
  const lines=[headers,...rows.map(r=>[period,scope,'Approved',r.employeeCode,r.name,r.department,...chosen.map(t=>r[t]),r.total])];
  return {period,types:chosen,scope,rows,total,filename:`leave-report-${period}-${chosen.join('-')}.csv`,csv:'\uFEFF'+lines.map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n'};
}
