import { HandlerContext } from "../../types";
import { asNumber, errorJson, okJson } from "../utils";
import { hashPassword, verifyPassword } from "../../services/auth";
import { DynamicRoute, Route } from "./types";

function getClientIps(request: Request): string[] {
  const ips: string[] = [];
  const pushIp = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeIp(value);
    if (normalized) ips.push(normalized);
  };

  pushIp(request.headers.get("CF-Connecting-IP"));
  pushIp(request.headers.get("True-Client-IP"));

  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) {
    forwarded
      .split(",")
      .map((entry) => entry.trim())
      .forEach((entry) => pushIp(entry));
  }

  const forwardedHeader = request.headers.get("Forwarded");
  if (forwardedHeader) {
    forwardedHeader
      .split(",")
      .map((entry) => entry.trim())
      .forEach((entry) => {
        const match = entry.match(/for=([^;]+)/i);
        if (match?.[1]) {
          pushIp(match[1].replace(/^"|"$/g, ""));
        }
      });
  }

  pushIp(request.headers.get("X-Real-IP"));
  return Array.from(new Set(ips));
}

function getPrimaryClientIp(request: Request): string | null {
  const ips = getClientIps(request);
  return ips.length > 0 ? ips[0] : null;
}

function normalizeIp(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }
  const ipv4Match = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4Match) return ipv4Match[1];
  return trimmed;
}

function splitAllowlist(value: string): string[] {
  return value
    .split(/[,\s，;]+/)
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);
}

function normalizeAllowlist(value: string): string | null {
  const entries = splitAllowlist(value);
  if (entries.length === 0) return null;
  return entries.join(",");
}

function parseAdminIdFromToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token.startsWith("admin:")) return null;
  const adminId = token.slice("admin:".length).trim();
  return adminId ? adminId : null;
}

async function requireAdmin(ctx: HandlerContext): Promise<{ adminId: string } | Response> {
  const adminId = parseAdminIdFromToken(ctx.request);
  if (!adminId) return errorJson("Unauthorized", 401);
  const admin = await ctx.db.getAdminByAdminId(adminId);
  if (!admin) return errorJson("Unauthorized", 401);
  const allowlist = splitAllowlist(admin.ipAllowlist ?? "");
  if (allowlist.length === 0) return { adminId };
  const ips = getClientIps(ctx.request);
  if (ips.length === 0 || !ips.some((ip) => allowlist.includes(ip))) return errorJson("Forbidden", 403);
  return { adminId };
}

async function reviewSummaryRoute(ctx: HandlerContext): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const counts = await ctx.db.countVerificationStatuses();
  return okJson({ ...counts, ts: new Date().toISOString() });
}

async function reviewKycPendingRoute(ctx: HandlerContext): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const data = await ctx.db.listVerifications();
  return okJson(data, 200);
}

async function kycDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
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
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const accountId = params.id;
  const body = (await ctx.request.json().catch(() => ({}))) as { status?: number };
  if (body.status !== 1 && body.status !== 3) return errorJson("invalid status", 400);
  await ctx.db.updateAccountVerificationStatus(accountId, body.status);
  return okJson({ accountId, status: body.status }, 200);
}

async function adminAccountsListRoute(ctx: HandlerContext): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const admins = await ctx.db.listAdminAccounts();
  return okJson(admins, 200);
}

async function adminAccountsCreateRoute(ctx: HandlerContext): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
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
  return okJson(created, 201);
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
  const allowlist = splitAllowlist(admin.ipAllowlist ?? "");
  if (allowlist.length > 0) {
    const ips = getClientIps(ctx.request);
    if (ips.length === 0 || !ips.some((ip) => allowlist.includes(ip))) return errorJson("Forbidden", 403);
  }
  const token = `admin:${admin.adminId}`;
  await ctx.db.updateAdminLastAt(admin.adminId, new Date().toISOString());
  return okJson({ token, admin: { id: admin.id, adminId: admin.adminId, permission: admin.permission } }, 200);
}

async function adminAccountRollRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const id = params.id;
  const payload = (await ctx.request.json().catch(() => ({}))) as { password?: string };
  const newPassword = payload.password ?? "";
  if (!newPassword) return errorJson("password required", 400);
  const hashed = await hashPassword(newPassword);
  await ctx.db.updateAdminPassword(id, hashed);
  return okJson({ accountId: id }, 200);
}

async function adminPostsListRoute(ctx: HandlerContext): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const url = new URL(ctx.request.url);
  const limit = asNumber(url.searchParams.get("limit"), 20);
  const page = Math.max(asNumber(url.searchParams.get("page"), 1), 1);
  const offset = (page - 1) * limit;
  const posts = await ctx.db.listAdminPosts(limit, offset);
  return okJson({ items: posts, page, hasMore: posts.length === limit }, 200);
}

async function adminPostDetailRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const post = await ctx.db.getPostById(params.id);
  if (!post) return errorJson("post not found", 404);
  return okJson(post, 200);
}

async function adminPostModerateRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
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
      return okJson(null, 200);
    }

    if (action === "disable_delete_media") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostMediaAndAssets(postId, assetIds);
      await ctx.db.markPostDeleted(postId);
      return okJson(null, 200);
    }

    if (action === "delete_all") {
      await deleteCloudflareAssets(assets, ctx.env);
      await ctx.db.deletePostCascade(postId, assetIds);
      return okJson(null, 200);
    }

    return errorJson("invalid action", 400);
  } catch (err) {
    console.error("adminPostModerate error", err);
    return errorJson((err as Error).message, 500);
  }
}

async function adminAccountIpAllowlistRoute(ctx: HandlerContext, params: Record<string, string>): Promise<Response> {
  const auth = await requireAdmin(ctx);
  if (auth instanceof Response) return auth;
  const payload = (await ctx.request.json().catch(() => ({}))) as { ipAllowlist?: string | null };
  const entries = splitAllowlist(payload.ipAllowlist ?? "");
  const currentIp = getPrimaryClientIp(ctx.request);
  if (entries.length > 0 && currentIp) {
    entries.push(currentIp);
  }
  const normalized = entries.length > 0 ? Array.from(new Set(entries)).join(",") : null;
  const updated = await ctx.db.updateAdminIpAllowlist(params.id, normalized);
  if (!updated) return errorJson("Not found", 404);
  return okJson({ adminId: params.id, ipAllowlist: normalized }, 200);
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

export const routes: Route[] = [
  { method: "GET", path: "/admin/review/summary", handler: reviewSummaryRoute },
  { method: "GET", path: "/admin/review/kyc-pending", handler: reviewKycPendingRoute },
  { method: "GET", path: "/admin/admin-accounts", handler: adminAccountsListRoute },
  { method: "POST", path: "/admin/admin-accounts", handler: adminAccountsCreateRoute },
  { method: "POST", path: "/admin/auth/login", handler: adminLoginRoute },
  { method: "GET", path: "/admin/posts", handler: adminPostsListRoute }
];

export const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/admin\/review\/kyc\/([^/]+)$/, handler: kycDetailRoute },
  { method: "POST", pattern: /^\/admin\/review\/kyc\/([^/]+)\/decision$/, handler: kycDecisionRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/roll$/, handler: adminAccountRollRoute },
  { method: "POST", pattern: /^\/admin\/admin-accounts\/([^/]+)\/ip-allowlist$/, handler: adminAccountIpAllowlistRoute },
  { method: "GET", pattern: /^\/admin\/posts\/([^/]+)$/, handler: adminPostDetailRoute },
  { method: "POST", pattern: /^\/admin\/posts\/([^/]+)\/moderate$/, handler: adminPostModerateRoute }
];
