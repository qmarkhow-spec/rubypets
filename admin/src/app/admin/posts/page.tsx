'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import { AdminPost } from "@/lib/types";

interface AdminPostResponse {
  items: AdminPost[];
  page: number;
  hasMore: boolean;
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load(page);
  }, [page]);

  async function load(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AdminPostResponse>(`/admin/posts?page=${nextPage}&limit=20`);
      setPosts(result.items);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="貼文管理" intro="檢視並執行下架或刪除">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
            上一頁
          </button>
          <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={!hasMore || loading}>
            下一頁
          </button>
        </div>
        <button className="btn ghost" onClick={() => load(page)} disabled={loading}>
          重新整理
        </button>
      </div>

      {loading && <p className="text-sm text-slate-600">載入中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card mt-3 w-full max-w-none overflow-x-auto">
        <div
          className="w-full px-4 py-2 text-xs font-semibold text-slate-500"
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 4fr 1.1fr 1fr 2.6fr 60px",
            gap: "12px",
            alignItems: "center"
          }}
        >
          <div>作者</div>
          <div>貼文 ID</div>
          <div>狀態</div>
          <div>類型</div>
          <div>建立時間</div>
          <div style={{ textAlign: "right" }}>操作</div>
        </div>

        <div className="space-y-2 px-2 pb-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="w-full bg-white/80 rounded-md shadow-sm px-2 sm:px-4 py-3 hover:bg-white transition"
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 4fr 1.1fr 1fr 2.6fr 60px",
                gap: "12px",
                alignItems: "center"
              }}
            >
              <div className="min-w-0 truncate whitespace-nowrap">
                {post.authorDisplayName || post.authorId}
              </div>

              <div className="min-w-0">
                <Link
                  href={`/admin/posts/detail?id=${post.id}`}
                  className="text-blue-600 hover:underline truncate block w-full"
                >
                  {post.id}
                </Link>
              </div>

              <div>
                <StatusPill
                  label={post.isDeleted ? "已下架" : "上架中"}
                  tone={post.isDeleted ? "neutral" : "success"}
                />
              </div>

              <div className="whitespace-nowrap">{post.postType || "text"}</div>

              <div className="whitespace-nowrap">{new Date(post.createdAt).toLocaleString()}</div>

              <div className="flex justify-end">
                <div className="h-9 w-[120px]" />
              </div>
            </div>
          ))}

          {posts.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-slate-600">目前沒有資料</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  return (err as Error).message || "發生錯誤";
}
