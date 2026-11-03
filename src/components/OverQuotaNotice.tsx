import {overQuotaDays} from '../lib/overQuota';

export default function OverQuotaNotice({remaining, configured, unlimited, loading, language}: {
  remaining: number | null | undefined; configured: boolean; unlimited: boolean; loading: boolean; language: string;
}) {
  const days = overQuotaDays(remaining, configured, unlimited);
  if (loading || days <= 0) return null;
  return <p className="relative mt-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5" role="status">
    {language === 'th' ? `เกินโควตา ${days} วัน` : `Over quota: ${days} day${days === 1 ? '' : 's'}`}
  </p>;
}
