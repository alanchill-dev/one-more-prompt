# Changelog

Notable changes to One More Prompt are documented here. Required source
attribution is preserved in [LICENSE](LICENSE) and [NOTICE](NOTICE).

## v1.0.0 — Public Launch

First stable public release for macOS Apple Silicon and Windows x64. See the
[English release notes](docs/release-notes/v1.0.0.md) and their eight translations
for the complete description.

- Unified One More Prompt branding, application identity, and internal naming,
  with one-time preservation of existing local product data and settings.
- Added automatic stable-release checks and manual Check for Updates. The
  compact icon left of Settings signals an available update; download opens
  externally and the user replaces the app manually.
- Added nine-language README and release notes, with English as the default.
- Combined account limits, Today-first Token activity, customizable model colors,
  API valuation, Projects, and Timeline in one Codex-only workspace.
- Added original Prompt text, execution-time and agent detail, persistent Project
  and Session pins, and reliable ordinary/compressed `.jsonl.zst` history.
- Added optional hands-on demo guidance, separate Replay Guide/Recheck Codex,
  required first setup, and real checked/total scan progress.
- Corrected repeated and continued-session Token totals, cross-thread deduplication, and reasoning totals in ordinary and compressed history. API estimates retain measured cache writes and explain missing prices with the available subtotal.
- Refresh failures remain visible until a newer success. Diagnostic masking, Codex-only cache isolation, migration retry cleanup, Windows startup registration, and the tray Open action are more reliable.
- Signed/notarized macOS Apple Silicon DMG and unsigned Windows x64
  portable ZIP distribution, with normal per-user data and manual replacement.

Verification includes automated tests, package checks, and a current-user macOS launch check. Windows x64 and clean-account macOS acceptance were not rerun for these packages; the owner approved publication with those limits disclosed.
Linux, Intel Mac, and native Windows ARM packages are outside the first public release.

## v0.8.0

One More Prompt 0.8.0 establishes a focused, local-first Codex analytics app with a redesigned information architecture and a dedicated Prompt Usage workspace.

### New Features

- Added an unsigned Windows x64 NSIS installation preview workflow for private
  Release testing, with SHA-256 checksums and a clean-machine checklist.
- Added a standard cross-platform tray panel implementation for Windows while
  preserving the existing macOS NSPanel behavior.
- Added a standalone Prompt Usage workspace with project search, filtering, sorting, density controls, expandable sessions, and one-click prompt copying.
- Added responsive split-view layouts that adapt from compact menu-bar panels to freely resized desktop windows.
- Restored the last active page and window size when the app is reopened.
- Added keyboard navigation for all four primary destinations with Command-1 through Command-4.

### Improvements

- Added Windows notification-settings routing and native relaunch behavior.
- Overview now contains the complete Codex usage detail instead of duplicating a separate provider page.
- Codex session names now match the Codex sidebar by honoring the latest session index title and preserving sidebar order.
- Redesigned navigation, empty, loading, stale, and error states for clearer long-session use.
- Rebuilt Settings, Onboarding, and About around the Codex-only product scope.
- Replaced the inherited first-run tour with One More Prompt's local Signal Check, truthful Prompt and Session counts, bilingual setup, and an optional guide inside the real workspace.
- Added compact and comfortable Prompt Usage density options, persisted locally.
- Improved focus visibility, keyboard access, reduced-motion behavior, truncation tooltips, and responsive text hierarchy.

### Security and Maintenance

- Removed bundled non-Codex providers, provider credential dialogs, licensing integration, referral links, and the untrusted upstream updater path.
- The local HTTP API excludes private Prompt Usage content.
- Public distribution requires project-owned signing credentials and release infrastructure.
