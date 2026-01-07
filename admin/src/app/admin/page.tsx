'use client';

import { AppShell } from "@/components/app-shell";

export default function AdminOverviewPage() {
  return (
    <AppShell title="管理員管理" intro="管理後台登入帳號與權限">
      <section className="card">
        <h3>總覽</h3>
        <p className="helper">建立管理員、調整權限與重設密碼。</p>
      </section>
    </AppShell>
  );
}
