<p align="center"><img src="public/icon.png" alt="One More Prompt" width="96" height="96"></p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Codex の使用量と、仕事の流れをひと目で。</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <strong>日本語</strong> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt は、**Codex のアカウント上限、Token 使用量、プロンプト履歴**をまとめるローカル優先のデスクトップアプリです。履歴を分析サービスに送らず、使用量のピークからプロジェクト、会話、元のプロンプトまでたどれます。

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>ワークスペースを見る</summary>

![プロジェクト、プロンプト、エージェントの内訳](assets/brand/projects-demo.png)

![デモ日の一日を表示するタイムライン](assets/brand/timeline-demo.png)

![API 換算モード](assets/brand/api-valuation-demo.png)

![モデル配色のプレビュー](assets/brand/palette-demo.png)

</details>

## リリース状況

> v1.0.0 は初の正式公開版です。macOS（Apple Silicon）と Windows（x64）向けのパッケージを提供します。

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [リリースノート](docs/release-notes/v1.0.0.ja.md)

## 主な機能

- **上限をすばやく確認.** メニューバーやシステムトレイから、アカウント上限、リセット時刻、残りの利用枠を確認できます。
- **使用状況を理解.** 今日から始めて期間を比較し、モデルの配色を変更し、Token と API 換算額を切り替えられます。換算額と単価計算は選択した通貨で表示します。比較用の値であり、請求額ではありません。
- **数値の元になった仕事を探す.** プロジェクト → セッション → プロンプトの順に元の指示やエージェントの使用量を確認できます。同じ記録をタイムラインでも表示できます。時間の前の `>` は、合計時間が不完全であることを示します。
- **大事な仕事を固定.** プロジェクトや会話をピン留めすると、日付を変えても保持されます。通常の記録と `.jsonl.zst` 圧縮記録で、集計と閲覧の動作は共通です。
- **安心して操作を学ぶ.** 初回設定の最初に言語を選び、その選択を設定、ワークスペース、任意の操作ガイドで共有します。デモのプロジェクト、会話、プロンプト、エージェントも9言語に対応します。ガイド再生と Codex の再確認は別の操作です。
- **新しいバージョンを確認.** 安定版を自動確認し、設定からの手動確認はいつでも利用できます。このプラットフォーム向けの新しい安定版が確認された場合にのみ、設定のすぐ左に通知点付きの更新アイコンが現れます。ダウンロードと置き換えは自分のタイミングで行えます。

## ダウンロードと起動

- **macOS · Apple Silicon:** 署名・Apple 公証済みの Apple Silicon DMG を開き、**One More Prompt.app** をアプリケーションフォルダにドラッグして起動します。
- **Windows · x64:** 署名なしの Windows x64 ポータブル ZIP をダウンロードし、**フォルダ全体**を展開して `one-more-prompt.exe` を起動します。付属ファイルは一緒に保管してください。

Windows では [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section) が必要です。SmartScreen や組織のポリシーにより、署名なしアプリへの警告や実行制限が出る場合があります。Linux、Intel Mac、ネイティブ Windows ARM のパッケージは提供していません。

Codex の標準ローカル設定でサインインすれば、既存の記録を自動検出します。API キーや認証情報の手動コピーは不要です。初回設定の最初の画面で上記の9言語を選べます。最初は英語が選択され、保存した言語は後で設定から変更できます。

## 更新方法

起動時に GitHub の最新安定版を確認します。その後は画面を表示している間に6時間が経過した時点、またはアプリに戻った時点で期限の来た確認を実行します。設定の更新確認はすぐに実行できます。Codex の認証情報やプロンプト履歴は送信しません。新版をダウンロードしたらアプリを終了し、アプリ本体または Windows のフォルダ全体を置き換えます。設定とローカルデータは通常のユーザーデータ領域に残ります。自動インストールやアップデーターフィードはありません。[更新ガイド](docs/updates.md)を参照してください。

## ローカルを基本に

プロンプト本文、プロジェクト名、セッション名、閲覧操作はコンピューター内に留まります。利用枠の確認は既存の Codex 認証情報で OpenAI に接続し、バージョン確認は匿名で GitHub に接続します。読み取り専用 API は `127.0.0.1:6736` のみにバインドし、プロンプトの詳細を含みません。インストールのテレメトリーはありません。

## ドキュメント

- [はじめに](docs/getting-started.md)
- [Codex データと認証](docs/providers/codex.md)
- [更新](docs/updates.md)
- [ローカル HTTP API](docs/local-http-api.md)
- [使用量通知](docs/notifications.md)
- [プロキシ設定](docs/proxy.md)
- [診断ログ](docs/capture-logs.md)
- [リリース手順](docs/releasing.md)

## ソースからビルド

Bun と Rust ツールチェーンが必要です。macOS は Xcode Command Line Tools、Windows は Visual Studio C++ Build Tools と WebView2 が必要です。ビルドとテストはローカルで行い、GitHub Actions は使いません。

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

検証は[貢献ガイド](CONTRIBUTING.md)、署名・公証済み macOS DMG と Windows ZIP の作成は[リリース手順](docs/releasing.md)を参照してください。このリポジトリは **Codex のみ**を統合しています。Linux は計画段階です。

## サポートとライセンス

不具合や要望は[サポート](SUPPORT.md)、脆弱性は[セキュリティポリシー](SECURITY.md)を確認してください。One More Prompt は独立したプロジェクトで、OpenAI の公式製品ではありません。[MIT ライセンス](LICENSE)で提供し、必要な第三者の著作権・帰属表示を [NOTICE](NOTICE) と[商標・帰属表示](TRADEMARK.md)に保持しています。
