import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authRequired, clearedCookie, sessionCookie, signedIn, verifyPassword } from "./_lib/auth.js";
import { json } from "./_lib/http.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return json(res, 200, { required: authRequired(), signedIn: signedIn(req.headers.cookie) });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearedCookie());
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return json(res, 405, { error: "method not allowed" });
  }

  if (!authRequired()) {
    return json(res, 200, { ok: true, required: false });
  }

  const body = typeof req.body === "object" && req.body !== null ? (req.body as Record<string, unknown>) : {};

  if (!verifyPassword(body.password)) {
    return json(res, 401, { error: "Incorrect password" });
  }

  res.setHeader("Set-Cookie", sessionCookie(process.env.NODE_ENV === "production"));
  return json(res, 200, { ok: true });
}
