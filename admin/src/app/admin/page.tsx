'use client';

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";

type IpInfo = {
  primaryIp: string | null;
  ips: string[];
};

export default function AdminOverviewPage() {
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadIp();
  }, []);

  async function loadIp() {
    setError(null);
    try {
      const data = await apiFetch<IpInfo>("/admin/ip-info");
      setIpInfo(data);
    } catch (err) {
      setError((err as Error).message || "無法取得 IP 資訊");
      setIpInfo(null);
    }
  }

  return (
    <AppShell title="管理員管理" intro="管理後台登入帳號與權限">
      <section className="card">
        <h3>總覽</h3>
        <p className="helper">建立管理員、調整權限與重設密碼。</p>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="btn-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h3>系統看到的 IP</h3>
          <button className="btn ghost" onClick={loadIp}>
            重新取得
          </button>
        </div>
        {error ? <p className="helper" style={{ color: "#fecdd3" }}>{error}</p> : null}
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div className="field">
            <label>主要 IP</label>
            <input value={ipInfo?.primaryIp ?? "--"} readOnly />
          </div>
          <div className="field">
            <label>所有候選 IP</label>
            <textarea value={ipInfo?.ips?.join(", ") || "--"} readOnly />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
