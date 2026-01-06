export interface Env {
  // Auth

  // Media
  R2_MEDIA: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  CF_IMAGES_ACCOUNT_HASH?: string;
  CF_STREAM_SUBDOMAIN?: string;

  // Admin
  DB: D1Database;
  ENVIRONMENT?: string;
  ADMIN_IP_ALLOWLIST?: string;
}

export interface HandlerContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  db: import("./db").DBClient;
}
