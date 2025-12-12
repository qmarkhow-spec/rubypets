# Rubypets Admin (admin.rubypets.com)

Minimal Next.js App Router project for the internal admin console. The build is static-exported so it can be deployed on Cloudflare Pages behind `admin.rubypets.com`.

## Quick start
```bash
npm install           # from repo root to install workspace deps
npm run dev --workspace admin
# open http://localhost:3000
```

Environment variables (copy `.env.example` to `.env.local`):
- `NEXT_PUBLIC_API_BASE` – API base URL (default `https://api.rubypets.com`)
- `NEXT_PUBLIC_ENV_LABEL` – short environment label shown in the UI.

## Build
```bash
npm run build --workspace admin   # outputs to admin/out
```

## Deploy to Cloudflare Pages
1) 新增 Pages 專案：連結本 repo，Root/Working directory 設 `admin/`。
2) Build：`npm install && npm run build --workspace admin`；輸出目錄 `out`；Node 20。
3) 環境變數：`NEXT_PUBLIC_API_BASE=https://api.rubypets.com`（或暫時使用 wrangler dev URL）、`NEXT_PUBLIC_ENV_LABEL=dev`。
4) 首次佈署完成後，在 Pages「自訂網域」新增 `admin.rubypets.com`，Cloudflare 會建立一條 CNAME 指向 `*.pages.dev`。
5) 如果要從本機直接上傳靜態匯出檔，可用 `npx wrangler pages deploy out --project-name rubypets-admin`.
