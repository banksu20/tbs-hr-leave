import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isWithinWindow } from "./_lib/date";
import { ceoAuthorised, json, queryParam, writesAllowed } from "./_lib/http";
import { leaveRowSchema, normalizeRow } from "./_lib/leaveSchema";
import { N8nNotRegisteredError, N8nUnavailableError, n8nPost } from "./_lib/n8nClient";
import { cleanString } from "./_lib/normalize";

function n8nFailure(res: VercelResponse, err: unknown) {
  if (err instanceof N8nNotRegisteredError) {
    return json(res, 503, {
      error: err.message,
      hint: "this workflow must be created and activated in n8n before the dashboard can write",
    });
  }
  if (err instanceof N8nUnavailableError) {
    return json(res, 502, { error: err.message });
  }
  return json(res, 500, { error: err instanceof Error ? err.message : "request failed" });
}

async function create(req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const parsed = leaveRowSchema.safeParse(normalizeRow(raw));

  if (!parsed.success) {
    return json(res, 422, {
      error: "validation failed",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  const row = parsed.data;

  if (!isWithinWindow(row.leave_date)) {
    return json(res, 422, { error: `leave_date ${row.leave_date} is outside the accepted window` });
  }

  const userId = cleanString(row.user_id ?? row.line_user_id);
  if (!userId) {
    return json(res, 422, {
      error: "user_id is required — the dashboard must send the LINE user id, never a name",
    });
  }

  try {
    const result = await n8nPost("dashboard-leave-create", {
      userId,
      empNo: row.emp_no ?? null,
      leaveDate: row.leave_date,
      leaveType: row.leave_type,
      leaveDays: row.days,
      halfDayPeriod: row.half_day_period ?? null,
      reason: row.note,
      status: row.status,
      source: "dashboard",
    });

    return json(res, 201, { ok: true, userId, n8n: result });
  } catch (err) {
    return n8nFailure(res, err);
  }
}

async function update(req: VercelRequest, res: VercelResponse, id: string) {
  const raw = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const normalized = normalizeRow(raw);

  const patch: Record<string, unknown> = { id };
  if (raw.leave_date !== undefined || raw.date !== undefined) patch.leaveDate = normalized.leave_date;
  if (raw.leave_type !== undefined || raw.type !== undefined) patch.leaveType = normalized.leave_type;
  if (raw.days !== undefined) patch.leaveDays = normalized.days;
  if (raw.half_day_period !== undefined) patch.halfDayPeriod = normalized.half_day_period;
  if (raw.note !== undefined || raw.reason !== undefined) patch.reason = normalized.note;
  if (raw.status !== undefined) patch.status = normalized.status;

  if (Object.keys(patch).length === 1) {
    return json(res, 422, { error: "no fields to update" });
  }

  if (patch.leaveDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch.leaveDate))) {
    return json(res, 422, { error: "leave_date must be a plain YYYY-MM-DD date with no timezone" });
  }

  try {
    const result = await n8nPost("dashboard-leave-update", patch);
    return json(res, 200, { ok: true, id, n8n: result });
  } catch (err) {
    return n8nFailure(res, err);
  }
}

async function remove(res: VercelResponse, id: string) {
  try {
    const result = await n8nPost("dashboard-leave-delete", { id });
    return json(res, 200, { ok: true, id, deleted: true, n8n: result });
  } catch (err) {
    return n8nFailure(res, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ceoAuthorised(req)) {
    return json(res, 401, { error: "not signed in" });
  }

  if (!writesAllowed(req)) {
    return json(res, 401, { error: "invalid or missing dashboard token" });
  }

  const id = queryParam(req, "id");

  if (req.method === "POST") return create(req, res);

  if (req.method === "PATCH" || req.method === "DELETE") {
    if (!id) return json(res, 422, { error: "id query parameter is required" });
    return req.method === "PATCH" ? update(req, res, id) : remove(res, id);
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return json(res, 405, { error: "method not allowed" });
}
