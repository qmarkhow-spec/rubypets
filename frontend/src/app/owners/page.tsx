'use client';

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { OwnerDetail } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com";

export default function OwnerPage() {
  return (
    <Suspense fallback={<PageShell loading />}>
      <OwnerContent />
    </Suspense>
  );
}

function OwnerContent() {
  const searchParams = useSearchParams();
  const ownerId = useMemo(() => searchParams.get("id") || "", [searchParams]);

  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ownerId) {
      setOwner(null);
      setError("缺少 id 參數");
      return;
    }
    setLoading(true);
    setError(null);
    fetchOwner(ownerId)
      .then(({ owner, error }) => {
        setOwner(owner);
        setError(error);
      })
      .finally(() => setLoading(false));
  }, [ownerId]);

  return <PageShell loading={loading} error={error} owner={owner} />;
}

function PageShell({ loading, error, owner }: { loading?: boolean; error?: string | null; owner?: OwnerDetail | null }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          ← 返回首頁
        </Link>
        <h1 className="text-xl font-semibold text-white">飼主資訊</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        {loading && <p className="text-sm text-slate-600">載入中...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !owner && !loading && <p className="text-sm text-slate-600">找不到飼主資料。</p>}
        {owner && (
          <div className="space-y-2 text-sm text-slate-800">
            <p>
              <span className="font-medium text-slate-600">UUID：</span>
              <span className="font-mono text-slate-900 break-all">{owner.uuid}</span>
            </p>
            <p>
              <span className="font-medium text-slate-600">Email：</span>
              {owner.email || "（未提供）"}
            </p>
            <p>
              <span className="font-medium text-slate-600">暱稱：</span>
              {owner.displayName}
            </p>
            <p>
              <span className="font-medium text-slate-600">頭像：</span>
              {owner.avatarUrl || "（未設定）"}
            </p>
            <p>
              <span className="font-medium text-slate-600">可建立寵物數上限：</span>
              {owner.maxPets}
            </p>
            <p>
              <span className="font-medium text-slate-600">建立時間：</span>
              {owner.createdAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">最後更新：</span>
              {owner.updatedAt}
            </p>
            <p>
              <span className="font-medium text-slate-600">狀態：</span>
              {owner.isActive ? "啟用" : "停用"}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

async function fetchOwner(id: string): Promise<{ owner: OwnerDetail | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/owners/${id}`);
    if (!res.ok) {
      const text = await res.text();
      return { owner: null, error: `載入失敗（${res.status}）：${text || res.statusText}` };
    }
    const data = (await res.json()) as OwnerDetail;
    return { owner: data, error: null };
  } catch (err) {
    return { owner: null, error: `載入失敗：${String(err)}` };
  }
}
