import { Env } from "../types";

export async function checkHealth(env: Env) {
  const dbRow = await env.DB.prepare("select 1 as ok").first<{ ok: number }>();

  let r2Ok = true;
  try {
    await env.R2_MEDIA.head("healthcheck.txt");
  } catch (err) {
    console.warn("R2 health check failed", err);
    r2Ok = false;
  }

  return {
    status: "ok",
    environment: env.ENVIRONMENT ?? "development",
    d1: dbRow?.ok === 1,
    r2: r2Ok,
    timestamp: new Date().toISOString()
  };
}
