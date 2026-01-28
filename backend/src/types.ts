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

  // Chat
  CHAT_THREAD_DO: DurableObjectNamespace;

  // Push / FCM
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_PROJECT_ID?: string;
}

export interface HandlerContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  db: import("./db").DBClient;
}
