import { useState, useEffect } from "react";

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
const QUOTA_API_URL = `${N8N_URL}/webhook/get-quota`;

interface UseLeaveQuotaResult {
  remainingDays: number | null;
  sickRemaining: number | null;
  annualTotal: number | null; 
  sickTotal: number | null; 
  sickTaken: number | null; 
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useLeaveQuota = (userId: string | null): UseLeaveQuotaResult => {
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [sickRemaining, setSickRemaining] = useState<number | null>(null);
  
  const [annualTotal, setAnnualTotal] = useState<number | null>(null);
  const [sickTotal, setSickTotal] = useState<number | null>(null);
  const [sickTaken, setSickTaken] = useState<number | null>(null); // 🌟 2. สร้าง State มารับค่าที่ใช้ไปแล้ว

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
      setSickRemaining(data.sickRemaining ?? null);
      
      setAnnualTotal(data.annualTotal ?? null);
      setSickTotal(data.sickTotal ?? null);
      setSickTaken(data.sickTaken ?? null); 

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

  return { 
    remainingDays, 
    sickRemaining, 
    annualTotal, 
    sickTotal, 
    sickTaken, 
    isLoading, 
    error, 
    refetch: fetchQuota 
  };
};