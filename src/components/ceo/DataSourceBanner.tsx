import { AlertTriangle, CloudOff, RefreshCw, Wifi } from "lucide-react";
import type { DataSource } from "@/hooks/useEmployeesData";

export interface DataSourceBannerProps {
  source: DataSource;
  error: string | null;
  isFetching: boolean;
  lastUpdated?: number;
  partial?: boolean;
  warning?: string;
  onRetry: () => void;
}

function agoLabel(timestamp?: number) {
  if (!timestamp) return null;
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function DataSourceBanner({ source, error, isFetching, lastUpdated, partial, warning, onRetry }: DataSourceBannerProps) {
  if (source === "live" && partial) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg px-3 py-2.5 mb-4 border bg-amber-50 border-amber-300">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-amber-900">This list may be incomplete</p>
            <p className="text-[11px] font-semibold text-amber-800">
              {warning ?? "Data was assembled from many separate requests and some may be missing."}
            </p>
          </div>
        </div>
        <button
          onClick={onRetry}
          disabled={isFetching}
          className="shrink-0 h-8 px-3 rounded-lg bg-white border border-slate-300 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Reloading" : "Reload"}
        </button>
      </div>
    );
  }

  if (source === "live" && !error) {
    return null;
  }

  const isEmpty = source === "empty";

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg px-3 py-2.5 mb-4 border ${
        isEmpty ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex items-start gap-2">
        {isEmpty ? (
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
        ) : (
          <CloudOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <p className={`text-xs font-extrabold ${isEmpty ? "text-rose-800" : "text-amber-900"}`}>
            {isEmpty
              ? isFetching
                ? "Loading leave data from the server…"
                : "No data available"
              : `Showing saved data${agoLabel(lastUpdated) ? ` from ${agoLabel(lastUpdated)}` : ""}`}
          </p>
          {error && <p className={`text-[11px] font-semibold ${isEmpty ? "text-rose-700" : "text-amber-800"}`}>{error}</p>}
          {!isEmpty && (
            <p className="text-[11px] font-medium text-amber-700">
              Changes are stored locally and are not saved to the server yet.
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onRetry}
        disabled={isFetching}
        className="shrink-0 h-8 px-3 rounded-lg bg-white border border-slate-300 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        {isFetching ? "Retrying" : "Retry"}
      </button>
    </div>
  );
}
