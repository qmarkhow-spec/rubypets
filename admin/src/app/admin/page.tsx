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
        <p className="helper" style={{ marginTop: 8 }}>
          目前IP:
          {ipInfo
            ? ` ${formatIpSummary(ipInfo)}`
            : error
              ? ` ${error}`
              : " 載入中..."}
        </p>
      </section>
    </AppShell>
  );
}

function formatIpSummary(info: IpInfo) {
  if (!info.ips?.length) return info.primaryIp ? `${info.primaryIp}(主要)` : "--";
  const primary = info.primaryIp ?? info.ips[0] ?? "";
  const items = info.ips.map((ip) => (ip === primary ? `${ip}(主要)` : ip));
  return items.join(",");
}
