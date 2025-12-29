import { RouteHandler, asNumber, errorJson, isOptions, okResponse, withCors } from "./utils";
import { HandlerContext } from "../types";
import { checkHealth } from "../services/health";
import { createPost, getPostsByOwner, listRecentPosts } from "../services/posts";
import { createDB } from "../db";
import {
  getUserFromAuthHeader,
  loginUser,
  parseLoginPayload,
  parseRegisterAccountOnlyPayload,
  parseRegisterPayload,
  parseRegisterOwnerPayload,
  registerAccountOnly,
  registerUser,
  registerOwnerForAccount,
  toPublicOwner,
  hashPassword,
  verifyPassword
} from "../services/auth";

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  { method: "GET", path: "/health", handler: healthRoute },
  { method: "GET", path: "/posts", handler: postsListRoute },
  { method: "POST", path: "/posts", handler: createPostRoute },
  { method: "POST", path: "/auth/register", handler: registerRoute },
  { method: "POST", path: "/auth/register/account", handler: registerAccountRoute },
  { method: "POST", path: "/auth/register/owner", handler: registerOwnerRoute },
  { method: "POST", path: "/auth/login", handler: loginRoute },
  { method: "GET", path: "/me", handler: meRoute },
  { method: "GET", path: "/owners/search", handler: ownersSearchRoute },
  { method: "GET", path: "/friendships/incoming", handler: incomingRequestsRoute },
  { method: "GET", path: "/friendships/outgoing", handler: outgoingRequestsRoute },
  { method: "POST", path: "/media/images/init", handler: mediaImagesInitRoute },
  { method: "POST", path: "/media/videos/init", handler: mediaVideosInitRoute },
  { method: "GET", path: "/admin/review/summary", handler: reviewSummaryRoute },
  { method: "GET", path: "/admin/review/kyc-pending", handler: reviewKycPendingRoute },
  { method: "GET", path: "/admin/admin-accounts", handler: adminAccountsListRoute },
  { method: "POST", path: "/admin/admin-accounts", handler: adminAccountsCreateRoute },
  { method: "POST", path: "/admin/auth/login", handler: adminLoginRoute },
  { method: "GET", path: "/admin/posts", handler: adminPostsListRoute },
  { method: "GET", path: "/", handler: rootRoute }
];

export async function handleRequest(request: Request, env: HandlerContext["env"], ctx: ExecutionContext): Promise<Response> {
  if (isOptions(request)) return okResponse();

  const url = new URL(request.url);
  const pathname = normalizePath(stripApiPrefix(url.pathname));
  const dynamic = matchDynamicRoute(request.method, pathname);

  if (dynamic) {
    const db = createDB(env);
    try {
      const response = await dynamic.handler({ request, env, ctx, db }, dynamic.params);
      return withCors(response);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status) {
        const message = (err as Error).message || "Unexpected error";
        return withCors(errorJson(message, status));
      }
      console.error("Request failed", err);
      return withCors(errorJson("Unexpected error", 500));
    }
  }

  const route = routes.find((entry) => entry.method === request.method && entry.path === pathname);

  if (!route) {
    return withCors(errorJson("Not found", 404));
  }

  const db = createDB(env);

  try {
    const response = await route.handler({ request, env, ctx, db });
    return withCors(response);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status) {
      const message = (err as Error).message || "Unexpected error";
      return withCors(errorJson(message, status));
    }
    console.error("Request failed", err);
    return withCors(errorJson("Unexpected error", 500));
  }
}

async function healthRoute(ctx: HandlerContext): Promise<Response> {
  const status = await checkHealth(ctx.env, ctx.db);
  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

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

async function rootRoute(): Promise<Response> {
  return new Response(
    JSON.stringify({
      message: "Rubypets API",
      endpoints: [
        "/api/health",
        "/api/posts",
        "/api/posts?userId=...",
        "/api/posts/:id/media/attach",
        "/api/auth/register",
        "/api/auth/login",
        "/api/media/images/init",
        "/api/media/videos/init",
        "/api/me",
        "/api/owners/:uuid"
      ]
    }),
    {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    }
  );
}

async function registerRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterPayload(ctx.request);
    const { owner, tokens } = await registerUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function registerAccountRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterAccountOnlyPayload(ctx.request);
    const account = await registerAccountOnly(ctx.db, payload);
    return okJson({ account }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

  async function registerOwnerRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseRegisterOwnerPayload(ctx.request);
    const { owner, tokens } = await registerOwnerForAccount(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function mediaImagesInitRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);

    const body = (await ctx.request.json().catch(() => ({}))) as any;
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};

    if (!["avatar", "pet_avatar", "post", "kyc", "other"].includes(usage)) {
      return errorJson("invalid usage", 400);
    }
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mime_type)) {
      return errorJson("unsupported mime_type", 422);
    }

    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    const cfImagesHash = ctx.env.CF_IMAGES_ACCOUNT_HASH;
    if (!cfAccountId || !cfToken || !cfImagesHash) return errorJson("cloudflare images not configured", 500);

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v2/direct_upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfToken}` }
    });
    const cfJson = (await cfResp.json().catch(() => ({}))) as any;
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Images init failed", cfJson);
      return errorJson("cloudflare images init failed", 502);
    }
    const cfImageId = cfJson.result?.id;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!cfImageId || !uploadUrl) return errorJson("cloudflare images init missing uploadURL", 502);

    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "image",
      usage: usage as any,
      storageKey: cfImageId,
      url: `https://imagedelivery.net/${cfImagesHash}/${cfImageId}/${pickImageVariant(usage)}`,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "uploaded"
    });

    return okJson({ data: { asset_id: asset.id, upload_url: uploadUrl } }, 201);
  } catch (err) {
    console.error("mediaImagesInit error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function mediaVideosInitRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const user = await getUserFromAuthHeader(ctx.db, ctx.request);
    if (!user) return errorJson("Unauthorized", 401);

    const body = (await ctx.request.json().catch(() => ({}))) as any;
    const usage = (body.usage ?? "").trim();
    const file = body.file ?? {};

    if (usage !== "post") return errorJson("video upload only supports usage=post for now", 400);
    if (!file.filename || !file.mime_type || typeof file.size_bytes !== "number") {
      return errorJson("file.filename, file.mime_type, size_bytes are required", 400);
    }

    const cfAccountId = ctx.env.CF_ACCOUNT_ID;
    const cfToken = ctx.env.CF_API_TOKEN;
    if (!cfAccountId || !cfToken) return errorJson("cloudflare stream not configured", 500);
    const cfStreamSubdomain = ctx.env.CF_STREAM_SUBDOMAIN; // e.g. abc123 or customer-abc123.cloudflarestream.com

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/direct_upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ maxDurationSeconds: 60, creator: user.uuid })
    });
    const cfJson = (await cfResp.json().catch(() => ({}))) as any;
    if (!cfResp.ok || !cfJson?.success) {
      console.error("CF Stream init failed", cfJson);
      return errorJson("cloudflare stream init failed", 502);
    }
    const uid = cfJson.result?.uid;
    const uploadUrl = cfJson.result?.uploadURL;
    if (!uid || !uploadUrl) return errorJson("cloudflare stream init missing uploadURL", 502);

    const streamUrl =
      cfStreamSubdomain && uid
        ? `https://customer-${normalizeStreamSubdomain(cfStreamSubdomain)}.cloudflarestream.com/${uid}/manifest/video.m3u8`
        : null;

    const asset = await ctx.db.createMediaAsset({
      ownerId: user.uuid,
      kind: "video",
      usage: "post",
      storageKey: uid,
      url: streamUrl,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      status: "processing"
    });

    return okJson({ data: { asset_id: asset.id, upload_url: uploadUrl } }, 201);
  } catch (err) {
    console.error("mediaVideosInit error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function mediaUploadStubRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  // Accept upload (stub) and mark ready
  const assetId = params.id;
  try {
    const form = await ctx.request.formData().catch(() => null);
    if (!form) return okJson({ ok: true }, 200);
    // In a real implementation, stream to Cloudflare. Here we just mark as ready.
    return okJson({ ok: true, asset_id: assetId }, 200);
  } catch (err) {
    console.error("mediaUploadStub error", err);
    return errorJson((err as Error).message, 500);
  }
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

function pickImageVariant(usage: string): string {
  switch (usage) {
    case "avatar":
      return "OwnerAvatar256";
    case "pet_avatar":
      return "PetAvatar256";
    case "post":
      return "Post1080";
    case "kyc":
      return "KYCMax1600";
    default:
      return "public";
  }
}

function normalizeStreamSubdomain(value: string): string {
  let sub = value.trim();
  sub = sub.replace(/^https?:\/\//, "");
  sub = sub.replace(/\.cloudflarestream\.com.*$/i, "");
  sub = sub.replace(/^customer-/, "");
  return sub;
}
async function loginRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseLoginPayload(ctx.request);
    const { owner, tokens } = await loginUser(ctx.db, payload);
    return okJson({ user: owner, ...tokens }, 200);
  } catch (err) {
    const message = (err as Error).message;
    const status = message === "invalid credentials" ? 401 : 400;
    return errorJson(message, status);
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
): Promise<Response | { post: import("../db/models").Post }> {
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


async function meRoute(ctx: HandlerContext): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  return okJson(toPublicOwner(user), 200);
}

async function reviewSummaryRoute(ctx: HandlerContext): Promise<Response> {
  const counts = await ctx.db.countVerificationStatuses();
  return okJson({ ...counts, ts: new Date().toISOString() });
}

async function reviewKycPendingRoute(ctx: HandlerContext): Promise<Response> {
  const data = await ctx.db.listVerifications();
  return okJson({ data }, 200);
}

async function kycDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const account = await ctx.db.getAccountById(params.id);
  if (!account) return errorJson("Not found", 404);

  const bucket = ctx.env.R2_MEDIA?.bucket?.name ?? "rubypets-media-dev";
  const toUrl = (value: string | null | undefined) => {
    if (!value) return null;
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    const base = ctx.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    let key = value.replace(/^\/+/, "");
    if (base) {
      // If key already carries the bucket prefix and base is a custom domain, drop the duplicate.
      if (key.startsWith(`${bucket}/`)) {
        key = key.slice(bucket.length + 1);
      }
      return `${base}/${key}`;
    }
    return `${bucket}/${key}`;
  };

  return okJson(
    {
      accountId: account.accountId,
      realName: account.realName ?? null,
      idNumber: account.idNumber ?? null,
      phoneNumber: account.phoneNumber ?? null,
      isVerified: account.isVerified,
      idLicenseFrontUrl: toUrl(account.idLicenseFrontUrl),
      idLicenseBackUrl: toUrl(account.idLicenseBackUrl),
      faceWithLicenseUrl: toUrl(account.faceWithLicenseUrl),
      createdAt: account.createdAt ?? null
    },
    200
  );
}

async function kycDecisionRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const accountId = params.id;
  const body = (await ctx.request.json().catch(() => ({}))) as { status?: number };
  if (body.status !== 1 && body.status !== 3) return errorJson("invalid status", 400);
  await ctx.db.updateAccountVerificationStatus(accountId, body.status);
  return okJson({ accountId, status: body.status }, 200);
}

async function adminAccountsListRoute(ctx: HandlerContext): Promise<Response> {
  const admins = await ctx.db.listAdminAccounts();
  return okJson({ data: admins }, 200);
}

async function adminAccountsCreateRoute(ctx: HandlerContext): Promise<Response> {
  const payload = (await ctx.request.json().catch(() => ({}))) as {
    adminId?: string;
    password?: string;
    permission?: string;
  };
  const adminId = (payload.adminId ?? "").trim();
  const password = payload.password ?? "";
  const permission = (payload.permission ?? "").trim() || "Inspector";
  if (!adminId || !password) return errorJson("adminId and password are required", 400);
  if (!["super", "administrator", "Inspector"].includes(permission)) return errorJson("invalid permission", 400);
  const hashed = await hashPassword(password);
  const created = await ctx.db.createAdminAccount({ adminId, password: hashed, permission });
  return okJson({ data: created }, 201);
}

async function adminLoginRoute(ctx: HandlerContext): Promise<Response> {
  const payload = (await ctx.request.json().catch(() => ({}))) as { adminId?: string; password?: string };
  const adminId = (payload.adminId ?? "").trim();
  const password = payload.password ?? "";
  if (!adminId || !password) return errorJson("adminId and password are required", 400);
  const admin = await ctx.db.getAdminByAdminId(adminId);
  if (!admin) return errorJson("invalid credentials", 401);
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) return errorJson("invalid credentials", 401);
  const token = `admin:${admin.adminId}`;
  await ctx.db.updateAdminLastAt(admin.adminId, new Date().toISOString());
  return okJson({ token, admin: { id: admin.id, adminId: admin.adminId, permission: admin.permission } }, 200);
}

async function adminAccountRollRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const id = params.id;
  const payload = (await ctx.request.json().catch(() => ({}))) as { password?: string };
  const newPassword = payload.password ?? "";
  if (!newPassword) return errorJson("password required", 400);
  const hashed = await hashPassword(newPassword);
  await ctx.db.updateAdminPassword(id, hashed);
  return okJson({ accountId: id, ok: true }, 200);
}

async function adminPostsListRoute(ctx: HandlerContext): Promise<Response> {
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const page = Math.max(asNumber(url.searchParams.get("page"), 1), 1);
  const offset = (page - 1) * limit;
  const posts = await ctx.db.listAdminPosts(limit, offset);
  return okJson({ data: posts, page, hasMore: posts.length === limit }, 200);
}

async function adminPostDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const post = await ctx.db.getPostById(params.id);
  if (!post) return errorJson("post not found", 404);
  return okJson({ data: post }, 200);
}

async function adminPostModerateRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  try {
    const postId = params.id;
    const body = (await ctx.request.json().catch(() => ({}))) as { action?: string };
    const action = (body.action ?? "").trim();
    const post = await ctx.db.getPostById(postId);
    if (!post) return errorJson("post not found", 404);

    const assets = await ctx.db.getPostAssets(postId);
    const assetIds = assets.map((a) => a.assetId);

    if (action === "disable") {
      await ctx.db.markPostDeleted(postId);
      return okJson({ ok: true }, 200);
    }

    if (action === "disable_delete_media") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostMediaAndAssets(postId, assetIds);
      await ctx.db.markPostDeleted(postId);
      return okJson({ ok: true }, 200);
    }

    if (action === "delete_all") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostCascade(postId, assetIds);
      return okJson({ ok: true }, 200);
    }

    return errorJson("invalid action", 400);
  } catch (err) {
    console.error("adminPostModerate error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function deleteCloudflareAssets(
  assets: { assetId: string; kind: string; storageKey: string }[],
  env: HandlerContext["env"]
): Promise<void> {
  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfToken = env.CF_API_TOKEN;
  if (!cfAccountId || !cfToken) {
    console.warn("Cloudflare credentials missing, skip remote delete");
    return;
  }
  for (const asset of assets) {
    try {
      if (asset.kind === "image") {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1/${asset.storageKey}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` }
        });
      } else if (asset.kind === "video") {
        await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${asset.storageKey}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${cfToken}` }
        });
      }
    } catch (err) {
      console.error("deleteCloudflareAsset failed", asset, err);
    }
  }
}

function okJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function normalizePath(path: string): string {
  if (path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

// Allow calling routes with or without a leading /api prefix.
function stripApiPrefix(path: string): string {
  if (!path.startsWith("/api")) return path;
  const next = path.slice("/api".length);
  return next.startsWith("/") ? next : `/${next}`;
}

type DynamicRoute =
  | {
      method: "GET" | "POST" | "DELETE";
      pattern: RegExp;
      handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>;
    };

const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/owners\/(?!search$)([^/]+)$/, handler: ownerDetailRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/location$/, handler: ownerLocationRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/verification-docs$/, handler: ownerVerificationDocsRoute },
  { method: "GET", pattern: /^\/owners\/([^/]+)\/friendship\/status$/, handler: friendshipStatusRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: sendFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request$/, handler: cancelFriendRequestRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/friend-request\/accept$/, handler: acceptFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friend-request\/reject$/, handler: rejectFriendRequestRoute },
  { method: "DELETE", pattern: /^\/owners\/([^/]+)\/friendship$/, handler: unfriendRoute },
  { method: "GET", pattern: /^\/admin\/review\/kyc\/([^/]+)$/, handler: kycDetailRoute },
  { method: "POST", pattern: /^\/admin\/review\/kyc\/([^/]+)\/decision$/, handler: kycDecisionRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/roll$/, handler: adminAccountRollRoute },
  { method: "GET", pattern: /^\/admin\/posts\/([^/]+)$/, handler: adminPostDetailRoute },
  { method: "POST", pattern: /^\/admin\/posts\/([^/]+)\/moderate$/, handler: adminPostModerateRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/media\/attach$/, handler: attachMediaRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/like$/, handler: likeRoute },
  { method: "DELETE", pattern: /^\/posts\/([^/]+)\/like$/, handler: unlikeRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/repost$/, handler: repostRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments\/list$/, handler: listCommentsRoute },
  { method: "GET", pattern: /^\/posts\/([^/]+)\/comments$/, handler: listLatestCommentRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/comments$/, handler: createCommentRoute },
  { method: "POST", pattern: /^\/comments\/([^/]+)\/like$/, handler: toggleCommentLikeRoute },
  { method: "POST", pattern: /^\/media\/upload\/([^/]+)$/, handler: mediaUploadStubRoute }
];

function matchDynamicRoute(
  method: string,
  pathname: string
):
  | { handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>; params: Record<string, string> }
  | null {
  for (const route of dynamicRoutes) {
    if (route.method !== method) continue;
    const m = pathname.match(route.pattern);
    if (m) {
      return { handler: route.handler, params: { id: m[1] } };
    }
  }
  return null;
}

function canonicalPair(a: string, b: string) {
  if (a === b) return null;
  const ownerA = a < b ? a : b;
  const ownerB = a < b ? b : a;
  return { ownerA, ownerB, pairKey: `${ownerA}#${ownerB}` };
}

async function requireAuthOwner(ctx: HandlerContext) {
  const me = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!me) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return me;
}

async function ownersSearchRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("display_name") ?? "").trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, asNumber(url.searchParams.get("limit"), 20)));

  if (!q) return okJson({ items: [] });

  const items = await ctx.db.searchOwnersByDisplayName(q, limit, me.uuid);
  return okJson({ items });
}

async function incomingRequestsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listIncomingRequests(me.uuid, 50);
  return okJson({ items });
}

async function outgoingRequestsRoute(ctx: HandlerContext): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const items = await ctx.db.listOutgoingRequests(me.uuid, 50);
  return okJson({ items });
}

async function friendshipStatusRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);

  const row = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (!row) return okJson({ status: "none" });

  if (row.status === "accepted") return okJson({ status: "friends" });

  if (row.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
  return okJson({ status: "pending_incoming" });
}

async function sendFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const otherId = params.id;
  const pair = canonicalPair(me.uuid, otherId);
  if (!pair) return errorJson("Invalid target", 400);

  const existing = await ctx.db.getFriendshipRowByPairKey(pair.pairKey);
  if (existing) {
    if (existing.status === "accepted") return errorJson("Already friends", 409);
    if (existing.requestedBy === me.uuid) return okJson({ status: "pending_outgoing" });
    return okJson({ status: "pending_incoming" });
  }

  try {
    await ctx.db.createFriendRequest({
      ownerA: pair.ownerA,
      ownerB: pair.ownerB,
      requestedBy: me.uuid,
      pairKey: pair.pairKey
    });
  } catch (err) {
    return errorJson("Failed to create request", 500);
  }

  return okJson({ status: "pending_outgoing" });
}

async function cancelFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deletePendingRequest(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function acceptFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.acceptPendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "friends" });
}

async function rejectFriendRequestRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deletePendingIncoming(pair.pairKey, me.uuid);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function unfriendRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const me = await requireAuthOwner(ctx);
  const pair = canonicalPair(me.uuid, params.id);
  if (!pair) return errorJson("Invalid target", 400);

  const changes = await ctx.db.deleteFriendship(pair.pairKey);
  if (!changes) return errorJson("Not found", 404);
  return okJson({ status: "none" });
}

async function ownerDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}

async function ownerLocationRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);
  const body = (await ctx.request.json()) as { city?: string; region?: string };
  if (!body.city || !body.region) return errorJson("city and region are required", 400);
  const owner = await ctx.db.updateOwnerLocation(params.id, body.city, body.region);
  return okJson({
    accountId: owner.accountId,
    uuid: owner.uuid,
    email: owner.email,
    displayName: owner.displayName,
    avatarUrl: owner.avatarUrl,
    maxPets: owner.maxPets,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
    isActive: owner.isActive,
    city: owner.city ?? null,
    region: owner.region ?? null,
    isVerified: owner.isVerified ?? 0,
    idLicenseFrontUrl: owner.idLicenseFrontUrl ?? null,
    idLicenseBackUrl: owner.idLicenseBackUrl ?? null,
    faceWithLicenseUrl: owner.faceWithLicenseUrl ?? null
  });
}

async function ownerVerificationDocsRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const authed = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!authed || authed.uuid !== params.id) return errorJson("Forbidden", 403);

  const owner = await ctx.db.getOwnerByUuid(params.id);
  if (!owner) return errorJson("Not found", 404);

  const form = await ctx.request.formData();
  const front = form.get("id_license_front");
  const back = form.get("id_license_back");
  const face = form.get("face_with_license");
  if (!(front instanceof File) || !(back instanceof File) || !(face instanceof File)) {
    return errorJson("all three images are required", 400);
  }

  const accountId = owner.accountId;
  const basePath = `${accountId}/verify_doc/pics`;
  const frontKey = `${basePath}/${accountId}_id_license_front.png`;
  const backKey = `${basePath}/${accountId}_id_license_back.png`;
  const faceKey = `${basePath}/${accountId}_face_with_license.png`;

  await Promise.all([
    ctx.env.R2_MEDIA.put(frontKey, front, { httpMetadata: { contentType: front.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(backKey, back, { httpMetadata: { contentType: back.type || "image/png" } }),
    ctx.env.R2_MEDIA.put(faceKey, face, { httpMetadata: { contentType: face.type || "image/png" } })
  ]);

  const publicBase = ctx.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const toUrl = (key: string) => (publicBase ? `${publicBase}/${key}` : key);

  const frontUrl = toUrl(frontKey);
  const backUrl = toUrl(backKey);
  const faceUrl = toUrl(faceKey);

  await ctx.db.updateAccountVerificationUrls(accountId, {
    frontUrl,
    backUrl,
    faceUrl,
    setPending: true
  });

  return okJson(
    {
      idLicenseFrontUrl: frontUrl,
      idLicenseBackUrl: backUrl,
      faceWithLicenseUrl: faceUrl
    },
    200
  );
}
