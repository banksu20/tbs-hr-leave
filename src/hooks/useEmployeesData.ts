import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Employee } from "@/data/mockEmployees";
import { ApiError, NetworkError, fetchEmployees } from "@/lib/api";

export type DataSource = "live" | "cached" | "empty";
// A new cache version discards legacy optimistic records and invalid request IDs.
const CACHE_KEY = "tbs_employees_v2";
const keyFor = (year: string) => `${CACHE_KEY}_${year}`;

// Sensitive records must not survive logout or be shared between roles.
export function readCache(_year: string): Employee[] | null { return null; }
export function readCacheTime(_year: string): number { return 0; }
export function writeCache(_year: string, _employees: Employee[]) { /* memory cache only */ }

export function describeError(error: unknown): string {
  if (error instanceof NetworkError) return "Cannot reach the server. Check your connection.";
  if (error instanceof ApiError) {
    if (error.status === 503) return "The server or n8n workflow is not configured yet.";
    if (error.status === 502) return "n8n did not respond. The workflow may be failing.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

export function useEmployeesData(year: string, enabled = true, cohort: "employee"|"intern" = "employee") {
  const query = useQuery({
    queryKey: ["employees", year, cohort],
    queryFn: () => fetchEmployees(year, true, cohort),
    enabled,
    initialData: () => {
      const cached = enabled ? readCache(year) : null;
      return cached ? { employees: cached, partial: false, warning: undefined } : undefined;
    },
    initialDataUpdatedAt: () => readCacheTime(year),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 120_000,
    staleTime: 0,
    gcTime: 24 * 60 * 60 * 1000,
  });

  // No placeholderData: an old year's result must never be saved under a new year.
  useEffect(() => {
    if (enabled && query.isFetched && query.isSuccess && query.data) {
      writeCache(year, query.data.employees);
    }
  }, [enabled, query.isFetched, query.isSuccess, query.data, year]);

  const employees = enabled ? query.data?.employees ?? [] : [];
  const source: DataSource = query.isFetched && query.isSuccess ? "live" : query.data ? "cached" : "empty";
  return {
    employees, source,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? describeError(query.error) : null,
    partial: query.data?.partial === true,
    warning: query.data?.warning,
    lastUpdated: query.dataUpdatedAt || readCacheTime(year),
    refetch: query.refetch,
  };
}
