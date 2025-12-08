'use client';

import { FormEvent, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { HealthStatus, Post } from "@/lib/types";
import { useAuth } from "@/lib/auth";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export default function Home() {
  const { user } = useAuth();
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_BASE ?? "https://api.rubypets.com", []);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [newPostContent, setNewPostContent] = useState("");
  const [newPostMediaKey, setNewPostMediaKey] = useState("");
  const [postResult, setPostResult] = useState<Json | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  const [postsUserId, setPostsUserId] = useState("demo-user");
  const [postsLimit, setPostsLimit] = useState(10);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  async function runHealth() {
    setHealthError(null);
    try {
      const { data } = await apiFetch<HealthStatus>("/api/health");
      setHealth(data);
    } catch (err) {
      setHealthError(readError(err));
    }
  }

  async function submitPost(e: FormEvent) {
    e.preventDefault();
    setPostError(null);
    try {
      const { data } = await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          content: newPostContent,
          mediaKey: newPostMediaKey || undefined,
        }),
      });
      setPostResult(data as Json);
    } catch (err) {
      setPostError(readError(err));
    }
  }

  async function loadPosts() {
    setPostsError(null);
    try {
      const { data } = await apiFetch<{ data: Post[] }>(`/api/posts?userId=${encodeURIComponent(postsUserId)}&limit=${postsLimit}`);
      setPosts(data.data);
    } catch (err) {
      setPostsError(readError(err));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-slate-600">Base URL：{apiBase}</p>
        <p className="text-sm text-slate-600">
          {user ? (
            <>
              目前登入：<span className="font-semibold">{user.displayName || user.handle}</span>
            </>
          ) : (
            "尚未登入（部分 API 需登入才能成功）"
          )}
        </p>
      </header>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">健康檢查</h2>
          <button
            type="button"
            onClick={runHealth}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            送出 /api/health
          </button>
        </div>
        <div className="mt-3 text-sm">
          {health && (
            <pre className="rounded bg-slate-50 p-3 text-xs text-slate-800">{JSON.stringify(health, null, 2)}</pre>
          )}
          {healthError && <p className="text-sm text-red-600">{healthError}</p>}
          {!health && !healthError && <p className="text-slate-500">尚未測試</p>}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">新增貼文（暫用 demo-user）</h2>
        <form className="mt-3 space-y-3" onSubmit={submitPost}>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">內容</label>
            <textarea
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              rows={3}
              placeholder="寫點什麼吧"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">媒體 key（可留空）</label>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={newPostMediaKey}
              onChange={(e) => setNewPostMediaKey(e.target.value)}
              placeholder="ex: owner/uuid.jpg"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500"
            >
              送出 /api/posts
            </button>
            {postError && <span className="text-sm text-red-600">{postError}</span>}
          </div>
        </form>
        {postResult && (
          <pre className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-800">{JSON.stringify(postResult, null, 2)}</pre>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">查詢貼文</h2>
          <button
            type="button"
            onClick={loadPosts}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            查詢 /api/posts
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm text-slate-700">userId</label>
            <input
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={postsUserId}
              onChange={(e) => setPostsUserId(e.target.value)}
              placeholder="demo-user"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">limit</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full rounded border border-slate-200 p-2 text-sm"
              value={postsLimit}
              onChange={(e) => setPostsLimit(Number(e.target.value))}
            />
          </div>
        </div>
        {postsError && <p className="mt-2 text-sm text-red-600">{postsError}</p>}
        <div className="mt-3 space-y-2">
          {posts.length === 0 && !postsError && <p className="text-sm text-slate-500">尚未查詢或沒有資料</p>}
          {posts.map((post) => (
            <div key={post.id} className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{post.authorDisplayName || post.authorHandle || post.authorId}</span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-800">{post.body ?? post.content ?? "(無內容)"}</p>
              {post.mediaKey && <p className="text-xs text-slate-500">mediaKey: {post.mediaKey}</p>}
            </div>
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
