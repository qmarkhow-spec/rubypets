'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Post } from "@/lib/types";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPosts() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<{ data: Post[] }>("/api/posts?limit=20");
      setPosts(data.data);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/posts/new"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-semibold text-slate-900 shadow hover:bg-slate-100"
          aria-label="新增貼文"
        >
          +
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-white">貼文</h1>
          <p className="text-sm text-white/80">
            {user ? `已登入：${user.displayName || user.handle}` : "未登入，僅瀏覽公開貼文"}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">已發佈的貼文</h2>
          <button
            type="button"
            onClick={loadPosts}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            重新整理
          </button>
        </div>
        {loading && <p className="mt-3 text-sm text-slate-500">載入中...</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {!loading && !error && posts.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">目前還沒有貼文。</p>
        )}
        <div className="mt-3 space-y-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{post.authorDisplayName || post.authorHandle || post.authorId}</span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm text-slate-800">{post.body ?? post.content ?? "(無內容)"}</p>
              {renderMedia(post)}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function readError(err: unknown): string {
  if (!err) return "未知錯誤";
  if (typeof err === "string") return err;
  const status = (err as { status?: number }).status;
  const details = (err as { details?: unknown }).details;
  if (details && typeof details === "object" && "error" in details) {
    return `${status ?? ""} ${(details as { error?: string }).error ?? "發生錯誤"}`;
  }
  return status ? `HTTP ${status}` : "發生錯誤";
}

function renderMedia(post: Post) {
  const media = post.mediaUrls ?? [];
  if (media.length === 0) return null;

  if (post.postType === "video") {
    const url = media[0];
    return (
      <div className="mt-3">
        <video controls className="w-full rounded-md bg-black" src={url}>
          你的瀏覽器不支援播放影片
        </video>
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {media.map((url) => (
        <img
          key={url}
          src={url}
          alt="post media"
          className="max-h-80 w-full rounded-md bg-slate-100 object-contain"
        />
      ))}
    </div>
  );
}
