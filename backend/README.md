# rubypets backend (Cloudflare Workers, D1, R2)

Current target: **Plan A (all-in Cloudflare)** with D1 + R2 + custom domain `api.rubypets.com`. Architecture leaves room for **Plan B (Cloud Run + Cloud SQL)** by keeping a thin services layer and SQL schema that maps cleanly to Postgres.

## Structure
- `src/index.ts` → Worker entrypoint.
- `src/api/` → HTTP routing + JSON/CORS helpers.
- `src/services/` → Business logic (health, posts).
- `src/db/` → DB 抽象層（`DBClient` 介面 + `D1Client` 實作；未來可掛 PgClient）。
- `migrations/` → D1 schema (kept close to Postgres layout).
- `wrangler.toml` (repo root) → bindings (D1, R2), routes, vars.

## Local dev
```bash
cd backend
npm install
npm run dev        # wrangler dev --local
```

## Deploy (Plan A)
```bash
cd backend
npm run deploy
```

Make sure `wrangler.toml` (root) has your `account_id` or configure it via `wrangler login`.
For Cloudflare Git builds, keep root directory `/` and set:
- Build: `npm install`
- Deploy: `npm run deploy`

## Database
Apply migrations:
```bash
npm run migrate:local   # local D1
npm run migrate         # remote D1 (rubypets_dev)
```

## Routes (initial)
- `GET /api/health` → 健康檢查（D1 ping + R2 head）。
- `POST /api/posts` `{ content, mediaKey? }`（暫用 `demo-user`，透過 DB 抽象層寫 D1）
- `GET /api/posts?userId=...&limit=20`（依 user 拉貼文；需先有該 user）

## R2
Bucket: `rubypets-media-dev` bound as `R2_MEDIA`. Upload flows can store the R2 key in `media_objects` and reference `media_key` on posts.

## Auth / API 規劃（尚未實作，先定規格）
- D1 schema：`users` 已存在，增加 `password_hash`（migration 002）。
- API 規格：
  - `POST /api/auth/register` → 建立帳號（寫入 users，存 `password_hash`）
  - `POST /api/auth/login` → 驗證密碼，簽發 JWT（推薦）或 session token
  - `GET /api/me` → 依 Token 回傳登入使用者
- 認證方式（建議）：JWT + HTTP-only Cookie；備案：D1/KV server-side session。
- Middleware：在需要登入的路由前解析 Token，把 `userId` 放進 context，內層 handler 專注商業邏輯。

## Plan B (Cloud Run + Cloud SQL) notes
- Keep SQL portable: `TEXT` IDs, explicit timestamps, simple FKs.
- Services (`src/services/*`) should stay data-store-agnostic; add adapters under `src/db/` for Postgres later.
- R2 ↔ GCS: maintain media key format `<owner_id>/<uuid>` so either backend can find objects.
- Replace D1 bindings with Postgres client + secrets; routes stay stable.
