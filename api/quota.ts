import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ceoAuthorised, currentYear, json, queryParam, writesAllowed } from "./_lib/http";
import { N8nMutationError, N8nNotRegisteredError, N8nUnavailableError, n8nGet, n8nPost } from "./_lib/n8nClient";
import { cleanString, normalizeDays } from "./_lib/normalize";

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

  const numberOrNull = (value: unknown) => (value === undefined || value === null || value === "" ? null : normalizeDays(value));

  try {
    const result = await n8nPost("dashboard-quota-update", {
      userId,
      year,
      annualTotal: numberOrNull(body.annualTotal),
      sickTotal: numberOrNull(body.sickTotal),
      personalTotal: numberOrNull(body.personalTotal),
      carriedOver: numberOrNull(body.carriedOver),
      note: body.note === undefined ? null : cleanString(body.note),
    });
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

    const row = payload as Record<string, unknown>;

    const annualTotal = num(row, ["annualTotal", "annual_total"], 12) ?? 12;
    const sickTotal = num(row, ["sickTotal", "sick_total"], 30) ?? 30;
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
      annualTaken: annualTaken ?? (remainingDays === null ? 0 : annualTotal + carriedOver - remainingDays),
      sickTaken: sickTaken ?? (sickRemaining === null ? 0 : sickTotal - sickRemaining),
      personalTaken: personalTaken ?? (personalRemaining === null ? 0 : personalTotal - personalRemaining),
      remainingDays: remainingDays ?? annualTotal + carriedOver - (annualTaken ?? 0),
      sickRemaining: sickRemaining ?? sickTotal - (sickTaken ?? 0),
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
