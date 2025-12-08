import { RouteHandler, asNumber, errorJson, isOptions, okResponse, withCors } from "./utils";
import { HandlerContext } from "../types";
import { checkHealth } from "../services/health";
import { createPost, getPostsByUser } from "../services/posts";
import { createDB } from "../db";

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

const routes: Route[] = [
  { method: "GET", path: "/health", handler: healthRoute },
  { method: "GET", path: "/posts", handler: postsListRoute },
  { method: "POST", path: "/posts", handler: createPostRoute }
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

  if (!userId) {
    return errorJson("userId is required", 400);
  }

  const posts = await getPostsByUser(ctx.db, userId, limit);
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

  const post = await createPost(ctx.db, {
    authorId: "demo-user",
    content: payload.content,
    mediaKey: payload.mediaKey ?? null
  });

  return new Response(JSON.stringify(post), {
    status: 201,
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
