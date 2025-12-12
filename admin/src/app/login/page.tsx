'use client';

import { FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";

type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    displayName: string;
    email: string | null;
  };
};

export default function LoginPage() {
  const [email, setEmail] = useState("demo@rubypets.com");
  const [password, setPassword] = useState("demo-password");
  const [result, setResult] = useState<LoginResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setResult(data);
    } catch (err) {
      setError((err as Error).message || "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="登入 / Token" intro="用 demo 帳號快速換取 accessToken，方便測試 /api/me 與 R2 上傳流程。">
      <section className="card">
        <h3>登入</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="demo@rubypets.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="輸入 demo 密碼"
                type="password"
              />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? "登入中..." : "取得 token"}
            </button>
            <p className="helper">成功後可將 token 帶入 Authorization: Bearer &lt;token&gt;</p>
          </div>
        </form>
        {error ? (
          <div className="callout" style={{ marginTop: 10, color: "#fecdd3" }}>
            {error}
          </div>
        ) : null}
        {result ? (
          <div className="callout" style={{ marginTop: 10 }}>
            <StatusPill label="登入成功" tone="success" />
            <p style={{ marginTop: 8 }}>accessToken: {result.accessToken}</p>
            <p className="helper">curl -H "Authorization: Bearer {result.accessToken}" {`"${process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com"}/me"`}</p>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
