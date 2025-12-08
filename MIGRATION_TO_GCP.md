# Cloudflare → GCP (Cloud Run + Cloud SQL Postgres) Checklist

本文件是未來 B 方案遷移手冊；現在不執行，只做規劃。

## 1) 準備 Cloud SQL (Postgres)
- 建立 Postgres 叢集（建議：專案內專用 VPC，開 Private IP；如果必須公開，限制來源 IP）。
- 設定自動備份、最小必要權限帳號（app user / migration user 分開）。
- 建立資料庫 `rubypets`（或專案指定名稱）。
- 匯入/重放 schema：將 `backend/migrations/*.sql` 轉寫為 Postgres 版本並執行（含 `password_hash` 欄位、索引等）。
- 驗證：跑 `select 1;`、檢查表/索引都存在，必要時加入初始種子資料（demo user）。

## 2) Cloud Run API 架構
- 在 repo 建 `backend-gcp/`（Node 18+/22+，框架可選 Express/Hono/Koa，建議 Hono）。
- 實作 `PgClient implements DBClient`（簽名同 `backend/src/db/interface.ts`），用 `pg`/`postgres` 套件連線。
- 提供 `.env`/Secret Manager 設定：`DATABASE_URL` 或分離 host/port/user/password/ssl。
- Middleware：複用現有路由/handler 思路（健康檢查、posts、auth），Auth middleware 解析 JWT/Cookie 後將 `userId` 放進 context。

## 3) 切換流程（從 D1 → Cloud SQL）
1. 在 Cloud SQL 重放/更新 schema（對齊最新 migrations），準備好種子資料（含 demo user 或必要系統帳號）。
2. 部署 Cloud Run（backend-gcp）。驗證健康檢查與 /api/posts 基本流程。
3. 在 Cloudflare Worker 設定 `MODE`（或類似旗標）：
   - `worker-direct`：目前模式，直接用 D1。
   - `proxy-to-gcp`：將 `/api/*` 轉發到 Cloud Run（Http fetch）；靜態資產/R2 邏輯視需求保留在 Worker。
4. 切到 `proxy-to-gcp`，灰度/觀察 logs & metrics，確認 Cloud SQL query/latency 正常。
5. 確認穩定後，再決定是否關閉 D1 或保留為備援/匯出。

## 4) 設計注意事項
- 保持 DB 抽象層：上層只呼叫 `DBClient`，可在 Worker/Cloud Run 共用商業邏輯。
- 避免使用 D1 特有語法；SQL 盡量採標準 Postgres 友善寫法，必要時在 PgClient 加方言轉換。
- 資料一致性：如需搬資料，安排一次性匯出/匯入流程（備註：D1 → Postgres 需要自訂匯出工具）。
- 安全：Cloud Run 僅允許 Cloudflare Egress/特定 IP 進入（可用 NEG + Cloud Armor），JWT 秘鑰/DB 密碼放 Secret Manager。
