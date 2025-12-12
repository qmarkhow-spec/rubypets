'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import type { KycDetail } from "@/lib/types";

export default function KycDetailPage() {
  return (
    <Suspense fallback={<div className="callout">載入中...</div>}>
      <KycDetailContent />
    </Suspense>
  );
}

function KycDetailContent() {
  const search = useSearchParams();
  const router = useRouter();
  const accountId = search.get("accountId") ?? "";
  const [data, setData] = useState<KycDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    void load(accountId);
  }, [accountId]);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<KycDetail>(`/admin/review/kyc/${encodeURIComponent(id)}`);
      setData(res);
    } catch (err) {
      setError((err as Error).message || "無法取得用戶資料");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const statusTone = useMemo(() => {
    if (!data) return "neutral";
    if (data.isVerified === 2) return "warn";
    if (data.isVerified === 1) return "success";
    return "neutral";
  }, [data]);

  const statusLabel = useMemo(() => {
    if (!data) return "未知";
    if (data.isVerified === 2) return "待審核";
    if (data.isVerified === 1) return "已審核";
    return "未上傳資料";
  }, [data]);

  const renderImage = (url: string | null, label: string) => {
    if (!url) {
      return (
        <div className="empty-img">
          <span>{label} 尚未上傳</span>
        </div>
      );
    }
    return (
      <div className="img-box">
        <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  };

  return (
    <AppShell
      title="實名認證審核 - 詳細"
      intro="檢視用戶上傳的三張證件照。"
      actions={
        <div className="btn-row" style={{ flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={() => router.back()}>
            返回列表
          </button>
          {accountId ? (
            <button className="btn ghost" onClick={() => load(accountId)} disabled={loading}>
              {loading ? "載入中..." : "重新整理"}
            </button>
          ) : null}
        </div>
      }
    >
      <section className="card">
        {!accountId ? <div className="callout">缺少 accountId 參數</div> : null}
        {error ? <div className="callout" style={{ color: "#fecdd3" }}>{error}</div> : null}
        {data ? (
          <>
            <div className="pill-grid">
              <StatusPill label={statusLabel} tone={statusTone as "success" | "warn" | "neutral"} />
              <span className="tag">Account: {data.accountId}</span>
              {data.createdAt ? <span className="tag">註冊：{new Date(data.createdAt).toLocaleString()}</span> : null}
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>本名</label>
                <p>{data.realName ?? "—"}</p>
              </div>
              <div className="field">
                <label>身份證字號</label>
                <p>{data.idNumber ?? "—"}</p>
              </div>
              <div className="field">
                <label>手機</label>
                <p>{data.phoneNumber ?? "—"}</p>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="card">
        <h3>證件影像</h3>
        <div className="grid-3">
          <div>
            <div className="tag">身分證正面</div>
            {renderImage(data?.idLicenseFrontUrl ?? null, "身分證正面")}
          </div>
          <div>
            <div className="tag">身分證反面</div>
            {renderImage(data?.idLicenseBackUrl ?? null, "身分證反面")}
          </div>
          <div>
            <div className="tag">人像+證件自拍</div>
            {renderImage(data?.faceWithLicenseUrl ?? null, "人像+證件自拍")}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
