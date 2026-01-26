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
      setError((err as Error).message || "Failed to load review summary.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="KYC Review"
      intro="Counts are based on accounts.is_verified: 0 awaiting, 1 verified, 2 pending, 3 failed."
    >
      <section className="card">
        <div className="btn-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <h3>Pending reviews</h3>
            <p className="meta">Latest snapshot of verification states.</p>
          </div>
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="stat" style={{ marginTop: 8 }}>
          <div className="value">{summary?.pending ?? "?"}</div>
          <div className="label">Pending (is_verified=2)</div>
          <div className="pill-grid" style={{ marginTop: 10 }}>
            <StatusPill label={`Awaiting ${summary?.awaiting ?? 0}`} tone="neutral" />
            <StatusPill label={`Pending ${summary?.pending ?? 0}`} tone="warn" />
            <StatusPill label={`Verified ${summary?.verified ?? 0}`} tone="success" />
            <StatusPill label={`Failed ${summary?.failed ?? 0}`} tone="danger" />
          </div>
          {summary?.ts ? <p className="helper">Updated: {new Date(summary.ts).toLocaleString()}</p> : null}
          {error ? <p className="helper" style={{ color: "#fecdd3" }}>{error}</p> : null}
        </div>
      </section>

      <section className="card">
        <h3>Next steps</h3>
        <ol className="list">
          <li>Review pending submissions and confirm the documents.</li>
          <li>Update accounts.is_verified after a decision.</li>
          <li>Verify the R2 URLs for front/back/face images.</li>
        </ol>
      </section>
    </AppShell>
  );
}
