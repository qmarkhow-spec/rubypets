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

  const cfAccountId = env.CF_ACCOUNT_ID;
  const cfToken = env.CF_API_TOKEN;
  let cfMediaOk = !!(cfAccountId && cfToken);
  if (cfMediaOk) {
    try {
      const imgResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1?per_page=1`, {
        headers: { Authorization: `Bearer ${cfToken}` }
      });
      const streamResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${cfToken}` }
      });
      cfMediaOk = imgResp.ok && streamResp.ok;
    } catch (err) {
      console.warn("Cloudflare media health check failed", err);
      cfMediaOk = false;
    }
  }

  const ok = d1Ok && r2Ok && cfMediaOk;
  return {
    ok,
    environment: env.ENVIRONMENT ?? "development",
    d1: d1Ok,
    r2: r2Ok,
    cfMedia: cfMediaOk,
    ts: new Date().toISOString()
  };
}
