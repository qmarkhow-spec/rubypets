'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Comment, Post } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { CommentComposerSheet } from "@/components/comment-composer-sheet";

type ReplyTarget = {
  commentId: string;
  ownerDisplayName: string | null;
};

export default function Home() {
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPostId, setComposerPostId] = useState<string | null>(null);
  const [composerReplyTarget, setComposerReplyTarget] = useState<ReplyTarget | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerSubmitting, setComposerSubmitting] = useState(false);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadPosts() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<{ data: Post[] }>("/api/posts?limit=20");
      if (!user) {
        setPosts(data.data);
        return;
      }
      // Fetch latest comment for each post
      const enriched = await Promise.all(
        data.data.map(async (post) => {
          try {
            const { data: commentData } = await apiFetch<{ data: Comment | null; comment_count: number }>(
              `/api/posts/${post.id}/comments`
            );
            return {
              ...post,
              latestComment: commentData.data ?? null,
              commentCount: commentData.comment_count ?? post.commentCount ?? 0
            };
          } catch {
            return post;
          }
        })
      );
      setPosts(enriched);
    } catch (err) {
      setError(readError(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleLike(postId: string) {
    const idx = posts.findIndex((p) => p.id === postId);
    if (idx < 0) return;
    const target = posts[idx];
    const isLiked = !!target.isLiked;
    try {
      const { data } = await apiFetch<{ like_count?: number }>(`/api/posts/${postId}/like`, {
        method: isLiked ? "DELETE" : "POST"
      });
      const nextCount = data.like_count ?? (target.likeCount ?? 0) + (isLiked ? -1 : 1);
      const next = [...posts];
      next[idx] = { ...target, isLiked: !isLiked, likeCount: Math.max(0, nextCount) };
      setPosts(next);
    } catch (err) {
      setError(readError(err));
    }
  }

  async function addComment(postId: string, content: string, replyTarget?: ReplyTarget | null) {
    if (!user) {
      setError("Unauthorized");
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) return;
    const idx = posts.findIndex((p) => p.id === postId);
    if (idx < 0) return;

    const displayName = user.displayName || user.handle || "You";
    const replyPrefix = replyTarget?.ownerDisplayName ? `@${replyTarget.ownerDisplayName} ` : "";
    const optimistic: Comment = {
      id: `optimistic-${Date.now()}`,
      postId,
      ownerId: user.id,
      ownerDisplayName: displayName,
      content: `${replyPrefix}${trimmed}`.trim(),
      parentCommentId: replyTarget?.commentId ?? null,
      createdAt: new Date().toISOString()
    };

    let previousPost: Post | null = null;
    setPosts((current) => {
      const index = current.findIndex((p) => p.id === postId);
      if (index < 0) return current;
      const next = [...current];
      previousPost = next[index];
      next[index] = {
        ...next[index],
        latestComment: optimistic,
        commentCount: (next[index].commentCount ?? 0) + 1
      };
      return next;
    });

    try {
      const payload: { content: string; reply_to_comment_id?: string } = { content: trimmed };
      if (replyTarget?.commentId) {
        payload.reply_to_comment_id = replyTarget.commentId;
      }
      const { data } = await apiFetch<{ data: Comment; comment_count?: number }>(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setPosts((current) => {
        const index = current.findIndex((p) => p.id === postId);
        if (index < 0) return current;
        const next = [...current];
        next[index] = {
          ...next[index],
          latestComment: data.data ?? null,
          commentCount: data.comment_count ?? next[index].commentCount ?? 0
        };
        return next;
      });
    } catch (err) {
      if (previousPost) {
        setPosts((current) => {
          const index = current.findIndex((p) => p.id === postId);
          if (index < 0) return current;
          const next = [...current];
          next[index] = previousPost as Post;
          return next;
        });
      }
      setError(readError(err));
    }
  }

  function openComposer(postId: string, replyTarget?: ReplyTarget | null) {
    setComposerPostId(postId);
    setComposerReplyTarget(replyTarget ?? null);
    setComposerText("");
    setComposerOpen(true);
    setError(null);
  }

  function closeComposer() {
    if (composerSubmitting) return;
    setComposerOpen(false);
    setComposerPostId(null);
    setComposerReplyTarget(null);
    setComposerText("");
  }

  async function submitComposer() {
    if (!composerPostId || composerSubmitting) return;
    setComposerSubmitting(true);
    try {
      await addComment(composerPostId, composerText, composerReplyTarget);
      setComposerOpen(false);
      setComposerPostId(null);
      setComposerReplyTarget(null);
      setComposerText("");
    } finally {
      setComposerSubmitting(false);
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
              <div className="mt-2 flex items-center gap-3 text-sm text-slate-600">
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-rose-500"
                  onClick={() => toggleLike(post.id)}
                >
                  <span>{post.isLiked ? "❤️" : "🤍"}</span>
                  <span>{post.likeCount ?? 0}</span>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-slate-800"
                  onClick={() => openComposer(post.id)}
                >
                  <span>💬</span>
                  <span>{post.commentCount ?? 0}</span>
                </button>
              </div>
              {post.latestComment && (
                <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {formatLatestComment(post.latestComment)}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
      <CommentComposerSheet
        open={composerOpen}
        value={composerText}
        submitting={composerSubmitting}
        replyLabel={composerReplyTarget?.ownerDisplayName ?? null}
        onChange={setComposerText}
        onClose={closeComposer}
        onSubmit={submitComposer}
      />
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

function formatLatestComment(comment: Comment): string {
  const name = comment.ownerDisplayName;
  return name ? `${name}: ${comment.content}` : comment.content;
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
