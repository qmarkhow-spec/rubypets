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

      <div className="card mt-3 overflow-x-auto w-full max-w-none">
        <table className="w-full text-sm text-slate-800 border-separate border-spacing-y-2">
          <thead className="text-xs font-semibold text-slate-500">
            <tr className="text-left">
              <th className="px-4 py-2 w-1/5">作者</th>
              <th className="px-4 py-2 w-2/5">貼文 ID</th>
              <th className="px-4 py-2 w-1/6">狀態</th>
              <th className="px-4 py-2 w-1/6">類型</th>
              <th className="px-4 py-2 w-1/6">建立時間</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="bg-white/80 rounded-md shadow-sm">
                <td className="px-4 py-3 whitespace-nowrap">{post.authorDisplayName || post.authorId}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/posts/detail?id=${post.id}`}
                    className="text-blue-600 hover:underline truncate inline-block max-w-[320px] align-middle"
                  >
                    {post.id}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      post.isDeleted ? "bg-slate-200 text-slate-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    ● {post.isDeleted ? "下架中" : "上架中"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{post.postType || "text"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{new Date(post.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {posts.length === 0 && !loading && (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={5}>
                  目前沒有資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  return (err as Error).message || "伺服器錯誤";
}
