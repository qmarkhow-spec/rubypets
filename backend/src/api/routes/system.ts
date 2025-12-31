import { HandlerContext } from "../../types";
import { checkHealth } from "../../services/health";
import { Route } from "./types";

async function healthRoute(ctx: HandlerContext): Promise<Response> {
  const status = await checkHealth(ctx.env, ctx.db);
  return new Response(JSON.stringify(status), {
    status: 200,
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

export const routes: Route[] = [
  { method: "GET", path: "/health", handler: healthRoute },
  { method: "GET", path: "/", handler: rootRoute }
];
