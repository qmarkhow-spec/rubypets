'use client';

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import type { ReviewSummary } from "@/lib/types";

export default function ReviewOverviewPage() {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ReviewSummary>("/admin/review/summary");
      setSummary(data);
    } catch (err) {
      setError((err as Error).message || "無法取得待審核數量");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="審核管理" intro="從 D1 讀取實名狀態（accounts.is_verified）。">
      <section className="card">
        <div className="btn-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h3>待審核飼主</h3>
            <p className="meta">源自 accounts 表，狀態：0 未上傳、2 待審核、1 已審核</p>
          </div>
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "載入中..." : "重新整理"}
          </button>
        </div>
        <div className="stat" style={{ marginTop: 8 }}>
          <div className="value">{summary?.pending ?? "—"}</div>
          <div className="label">待審核（is_verified=2）</div>
          <div className="pill-grid" style={{ marginTop: 10 }}>
            <StatusPill label={`未上傳：${summary?.awaiting ?? 0}`} tone="neutral" />
            <StatusPill label={`待審核：${summary?.pending ?? 0}`} tone="warn" />
            <StatusPill label={`已審核：${summary?.verified ?? 0}`} tone="success" />
          </div>
          {summary?.ts ? <p className="helper">更新時間：{new Date(summary.ts).toLocaleString()}</p> : null}
          {error ? <p className="helper" style={{ color: "#fecdd3" }}>{error}</p> : null}
        </div>
      </section>

      <section className="card">
        <h3>處理步驟</h3>
        <ol className="list">
          <li>查看「實名認證審核」列表，確認真實姓名、電話與註冊時間。</li>
          <li>若媒體/證件齊全，將目標帳號 is_verified 改為 1。</li>
          <li>必要時補齊 R2 影像（id_license_front/back/face_with_license）。</li>
        </ol>
      </section>
    </AppShell>
  );
}
