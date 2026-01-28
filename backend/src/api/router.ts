import { errorJson, isOptions, okResponse, withCors } from "./utils";
import { HandlerContext } from "../types";
import { createDB } from "../db";
import { routes as systemRoutes } from "./routes/system";
import { routes as authRoutes } from "./routes/auth";
import { routes as postsRoutes, dynamicRoutes as postsDynamicRoutes } from "./routes/posts";
import { routes as mediaRoutes, dynamicRoutes as mediaDynamicRoutes } from "./routes/media";
import { routes as adminRoutes, dynamicRoutes as adminDynamicRoutes } from "./routes/admin";
import { routes as petsRoutes, dynamicRoutes as petsDynamicRoutes } from "./routes/pets";
import { routes as ownerRoutes, dynamicRoutes as ownerDynamicRoutes } from "./routes/owners";
import { routes as chatRoutes, dynamicRoutes as chatDynamicRoutes } from "./routes/chat";
import { routes as notifRoutes, dynamicRoutes as notifDynamicRoutes } from "./routes/notifications";
import { DynamicRoute, Route } from "./routes/types";

const routes: Route[] = [
  ...systemRoutes,
  ...postsRoutes,
  ...authRoutes,
  ...petsRoutes,
  ...ownerRoutes,
  ...mediaRoutes,
  ...adminRoutes,
  ...chatRoutes,
  ...notifRoutes
];

const dynamicRoutes: DynamicRoute[] = [
  ...ownerDynamicRoutes,
  ...petsDynamicRoutes,
  ...adminDynamicRoutes,
  ...postsDynamicRoutes,
  ...mediaDynamicRoutes,
  ...chatDynamicRoutes,
  ...notifDynamicRoutes
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
