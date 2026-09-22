import { z } from "zod";
import { isPlainDate, isWithinWindow } from "./date.js";

const dates = z.array(z.string().refine(isPlainDate, "Invalid date"))
  .min(1).max(366).refine((items) => new Set(items).size === items.length, "Dates must be unique");
export const requestTargetSchema = z.object({
  scope: z.literal("request"),
  expectedDates: dates,
  expectedRevision: z.string().regex(/^[a-f0-9]{32}$/, "Refresh the request before saving"),
});

// A complete request is required. No partial day can accidentally overwrite a range.
export const requestUpdateSchema = requestTargetSchema.extend({
  dates,
  type: z.enum(["annual", "sick", "personal"]),
  daysPerDate: z.union([z.literal(0.25), z.literal(0.5), z.literal(1)]),
  halfDayPeriod: z.enum(["morning", "afternoon"]).nullable(),
  note: z.string().max(5000),
  status: z.enum(["Approved", "Pending", "Rejected"]),
}).refine((row) => row.daysPerDate === 0.5 ? !!row.halfDayPeriod : !row.halfDayPeriod, {
  message: "Choose morning or afternoon for half-day leave only", path: ["halfDayPeriod"],
}).refine((row) => row.dates.every((date) => isWithinWindow(date)), {
  message: "Leave dates are outside the accepted window", path: ["dates"],
});
