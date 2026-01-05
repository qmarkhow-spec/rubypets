'use client';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { OwnerSearchResult } from "@/lib/types";

export default function SearchPage() {
  const { user, loading } = useAuth();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<OwnerSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  const debounceMs = 300;

  useEffect(() => {
    if (!user) return;
    const keyword = q.trim().toLowerCase();
    if (keyword.length < 2) {
      setItems([]);
      setError(null);
      setSearching(false);
      return;
    }
    const handle = setTimeout(() => {
      void onSearch(keyword);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [q, user, debounceMs]);

  async function onSearch(keyword: string) {
    const seq = (searchSeq.current += 1);
    setError(null);
    if (keyword.length < 2) {
      setItems([]);
      if (searchSeq.current === seq) setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const { data } = await apiFetch<{ data: { items: OwnerSearchResult[] } }>(
        `/api/owners/search?display_name=${encodeURIComponent(keyword)}&limit=20`
      );
      if (searchSeq.current === seq) {
        setItems(data.data?.items ?? []);
      }
    } catch (err) {
      if (searchSeq.current !== seq) return;
      const status = (err as { status?: number }).status;
      setError(`搜尋失敗（${status ?? "?"}）`);
    } finally {
      if (searchSeq.current === seq) {
        setSearching(false);
      }
    }
  }

  if (loading) return <div>載入中...</div>;
  if (!user) return <div>請先登入後再使用搜尋。</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">搜尋飼主</h1>

      <div className="flex gap-2">
        <input
          className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-white"
          placeholder="輸入 display_name（小寫英數 . _）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch(q.trim().toLowerCase());
          }}
        />
        <button
          className="rounded bg-white/10 px-4 py-2 hover:bg-white/15 disabled:opacity-60"
          onClick={() => onSearch(q.trim().toLowerCase())}
          disabled={searching}
        >
          {searching ? "搜尋中" : "搜尋"}
        </button>
      </div>

      {error && <div className="text-red-300">{error}</div>}

      <div className="space-y-2">
        {items.map((o) => (
          <Link
            key={o.uuid}
            href={`/owners?id=${encodeURIComponent(o.uuid)}`}
            className="block rounded border border-white/10 bg-white/5 p-3 hover:bg-white/10"
          >
            <div className="font-medium">{o.displayName}</div>
            <div className="text-sm text-white/70">{[o.city, o.region].filter(Boolean).join(" / ")}</div>
          </Link>
        ))}
        {!items.length && q.trim() && !searching && <div className="text-white/60">找不到符合的飼主</div>}
      </div>
    </div>
  );
}
