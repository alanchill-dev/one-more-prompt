# One More Prompt

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Codex users who want to understand account limits and local work. The optional
interactive guide uses a separate synthetic workspace, so people with or without
local Codex records can complete the same walkthrough.

## Product Purpose

Bring Codex limits, token activity and local prompt history into one desktop
workspace. Help a user understand a busy period, inspect a prompt and compare
work happening during the same time range.

## Operating Context

React and TypeScript render inside a Tauri desktop app. macOS and Windows use
the same frontend; native tray, window, startup and credential behavior differ.
The app discovers existing local Codex records. It is Codex-only.

## Capabilities and Constraints

- Overview shows account limits, reset times, period activity and model shares.
  Tokens/API Valuation switches the complete readout while preserving dates and
  model colors. Prices are per-model references; unknown and partial estimates
  stay explicit.
- Projects preserves the project, session and prompt hierarchy. Prompt details
  show authored instructions, token attribution and API-equivalent estimates
  when the local records contain them. Estimates are not subscription charges.
- Timeline compares work within a selected time range and opens prompt details.
- Prompt text stays local. Account-limit refresh may contact OpenAI using the
  existing Codex credentials. The setup scan is a local aggregate count.
- Detecting configuration files does not establish valid online authentication.
- First setup is required; workspace guidance is optional. Replay Guide opens in the main
  workspace; Recheck Codex opens the independent setup check. Both can be replayed. Keyboard navigation,
  light/dark appearance and nine existing locales are retained. The app always
  uses full animations, independent of system animation preferences, with no motion-mode option.
- Windows first public distribution is an unsigned x64 portable ZIP, subject
  to native acceptance. It keeps normal per-user app data. macOS requires local
  Developer ID signing and Apple notarization. Packages are built and verified
  locally, then manually uploaded to GitHub Releases.

## Brand Commitments

Keep the One More Prompt name, existing logo and product voice. Onboarding
inherits the app's established orange, paper and ink appearance and saved theme.
Visual changes are discussed through concrete previews before implementation.
The owner selected Overview metric design 1 on 2026-10-09: text tabs above the
main value, with an orange underline for the selected measure and no repeated
activity-period label.
The metric tabs must preserve the original reading-header height and chart
position; adding a selector must not consume extra chart space.

## Evidence on Hand

The current source in this repository is the interface authority. The accepted
local promotional video demonstrates the intended product value, but its source
copy is not the current app. Synthetic preview data must be labeled and must not
read or overwrite the user's records.

## Product Principles

- Explain value through real work instead of cataloguing every control.
- Let the user control teaching pace and leave at any time.
- Separate absent data, unavailable data and available local history.
- Preserve useful context and local data across navigation and setup replay.
