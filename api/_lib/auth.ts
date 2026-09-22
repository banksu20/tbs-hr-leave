import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tbs_ceo";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function authRequired(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.CEO_PASSWORD);
}

function secret(): string {
  return process.env.CEO_SESSION_SECRET || process.env.CEO_PASSWORD || "";
}

function token(): string {
  return createHmac("sha256", secret()).update("ceo-session").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyPassword(password: unknown): boolean {
  const expected = process.env.CEO_PASSWORD;
  if (!expected) return !authRequired();
  if (typeof password !== "string" || password.length === 0) return false;
  return safeEqual(expected, password);
}

export function sessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export function signedIn(cookieHeader: string | undefined): boolean {
  if (!authRequired()) return true;
  if (!process.env.CEO_PASSWORD) return false;

  const match = String(cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  if (!match) return false;

  return safeEqual(token(), match[1]);
}
