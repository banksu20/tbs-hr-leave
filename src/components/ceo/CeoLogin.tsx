import { BASE } from "@/lib/api";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import tbsLogo from "@/image/TBS-Logo.png";

export interface CeoLoginProps {
  onSuccess: () => void;
}

export default function CeoLogin({ onSuccess }: CeoLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/auth`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Incorrect password");
    } catch {
      setError("Cannot reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-slate-900 p-1.5 rounded">
            <img src={tbsLogo} alt="TBS" className="h-6 w-auto object-contain" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900">TBS HR - Leave Request System</h1>
            <p className="text-[11px] text-slate-500 font-semibold">TBS Marketing</p>
          </div>
        </div>

        <label className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">Password</label>
        <div className="relative mt-1">
          <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            className="pl-9 h-10"
          />
        </div>

        {error && <p className="text-xs font-bold text-rose-600 mt-2">{error}</p>}

        <Button
          type="submit"
          disabled={busy || !password}
          className="w-full mt-4 h-10 bg-[#00B5E2] hover:bg-[#0099c4] text-white font-bold disabled:opacity-40"
        >
          {busy ? "Checking…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
