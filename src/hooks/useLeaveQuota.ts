import { useState, useEffect } from "react";

import {employeeData} from "@/lib/employeeData";

interface UseLeaveQuotaResult {
  unlimitedLeave: boolean;
  policyConfigured: boolean;
  remainingDays: number | null;
  sickRemaining: number | null;
  annualTotal: number | null; 
  sickTotal: number | null; 
  sickTaken: number | null; 
  personalRemaining?: number | null;
  personalTotal?: number | null;
  isLoading: boolean;
  error: string | null;
  personalTaken?: number | null;
  refetch: () => void;
}

export const useLeaveQuota = (userId: string | null): UseLeaveQuotaResult => {
  const [policyConfigured,setPolicyConfigured] = useState(true);
  const [unlimitedLeave, setUnlimitedLeave] = useState(false);
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [sickRemaining, setSickRemaining] = useState<number | null>(null);
  
  const [annualTotal, setAnnualTotal] = useState<number | null>(null);
  const [sickTotal, setSickTotal] = useState<number | null>(null);
  const [sickTaken, setSickTaken] = useState<number | null>(null);

  const [personalRemaining, setPersonalRemaining] = useState<number | null>(null);
  const [personalTotal, setPersonalTotal] = useState<number | null>(null);
  const [personalTaken, setPersonalTaken] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await employeeData('get-quota');

      setUnlimitedLeave(data.unlimitedLeave === true);
      setPolicyConfigured(data.policyConfigured !== false);
      setRemainingDays(data.remainingDays ?? null);
      setSickRemaining(data.sickRemaining ?? null);
      
      setAnnualTotal(data.annualTotal ?? null);
      setSickTotal(data.sickTotal ?? null);
      setSickTaken(data.sickTaken ?? null); 

      setPersonalRemaining(data.personalRemaining ?? null);
      setPersonalTotal(data.personalTotal ?? null);
      setPersonalTaken(data.personalTaken ?? null);

    } catch (err: any) {
      console.error("Failed to fetch leave quota from PostgreSQL:", err);
      setError(err.message || "Failed to load quota");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuota();
  }, [userId]);

  return { 
    unlimitedLeave,
    policyConfigured,
    remainingDays, 
    sickRemaining, 
    annualTotal, 
    sickTotal, 
    sickTaken, 
    personalRemaining, 
    personalTotal, 
    personalTaken,
    isLoading, 
    error, 
    refetch: fetchQuota 
  };
};