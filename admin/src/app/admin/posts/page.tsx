'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
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

      <div className="card mt-3">
        <div className="grid grid-cols-5 gap-3 text-xs font-semibold text-slate-500">
          <span>ID</span>
          <span>作者</span>
          <span>類型</span>
          <span>狀態</span>
          <span>時間</span>
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
    </AppShell>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  return (err as Error).message || "伺服器錯誤";
}
