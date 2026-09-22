import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authRequired, signedIn } from "./auth";

export function secretMatches(provided: unknown): boolean {
  const expected = process.env.CEO_WEBHOOK_SECRET;
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

export function ceoAuthorised(req: VercelRequest): boolean {
  return signedIn(req.headers.cookie);
}

export function writesAllowed(req: VercelRequest): boolean {
  if (!authRequired()) return true;
  if (authRequired() && signedIn(req.headers.cookie)) return true;
  const required = process.env.CEO_API_TOKEN;
  if (!required) return true;
  return headerValue(req, "x-ceo-token") === required;
}

export function queryParam(req: VercelRequest, name: string): string | undefined {
  const value = req.query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}
