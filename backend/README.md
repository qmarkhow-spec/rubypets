# rubypets backend (Cloudflare Workers, D1, R2)

Current target: **Plan A (all-in Cloudflare)** with D1 + R2 + custom domain `api.rubypets.com`. Architecture leaves room for **Plan B (Cloud Run + Cloud SQL)** by keeping a thin services layer and SQL schema that maps cleanly to Postgres.

## Structure
- `src/index.ts` — Worker entrypoint.
- `src/api/` — HTTP routing + JSON/CORS helpers.
- `src/services/` — Business logic (timeline/posts, health).
- `src/db/` — Reserved for future data mappers / repository adapters (Cloud SQL later).
- `migrations/` — D1 schema (kept close to Postgres layout).
- `wrangler.toml` — bindings (D1, R2), routes, vars.

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

Make sure `wrangler.toml` has your `account_id` or configure it via `wrangler login`.

## Database
Apply migrations:
```bash
npm run migrate:local   # local D1
npm run migrate         # remote D1 (rubypets_dev)
```

## Routes (initial)
- `GET /health` — D1 + R2 reachability.
- `GET /v1/posts?limit=20`
- `POST /v1/posts` `{ author_id, body, media_key? }`

## R2
Bucket: `rubypets-media-dev` bound as `R2_MEDIA`. Upload flows can store the R2 key in `media_objects` and reference `media_key` on posts.

## Plan B (Cloud Run + Cloud SQL) notes
- Keep SQL portable: `TEXT` IDs, explicit timestamps, simple FKs.
- Services (`src/services/*`) should stay data-store-agnostic; add adapters under `src/db/` for Postgres later.
- R2 ↔ GCS: maintain media key format `<owner_id>/<uuid>` so either backend can find objects.
- Replace D1 bindings with Postgres client + secrets; routes stay stable.
