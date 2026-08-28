import { z } from "zod";
import { isPlainDate } from "./date";
import { cleanString, normalizeDays, normalizeLeaveType } from "./normalize";

export const leaveRowSchema = z
  .object({
    user_id: z.string().optional(),
    line_user_id: z.string().optional(),
    emp_no: z.union([z.number(), z.string()]).optional(),
    emp_code: z.string().optional(),
    leave_date: z.string(),
    leave_type: z.enum(["sick", "annual", "personal"]),
    days: z.number().refine((d) => d === 0.25 || d === 0.5 || d === 1, {
      message: "days must be 0.25, 0.5 or 1",
    }),
    half_day_period: z.enum(["morning", "afternoon"]).nullable().optional(),
    note: z.string().default(""),
    status: z.enum(["Approved", "Pending", "Rejected"]).default("Approved"),
    request_id: z.string().nullable().optional(),
  })
  .refine((row) => isPlainDate(row.leave_date), {
    message: "leave_date must be a plain YYYY-MM-DD date with no timezone",
    path: ["leave_date"],
  })
  .refine((row) => (row.days === 0.5 ? !!row.half_day_period : !row.half_day_period), {
    message: "half_day_period is required when days is 0.5 and forbidden otherwise",
    path: ["half_day_period"],
  });

export type LeaveRow = z.infer<typeof leaveRowSchema>;

export function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const period = cleanString(raw.half_day_period ?? raw.halfDayPeriod).toLowerCase();
  return {
    user_id: cleanString(raw.user_id ?? raw.userId) || undefined,
    line_user_id: cleanString(raw.line_user_id ?? raw.lineUserId) || undefined,
    emp_no: raw.emp_no ?? raw.empNo ?? undefined,
    emp_code: cleanString(raw.emp_code ?? raw.empCode) || undefined,
    leave_date: cleanString(raw.leave_date ?? raw.leaveDate ?? raw.date),
    leave_type: normalizeLeaveType(raw.leave_type ?? raw.leaveType ?? raw.type),
    days: normalizeDays(raw.days ?? raw.leave_days ?? raw.leaveDays),
    half_day_period: period === "morning" || period === "afternoon" ? period : null,
    note: cleanString(raw.note ?? raw.reason),
    status: cleanString(raw.status) || "Approved",
    request_id: cleanString(raw.request_id ?? raw.requestId) || null,
  };
}
