# rubypets frontend (Cloudflare Pages)

Status: placeholder. Suggested stack is Vite + React/TypeScript deployed to Cloudflare Pages. API base: `https://api.rubypets.com`.

## Quick start (suggested)
```bash
npm create vite@latest rubypets-frontend -- --template react-ts
cd rubypets-frontend
npm install
npm run dev
```

When ready, move the app into this `frontend/` directory, wire environment variables, and deploy via Pages connected to the repo.

## Env hints
- `VITE_API_BASE=https://api.rubypets.com`
- Keep upload URLs relative so backend swap (Plan A → Plan B) is transparent.
