import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requestTargetSchema, requestUpdateSchema } from "./_lib/requestMutation.js";
import { isWithinWindow } from "./_lib/date.js";
import { ceoAuthorised, json, queryParam, writesAllowed } from "./_lib/http.js";
import { leaveRowSchema, normalizeRow } from "./_lib/leaveSchema.js";
import { N8nMutationError, N8nNotRegisteredError, N8nUnavailableError, n8nPost } from "./_lib/n8nClient.js";
import { cleanString } from "./_lib/normalize.js";

function n8nFailure(res: VercelResponse, err: unknown) {
  if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
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
  if (["approve","reject"].includes(req.body?.action)) {
    const revision = req.body.expectedRevision;
    const rejectionReason=req.body.rejectionReason;
    if(req.body.action==='reject'&&rejectionReason!==undefined&&(typeof rejectionReason!=='string'||rejectionReason.length>1000))return json(res,422,{error:'Rejection reason must be 1,000 characters or fewer'});
    if (typeof revision !== "string" || !/^[a-f0-9]{32}$/.test(revision)) return json(res,422,{error:"Refresh the request before deciding"});
    try {
      const result = await n8nPost("dashboard-leave-update", {id,action:req.body.action,expectedRevision:revision,...(req.body.action==='reject'?{rejectionReason:rejectionReason?.trim()??''}:{})});
      return json(res,200,{ok:true,id,n8n:result});
    } catch (err) { return n8nFailure(res,err); }
  }
  if (req.body?.action === "restore") {
    const cancellationId = req.body.cancellationId;
    if (typeof cancellationId !== "string" || !/^[1-9]\d*$/.test(cancellationId)) return json(res,422,{error:"Invalid cancellation id"});
    try {
      const result = await n8nPost("dashboard-leave-update", {id, action:"restore", cancellationId});
      return json(res,200,{ok:true,id,n8n:result});
    } catch (err) { return n8nFailure(res,err); }
  }
  const parsed = requestUpdateSchema.safeParse(req.body);
  if (!parsed.success) return json(res, 422, {
    error: "Invalid leave request", issues: parsed.error.issues.map((issue) => issue.message),
  });
  const row = parsed.data;
  try {
    const result = await n8nPost("dashboard-leave-update", {
      id, scope: row.scope, expectedDates: row.expectedDates, expectedRevision: row.expectedRevision,
      leaveDates: [...row.dates].sort(), leaveType: row.type,
      leaveDays: row.daysPerDate * row.dates.length,
      halfDayPeriod: row.halfDayPeriod, reason: row.note, status: row.status,
    });
    return json(res, 200, { ok: true, id, n8n: result });
  } catch (err) { return n8nFailure(res, err); }
}

async function remove(req: VercelRequest, res: VercelResponse, id: string) {
  const parsed = requestTargetSchema.safeParse(req.body);
  if (!parsed.success) return json(res, 422, { error: "Explicit request scope and expectedDates are required" });
  try {
    const result = await n8nPost("dashboard-leave-delete", { id, ...parsed.data });
    return json(res, 200, { ok: true, id, deleted: true, n8n: result });
  } catch (err) { return n8nFailure(res, err); }
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
    if (!id || !/^[1-9]\d*$/.test(id)) return json(res, 422, { error: "A numeric request id is required" });
    return req.method === "PATCH" ? update(req, res, id) : remove(req, res, id);
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return json(res, 405, { error: "method not allowed" });
}
