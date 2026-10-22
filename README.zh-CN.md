<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light.svg">
    <img src="assets/brand/logo-light.svg" alt="One More Prompt" width="96" height="96">
  </picture>
</p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>掌握 Codex 用量，也看清每一份工作。</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <strong>简体中文</strong> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt 是本地优先的桌面应用，集中展示 **Codex 账号额度、Token 活动与提示词历史**。从用量高峰找到项目、会话与原始提示词，无需将历史记录上传到分析服务。

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>查看工作区</summary>

![项目、提示词与代理用量明细](assets/brand/projects-demo.png)

![涵盖完整示范日的时间轴](assets/brand/timeline-demo.png)

![API 估值模式](assets/brand/api-valuation-demo.png)

![实时预览模型配色](assets/brand/palette-demo.png)

</details>

## 发布状态

> v1.0.0 是首个正式公开版本，提供 macOS（Apple Silicon）与 Windows（x64）安装包。

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [版本说明](docs/release-notes/v1.0.0.zh-CN.md)

## 主要功能

- **快速查看额度.** 在菜单栏或系统托盘查看账号额度、重置时间与剩余用量。
- **理解使用活动.** 从今天开始，对比不同日期范围、调整模型配色，并切换 Token 与 API 估值。估值与单价计算使用你选择的货币；仅用于比较用量，并非实际账单。
- **找到数字背后的工作.** 按「项目 → 会话 → 提示词」查看原始指令与代理用量，或在时间轴浏览相同记录。时间前的 `>` 表示总时长尚不完整。
- **保留重要工作.** 固定项目与会话，切换日期也不会丢失。普通记录与 `.jsonl.zst` 压缩记录使用相同的计算及浏览方式。
- **安心学习操作.** 首次设置先选择语言，设置、工作区和可选导览都会沿用该选择。九种语言均有对应的示例项目、会话、提示词与代理内容。「重新观看导览」和「重新检查 Codex」是独立入口。
- **获取新版提醒.** 自动检查正式新版，设置中的手动检查入口始终保留。只有确认当前平台有更新的正式版后，设置左侧才会出现带提示点的更新图标，由你决定何时下载替换。

## 下载与开始使用

- **macOS · Apple Silicon:** 打开已签名并经过 Apple 公证的 Apple Silicon DMG，将 **One More Prompt.app** 拖到「应用程序」后启动。
- **Windows · x64:** 下载未签名的 Windows x64 免安装 ZIP，解压**整个文件夹**后运行 `one-more-prompt.exe`，保留所有附带文件。

Windows 需要 [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)。SmartScreen 或企业策略可能警告或阻止未签名程序。目前不提供 Linux、Intel Mac 或原生 Windows ARM 安装包。

安装或运行 App 只需下载 DMG 或 ZIP。[SHA256SUMS.txt](https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.0/SHA256SUMS.txt) 列出文件的哈希值，供需要时核对下载文件是否完整；它不是安装程序，也不是数字签名。

使用 Codex 的标准本地配置登录，即可自动发现已有记录，无需 API Key 或手动复制凭据。首次设置的第一页提供上方九种语言，初始选择为英文；以后也可在设置中更改已保存的语言。

## 更新方式

应用启动时向 GitHub 检查最新正式版；之后在界面可见时每六小时到期检查，或在返回应用时补做已到期的检查；设置中的「检查更新」可立即检查，不会发送 Codex 凭据或提示词历史。下载后先退出应用，再替换应用程序或整个 Windows 文件夹；偏好设置与本地产品数据保留在通常的用户数据目录。需要手动替换，不会自动安装，也没有自动更新源文件。详见[更新说明](docs/updates.md)。

## 本地优先

提示词、项目名称、会话名称与浏览操作留在你的电脑。额度刷新通过已有的 Codex 本地凭据连接 OpenAI；版本检查匿名连接 GitHub。只读本地 API 绑定 `127.0.0.1:6736`，不包含提示词明细。应用不收集安装遥测。

## 文档

- [快速开始](docs/getting-started.md)
- [Codex 数据与登录](docs/providers/codex.md)
- [更新说明](docs/updates.md)
- [本地 HTTP API](docs/local-http-api.md)
- [用量提醒](docs/notifications.md)
- [代理配置](docs/proxy.md)
- [诊断日志](docs/capture-logs.md)
- [发布指南](docs/releasing.md)

## 从源码构建

需要 Bun 与 Rust 工具链。macOS 需要 Xcode Command Line Tools；Windows 需要 Visual Studio C++ Build Tools 和 WebView2。本地构建及测试，不使用 GitHub Actions。

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

检查流程见[贡献指南](CONTRIBUTING.md)，macOS 签名、公证和 Windows ZIP 构建见[发布指南](docs/releasing.md)。本仓库**仅集成 Codex**；Linux 仍在规划。

## 支持与许可

问题和建议请参阅[支持说明](SUPPORT.md)，漏洞请按[安全策略](SECURITY.md)报告。One More Prompt 独立维护，并非 OpenAI 官方产品。采用 [MIT 许可](LICENSE)，必要的第三方版权与来源声明保留在 [NOTICE](NOTICE) 和[商标与归属说明](TRADEMARK.md)。
