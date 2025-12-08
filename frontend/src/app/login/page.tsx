'use client';

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const { login, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerInfo, setRegisterInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      await refreshProfile();
      router.push("/");
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function quickRegister() {
    setError(null);
    setRegisterInfo(null);
    setLoading(true);
    try {
      const { data } = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          handle: email.split("@")[0] || "user",
          displayName: email.split("@")[0] || "user",
        }),
      });
      setRegisterInfo(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-xl border bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">登入 / 註冊</h1>
        <p className="text-sm text-slate-600">先完成登入流程，後續 API 都會自動帶 Token。</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1">
          <label className="text-sm text-slate-700">Email</label>
          <input
            type="email"
            required
            className="w-full rounded border border-slate-200 p-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-700">Password</label>
          <input
            type="password"
            required
            className="w-full rounded border border-slate-200 p-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "處理中…" : "登入"}
          </button>
          <button
            type="button"
            onClick={quickRegister}
            disabled={loading}
            className="rounded border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            快速註冊（用上方 Email/密碼）
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {registerInfo && (
        <div>
          <p className="text-sm text-slate-600">註冊回應：</p>
          <pre className="mt-1 rounded bg-slate-50 p-3 text-xs text-slate-800">{registerInfo}</pre>
        </div>
      )}
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "發生錯誤"}`;
  }
  return status ? `HTTP ${status}` : "發生錯誤";
}
