import { z } from "zod";
import { isPlainDate } from "./_lib/date.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ceoAuthorised, currentYear, json, queryParam, writesAllowed } from "./_lib/http.js";
import { N8nMutationError, N8nNotRegisteredError, N8nUnavailableError, n8nGet, n8nPost } from "./_lib/n8nClient.js";
import { cleanString, normalizeDays } from "./_lib/normalize.js";

function num(source: Record<string, unknown>, keys: string[], fallback: number | null): number | null {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      const parsed = normalizeDays(source[key]);
      if (parsed !== null) return parsed;
    }
  }
  return fallback;
}

async function updateQuota(req: VercelRequest, res: VercelResponse) {
  if (!writesAllowed(req)) {
    return json(res, 401, { error: "invalid or missing dashboard token" });
  }

  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const userId = cleanString(body.userId ?? body.user_id);

  if (!userId) {
    return json(res, 422, { error: "userId is required" });
  }

  const year = Number(body.year ?? currentYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return json(res, 422, { error: "year must be a four digit year" });
  }

  const days=z.number().min(0).max(365).multipleOf(0.25);
  const schema=z.object({userId:z.string().min(1),year:z.number().int().min(2000).max(2100),expectedRevision:z.string().regex(/^(missing|[a-f0-9]{32})$/),
    annualTotal:days.nullable().optional(),sickTotal:days.nullable().optional(),personalTotal:days.optional(),carriedOver:days.optional(),
    carryoverExpiresOn:z.string().refine(isPlainDate).nullable().optional(),note:z.string().max(1000).optional()})
    .refine(v=>!v.carryoverExpiresOn||v.carryoverExpiresOn.startsWith(String(v.year)),{message:'Expiry must be in the quota year'});
  const parsed=schema.safeParse({...body,userId,year});
  if(!parsed.success)return json(res,422,{error:'Invalid quota values. Refresh first; use nonnegative quarter days.',issues:parsed.error.issues.map(i=>i.message)});
  try {
    const result = await n8nPost("dashboard-quota-update", parsed.data);
    return json(res, 200, { ok: true, userId, year, n8n: result });
  } catch (err) {
    if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
    if (err instanceof N8nNotRegisteredError) {
      return json(res, 503, { error: err.message, hint: "create the dashboard-quota-update workflow in n8n" });
    }
    if (err instanceof N8nUnavailableError) {
      return json(res, 502, { error: err.message });
    }
    return json(res, 500, { error: err instanceof Error ? err.message : "request failed" });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ceoAuthorised(req)) {
    return json(res, 401, { error: "not signed in" });
  }

  if (req.method === "PATCH" || req.method === "POST") {
    return updateQuota(req, res);
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, PATCH");
    return json(res, 405, { error: "method not allowed" });
  }

  const userId = queryParam(req, "userId") ?? queryParam(req, "user_id");
  if (!userId) {
    return json(res, 422, { error: "userId is required" });
  }

  const year = queryParam(req, "year") ?? currentYear();

  try {
    const payload = await n8nGet("get-quota", { userId, year });

    if (payload === null || typeof payload !== "object") {
      return json(res, 404, { error: `n8n returned no quota for ${userId}` });
    }

    const row = (Array.isArray(payload)?payload[0]:payload) as Record<string, unknown>;
    if(!row)return json(res,404,{error:"Quota not found"});

    const annualTotal = num(row, ["annualTotal", "annual_total"], null);
    const sickTotal = num(row, ["sickTotal", "sick_total"], null);
    const personalTotal = num(row, ["personalTotal", "personal_total"], 3) ?? 3;
    const carriedOver = num(row, ["carriedOver", "carried_over"], 0) ?? 0;

    const annualTaken = num(row, ["annualTaken", "annual_taken"], null);
    const sickTaken = num(row, ["sickTaken", "sick_taken"], null);
    const personalTaken = num(row, ["personalTaken", "personal_taken"], null);

    const remainingDays = num(row, ["remainingDays", "annualRemaining"], null);
    const sickRemaining = num(row, ["sickRemaining"], null);
    const personalRemaining = num(row, ["personalRemaining"], null);

    return json(res, 200, {
      year: Number(year),
      userId,
      annualTotal,
      sickTotal,
      personalTotal,
      carriedOver,
      annualTaken: annualTaken ?? (remainingDays === null ? 0 : (annualTotal ?? 0) + carriedOver - remainingDays),
      sickTaken: sickTaken ?? (sickRemaining === null ? 0 : (sickTotal ?? 0) - sickRemaining),
      personalTaken: personalTaken ?? (personalRemaining === null ? 0 : personalTotal - personalRemaining),
      remainingDays: annualTotal===null?null:remainingDays ?? (annualTotal ?? 0) + carriedOver - (annualTaken ?? 0),
      sickRemaining: sickTotal===null?null:sickRemaining ?? sickTotal - (sickTaken ?? 0),
      personalRemaining: personalRemaining ?? personalTotal - (personalTaken ?? 0),
    });
  } catch (err) {
    if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
    if (err instanceof N8nNotRegisteredError) {
      return json(res, 503, { error: "the n8n get-quota workflow is not active" });
    }
    if (err instanceof N8nUnavailableError) {
      return json(res, 502, { error: err.message });
    }
    return json(res, 500, { error: err instanceof Error ? err.message : "request failed" });
  }
}
