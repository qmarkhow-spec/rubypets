import Link from "next/link";
import type { OwnerDetail } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com";

export const dynamic = "force-static";

export default async function OwnerPage({ searchParams }: { searchParams: { id?: string } }) {
  const ownerId = searchParams.id;
  const { owner, error } = ownerId ? await fetchOwner(ownerId) : { owner: null, error: "缺少 id 參數" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          ← 返回首頁
        </Link>
        <h1 className="text-xl font-semibold text-white">飼主資訊</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !owner && <p className="text-sm text-slate-600">找不到飼主資料。</p>}
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
