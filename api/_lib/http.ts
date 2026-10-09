import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dashboardSession, sameOrigin } from "./dashboardAuth.js";
import { webhookSecret } from "./webhookSecret.js";

export function secretMatches(provided: unknown): boolean {
  const expected = webhookSecret();
  if (!expected) return false;
  if (typeof provided !== "string" || provided.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

export function headerValue(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export async function ceoAuthorised(req: VercelRequest): Promise<boolean> {
  try { return !!await dashboardSession(req); } catch { return false; }
}
export async function writesAllowed(req: VercelRequest): Promise<boolean> {
  return sameOrigin(req) && await ceoAuthorised(req);
}

export function queryParam(req: VercelRequest, name: string): string | undefined {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}
