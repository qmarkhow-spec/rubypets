'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Post } from "@/lib/types";

interface AdminPostResponse {
  data: Post[];
  page: number;
  hasMore: boolean;
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<AdminPostResponse>(`/api/admin/posts?page=${nextPage}&limit=20`);
      setPosts(data.data);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">貼文管理</h1>
        <div className="flex gap-2">
          <button
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            上一頁
          </button>
          <button
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore || loading}
          >
            下一頁
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-white/80">載入中...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="grid grid-cols-5 gap-3 text-xs font-semibold text-slate-500">
          <span>ID</span>
          <span>作者</span>
          <span>類型</span>
          <span>狀態</span>
          <span>建立時間</span>
        </div>
        <div className="divide-y divide-slate-200">
          {posts.map((post) => (
            <div key={post.id} className="grid grid-cols-5 gap-3 py-3 text-sm text-slate-800">
              <Link href={`/admin/posts/detail?id=${post.id}`} className="truncate text-blue-600 hover:underline">
                {post.id}
              </Link>
              <span className="truncate">{post.authorDisplayName || post.authorId}</span>
              <span>{post.postType || "text"}</span>
              <span className={post.isDeleted ? "text-red-600" : "text-emerald-600"}>
                {post.isDeleted ? "已下架" : "上架中"}
              </span>
              <span>{new Date(post.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {posts.length === 0 && !loading && <p className="py-4 text-sm text-slate-600">目前沒有資料</p>}
        </div>
      </div>
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "伺服器錯誤"}`;
  }
  return status ? `HTTP ${status}` : "伺服器錯誤";
}
