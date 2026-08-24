// ==============================================================================
// PostgreSQL & n8n Full Webhook API Service
// Standardized Integration Service for all 6 n8n Webhooks & PostgreSQL DB
// ==============================================================================

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "https://n8n.womenrefugeeroute.org";

export interface LeaveSubmissionPayload {
  userId: string;
  userName: string;
  department: string;
  leaveType: string;
  startDateTime?: string;
  endDateTime?: string;
  selectedDates: string[];
  leaveDays: number;
  reason: string;
  isHalfDay?: boolean;
  halfDayPeriod?: string | null;
}

export interface UserRegistrationPayload {
  userId: string;
  department: string;
  FirstName: string;
  LastName: string;
  Nickname: string;
}

// 1. Submit Leave Request (POST /webhook/submit-leave)
export const submitLeaveToPostgres = async (payload: LeaveSubmissionPayload): Promise<boolean> => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/submit-leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("Submit Leave Error:", err);
    return false;
  }
};

// 2. Fetch User Quota (GET /webhook/get-quota)
export const fetchUserQuotaFromPostgres = async (userId: string, leaveType?: string) => {
  try {
    const url = `${N8N_URL}/webhook/get-quota?userId=${encodeURIComponent(userId)}${leaveType ? `&type=${leaveType}` : ""}`;
    const res = await fetch(url, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("Fetch Quota Error:", err);
  }
  return null;
};

// 3. Check User Registration Status (GET /webhook/check-user)
export const checkUserRegistration = async (userId: string) => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/check-user?userId=${encodeURIComponent(userId)}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("Check User Error:", err);
  }
  return { found: false };
};

// 4. Register New User (POST /webhook/register-user)
export const registerUserToPostgres = async (payload: UserRegistrationPayload): Promise<boolean> => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/register-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error("Register User Error:", err);
    return false;
  }
};

// 5. Fetch User Leave History (GET /webhook/get-leave-history)
export const fetchUserLeaveHistory = async (userId: string) => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/get-leave-history?userId=${encodeURIComponent(userId)}`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error("Fetch User Leave History Error:", err);
  }
  return [];
};

// 6. Fetch All Leaves (CEO Dashboard Stream)
export const fetchPostgresLiveData = async () => {
  try {
    const res = await fetch(`${N8N_URL}/webhook/get-all-leaves`, {
      method: "GET",
      headers: { "ngrok-skip-browser-warning": "true" },
    }).catch(() => null);

    if (res && res.ok) {
      return await res.json().catch(() => null);
    }
  } catch (err) {
    // Silent catch for CORS / unconfigured endpoint
  }
  return null;
};
