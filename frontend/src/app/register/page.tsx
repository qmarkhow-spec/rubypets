'use client';

export const runtime = 'edge';

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { login, refreshProfile } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [accountId, setAccountId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStep1(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiFetch<{ account: { accountId: string } }>("/api/auth/register/account", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!data.account?.accountId) throw new Error("註冊帳號失敗");
      setAccountId(data.account.accountId);
      setStep(2);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2(e: FormEvent) {
    e.preventDefault();
    if (!accountId) {
      setError("帳號尚未建立");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiFetch("/api/auth/register/owner", {
        method: "POST",
        body: JSON.stringify({ accountId, displayName }),
      });
      await login(email, password); // 直接登入以取得 token 與 me
      await refreshProfile();
      router.push("/");
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{step === 1 ? "註冊帳號" : "填寫基本資料"}</h1>
          <p className="text-sm text-slate-600">{step === 1 ? "建立登入帳號（Email / 密碼）" : "設定顯示名稱"}</p>
        </div>
        <Link href="/login" className="text-sm text-emerald-700 hover:underline">
          已有帳號？登入
        </Link>
      </div>

      {step === 1 && (
        <form className="space-y-4" onSubmit={handleStep1}>
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
            <label className="text-sm text-slate-700">密碼</label>
            <input
              type="password"
              required
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "建立中..." : "確認註冊"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      {step === 2 && (
        <form className="space-y-4" onSubmit={handleStep2}>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">顯示名稱</label>
            <input
              type="text"
              required
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="給大家看到的名稱"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? "送出中..." : "確認送出"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "伺服器錯誤"}`;
  }
  return status ? `HTTP ${status}` : "伺服器錯誤";
}
