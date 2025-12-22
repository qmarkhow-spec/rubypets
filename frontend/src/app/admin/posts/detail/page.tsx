'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Post } from "@/lib/types";

export default function AdminPostDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const postId = searchParams.get("id") || "";
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"disable" | "disable_delete_media" | "delete_all">("disable");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!postId) {
      setError("缺少貼文 ID");
      setLoading(false);
      return;
    }
    load(postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<{ data: Post }>(`/api/admin/posts/${id}`);
      setPost(data.data);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveAction() {
    if (!post) return;
    if (action !== "disable") {
      const ok = window.confirm("此動作會刪除媒體或整筆貼文資料，確定要執行嗎？");
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/posts/${post.id}/moderate`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (action === "delete_all") {
        router.push("/admin/posts");
        router.refresh();
        return;
      }
      await load(post.id);
      alert("已儲存");
    } catch (err) {
      setError(readError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-white">
        <Link href="/admin/posts" className="text-sm text-white/80 hover:text-white">
          返回列表
        </Link>
        <h1 className="text-xl font-semibold">貼文管理</h1>
      </div>

      {!postId && <p className="text-sm text-red-500">缺少貼文 ID</p>}
      {loading && <p className="text-sm text-white/80">載入中...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {post && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>作者：{post.authorDisplayName || post.authorId}</span>
            <span>{new Date(post.createdAt).toLocaleString()}</span>
          </div>
          <p className="text-slate-800">{post.body || post.content || "(無內容)"}</p>
          {renderMedia(post)}

          <div className="space-y-2 rounded border border-dashed border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">刪除/下架選項</p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="action"
                value="disable"
                checked={action === "disable"}
                onChange={() => setAction("disable")}
              />
              下架該貼文（僅 posts.is_deleted=1）
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="action"
                value="disable_delete_media"
                checked={action === "disable_delete_media"}
                onChange={() => setAction("disable_delete_media")}
              />
              下架並刪除媒體（含 Cloudflare 與 post_media/media_assets/post_media_pet_tags）
            </label>
            <label className="flex items-center gap-2 text-sm text-red-700">
              <input
                type="radio"
                name="action"
                value="delete_all"
                checked={action === "delete_all"}
                onChange={() => setAction("delete_all")}
              />
              刪除所有資料（含 likes/comments/shares/post row）
            </label>
            <button
              type="button"
              onClick={saveAction}
              disabled={saving}
              className="mt-2 w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "儲存中..." : "儲存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderMedia(post: Post) {
  const media = post.mediaUrls ?? [];
  if (!media.length) return null;

  if (post.postType === "video") {
    const url = media[0];
    return (
      <div className="mt-2">
        <video controls className="w-full rounded-md bg-black" src={url}>
          無法播放影片
        </video>
      </div>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {media.map((url) => (
        <img key={url} src={url} alt="post media" className="max-h-80 w-full rounded-md bg-slate-100 object-contain" />
      ))}
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
