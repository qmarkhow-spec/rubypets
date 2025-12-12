'use client';

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import type { HealthStatus } from "@/lib/types";

const stats = [
  { label: "待審核飼主", value: 6, helper: "含身份證/自拍待檢視" },
  { label: "公開貼文", value: 128, helper: "demo 環境樣本資料" },
  { label: "媒體物件", value: 342, helper: "R2 rubypets-media-dev" }
];

const playbook = [
  "確認 /health 連線無誤（D1 + R2）",
  "檢查待審核飼主並更新 city/region",
  "開啟登入頁取得 token 後再用 /api/me 驗證",
  "確認 Cloudflare Pages 綁定 admin.rubypets.com"
];

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d1Status = useMemo<"success" | "warn">(() => (health?.d1 ? "success" : "warn"), [health]);
  const r2Status = useMemo<"success" | "warn">(() => (health?.r2 ? "success" : "warn"), [health]);

  useEffect(() => {
    void refreshHealth();
  }, []);

  async function refreshHealth() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<HealthStatus>("/health");
      setHealth(result);
    } catch (err) {
      setError((err as Error).message || "無法取得健康檢查");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Rubypets 控制台"
      intro="用 admin.rubypets.com 管理 API 狀態、審核佇列與 demo 帳號。"
      actions={
        <>
          <button className="btn" onClick={refreshHealth} disabled={loading}>
            {loading ? "檢查中..." : "重新檢查 API"}
          </button>
          <a className="btn ghost" href="https://api.rubypets.com" target="_blank" rel="noreferrer">
            打開 API 根路徑
          </a>
        </>
      }
    >
      <div className="grid-3">
        {stats.map((item) => (
          <section key={item.label} className="card stat">
            <div className="value">{item.value}</div>
            <div className="label">{item.label}</div>
            <p>{item.helper}</p>
          </section>
        ))}
      </div>

      <div className="split" style={{ marginTop: 14 }}>
        <section className="card">
          <h3>API 健康檢查</h3>
          <p className="meta">/health 會同時檢查 D1 與 R2 綁定</p>
          <div className="pill-grid">
            <StatusPill label={health?.ok ? "一切正常" : "需要注意"} tone={health?.ok ? "success" : "warn"} />
            <StatusPill label={`D1 ${health?.d1 ? "OK" : "異常"}`} tone={d1Status} hint="DB ping" />
            <StatusPill label={`R2 ${health?.r2 ? "OK" : "異常"}`} tone={r2Status} hint="簽章/媒體" />
            <StatusPill label={`環境 ${health?.environment ?? "未知"}`} tone="neutral" />
          </div>
          {health?.ts ? <p style={{ marginTop: 10 }}>最近一次：{new Date(health.ts).toLocaleString()}</p> : null}
          {error ? (
            <div className="callout" style={{ marginTop: 10, color: "#fecdd3" }}>
              {error}
            </div>
          ) : null}
        </section>

        <section className="card">
          <h3>佈署待辦</h3>
          <p className="meta">用 Cloudflare Pages 指向 admin.rubypets.com</p>
          <ul className="list">
            {playbook.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h3>審核佇列概覽</h3>
        <div className="split">
          <div className="panel-stack">
            <div className="tag">身分證 + 自拍上傳</div>
            <p style={{ marginTop: 6 }}>demo-user 已經上傳照片，檢查完成即可更新 is_verified=1。</p>
          </div>
          <div className="panel-stack">
            <div className="tag">快速檢查步驟</div>
            <ol className="list">
              <li>開啟「飼主審核」頁面查看待處理的 city/region。</li>
              <li>必要時手動上傳 R2 媒體或重送 verification-docs。</li>
              <li>設定 owner.is_verified = 1 並更新 updated_at。</li>
            </ol>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
