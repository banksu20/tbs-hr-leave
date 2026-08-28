import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Employee } from "@/data/mockEmployees";
import { ApiError, NetworkError, fetchEmployees } from "@/lib/api";

export type DataSource = "live" | "cached" | "empty";

const CACHE_KEY = "tbs_employees_db";

function keyFor(year: string) {
  return `${CACHE_KEY}_${year}`;
}

export function readCache(year: string): Employee[] | null {
  try {
    const saved = localStorage.getItem(keyFor(year)) ?? localStorage.getItem(CACHE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function readCacheTime(year: string): number {
  const raw = localStorage.getItem(`${keyFor(year)}_at`);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function writeCache(year: string, employees: Employee[]) {
  try {
    localStorage.setItem(keyFor(year), JSON.stringify(employees));
    localStorage.setItem(`${keyFor(year)}_at`, String(Date.now()));
  } catch {
    return;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Cannot reach the server. Check your connection.";
  }
  if (error instanceof ApiError) {
    if (error.status === 503) return "The n8n get-all-leaves workflow is not running yet.";
    if (error.status === 502) return "n8n did not respond. The workflow may be failing.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Unknown error";
}

export function useEmployeesData(year: string) {
  const query = useQuery({
    queryKey: ["employees", year],
    queryFn: () => fetchEmployees(year, true),
    initialData: () => {
      const cached = readCache(year);
      return cached ? { employees: cached, partial: false, warning: undefined } : undefined;
    },
    initialDataUpdatedAt: () => readCacheTime(year),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: (previous) => previous,
  });

  const [local, setLocal] = useState<Employee[] | null>(() => readCache(year));

  useEffect(() => {
    setLocal(readCache(year));
  }, [year]);

  useEffect(() => {
    if (query.data?.employees) {
      setLocal(query.data.employees);
      writeCache(year, query.data.employees);
    }
  }, [query.data, year]);

  const employees = useMemo(() => local ?? [], [local]);

  const source: DataSource = query.isSuccess ? "live" : local ? "cached" : "empty";
  const lastUpdated = query.dataUpdatedAt || readCacheTime(year);

  const update = useCallback(
    (value: Employee[] | ((prev: Employee[]) => Employee[])) => {
      setLocal((prev) => {
        const next = typeof value === "function" ? value(prev ?? []) : value;
        writeCache(year, next);
        return next;
      });
    },
    [year]
  );

  return {
    employees,
    setEmployees: update,
    source,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? describeError(query.error) : null,
    partial: query.data?.partial === true,
    warning: query.data?.warning,
    lastUpdated,
    refetch: query.refetch,
  };
}
