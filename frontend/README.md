# rubypets frontend (Next.js 開發控制台)

目標：提供一個 Web 前端，快速測試與操作後端 API（健康檢查、登入、發文、查文、任意 API 測試）。

## 快速開始
```bash
cd frontend
npm run dev
# 瀏覽器開啟 http://localhost:3000
```

環境變數：
```bash
NEXT_PUBLIC_API_BASE=https://api.rubypets.com   # 可改成本機 wrangler dev URL
```
請依 `.env.example` 建立 `.env.local`。

## 主要頁面
- `/`：開發用控制台。健康檢查、建立貼文（暫用 demo-user）、依 userId 查貼文。
- `/login`：登入 / 快速註冊（呼叫 /api/auth/register, /api/auth/login）。成功後會記錄 Token。
- `/debug`：任意 API 測試器（method/path/body 可自訂）。

## 程式結構
- `src/lib/api-client.ts`：通用 fetch 包裝，帶 Base URL、自動加 Authorization。
- `src/lib/auth.tsx` + `auth-storage.ts`：登入狀態管理（localStorage 儲存 Token）。
- `src/lib/types.ts`：簡易型別定義。
- `src/components/user-status.tsx`：顯示登入狀態、登出鈕。
- `src/app/*`：頁面（App Router）。

## 後續待辦（對應要求）
- 串接完整 Auth API（目前後端尚未實作，前端先準備流程）。
- 增加寵物/配對/聊天/通知等頁面，對應 `docs/api-spec.yaml` 的路徑。
- 檔案/圖片上傳頁：依後端上傳策略（直傳或 pre-signed URL）補齊。
