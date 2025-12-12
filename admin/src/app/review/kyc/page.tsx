'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import type { KycPendingItem } from "@/lib/types";

type Filter = "all" | "pending" | "verified" | "awaiting" | "failed";

export default function KycReviewPage() {
  const [items, setItems] = useState<KycPendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

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

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "pending") return items.filter((i) => i.isVerified === 2);
    if (filter === "verified") return items.filter((i) => i.isVerified === 1);
    if (filter === "failed") return items.filter((i) => i.isVerified === 3);
    return items.filter((i) => i.isVerified === 0);
  }, [items, filter]);

  const renderStatus = (val: number) => {
    if (val === 2) return <StatusPill label="待審核" tone="warn" />;
    if (val === 1) return <StatusPill label="已審核" tone="success" />;
    if (val === 3) return <StatusPill label="審核未通過" tone="danger" />;
    return <StatusPill label="未上傳資料" tone="neutral" />;
  };

  return (
    <AppShell
      title="實名認證審核"
      intro="列出 D1 中的帳號（is_verified 狀態：0 未上傳、1 已審核、2 待審核、3 審核未通過）。"
      actions={
        <button className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "載入中..." : "重新整理"}
        </button>
      }
    >
      <section className="card">
        <h3>待審核列表</h3>
        {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
        <div className="btn-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button className={`btn ghost${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
            顯示全部
          </button>
          <button className={`btn ghost${filter === "pending" ? " active" : ""}`} onClick={() => setFilter("pending")}>
            待審核
          </button>
          <button
            className={`btn ghost${filter === "verified" ? " active" : ""}`}
            onClick={() => setFilter("verified")}
          >
            已審核
          </button>
          <button
            className={`btn ghost${filter === "awaiting" ? " active" : ""}`}
            onClick={() => setFilter("awaiting")}
          >
            未上傳資料
          </button>
          <button className={`btn ghost${filter === "failed" ? " active" : ""}`} onClick={() => setFilter("failed")}>
            審核未通過
          </button>
        </div>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>本名</th>
              <th>身份證字號</th>
              <th>手機</th>
              <th>註冊時間</th>
              <th>Account ID</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  {loading ? "載入中..." : "沒有符合條件的資料。"}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.accountId}>
                  <td>{item.realName ?? "—"}</td>
                  <td>{item.idNumber ?? "—"}</td>
                  <td>{item.phoneNumber ?? "—"}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="helper">{item.accountId}</td>
                  <td>{renderStatus(item.isVerified)}</td>
                  <td>
                    <Link href={`/review/kyc/detail?accountId=${encodeURIComponent(item.accountId)}`} className="btn">
                      審核
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
