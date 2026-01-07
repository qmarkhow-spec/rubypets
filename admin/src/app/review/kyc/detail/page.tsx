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
      setError((err as Error).message || "無法取得帳戶資料");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const statusTone = useMemo(() => {
    if (!data) return "neutral";
    if (data.isVerified === 2) return "warn";
    if (data.isVerified === 1) return "success";
    if (data.isVerified === 3) return "danger";
    return "neutral";
  }, [data]);

  const statusLabel = useMemo(() => {
    if (!data) return "未知";
    if (data.isVerified === 2) return "待審核";
    if (data.isVerified === 1) return "已審核";
    if (data.isVerified === 3) return "審核未通過";
    return "未提交";
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

  async function handleDecision(status: number) {
    if (!accountId) return;
    setLoading(true);
    try {
      await updateStatus(accountId, status);
      router.push("/review/kyc");
    } catch (err) {
      setError((err as Error).message || "更新狀態失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="實名認證審核 - 詳細"
      intro="檢視帳戶上傳的證件照片"
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
              <StatusPill label={statusLabel} tone={statusTone as "success" | "warn" | "neutral" | "danger"} />
              <span className="tag">Account: {data.accountId}</span>
              {data.createdAt ? <span className="tag">註冊：{new Date(data.createdAt).toLocaleString()}</span> : null}
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field">
                <label>姓名</label>
                <p>{data.realName ?? "--"}</p>
              </div>
              <div className="field">
                <label>身分證號</label>
                <p>{data.idNumber ?? "--"}</p>
              </div>
              <div className="field">
                <label>手機</label>
                <p>{data.phoneNumber ?? "--"}</p>
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
            <div className="tag">身分證背面</div>
            {renderImage(data?.idLicenseBackUrl ?? null, "身分證背面")}
          </div>
          <div>
            <div className="tag">人臉 + 證件自拍</div>
            {renderImage(data?.faceWithLicenseUrl ?? null, "人臉 + 證件自拍")}
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={() => router.push("/review/kyc")}>
            返回
          </button>
          <div className="btn-row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => handleDecision(3)} disabled={loading || !accountId}>
              不通過
            </button>
            <button className="btn" onClick={() => handleDecision(1)} disabled={loading || !accountId}>
              通過
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

async function updateStatus(accountId: string, status: number) {
  await apiFetch(`/admin/review/kyc/${encodeURIComponent(accountId)}/decision`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}
