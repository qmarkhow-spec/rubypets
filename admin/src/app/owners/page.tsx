'use client';

import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import type { OwnerSummary } from "@/lib/types";

const ownerQueue: OwnerSummary[] = [
  {
    uuid: "demo-user",
    displayName: "Demo User",
    email: "demo@rubypets.com",
    city: "TPE",
    region: "Xinyi",
    isVerified: false,
    lastUpdate: "等待人工檢視",
    risk: "low"
  },
  {
    uuid: "luna-chen",
    displayName: "Luna Chen",
    email: "luna@example.com",
    city: "TPQ",
    region: "Banqiao",
    isVerified: false,
    lastUpdate: "ID/文件已上傳",
    risk: "medium"
  },
  {
    uuid: "oscar-lin",
    displayName: "Oscar Lin",
    email: "oscar@example.com",
    city: "TXG",
    region: "Xitun",
    isVerified: true,
    lastUpdate: "已通過",
    risk: "low"
  }
];

export default function OwnersPage() {
  return (
    <AppShell title="飼主審核" intro="確認飼主資料與身份證件">
      <section className="card">
        <h3>待審 / 已通過</h3>
        <table className="table">
          <thead>
            <tr>
              <th>飼主</th>
              <th>Email</th>
              <th>縣市 / 地區</th>
              <th>驗證狀態</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {ownerQueue.map((owner) => (
              <tr key={owner.uuid}>
                <td>
                  <strong>{owner.displayName}</strong>
                  <div className="helper">{owner.uuid}</div>
                </td>
                <td>{owner.email}</td>
                <td>
                  {owner.city ?? "--"} / {owner.region ?? "--"}
                </td>
                <td>
                  <StatusPill label={owner.isVerified ? "已驗證" : "待人工"} tone={owner.isVerified ? "success" : "warn"} />
                </td>
                <td>
                  <span className="helper">{owner.lastUpdate}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="split" style={{ marginTop: 14 }}>
        <section className="card">
          <h3>快速檢查清單</h3>
          <ul className="list">
            <li>確認 city/region 已填寫（/owners/:uuid payload）</li>
            <li>確認 R2 已有證件影像</li>
            <li>寫入 is_verified=1 並更新 updated_at </li>
          </ul>
        </section>

        <section className="card">
          <h3>常用 API</h3>
          <div className="list">
            <div className="tag">GET /owners/:uuid</div>
            <div className="tag">POST /owners/:uuid/location</div>
            <div className="tag">POST /owners/:uuid/verification-docs</div>
          </div>
          <p style={{ marginTop: 8 }} className="helper">
            可搭配 /auth/login 取得 token 後在 Authorization 使用 Bearer
          </p>
        </section>
      </div>
    </AppShell>
  );
}
