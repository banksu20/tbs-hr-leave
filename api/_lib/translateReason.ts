import { N8N_BASE } from "./n8nClient.js";
import { webhookSecret } from "./webhookSecret.js";

const TIMEOUT_MS = Number(process.env.TRANSLATE_TIMEOUT_MS || 5000);
const THAI = /[\u0E00-\u0E7F]/;
const LETTER = /\p{L}/u;
const MARK = /\n\((EN|TH)\) /;

export function translationTarget(text: string): "EN" | "TH" {
  return THAI.test(text) ? "EN" : "TH";
}

async function translate(text: string, target: "EN" | "TH"): Promise<string> {
  const secret = webhookSecret();
  if (!secret) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${N8N_BASE}/webhook/translate-reason`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true", "x-ceo-webhook-secret": secret },
      body: JSON.stringify({ text, target }),
    });
    if (!response.ok) throw new Error(`Translation route returned ${response.status}`);
    const body = await response.json() as { translation?: unknown } | { translation?: unknown }[];
    const content = (Array.isArray(body) ? body[0] : body)?.translation;
    return typeof content === "string" ? content.replace(/\s*\n\s*/g, " ").trim() : "";
  } catch (error) {
    console.error("Reason translation skipped:", (error as Error).message);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function withTranslation(value: string | undefined, max: number): Promise<string> {
  const text = (value ?? "").trim();
  if (!text || !LETTER.test(text) || MARK.test(text)) return text;
  const target = translationTarget(text);
  const translated = await translate(text, target);
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return text;
  const combined = `${text}\n(${target}) ${translated}`;
  return combined.length <= max ? combined : text;
}
