'use client';

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import type { HealthStatus, ReviewSummary } from "@/lib/types";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [errorHealth, setErrorHealth] = useState<string | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [errorReview, setErrorReview] = useState<string | null>(null);

  const d1Status = useMemo<"success" | "warn">(() => (health?.d1 ? "success" : "warn"), [health]);
  const r2Status = useMemo<"success" | "warn">(() => (health?.r2 ? "success" : "warn"), [health]);
  const cfStatus = useMemo<"success" | "warn">(() => (health?.cfMedia ? "success" : "warn"), [health]);

  useEffect(() => {
    void refreshHealth();
    void refreshReview();
  }, []);

  async function refreshHealth() {
    setLoadingHealth(true);
    setErrorHealth(null);
    try {
      const result = await apiFetch<HealthStatus>("/health");
      setHealth(result);
    } catch (err) {
      setErrorHealth((err as Error).message || "無法取得健康檢查");
      setHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }

  async function refreshReview() {
    setLoadingReview(true);
    setErrorReview(null);
    try {
      const summary = await apiFetch<ReviewSummary>("/admin/review/summary");
      setReviewSummary(summary);
    } catch (err) {
      setErrorReview((err as Error).message || "無法取得審核資料");
      setReviewSummary(null);
    } finally {
      setLoadingReview(false);
    }
  }

  return (
    <AppShell
      title="Rubypets 運維控台"
      intro="在 admin.rubypets.com 管理 API 與審核作業"
      actions={
        <>
          <button className="btn" onClick={refreshHealth} disabled={loadingHealth}>
            {loadingHealth ? "檢查中..." : "重新檢查 API"}
          </button>
          <button className="btn ghost" onClick={refreshReview} disabled={loadingReview}>
            {loadingReview ? "載入中..." : "刷新審核數據"}
          </button>
        </>
      }
    >
      <div className="grid-3">
        <section className="card stat">
          <div className="value">{reviewSummary?.pending ?? "?"}</div>
          <div className="label">待審核數</div>
          <p>來自 D1 accounts.is_verified = 2</p>
          {errorReview ? <p className="helper" style={{ color: "#fecdd3" }}>{errorReview}</p> : null}
        </section>
        <section className="card stat">
          <div className="value">{health ? (health.d1 ? "OK" : "異常") : "?"}</div>
          <div className="label">D1</div>
          <p>D1 ping 測試</p>
        </section>
        <section className="card stat">
          <div className="value">{health ? (health.r2 ? "OK" : "異常") : "?"}</div>
          <div className="label">R2</div>
          <p>R2 儲存/媒體</p>
        </section>
        <section className="card stat">
          <div className="value">{health ? (health.cfMedia ? "OK" : "異常") : "?"}</div>
          <div className="label">Cloudflare Media</div>
          <p>Images / Stream API</p>
        </section>
      </div>

      <div className="split" style={{ marginTop: 14 }}>
        <section className="card">
          <h3>API 健康檢查</h3>
          <p className="meta">/health 同時檢查 D1 / R2 / Cloudflare Media</p>
          <div className="pill-grid">
            <StatusPill label={health?.ok ? "一切正常" : "需要注意"} tone={health?.ok ? "success" : "warn"} />
            <StatusPill label={`D1 ${health?.d1 ? "OK" : "異常"}`} tone={d1Status} hint="DB ping" />
            <StatusPill label={`R2 ${health?.r2 ? "OK" : "異常"}`} tone={r2Status} hint="儲存/媒體" />
            <StatusPill label={`CF Media ${health?.cfMedia ? "OK" : "異常"}`} tone={cfStatus} hint="Images/Stream API" />
            <StatusPill label={`環境 ${health?.environment ?? "未知"}`} tone="neutral" />
          </div>
          {health?.ts ? <p style={{ marginTop: 10 }}>最近一次：{new Date(health.ts).toLocaleString()}</p> : null}
          {errorHealth ? (
            <div className="callout" style={{ marginTop: 10, color: "#fecdd3" }}>
              {errorHealth}
            </div>
          ) : null}
        </section>

        <section className="card">
          <h3>佈署待辦</h3>
          <p className="meta">Cloudflare Pages for admin.rubypets.com</p>
          <ul className="list">
            <li>確認 /health 綠燈（D1 + R2 + CF Media）</li>
            <li>檢查「審核管理」pending 數量</li>
            <li>登入/Token 測試 /api/me</li>
            <li>DNS 指向 Pages hostname</li>
          </ul>
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <h3>審核作業概覽</h3>
        <p>點擊「審核管理」可查看詳細待審清單</p>
        {reviewSummary?.ts ? <p className="helper">最後更新：{new Date(reviewSummary.ts).toLocaleString()}</p> : null}
      </section>
    </AppShell>
  );
}
