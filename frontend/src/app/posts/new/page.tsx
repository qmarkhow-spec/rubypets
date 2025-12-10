'use client';

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export default function NewPostPage() {
  const [content, setContent] = useState("");
  const [mediaKey, setMediaKey] = useState("");
  const [result, setResult] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitPost(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          content,
          mediaKey: mediaKey || undefined,
        }),
      });
      setResult(data as Json);
    } catch (err) {
      setError(readError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          ← 返回首頁
        </Link>
        <h1 className="text-xl font-semibold text-white">新增貼文</h1>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
        <form className="space-y-4" onSubmit={submitPost}>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">內容</label>
            <textarea
              className="w-full rounded border border-slate-200 p-3 text-sm"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="寫點什麼..."
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-slate-700">媒體 key（可留空）</label>
            <input
              className="w-full rounded border border-slate-200 p-3 text-sm"
              value={mediaKey}
              onChange={(e) => setMediaKey(e.target.value)}
              placeholder="ex: owner/uuid.jpg"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {submitting ? "發佈中..." : "發佈貼文"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
        {result && (
          <pre className="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-800">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-dashed border-white/20 bg-white/60 p-4 text-sm text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">送出前檢查</h2>
        {content.trim() ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs uppercase tracking-wide text-slate-500">內容預覽</p>
            <p className="rounded bg-slate-50 p-3 text-slate-800">{content}</p>
            {mediaKey && (
              <p className="text-xs text-slate-600">
                mediaKey: <span className="font-mono">{mediaKey}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-slate-600">輸入內容後即可預覽，確認沒問題再按發佈。</p>
        )}
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
