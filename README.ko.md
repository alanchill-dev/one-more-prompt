<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/logo-light.svg">
    <img src="assets/brand/logo-light.svg" alt="One More Prompt" width="96" height="96">
  </picture>
</p>
<h1 align="center">One More Prompt</h1>
<p align="center"><strong>Codex 사용량과 작업의 흐름을 한눈에.</strong></p>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a></p>

One More Prompt는 **Codex 계정 한도, Token 활동, 프롬프트 기록**을 모아 보여 주는 로컬 우선 데스크톱 앱입니다. 기록을 분석 서비스에 업로드하지 않고 사용량 급증 구간에서 프로젝트, 대화, 원본 프롬프트까지 찾아갈 수 있습니다.

<p align="center"><img src="assets/brand/hero.png" alt="One More Prompt — Demo Data" width="100%"></p>

<details>
<summary>작업 공간 살펴보기</summary>

![프로젝트, 프롬프트 및 에이전트 사용량](assets/brand/projects-demo.png)

![하루 전체를 보여 주는 데모 타임라인](assets/brand/timeline-demo.png)

![API 환산 모드](assets/brand/api-valuation-demo.png)

![모델 색상 실시간 미리 보기](assets/brand/palette-demo.png)

</details>

## 출시 상태

> v1.0.0은 첫 정식 공개 버전입니다. macOS(Apple Silicon) 및 Windows(x64) 패키지를 제공합니다.

[GitHub](https://github.com/alanchill-dev/one-more-prompt) · [macOS / Windows](https://github.com/alanchill-dev/one-more-prompt/releases) · [릴리스 노트](docs/release-notes/v1.0.0.ko.md)

## 주요 기능

- **한도 빠르게 확인.** 메뉴 막대나 시스템 트레이에서 계정 한도, 초기화 시간, 남은 사용량을 확인합니다.
- **활동 이해하기.** 오늘부터 시작해 기간을 비교하고 모델 색상을 바꾸며 Token과 API 환산 금액을 전환합니다. 환산액과 단가 계산은 선택한 통화를 따르며, 사용량 비교용이지 실제 청구액은 아닙니다.
- **숫자에 담긴 작업 찾기.** 프로젝트 → 세션 → 프롬프트 순서로 원본 지시와 에이전트 사용량을 읽거나 같은 기록을 타임라인에서 살펴봅니다. 시간 앞의 `>`는 합계가 아직 불완전함을 뜻합니다.
- **중요한 작업 고정.** 프로젝트와 대화를 고정하면 날짜를 바꿔도 유지됩니다. 일반 기록과 `.jsonl.zst` 압축 기록은 동일한 집계 및 탐색 방식을 사용합니다.
- **안전하게 배우기.** 최초 설정의 첫 화면에서 언어를 고르면 설정, 작업 공간, 선택형 가이드에서도 유지됩니다. 데모 프로젝트, 대화, 프롬프트, 에이전트 내용도 9개 언어로 제공됩니다. 가이드 다시 보기와 Codex 다시 확인은 별도 기능입니다.
- **새 버전 확인.** 안정 버전을 자동 확인하며 설정의 수동 확인 메뉴는 항상 사용할 수 있습니다. 현재 플랫폼용 새 안정 버전이 확인된 경우에만 설정 바로 왼쪽에 알림 점이 있는 업데이트 아이콘이 나타납니다. 다운로드와 교체 시점은 직접 선택합니다.

## 다운로드 및 시작

- **macOS · Apple Silicon:** 서명 및 Apple 공증을 마친 Apple Silicon DMG를 열고 **One More Prompt.app**을 응용 프로그램 폴더로 옮긴 뒤 실행합니다.
- **Windows · x64:** 서명되지 않은 Windows x64 포터블 ZIP을 다운로드하고 **폴더 전체**를 압축 해제한 뒤 `one-more-prompt.exe`를 실행합니다. 지원 파일을 함께 보관하세요.

Windows에는 [Microsoft WebView2](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)가 필요합니다. SmartScreen이나 회사 정책이 미서명 앱을 경고하거나 차단할 수 있습니다. Linux, Intel Mac, 네이티브 Windows ARM 패키지는 제공하지 않습니다.

앱을 설치하거나 실행할 때는 DMG 또는 ZIP만 다운로드하면 됩니다. [SHA256SUMS.txt](https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.0/SHA256SUMS.txt)에는 다운로드한 파일의 무결성을 선택적으로 확인할 수 있는 해시가 있으며, 설치 프로그램이나 디지털 서명이 아닙니다.

Codex의 표준 로컬 설정으로 로그인하면 기존 기록을 자동으로 찾습니다. API 키나 인증 정보 수동 복사는 필요하지 않습니다. 최초 설정의 첫 화면에서 위의 9개 언어를 선택하며, 처음에는 영어가 선택되어 있습니다. 저장한 언어는 나중에 설정에서 변경할 수 있습니다.

## 업데이트 방법

앱 시작 시 GitHub의 최신 안정 버전을 확인합니다. 이후 앱 화면이 보이는 동안 6시간 주기가 도래하거나 앱으로 돌아왔을 때 예정된 확인을 실행합니다. 설정의 업데이트 확인은 즉시 실행합니다. Codex 인증 정보나 프롬프트 기록은 전송하지 않습니다. 새 패키지를 다운로드한 뒤 앱을 종료하고 앱 또는 Windows 폴더 전체를 교체합니다. 설정과 로컬 데이터는 일반 사용자 데이터 위치에 유지됩니다. 자동 설치나 업데이터 피드는 없습니다. [업데이트 안내](docs/updates.md)를 참고하세요.

## 로컬 중심 설계

프롬프트, 프로젝트명, 세션명, 탐색 내역은 컴퓨터에 남습니다. 한도 갱신은 기존 Codex 인증 정보로 OpenAI에 연결하며 버전 확인은 GitHub에 익명으로 연결합니다. 읽기 전용 로컬 API는 `127.0.0.1:6736`에만 연결되고 프롬프트 상세를 제외합니다. 설치 텔레메트리는 수집하지 않습니다.

## 문서

- [시작하기](docs/getting-started.md)
- [Codex 데이터 및 인증](docs/providers/codex.md)
- [업데이트](docs/updates.md)
- [로컬 HTTP API](docs/local-http-api.md)
- [사용량 알림](docs/notifications.md)
- [프록시 설정](docs/proxy.md)
- [진단 로그](docs/capture-logs.md)
- [릴리스 가이드](docs/releasing.md)

## 소스에서 빌드

Bun과 Rust 도구 체인이 필요합니다. macOS에는 Xcode Command Line Tools, Windows에는 Visual Studio C++ Build Tools와 WebView2가 필요합니다. 로컬에서 빌드 및 테스트하며 GitHub Actions는 사용하지 않습니다.

```sh
bun install
bun run bundle:plugins
bun run test --run
cargo test --locked --manifest-path src-tauri/Cargo.toml
bun run build
bun run tauri dev
```

검증은 [기여 가이드](CONTRIBUTING.md), 서명·공증된 macOS DMG와 Windows ZIP 제작은 [릴리스 가이드](docs/releasing.md)를 참고하세요. 이 저장소는 **Codex만 통합**합니다. Linux는 계획 단계입니다.

## 지원 및 라이선스

오류 및 제안은 [지원](SUPPORT.md), 취약점은 [보안 정책](SECURITY.md)을 확인하세요. One More Prompt는 독립 프로젝트이며 OpenAI 공식 제품이 아닙니다. [MIT 라이선스](LICENSE)로 배포하며 필수 제3자 저작권과 출처 표시는 [NOTICE](NOTICE) 및 [상표와 출처](TRADEMARK.md)에 보존합니다.
