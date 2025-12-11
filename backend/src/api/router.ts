import { RouteHandler, asNumber, errorJson, isOptions, okResponse, withCors } from "./utils";
import { HandlerContext } from "../types";
import { checkHealth } from "../services/health";
import { createPost, getPostsByOwner, listRecentPosts } from "../services/posts";
import { createDB } from "../db";
import {
  getUserFromAuthHeader,
  loginUser,
  parseLoginPayload,
  parseRegisterPayload,
  registerUser,
  toPublicOwner
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
  { method: "POST", path: "/auth/login", handler: loginRoute },
  { method: "GET", path: "/me", handler: meRoute },
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
  const payload = (await ctx.request.json()) as { content?: string; mediaKey?: string | null };

  if (!payload.content) {
    return errorJson("content is required", 400);
  }

  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  const authorId = user?.uuid ?? "demo-user";

  const post = await createPost(ctx.db, {
    authorId,
    content: payload.content,
    mediaKey: payload.mediaKey ?? null
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
        "/api/auth/register",
        "/api/auth/login",
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
      method: "GET";
      pattern: RegExp;
      handler: (ctx: HandlerContext, params: Record<string, string>) => Promise<Response>;
    };

const dynamicRoutes: DynamicRoute[] = [
  { method: "GET", pattern: /^\/owners\/([^/]+)$/, handler: ownerDetailRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/location$/, handler: ownerLocationRoute },
  { method: "POST", pattern: /^\/owners\/([^/]+)\/verification-docs$/, handler: ownerVerificationDocsRoute }
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
    faceUrl
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
