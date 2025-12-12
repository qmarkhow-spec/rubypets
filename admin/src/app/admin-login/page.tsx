'use client';

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { setAdminToken } from "@/lib/admin-auth";

export default function AdminLoginPage() {
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ token: string }>("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ adminId, password })
      });
      setAdminToken(res.token);
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message || "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Rubypets Admin 登入</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            帳號
            <input value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder="Admin ID" />
          </label>
          <label>
            密碼
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </label>
          {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
