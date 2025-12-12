'use client';

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import type { KycPendingItem } from "@/lib/types";

export default function KycReviewPage() {
  const [items, setItems] = useState<KycPendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: KycPendingItem[] }>("/admin/review/kyc-pending");
      setItems(res.data);
    } catch (err) {
      setError((err as Error).message || "無法取得實名審核清單");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="實名認證審核"
      intro="列出 D1 中 is_verified=0 的帳號，只顯示本名、手機、註冊時間。"
      actions={
        <button className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "載入中..." : "重新整理"}
        </button>
      }
    >
      <section className="card">
        <h3>待審核列表</h3>
        {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>本名</th>
              <th>手機</th>
              <th>註冊時間</th>
              <th>Account ID</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  {loading ? "載入中..." : "目前沒有待審核的實名認證。"}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.accountId}>
                  <td>{item.realName ?? "—"}</td>
                  <td>{item.phoneNumber ?? "—"}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="helper">{item.accountId}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
