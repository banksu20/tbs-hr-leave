export function overQuotaDays(remaining: number | null | undefined, configured = true, unlimited = false) {
  if (!configured || unlimited || remaining == null || !Number.isFinite(Number(remaining))) return 0;
  return Math.max(0, Math.round(-Number(remaining) * 100) / 100);
}

