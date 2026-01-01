import { HandlerContext } from "../../types";
import { checkHealth } from "../../services/health";
import { okJson } from "../utils";
import { Route } from "./types";

async function healthRoute(ctx: HandlerContext): Promise<Response> {
  const status = await checkHealth(ctx.env, ctx.db);
  return okJson(status, 200);
}

async function rootRoute(): Promise<Response> {
  return okJson(
    {
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
    },
    200
  );
}

export const routes: Route[] = [
  { method: "GET", path: "/health", handler: healthRoute },
  { method: "GET", path: "/", handler: rootRoute }
];
