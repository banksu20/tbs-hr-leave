import type { LeaveRecord } from '@/data/mockEmployees';
// Different known half-day periods do not overlap. Quarter days have no time
// information, so conservatively flag them for review on a shared date.
export function conflictingLeave(leaves: LeaveRecord[], dates: string[], days: number, period?: string|null, requestId?: string) {
  return leaves.filter(leave=>leave.status!=='Rejected'&&(!requestId||leave.requestId!==requestId)&&dates.includes(leave.date)&&
    !(days===0.5&&leave.days===0.5&&period&&leave.halfDayPeriod&&period!==leave.halfDayPeriod));
}
