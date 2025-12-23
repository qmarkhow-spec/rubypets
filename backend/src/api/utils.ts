import { HandlerContext } from "../types";

const DEFAULT_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400"
};

export function withCors(response: Response, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers(response.headers);
  Object.entries({ ...DEFAULT_CORS, ...extraHeaders }).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorJson(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON payload");
  }
}

export function okResponse(): Response {
  return new Response(null, { status: 204, headers: DEFAULT_CORS });
}

export function isOptions(request: Request): boolean {
  return request.method.toUpperCase() === "OPTIONS";
}

export function asNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type RouteHandler = (ctx: HandlerContext) => Promise<Response>;
