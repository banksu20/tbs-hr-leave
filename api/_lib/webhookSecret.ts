export function webhookSecret(): string | undefined {
  return process.env.CEO_WEBHOOK_SECRET || process.env.ceowebhook;
}
