# RubyPets Flutter UI (prototype)

輕量 Flutter 專案，重刻首頁動態 + 底部五分頁導覽：首頁動態、影片、通知、探索、個人（含登入/註冊/Debug 入口），頂部導覽改為「新增貼文」「LOGO」「訊息」。

## 結構
- `lib/app.dart`：App scaffold、頂部導覽、底部導覽。
- `lib/features/feed/...`：首頁動態卡片（Mock 資料）。
- `lib/features/video|notifications|explore`：僅 UI placeholder。
- `lib/features/profile/...`：個人區（飼主資訊卡 + 登入/註冊/Debug 入口）。
- `lib/features/create_post/create_post_page.dart`：新增貼文表單（待串接）。
- `lib/theme/app_theme.dart`、`lib/widgets/app_top_bar.dart`：主題與頂部導覽。

## 使用方式
1) 確認已安裝 Flutter SDK（3.3+）。
2) 進入目錄：`cd flutter_app`
3) 產生平台腳手架（若需要 Android/iOS/Web 等）：
   ```bash
   flutter create . --platforms android,ios,web,macos,windows,linux
   ```
   （不會覆蓋 `lib/` 既有檔案）
4) 安裝套件：`flutter pub get`
5) 執行：`flutter run -d chrome` 或指定模擬器/裝置。

## 目前狀態
- 影片/通知/探索：僅展示 UI 容器，尚未串接資料。
- 訊息按鈕：顯示 Snackbar，聊天室頁未建立。
- 新增貼文、登入/註冊、Debug：僅表單 UI，尚未串接 API。

後續可在各 feature 目錄內替換 mock widget、串接 API，或加入實際導航流程。*** End Patch ***!
