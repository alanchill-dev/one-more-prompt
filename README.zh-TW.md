<p align="center"><img src="public/icon.png" alt="One More Prompt" width="96" height="96"></p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>掌握 Codex 用量，也看清每一份工作。</strong></p>
<p align="center"><a href="README.md">English</a> · <strong>繁體中文</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt 是本機優先的桌面 App，集中呈現 **Codex 帳號額度、Token 活動與提示詞歷史**。從用量高峰一路找到專案、對話與原始提示詞，不需要將歷史紀錄上傳至分析服務。

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>查看工作區</summary>

![專案、提示詞與代理用量明細](assets/brand/projects-demo.png)

![涵蓋完整示範日的時間軸](assets/brand/timeline-demo.png)

![API 估值模式](assets/brand/api-valuation-demo.png)

![即時預覽模型配色](assets/brand/palette-demo.png)

</details>

## 發布狀態

> v1.0.0 是首個正式公開版本，提供 macOS（Apple Silicon）與 Windows（x64）套件。

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [版本說明](docs/release-notes/v1.0.0.zh-TW.md)

## 你可以做什麼

- **快速查看額度.** 從選單列或系統匣查看帳號額度、重置時間與剩餘用量。
- **看懂使用活動.** 從今天開始，對照不同日期區間、調整模型配色，並切換 Token 與 API 估值。估值與單價計算會使用你選擇的幣別；僅供比較用量，不是實際帳單。
- **找到數字背後的工作.** 依「專案 → 對話 → 提示詞」瀏覽原始指令與代理用量，或在時間軸查看同一份紀錄。時間前的 `>` 表示總時間尚不完整。
- **保留重要工作.** 釘選專案與對話，切換日期也不受影響。一般紀錄與 `.jsonl.zst` 壓縮紀錄使用相同計算與瀏覽方式。
- **安心熟悉操作.** 首次設定先選擇語言，之後設定、工作區與操作導覽會沿用這項選擇。九種語言都有對應的示範專案、對話、提示詞與代理內容。「重新觀看操作導覽」與「重新檢查 Codex」各有獨立入口。
- **掌握新版資訊.** 自動檢查正式新版，設定中的手動檢查入口隨時保留。只有確認此平台有較新的正式版後，設定左側才會出現帶提示點的更新圖示，由你決定何時下載替換。

## 下載與開始使用

- **macOS · Apple Silicon:** 開啟已簽章並經 Apple 公證的 Apple Silicon DMG，將 **One More Prompt.app** 拖至「應用程式」後啟動。
- **Windows · x64:** 下載未簽章的 Windows x64 免安裝 ZIP，解壓縮**完整資料夾**後執行 `one-more-prompt.exe`，並保留所有隨附檔案。

Windows 需要 [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)。SmartScreen 或公司政策可能對未簽章程式提出警告或阻擋執行。目前不提供 Linux、Intel Mac 或原生 Windows ARM 套件。

使用 Codex 的標準本機設定登入即可自動讀取現有紀錄，不必提供 API Key 或手動複製憑證。首次設定的第一頁提供上方九種語言，初始選擇為英文；之後也可在設定中變更已儲存的語言。

## 更新方式

App 啟動時會向 GitHub 檢查最新正式版；之後在畫面可見時，每六小時到期便再次檢查，或在你返回 App 時補做已到期的檢查；設定中的「檢查更新」可立即檢查。檢查時不會傳送 Codex 憑證或提示詞歷史。下載新版後，先退出 App，再替換應用程式或完整 Windows 資料夾；偏好設定與本機資料仍保留在一般使用者資料目錄。此方式需要手動替換，不會自動安裝，也沒有自動更新來源檔。詳見[更新說明](docs/updates.md)。

## 以本機資料為核心

提示詞文字、專案名稱、對話名稱與瀏覽操作留在你的電腦。額度更新使用既有 Codex 本機憑證連線至 OpenAI；版本檢查匿名連線至 GitHub。唯讀本機 API 僅綁定 `127.0.0.1:6736`，不包含提示詞明細。App 不提供安裝遙測。

## 文件

- [開始使用](docs/getting-started.md)
- [Codex 資料與登入](docs/providers/codex.md)
- [更新說明](docs/updates.md)
- [本機 HTTP API](docs/local-http-api.md)
- [用量提醒](docs/notifications.md)
- [Proxy 設定](docs/proxy.md)
- [診斷記錄](docs/capture-logs.md)
- [發布指南](docs/releasing.md)

## 從原始碼建置

需要 Bun 與 Rust 工具鏈；macOS 需要 Xcode Command Line Tools，Windows 需要 Visual Studio C++ Build Tools 與 WebView2。建置與測試在本機進行，不使用 GitHub Actions。

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

完整檢查方式見[貢獻指南](CONTRIBUTING.md)，macOS 簽章、公證及 Windows ZIP 建置見[發布指南](docs/releasing.md)。本專案**僅整合 Codex**；Linux 尚在規劃。

## 支援與授權

問題與建議請見[支援說明](SUPPORT.md)，漏洞請依[安全性政策](SECURITY.md)回報。One More Prompt 為獨立專案，並非 OpenAI 官方產品。以 [MIT 授權](LICENSE)發布，必要第三方版權與來源聲明保留於 [NOTICE](NOTICE) 及[商標與來源聲明](TRADEMARK.md)。
