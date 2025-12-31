import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { getUserFromAuthHeader } from "../../services/auth";
import { createPost, getPostsByOwner, listRecentPosts } from "../../services/posts";
import { DynamicRoute, Route } from "./types";

async function postsListRoute(ctx: HandlerContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const userId = url.searchParams.get("userId");

  const currentUser = await getUserFromAuthHeader(ctx.db, ctx.request).catch(() => null);
  const posts = userId
    ? await getPostsByOwner(ctx.db, userId, limit, currentUser?.uuid)
    : await listRecentPosts(ctx.db, limit, currentUser?.uuid);

  return new Response(JSON.stringify({ data: posts }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function createPostRoute(ctx: HandlerContext): Promise<Response> {
  const payload = (await ctx.request.json()) as {
    content?: string;
    mediaKey?: string | null; // deprecated
    post_type?: string;
    visibility?: string;
  };

  const content = (payload.content ?? "").trim();
  if (!content) {
    return errorJson("content is required", 400);
  }

  const postType = (payload.post_type ?? "text").trim();
  if (!["text", "image_set", "video"].includes(postType)) {
    return errorJson("invalid post_type", 400);
  }

  const visibility = (payload.visibility ?? "public").trim();
  if (!["public", "friends", "private"].includes(visibility)) {
    return errorJson("invalid visibility", 400);
  }

  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  const authorId = user?.uuid ?? "demo-user";

  const post = await createPost(ctx.db, {
    authorId,
    content,
    visibility,
    postType
  });

  return new Response(JSON.stringify(post), {
    status: 201,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function repostRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);

  const origin = await ctx.db.getPostById(params.id);
  if (!origin) return errorJson("post not found", 404);
  if (origin.isDeleted === 1) return errorJson("origin post deleted", 409);
  if ((origin.visibility ?? "public") !== "public") return errorJson("forbidden", 403);

  const payload = (await ctx.request.json().catch(() => ({}))) as { content?: string | null; visibility?: string };
  const visibility = (payload.visibility ?? "public").trim();
  if (!["public", "friends", "private"].includes(visibility)) {
    return errorJson("invalid visibility", 400);
  }

  const rawContent = typeof payload.content === "string" ? payload.content : "";
  const trimmed = rawContent.trim();
  const content = trimmed ? trimmed : null;

  const repost = await ctx.db.createPost({
    authorId: user.uuid,
    body: content,
    visibility,
    postType: "text",
    mediaCount: 0,
    originPostId: origin.id
  });

  const repostCount = await ctx.db.updateRepostCount(origin.id);
  const repostWithAuthor = (await ctx.db.getPostById(repost.id)) ?? repost;

  return okJson(
    {
      data: { ...repostWithAuthor, originPost: origin },
      origin: { id: origin.id, repost_count: repostCount }
    },
    201
  );
}

async function attachMediaRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  try {
    const postId = params.id;
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);

    const body = (await ctx.request.json().catch(() => ({}))) as {
      post_type?: "image_set" | "video";
      asset_ids?: string[];
      pet_tags?: string[];
    };
    const postType = body.post_type;
    const assetIds = body.asset_ids ?? [];

    if (!postType || !["image_set", "video"].includes(postType)) return errorJson("invalid post_type", 400);
    if (assetIds.length === 0) return errorJson("asset_ids required", 400);

    const post = await ctx.db.getPostById(postId);
    if (!post) return errorJson("post not found", 404);
    if (post.authorId !== user.uuid) return errorJson("forbidden", 403);

    const assets = await ctx.db.getMediaAssetsByIds(assetIds);
    if (assets.length !== assetIds.length) return errorJson("asset not found", 404);
    for (const a of assets) {
      if (a.ownerId !== user.uuid) return errorJson("forbidden asset", 403);
      if (a.usage !== "post") return errorJson("asset usage must be post", 400);
      if (postType === "image_set" && a.kind !== "image") return errorJson("only images allowed", 400);
      if (postType === "video" && a.kind !== "video") return errorJson("only video allowed", 400);
    }
    if (postType === "image_set" && (assetIds.length < 1 || assetIds.length > 5)) {
      return errorJson("image_set must have 1-5 images", 400);
    }
    if (postType === "video" && assetIds.length !== 1) {
      return errorJson("video must have exactly 1 asset", 400);
    }

    await ctx.db.attachMediaToPost(postId, postType, assetIds);

    return okJson({ ok: true }, 200);
  } catch (err) {
    console.error("attachMedia error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function likeRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const postId = params.id;
  const post = await ctx.db.getPostById(postId);
  if (!post) return errorJson("post not found", 404);

  const result = await ctx.db.toggleLike(postId, user.uuid);
  return okJson({ ok: true, isLiked: result.isLiked, like_count: result.likeCount }, 200);
}

async function unlikeRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const postId = params.id;
  const post = await ctx.db.getPostById(postId);
  if (!post) return errorJson("post not found", 404);

  await ctx.db.unlikePost(postId, user.uuid);
  const updated = await ctx.db.getPostById(postId);
  return okJson({ ok: true, like_count: updated?.likeCount ?? 0 }, 200);
}

async function ensureCommentAccess(
  ctx: HandlerContext,
  postId: string,
  user: { uuid: string }
): Promise<Response | { post: import("../../db/models").Post }> {
  const post = await ctx.db.getPostById(postId);
  if (!post || post.isDeleted === 1) return errorJson("post not found", 404);

  const visibility = post.visibility ?? "public";
  if (visibility === "private" && post.authorId !== user.uuid) {
    return errorJson("forbidden", 403);
  }
  if (visibility === "friends" && post.authorId !== user.uuid) {
    const ok = await ctx.db.isFriends(post.authorId, user.uuid);
    if (!ok) return errorJson("forbidden", 403);
  }

  return { post };
}

async function listLatestCommentRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const access = await ensureCommentAccess(ctx, params.id, user);
  if (access instanceof Response) return access;
  const latest = await ctx.db.getLatestComment(params.id, user.uuid);
  return okJson({ data: latest, comment_count: access.post.commentCount ?? 0 }, 200);
}

async function createCommentRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const postId = params.id;
  const body = (await ctx.request.json().catch(() => ({}))) as {
    content?: string;
    parent_comment_id?: string | null;
    reply_to_comment_id?: string | null;
  };
  const content = (body.content ?? "").trim();
  if (!content) return errorJson("content required", 400);

  const access = await ensureCommentAccess(ctx, postId, user);
  if (access instanceof Response) return access;

  const replyToId = (body.reply_to_comment_id ?? "").trim() || null;
  const parentId = (body.parent_comment_id ?? "").trim() || null;

  let finalParentId: string | null = null;
  let finalContent = content;

  if (replyToId) {
    const target = await ctx.db.getCommentById(replyToId);
    if (!target) return errorJson("comment not found", 404);
    if (target.postId !== postId) return errorJson("comment not in post", 400);
    finalParentId = target.parentCommentId ?? target.id;
  } else if (parentId) {
    const parent = await ctx.db.getCommentById(parentId);
    if (!parent) return errorJson("comment not found", 404);
    if (parent.postId !== postId) return errorJson("comment not in post", 400);
    if (parent.parentCommentId) return errorJson("invalid parent_comment_id", 400);
    finalParentId = parent.id;
  }

  const created = await ctx.db.createComment({
    postId,
    ownerId: user.uuid,
    content: finalContent,
    parentCommentId: finalParentId
  });

  // Verify the comment was written by fetching it back by id.
  const check = await ctx.db.getCommentById(created.id);
  if (!check) {
    console.error("COMMENT_WRITE_VERIFY_FAILED", { createdId: created.id, postId });
    return errorJson("comment write verify failed", 500);
  }

  const updated = await ctx.db.getPostById(postId);

  return okJson(
    { ok: true, data: created, comment_count: updated?.commentCount ?? (access.post.commentCount ?? 0) + 1 },
    201
  );
}

async function listCommentsRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const access = await ensureCommentAccess(ctx, params.id, user);
  if (access instanceof Response) return access;

  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const cursor = url.searchParams.get("cursor");

  const page = await ctx.db.listPostCommentsThread(params.id, limit, cursor, user.uuid);
  return okJson({ data: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore }, 200);
}

async function toggleCommentLikeRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  const comment = await ctx.db.getCommentById(params.id);
  if (!comment) return errorJson("comment not found", 404);
  const access = await ensureCommentAccess(ctx, comment.postId, user);
  if (access instanceof Response) return access;

  const result = await ctx.db.toggleCommentLike(comment.id, user.uuid);
  return okJson({ ok: true, isLiked: result.isLiked, like_count: result.likeCount }, 200);
}

export const routes: Route[] = [
  { method: "GET", path: "/posts", handler: postsListRoute },
  { method: "POST", path: "/posts", handler: createPostRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "POST", pattern: /^\/posts\/([^/]+)\/media\/attach$/, handler: attachMediaRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/like$/, handler: likeRoute },
  { method: "DELETE", pattern: /^\/posts\/([^/]+)\/like$/, handler: unlikeRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/repost$/, handler: repostRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments\/list$/, handler: listCommentsRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments$/, handler: listLatestCommentRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/comments$/, handler: createCommentRoute },
  { method: "POST", pattern: /^\/comments\/([^/]+)\/like$/, handler: toggleCommentLikeRoute }
];
