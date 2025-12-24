'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusPill } from "@/components/status-pill";
import { apiFetch } from "@/lib/api";
import { AdminPost } from "@/lib/types";

interface AdminPostResponse {
  data: AdminPost[];
  page: number;
  hasMore: boolean;
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Grid List 欄位比例（含「操作欄」）
  // 你可依實際習慣微調各欄 fr 比例
  const gridColumns =
    "grid grid-cols-[1.4fr_3.6fr_1.1fr_1fr_1.8fr_160px]";

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<AdminPostResponse>(`/admin/posts?page=${nextPage}&limit=20`);
      setPosts(result.data);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell title="貼文管理" intro="查看並下架/刪除貼文" requireAuth>
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

      <div className="card mt-3 w-full max-w-none">
        {/* Header */}
        <div className={`${gridColumns} px-4 py-2 text-xs font-semibold text-slate-500`}>
          <div className="pr-2">作者</div>
          <div className="pr-2">貼文 ID</div>
          <div className="pr-2">狀態</div>
          <div className="pr-2">類型</div>
          <div className="pr-2">建立時間</div>
          <div className="text-right">操作</div>
        </div>

        <div className="space-y-2 px-2 pb-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className={`${gridColumns} items-center bg-white/80 rounded-md shadow-sm px-2 sm:px-4 py-3 hover:bg-white transition`}
            >
              {/* 作者 */}
              <div className="min-w-0 pr-2">
                <div className="truncate whitespace-nowrap text-slate-800">
                  {post.authorDisplayName || post.authorId}
                </div>
              </div>

              {/* 貼文 ID */}
              <div className="min-w-0 pr-2">
                <Link
                  href={`/admin/posts/detail?id=${post.id}`}
                  className="text-blue-600 hover:underline truncate block w-full"
                >
                  {post.id}
                </Link>
              </div>

              {/* 狀態 */}
              <div className="pr-2">
                <StatusPill
                  label={post.isDeleted ? "下架中" : "上架中"}
                  tone={post.isDeleted ? "neutral" : "success"}
                />
              </div>

              {/* 類型 */}
              <div className="pr-2 whitespace-nowrap text-slate-700">
                {post.postType || "text"}
              </div>

              {/* 建立時間 */}
              <div className="pr-2 whitespace-nowrap text-slate-700">
                {new Date(post.createdAt).toLocaleString()}
              </div>

              {/* 操作欄（先留空） */}
              <div className="flex justify-end">
                <div className="h-9 w-[120px]" aria-label="actions-placeholder" />
              </div>
            </div>
          ))}

          {posts.length === 0 && !loading && (
            <div className="px-4 py-6 text-sm text-slate-600">
              目前沒有資料
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  return (err as Error).message || "伺服器錯誤";
}
