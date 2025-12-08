# rubypets

Cloudflare-first implementation (Plan A) with a clear migration path to Google Cloud (Plan B: Cloud Run + Cloud SQL). Current resources:
- D1 (dev): `rubypets_dev` — `43b862e1-e59a-45ac-b9e3-78841a6f7696`
- R2 (dev): `rubypets-media-dev`
- Domain: `api.rubypets.com` (CNAME proxied to Cloudflare Worker)

## Repo layout
- `backend/` — Cloudflare Worker API, D1 schema, R2 binding, wrangler config.
- `frontend/` — Cloudflare Pages app (placeholder README, ready for Vite/React).

## How to run backend (Plan A)
```bash
cd backend
npm install
npm run dev           # local dev
npm run migrate:local # apply D1 migrations locally
npm run deploy        # deploy to Cloudflare Worker
```

Add your `account_id` to `wrangler.toml` (repo root) or login via `wrangler login`.
For Cloudflare Git builds, keep root directory `/` and set commands to use the root package:
- Build: `npm install`
- Deploy: `npm run deploy`

## API surface (initial)
- `GET /health` — checks D1 + R2 bindings.
- `GET /v1/posts?limit=20`
- `POST /v1/posts` `{ author_id, body, media_key? }`

## Database schema (D1 now, Cloud SQL later)
- `users` — id, handle, display_name, email, avatar_url.
- `posts` — author_id FK, body, media_key, created_at.
- `follows` — follower/followee pairs.
- `media_objects` — R2 metadata keyed by object key.

## Migration notes toward Plan B
- Keep service layer (`backend/src/services`) storage-agnostic; swap D1 with Postgres adapter under `backend/src/db`.
- Preserve API contract so the frontend keeps working through the transition.
- Media keys should stay stable (`<owner_id>/<uuid>`) whether stored in R2 or GCS.
- Introduce Cloud SQL by replacing D1 bindings with a Postgres client and porting migrations to SQLx/Liquibase or a similar tool.

## Frontend
Cloudflare Pages target. Suggested stack: Vite + React/TypeScript in `frontend/`; point `VITE_API_BASE` to `https://api.rubypets.com`.
