export interface Env {
  DB: D1Database;
  R2_MEDIA: R2Bucket;
  ENVIRONMENT?: string;
  R2_PUBLIC_BASE_URL?: string;
}

export interface HandlerContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  db: import("./db").DBClient;
}
