'use client';

export const runtime = 'edge';

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import type { ChatThreadSummary } from "@/lib/types";

type ThreadPage = { items: ChatThreadSummary[]; nextCursor: string | null };

export default function MessagesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setThreads([]);
      setCursor(null);
      setLoading(false);
      return;
    }
    loadThreads(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadThreads(reset: boolean) {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (!reset && cursor) params.set("cursor", cursor);
      const { data } = await apiFetch<ThreadPage>(`/api/chat/threads?${params.toString()}`);
      const items = data.items ?? [];
      setThreads((prev) => (reset ? items : [...prev, ...items]));
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  if (!user) {
    return (
      <div className="card rounded-3xl p-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">訊息</h1>
        <p className="mt-4 text-slate-500">請先登入以查看聊天室。</p>
        <Link href="/login" className="btn-primary mt-6 inline-flex items-center rounded-full px-6 py-2 text-sm">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="card rounded-3xl p-6">
        <h1 className="text-2xl font-semibold text-slate-900">訊息</h1>
        <p className="mt-2 text-slate-500">查看你的聊天室與訊息請求。</p>
      </header>

      <section className="card rounded-3xl p-4">
        {loading && threads.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-600">載入中...</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-rose-600">{error}</div>
        ) : threads.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-600">目前沒有聊天室。</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {threads.map((thread) => (
              <Link
                key={thread.threadId}
                href={`/messages/${thread.threadId}`}
                className="flex items-center gap-4 px-4 py-4 transition hover:bg-slate-50"
              >
                <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-200">
                  {thread.otherOwner.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thread.otherOwner.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-500">
                      {thread.otherOwner.displayName?.slice(0, 1) ?? "?"}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{thread.otherOwner.displayName}</span>
                    {thread.requestState === "pending" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">訊息請求</span>
                    )}
                    {thread.requestState === "rejected" && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">已拒絕</span>
                    )}
                    {thread.unread && (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">未讀</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                    {thread.lastMessagePreview || "尚無訊息"}
                  </p>
                </div>
                <div className="text-xs text-slate-400">{formatTime(thread.lastActivityAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {cursor && (
        <div className="flex justify-center">
          <button
            onClick={() => loadThreads(false)}
            className="btn-dark rounded-full px-6 py-2 text-sm disabled:opacity-60"
            disabled={loadingMore}
          >
            {loadingMore ? "載入中..." : "載入更多"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatTime(raw: string | null) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function readError(err: unknown) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const message = (err as { message?: string }).message;
  return message || "Unexpected error";
}
