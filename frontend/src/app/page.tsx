'use client';

export const runtime = 'edge';

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

type CommentThread = Comment & {
  replies: Comment[];
};

type RepostVisibility = "public" | "friends" | "private";

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
  const [composerCursorPos, setComposerCursorPos] = useState<number | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [commentThreads, setCommentThreads] = useState<CommentThread[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [commentHasMore, setCommentHasMore] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [repostOpen, setRepostOpen] = useState(false);
  const [repostTarget, setRepostTarget] = useState<Post | null>(null);
  const [repostText, setRepostText] = useState("");
  const [repostVisibility, setRepostVisibility] = useState<RepostVisibility>("public");
  const [repostSubmitting, setRepostSubmitting] = useState(false);
  const [repostError, setRepostError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadPosts() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch<Post[]>("/api/posts?limit=20");
      if (!user) {
        setPosts(data);
        return;
      }
      // Fetch latest comment for each post
      const enriched = await Promise.all(
        data.map(async (post) => {
          try {
            const { data: commentData } = await apiFetch<{ comment: Comment | null; comment_count: number }>(
              `/api/posts/${post.id}/comments`
            );
            return {
              ...post,
              latestComment: commentData.comment ?? null,
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
    const optimistic: Comment = {
      id: `optimistic-${Date.now()}`,
      postId,
      ownerId: user.id,
      ownerDisplayName: displayName,
      content: trimmed,
      parentCommentId: replyTarget?.commentId ?? null,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      isLiked: false
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
      const { data } = await apiFetch<{ comment: Comment; comment_count?: number }>(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      applyCommentToThreads(postId, data.comment);
      setPosts((current) => {
        const index = current.findIndex((p) => p.id === postId);
        if (index < 0) return current;
        const next = [...current];
        next[index] = {
          ...next[index],
          latestComment: data.comment ?? null,
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
    const mention = replyTarget?.ownerDisplayName ? `@${replyTarget.ownerDisplayName} ` : "";
    setComposerPostId(postId);
    setComposerReplyTarget(replyTarget ?? null);
    setComposerText(mention);
    setComposerCursorPos(mention.length);
    setComposerOpen(true);
    setError(null);
  }

  function closeComposer() {
    if (composerSubmitting) return;
    setComposerOpen(false);
    setComposerPostId(null);
    setComposerReplyTarget(null);
    setComposerText("");
    setComposerCursorPos(null);
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
      setComposerCursorPos(null);
    } finally {
      setComposerSubmitting(false);
    }
  }

  function applyCommentToThreads(postId: string, comment: Comment) {
    if (commentsPostId !== postId) return;
    setCommentThreads((current) => {
      if (!comment.parentCommentId) {
        return [{ ...comment, replies: [] }, ...current];
      }
      return current.map((thread) => {
        if (thread.id !== comment.parentCommentId) return thread;
        return { ...thread, replies: [...thread.replies, comment] };
      });
    });
  }

  async function loadComments(postId: string, reset: boolean) {
    if (!user) {
      setCommentError("Unauthorized");
      return;
    }
    setCommentLoading(true);
    setCommentError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (!reset && commentCursor) params.set("cursor", commentCursor);
      const { data } = await apiFetch<{ items: CommentThread[]; nextCursor: string | null; hasMore: boolean }>(
        `/api/posts/${postId}/comments/list?${params.toString()}`
      );
      setCommentThreads((current) => (reset ? data.items : [...current, ...data.items]));
      setCommentCursor(data.nextCursor);
      setCommentHasMore(data.hasMore);
    } catch (err) {
      setCommentError(readError(err));
    } finally {
      setCommentLoading(false);
    }
  }

  function openComments(postId: string) {
    setCommentsPostId(postId);
    setCommentThreads([]);
    setCommentCursor(null);
    setCommentHasMore(false);
    void loadComments(postId, true);
  }

  function closeComments() {
    if (commentLoading) return;
    setCommentsPostId(null);
    setCommentThreads([]);
    setCommentCursor(null);
    setCommentHasMore(false);
    setCommentError(null);
  }

  function findCommentInThreads(commentId: string): Comment | null {
    for (const thread of commentThreads) {
      if (thread.id === commentId) return thread;
      const reply = thread.replies.find((item) => item.id === commentId);
      if (reply) return reply;
    }
    return null;
  }

  function updateCommentInThreads(commentId: string, updater: (comment: Comment) => Comment) {
    setCommentThreads((current) =>
      current.map((thread) => {
        if (thread.id === commentId) {
          const updated = updater(thread);
          return { ...updated, replies: thread.replies };
        }
        let changed = false;
        const replies = thread.replies.map((reply) => {
          if (reply.id !== commentId) return reply;
          changed = true;
          return updater(reply);
        });
        return changed ? { ...thread, replies } : thread;
      })
    );
  }

  async function toggleCommentLike(commentId: string) {
    if (!user) {
      setError("Unauthorized");
      return;
    }
    const current = findCommentInThreads(commentId);
    if (!current) return;
    const prevIsLiked = !!current.isLiked;
    const prevCount = current.likeCount ?? 0;
    const nextIsLiked = !prevIsLiked;
    const nextCount = Math.max(0, prevCount + (prevIsLiked ? -1 : 1));
    updateCommentInThreads(commentId, (comment) => ({
      ...comment,
      isLiked: nextIsLiked,
      likeCount: nextCount
    }));

    try {
      const { data } = await apiFetch<{ isLiked: boolean; like_count: number }>(
        `/api/comments/${commentId}/like`,
        { method: "POST" }
      );
      updateCommentInThreads(commentId, (comment) => ({
        ...comment,
        isLiked: data.isLiked,
        likeCount: data.like_count
      }));
    } catch (err) {
      updateCommentInThreads(commentId, (comment) => ({
        ...comment,
        isLiked: prevIsLiked,
        likeCount: prevCount
      }));
      setError(readError(err));
    }
  }

  function openRepost(post: Post) {
    setRepostTarget(post);
    setRepostText("");
    setRepostVisibility("public");
    setRepostOpen(true);
    setRepostError(null);
  }

  function closeRepost() {
    if (repostSubmitting) return;
    setRepostOpen(false);
    setRepostTarget(null);
    setRepostText("");
    setRepostError(null);
  }

  async function submitRepost() {
    if (!repostTarget || repostSubmitting) return;
    if (!user) {
      setRepostError("Unauthorized");
      return;
    }

    setRepostSubmitting(true);
    setRepostError(null);

    const trimmed = repostText.trim();
    const content = trimmed ? trimmed : null;
    const optimisticId = `optimistic-repost-${Date.now()}`;
    const displayName = user.displayName || user.handle || user.id;
    const optimistic: Post = {
      id: optimisticId,
      authorId: user.id,
      authorHandle: user.handle ?? null,
      authorDisplayName: displayName,
      body: content,
      createdAt: new Date().toISOString(),
      postType: "text",
      visibility: repostVisibility,
      mediaCount: 0,
      mediaUrls: [],
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      isLiked: false,
      latestComment: null,
      originPostId: repostTarget.id,
      originPost: repostTarget
    };

    setPosts((current) => {
      const bumped = current.map((post) =>
        post.id === repostTarget.id ? { ...post, repostCount: Math.max(0, (post.repostCount ?? 0) + 1) } : post
      );
      return [optimistic, ...bumped];
    });

    try {
      const { data } = await apiFetch<{ post: Post; origin: { id: string; repost_count: number } }>(
        `/api/posts/${repostTarget.id}/repost`,
        {
          method: "POST",
          body: JSON.stringify({ content, visibility: repostVisibility })
        }
      );

      setPosts((current) => {
        let replaced = false;
        const next = current.map((post) => {
          if (post.id === optimisticId) {
            replaced = true;
            return data.post;
          }
          if (post.id === data.origin.id) {
            return { ...post, repostCount: data.origin.repost_count };
          }
          return post;
        });
        if (!replaced) {
          next.unshift(data.post);
        }
        return next;
      });

      setRepostOpen(false);
      setRepostTarget(null);
      setRepostText("");
    } catch (err) {
      setPosts((current) => {
        const without = current.filter((post) => post.id !== optimisticId);
        return without.map((post) => {
          if (post.id === repostTarget.id) {
            return { ...post, repostCount: Math.max(0, (post.repostCount ?? 0) - 1) };
          }
          return post;
        });
      });
      setRepostError(readError(err));
    } finally {
      setRepostSubmitting(false);
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
              {post.originPostId && (
                <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                  {renderPostSummary(post.originPost)}
                </div>
              )}
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
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-emerald-600"
                  onClick={() => openRepost(post)}
                >
                  <span>Repost</span>
                  <span>{post.repostCount ?? 0}</span>
                </button>
              </div>
              {post.latestComment && (
                <button
                  type="button"
                  className="mt-1 w-full rounded bg-slate-100 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-200"
                  onClick={() => openComments(post.id)}
                >
                  {formatLatestComment(post.latestComment)}
                </button>
              )}
              {!post.latestComment && (post.commentCount ?? 0) > 0 && (
                <button
                  type="button"
                  className="mt-1 w-full rounded bg-slate-100 px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-200"
                  onClick={() => openComments(post.id)}
                >
                  View comments
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      {commentsPostId && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-900/50"
            aria-label="Close comments"
            onClick={closeComments}
            disabled={commentLoading}
          />
          <div className="relative w-full max-w-2xl rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Comments</h3>
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
                onClick={closeComments}
                disabled={commentLoading}
              >
                Close
              </button>
            </div>
            {commentError && <p className="mt-2 text-sm text-red-600">{commentError}</p>}
            {commentLoading && commentThreads.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">Loading comments...</p>
            )}
            <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {commentThreads.length === 0 && !commentLoading && !commentError && (
                <p className="text-sm text-slate-500">No comments yet.</p>
              )}
              {commentThreads.map((comment) => (
                <div key={comment.id} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{comment.ownerDisplayName || comment.ownerId}</span>
                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{comment.content}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-slate-600">
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-rose-500"
                      onClick={() => toggleCommentLike(comment.id)}
                    >
                      <span>{comment.isLiked ? "❤️" : "🤍"}</span>
                      <span>{comment.likeCount ?? 0}</span>
                    </button>
                    <button
                      type="button"
                      className="hover:text-slate-900"
                      onClick={() =>
                        openComposer(commentsPostId, {
                          commentId: comment.id,
                          ownerDisplayName: comment.ownerDisplayName ?? comment.ownerId
                        })
                      }
                    >
                      Reply
                    </button>
                  </div>
                  {comment.replies.length > 0 && (
                    <div className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                      {comment.replies.map((reply) => (
                        <div key={reply.id}>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{reply.ownerDisplayName || reply.ownerId}</span>
                            <span>{new Date(reply.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-700">{reply.content}</p>
                          <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-slate-600">
                            <button
                              type="button"
                              className="flex items-center gap-1 hover:text-rose-500"
                              onClick={() => toggleCommentLike(reply.id)}
                            >
                              <span>{reply.isLiked ? "❤️" : "🤍"}</span>
                              <span>{reply.likeCount ?? 0}</span>
                            </button>
                            <button
                              type="button"
                              className="hover:text-slate-900"
                              onClick={() =>
                                openComposer(commentsPostId, {
                                  commentId: reply.id,
                                  ownerDisplayName: reply.ownerDisplayName ?? reply.ownerId
                                })
                              }
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {commentHasMore && (
              <button
                type="button"
                className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => commentsPostId && loadComments(commentsPostId, false)}
                disabled={commentLoading}
              >
                Load more
              </button>
            )}
          </div>
        </div>
      )}
      {repostOpen && repostTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-slate-900/50"
            aria-label="Close repost"
            onClick={closeRepost}
            disabled={repostSubmitting}
          />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Repost</h3>
              <button
                type="button"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
                onClick={closeRepost}
                disabled={repostSubmitting}
              >
                Close
              </button>
            </div>
            {repostError && <p className="mt-2 text-sm text-red-600">{repostError}</p>}
            <textarea
              className="mt-3 w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-900"
              placeholder="Add a note (optional)"
              rows={3}
              value={repostText}
              onChange={(event) => setRepostText(event.target.value)}
            />
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
              <label htmlFor="repost-visibility" className="font-semibold">Visibility</label>
              <select
                id="repost-visibility"
                className="rounded border border-slate-200 px-2 py-1 text-sm text-slate-800"
                value={repostVisibility}
                onChange={(event) => setRepostVisibility(event.target.value as RepostVisibility)}
              >
                <option value="public">public</option>
                <option value="friends">friends</option>
                <option value="private">private</option>
              </select>
            </div>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
              {renderPostSummary(repostTarget)}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={closeRepost}
                disabled={repostSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                onClick={submitRepost}
                disabled={repostSubmitting}
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}
      <CommentComposerSheet
        open={composerOpen}
        value={composerText}
        submitting={composerSubmitting}
        replyLabel={composerReplyTarget?.ownerDisplayName ?? null}
        cursorPosition={composerCursorPos}
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

function renderPostSummary(post: Post | null | undefined) {
  if (!post || post.isDeleted === 1) {
    return <p className="text-xs text-slate-500">Original post deleted.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{post.authorDisplayName || post.authorHandle || post.authorId}</span>
        <span>{new Date(post.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{post.body ?? post.content ?? "(no content)"}</p>
      {renderMedia(post)}
    </>
  );
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
