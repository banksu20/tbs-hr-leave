import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ceoAuthorised, currentYear, json, queryParam, writesAllowed } from "./_lib/http";
import { N8nMutationError, N8nNotRegisteredError, N8nUnavailableError, n8nGet, n8nPost, normalizeEmployeeList } from "./_lib/n8nClient";
import { cleanString, parseEmpNo } from "./_lib/normalize";

async function setStatus(req: VercelRequest, res: VercelResponse) {
  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const userId = cleanString(body.userId ?? body.user_id);
  const status = cleanString(body.status).toLowerCase();

  if (!userId) {
    return json(res, 422, { error: "userId is required" });
  }
  if (status !== "active" && status !== "inactive") {
    return json(res, 422, { error: "status must be active or inactive" });
  }

  try {
    const result = await n8nPost("dashboard-employee-status", { userId, status });
    return json(res, 200, { ok: true, userId, status, n8n: result });
  } catch (err) {
    if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
    if (err instanceof N8nNotRegisteredError) {
      return json(res, 503, { error: err.message, hint: "create the dashboard-employee-status workflow in n8n" });
    }
    if (err instanceof N8nUnavailableError) {
      return json(res, 502, { error: err.message });
    }
    return json(res, 500, { error: err instanceof Error ? err.message : "request failed" });
  }
}

async function setProfile(req: VercelRequest, res: VercelResponse) {
  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const userId = cleanString(body.userId ?? body.user_id);

  if (!userId) {
    return json(res, 422, { error: "userId is required" });
  }

  const empNo = body.empCode === undefined && body.empNo === undefined ? undefined : parseEmpNo(body.empCode ?? body.empNo);
  if (empNo === null) {
    return json(res, 422, { error: "employee code must look like TBS-007" });
  }

  const text = (value: unknown) => (value === undefined ? undefined : cleanString(value));
  const name = text(body.name);
  const nickname = text(body.nickname);
  const department = text(body.department);

  if (empNo === undefined && name === undefined && nickname === undefined && department === undefined) {
    return json(res, 422, { error: "nothing to update" });
  }
  if (name !== undefined && !name) {
    return json(res, 422, { error: "name cannot be empty" });
  }

  try {
    const result = await n8nPost("dashboard-employee-profile", {
      userId,
      empNo: empNo ?? null,
      name: name ?? null,
      nickname: nickname ?? null,
      department: department ?? null,
    });
    return json(res, 200, { ok: true, userId, n8n: result });
  } catch (err) {
    if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
    if (err instanceof N8nNotRegisteredError) {
      return json(res, 503, { error: err.message, hint: "create the dashboard-employee-profile workflow in n8n" });
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

  if (req.method === "PATCH") {
    if (!writesAllowed(req)) return json(res, 401, { error: "not authorised" });
    const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};
    return body.status === undefined ? setProfile(req, res) : setStatus(req, res);
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, PATCH");
    return json(res, 405, { error: "method not allowed" });
  }

  const year = queryParam(req, "year") ?? currentYear();
  if (!/^\d{4}$/.test(year)) {
    return json(res, 422, { error: "year must be a four digit year" });
  }

  try {
    const includeInactive = queryParam(req, "includeInactive") === "1";

    const payload = await n8nGet("get-all-leaves", { year });
    const all = normalizeEmployeeList(payload);

    const employees = all
      .filter((emp) => includeInactive || emp.status !== "inactive")
      .map((emp) => ({
        ...emp,
        leaves: emp.leaves.filter((l) => l.date.startsWith(year)),
      }));

    const withoutNumber = employees.filter((e) => e.empNo === null).length;

    return json(res, 200, {
      year: Number(year),
      count: employees.length,
      withoutEmployeeNumber: withoutNumber,
      inactive: all.filter((e) => e.status === "inactive").length,
      employees,
    });
  } catch (err) {
    if (err instanceof N8nMutationError) return json(res, err.status, { error: err.message });
    if (err instanceof N8nNotRegisteredError) {
      return json(res, 503, {
        error: "the n8n get-all-leaves workflow is not active",
        hint: "activate that workflow in n8n, then retry",
      });
    }
    if (err instanceof N8nUnavailableError) {
      return json(res, 502, { error: err.message });
    }
    return json(res, 500, { error: err instanceof Error ? err.message : "request failed" });
  }
}
