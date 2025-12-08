export interface Env {
  DB: D1Database;
  R2_MEDIA: R2Bucket;
  ENVIRONMENT?: string;
}

export interface HandlerContext {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
}
