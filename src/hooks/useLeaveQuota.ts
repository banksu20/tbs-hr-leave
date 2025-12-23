import { useState, useEffect } from "react";

const QUOTA_API_URL = "https://thirstless-ostensively-maryam.ngrok-free.dev/webhook/get-quota";

interface UseLeaveQuotaResult {
  remainingDays: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useLeaveQuota = (userId: string | null): UseLeaveQuotaResult => {
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${QUOTA_API_URL}?userId=${userId}`, {
        method: "GET",
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch quota");
      }

      const data = await response.json();
      setRemainingDays(data.remainingDays ?? null);
    } catch (err: any) {
      console.error("Failed to fetch leave quota:", err);
      setError(err.message || "Failed to load quota");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuota();
  }, [userId]);

  return { remainingDays, isLoading, error, refetch: fetchQuota };
};
