import { RouteHandler, asNumber, errorJson, isOptions, okResponse, withCors } from "./utils";
import { HandlerContext } from "../types";
import { checkHealth } from "../services/health";
import { createPost, getPostsByUser, listRecentPosts } from "../services/posts";
import { createDB } from "../db";
import { getUserFromAuthHeader, loginUser, parseLoginPayload, parseRegisterPayload, registerUser, toPublicUser } from "../services/auth";

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

  const posts = userId ? await getPostsByUser(ctx.db, userId, limit) : await listRecentPosts(ctx.db, limit);
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
  const authorId = user?.id ?? "demo-user";

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
      endpoints: ["/api/health", "/api/posts", "/api/posts?userId=...", "/api/auth/register", "/api/auth/login", "/api/me"]
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
    const { user, tokens } = await registerUser(ctx.db, payload);
    return okJson({ user, ...tokens }, 201);
  } catch (err) {
    return errorJson((err as Error).message, 400);
  }
}

async function loginRoute(ctx: HandlerContext): Promise<Response> {
  try {
    const payload = await parseLoginPayload(ctx.request);
    const { user, tokens } = await loginUser(ctx.db, payload);
    return okJson({ user, ...tokens }, 200);
  } catch (err) {
    const message = (err as Error).message;
    const status = message === "invalid credentials" ? 401 : 400;
    return errorJson(message, status);
  }
}

async function meRoute(ctx: HandlerContext): Promise<Response> {
  const user = await getUserFromAuthHeader(ctx.db, ctx.request);
  if (!user) return errorJson("Unauthorized", 401);
  return okJson(toPublicUser(user), 200);
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
