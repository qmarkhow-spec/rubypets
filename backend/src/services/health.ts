import { DBClient } from "../db";
import { Env } from "../types";

export async function checkHealth(env: Env, db: DBClient) {
  const d1Ok = await db.ping();

  let r2Ok = true;
  try {
    await env.R2_MEDIA.head("healthcheck.txt");
  } catch (err) {
    console.warn("R2 health check failed", err);
    r2Ok = false;
  }

  const ok = d1Ok && r2Ok;
  return {
    ok,
    environment: env.ENVIRONMENT ?? "development",
    d1: d1Ok,
    r2: r2Ok,
    ts: new Date().toISOString()
  };
}
