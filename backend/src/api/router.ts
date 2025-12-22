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
  { method: "POST", path: "/media/images/init", handler: mediaImagesInitRoute },
  { method: "POST", path: "/media/videos/init", handler: mediaVideosInitRoute },
  { method: "GET", path: "/admin/review/summary", handler: reviewSummaryRoute },
  { method: "GET", path: "/admin/review/kyc-pending", handler: reviewKycPendingRoute },
  { method: "GET", path: "/admin/admin-accounts", handler: adminAccountsListRoute },
  { method: "POST", path: "/admin/admin-accounts", handler: adminAccountsCreateRoute },
  { method: "POST", path: "/admin/auth/login", handler: adminLoginRoute },
  { method: "GET", path: "/", handler: rootRoute }
];

export async function handleRequest(request: Request, env: HandlerContext["env"], ctx: ExecutionContext): Promise<Response> {
  if (isOptions(request)) return okResponse();

  const url = new URL(request.url);
  const pathname = normalizePath(stripApiPrefix(url.pathname));
  const dynamic = matchDynamicRoute(pathname);

  if (dynamic) {
    const db = createDB(env);
    try {
      const response = await dynamic.handler({ request, env, ctx, db }, dynamic.params);
      return withCors(response);
    } catch (err) {
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

  const posts = userId ? await getPostsByOwner(ctx.db, userId, limit) : await listRecentPosts(ctx.db, limit);
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
      method: "GET" | "POST";
      pattern: RegExp;
      handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>;
    };

const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/owners\/([^/]+)$/, handler: ownerDetailRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/location$/, handler: ownerLocationRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/verification-docs$/, handler: ownerVerificationDocsRoute },
  { method: "GET", pattern: /^\/admin\/review\/kyc\/([^/]+)$/, handler: kycDetailRoute },
  { method: "POST", pattern: /^\/admin\/review\/kyc\/([^/]+)\/decision$/, handler: kycDecisionRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/roll$/, handler: adminAccountRollRoute },
  { method: "POST", pattern: /^\/posts\/([^/]+)\/media\/attach$/, handler: attachMediaRoute },
  { method: "POST", pattern: /^\/media\/upload\/([^/]+)$/, handler: mediaUploadStubRoute }
];

function matchDynamicRoute(pathname: string):
  | { handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>; params: Record<string, string> }
  | null {
  for (const route of dynamicRoutes) {
    const m = pathname.match(route.pattern);
    if (m) {
      return { handler: route.handler, params: { id: m[1] } };
    }
  }
  return null;
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
