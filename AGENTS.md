# AGENTS.md

Version: 0.32 (2026-08-30)

> One More Prompt is a local-first Tauri desktop app for Codex limits, token activity, and prompt history.

## Roadmap: Windows & Linux Support

One More Prompt is a Codex-only Tauri/Rust desktop app. Required third-party copyright and license notices are preserved in `LICENSE` and `NOTICE`. Development stays on Tauri/Rust, and the goal is to ship **Windows and Linux alongside macOS as first-class targets**.

Current state: macOS is the development platform, the owner waived Windows native acceptance for the 2026-10-08 candidate without executing it, and Linux is planned. GitHub Actions workflows are removed. Build and verify packages locally, then upload them manually to GitHub Releases after release authorization.

Remaining platform and release work:
- **Windows distribution** — the first public package is an unsigned x64 portable ZIP: extract the whole folder and run the app. Keep normal per-user app data; this is not a portable-data feature. Do not substitute NSIS or self-signing. Disclose unsigned status and possible SmartScreen restrictions. The owner waived native acceptance for the 2026-10-08 candidate; record this exception, never a fabricated test pass.
- **Tray and platform behavior** — verify tray positioning, hide-on-blur, pinned windows, startup, credential discovery, and Prompt Usage on real Windows machines. The portable app registers its notification name and icon per user; verify real toast delivery, Test Notification, folder moves, and cleanup without deleting user data. Clicking a notification does not launch the app. Linux tray positioning and desktop-environment differences remain future work.
- **Credentials and data paths** — verify each operating system's local Codex paths and credential storage. Windows currently relies on standard file-based Codex sign-in; Credential Manager and Linux Secret Service support remain work to verify.
- **Local macOS release** — use the existing valid Developer ID Application certificate in the local keychain, sign and notarize locally with Apple, and verify the resulting DMG. Keep exact certificate identities and credentials out of source and GitHub secrets.
- **Release phases** — Windows packaging/testing and publishing are phases of one release. Build, verify, perform native acceptance, then manually upload the reviewed assets. The project has no updater feed. See `docs/releasing.md` and `docs/windows-portable-test.md`.

### Release hygiene
- Never leave a release in Draft. After every release, verify it is published with its assets (use the release-tauri skill).

## Documentation

- Logic changes must update any docs in `docs/` that describe the affected behavior.
- Plans must list the doc files that need updating as part of the work.
- Exclude design from docs, and keep them simple, less-technical, easy to skim.

## Guardrails

- Use `trash` for deletes
- Use `mv` / `cp` to move and copy files
- Bugs: add regression test when it fits
- Keep files <~500 LOC; split/refactor as needed
- Before writing code, strictly follow the below research rules

## IPC Types (specta)

Tauri IPC types are auto-generated from Rust to TypeScript via `tauri-specta`. Rust is the single source of truth — never hand-write TS types that mirror Rust IPC structs.

- **Generated file:** `src/bindings.ts` (do not edit by hand). Contains all command signatures, event types, and type definitions.
- **When you change a Rust IPC type or command:** add `#[derive(specta::Type)]` to new structs/enums, `#[specta::specta]` to new `#[tauri::command]` functions, and `#[derive(tauri_specta::Event)]` + `#[tauri_specta(event_name = "...")]` to new event types. Then register them in the `Builder::new().commands(...).events(...)` call in `src-tauri/src/lib.rs` `run()` (and in the `export_bindings` test in the same file).
- **Regenerate bindings:** `cd src-tauri && cargo test test_export_bindings`. The `run()` function also auto-exports on every debug-mode app launch (`bun run tauri dev`), so bindings stay in sync during development.
- **Frontend usage:** import types from `@/bindings` (e.g., `import type { MetricLine, PluginOutput } from "@/bindings"`). Re-export them through `src/lib/plugin-types.ts` if you need narrowed literal types. Keep using `invoke<T>("command_name", args)` and `listen<T>("event_name", handler)` — do not switch to the generated `commands.foo()` wrappers (they use a `typedError` pattern that would break existing try/catch blocks and test mocks).
- **specta forbids `u64`/`usize`/`i64`/`isize`** in IPC types (BigInt precision loss in JS). Use `f64` for timestamps, byte sizes, and counts that cross the IPC boundary — safe within JS's 2^53 safe integer range.
- **`Option<T>` becomes `T | null`** in generated TS (not `T | undefined`). Frontend code must handle `null`, not just `undefined`. Use `?? defaultValue` or null guards.

## Research

- Check for and prefer available skills over web research.
- Prefer researched knowledge over your own knowledge when skills are unavailable.
- Research: Exa to general search, Context7 for official docs, GitHits for open source examples
- Best results: Quote exact errors; prefer late-2025/2026+ sources.

## Error Handling

Log failures clearly while showing friendly errors to the user. Do not add silent fallbacks that hide real problems.

## UI

Always use titlecase any hardcoded copy for titles.

Use the existing `@phosphor-icons/react` system for product icons. Do not add a second icon library or a paid private-registry dependency without an approved, repository-wide migration.

## Agent Guidance

When you have enough information to act, act. Do not re-derive facts already established in the conversation, re-litigate a decision the user has already made, or narrate options you will not pursue in user-facing messages. If you are weighing a choice, give a recommendation, not an exhaustive survey. This does not apply to thinking blocks.

Don't add features, refactor, or introduce abstractions beyond what the task requires. A bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need a helper. Don't design for hypothetical future requirements: do the simplest thing that works well. Avoid premature abstraction and half-finished implementations. Don't add error handling, fallbacks, or validation for scenarios that cannot happen. Trust
internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.

Lead with the outcome. Your first sentence after finishing should answer "what happened" or "what did you find": the thing the user would ask for if they said "just give me the TLDR." Supporting detail and reasoning come after. Being readable and being concise are different things, and readability matters more.

The way to keep output short is to be selective about what you include (drop details that don't change what the reader would do next), not to compress the writing into fragments, abbreviations, arrow chains like A → B → fails, or jargon.

Pause for the user only when the work genuinely requires them: a destructive or irreversible action, a real scope change, or input that only they can provide. If you hit one of these, ask and end the turn, rather than ending on a promise.

Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.

When the user is describing a problem, asking a question, or thinking out loud rather than requesting a change, the deliverable is your assessment. Report your findings and stop. Don't apply a fix until they ask for one. Before running a command that changes system state (restarts, deletes, config edits), check that the evidence actually supports that specific action. A signal that pattern-matches to a known failure may have
a different cause.

Delegate independent subtasks to subagents and keep working while they run. Intervene if a subagent goes off track or is missing relevant context.

Store one lesson per file with a one-line summary at the top. Record corrections and confirmed approaches alike, including why they mattered. Don't save what the repo or chat history already records; update an existing note rather than creating a duplicate; delete notes that turn out to be wrong.

You are operating autonomously. The user is not watching in real time and cannot answer questions mid-task, so asking "Want me to…?" or "Shall I…?" will block the work. For reversible actions that follow from the original request, proceed without asking. Offering follow-ups after the task is done is fine; asking permission after already discussing with the user before doing the work is not. Before ending your turn, check your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or a promise about work you have not done ("I'll…", "let me know when…"), do that work now with tool calls. End your turn only when the task is complete or you are blocked on
input only the user can provide.

You have ample context remaining. Do not stop, summarize, or suggest a new session on account of context limits. Continue the work.

I'm working on [the larger task] for [who it's for]. They need [what the output enables]. With that in mind: [request].

Terse shorthand is fine between tool calls (that's you thinking out loud, and brevity there is good). Your final summary is different: it's for a reader who didn't see any of that.

If you've been working for a while without the user watching (overnight, across many tool calls, since they last spoke), your final message is their first look at any of it. Write it as a re-grounding, not a continuation of your working thread: the outcome first, then the one or two things you need from them, each explained as if new. The vocabulary you built up while working is yours, not theirs; leave it behind unless you re-introduce it.

When you write the summary at the end, skip the technical jargon. Write like you'd explain it to a non-engineer, without dumbing it down too much. Write complete sentences. When you mention files, commits, flags, or other identifiers, give each one its own plain-language clause. Open with the outcome: one sentence on what happened or what you found. Then the supporting detail. If you have to choose between short and clear, choose clear.

## Before Creating Pull Request

- Before creating a PR or pushing to main, ensure that `README.md` still states the actual Codex-only scope.
- On any Codex plugin change, audit plugin-exposed request/response fields against `src-tauri/src/plugin_engine/host_api.rs` redaction lists and add or update tests for gaps.
- In `plugin.json`, set `brandColor` to the provider's real brand color.
- Plugin SVG logos must use `currentColor` so icon theming works correctly.
- If the PR includes visual changes, refuse to create it without providing before/after screenshots.

## Project Memories

Use below list to store and recall user notes when asked to do so.

- Use this list when asked to remember things. Keep each list item concise.
- Tauri IPC: JS must use camelCase (`{ batchId, pluginIds }`), Tauri auto-converts to Rust's snake_case. Never send snake_case from JS—params silently won't match. (Note: specta-generated `commands.foo()` wrappers handle this automatically, but we keep manual `invoke()` calls — see the IPC Types section above.)
- Release decision (2026-10-08): remove GitHub Actions and build/verify locally, retaining GitHub and manually uploaded Releases. Windows first distribution is an unsigned x64 portable ZIP with normal per-user data; packaging/testing and publishing are phases of one release. The owner waived native Windows acceptance for this candidate; it was not executed. macOS uses the existing local Developer ID Application certificate and local Apple notarization; no GitHub Apple secrets. Publication, version tags, repository visibility, and unrelated remote settings still require authorization.
- Usage Trend model visuals: keep cross-chart hover/focus highlight and no top accent stripe. Colors are rank-based, not model-identity based: aggregate Tokens within the currently selected period, sort descending (canonical name as deterministic tie-break), assign palette slots 1–5, and aggregate lower ranks into neutral Other. Switching Today / 7 / 14 / 30 / custom intentionally recalculates the mapping.
- Model palette customization: Overview + Settings share persisted ordered `modelPalette` slots. On Overview, the 44px Palette control in the plot upper-right is a true shared-element source: hide the real trigger for the entire open/closing transition, animate a shell's actual `left/top/width/height/border-radius` from the source rectangle into the focused-palette card, reveal destination content only after the shell has materially expanded, and reverse the geometry on close before restoring the trigger. Keep only a tiny settle overshoot; no heavy blur, multi-step bounce, sheen, or strong glow. The blur/dim backdrop is measured from `.app-panel-surface` and clipped to that exact rounded app frame, never the full WebView; sharp bars remain above it with subtle saturation/brightness only. The ~350px card keeps title/info/close → fixed slots 1–5 with per-slot reset → hue/chroma wheel + lightness/HEX → Apply. Per-slot reset and all edits are previews until Apply; X, Escape, or outside click restores the opening snapshot. No Cancel button, visible rule paragraph, recommended swatches, hue/chroma readouts, model names/Token counts/percentages, palette reordering, or Light/Dark overrides.
- Usage Trend custom-date picker: render it in a viewport portal above the chart Palette icon and use the exact same shared-element geometry morph as Model Palette (real source/destination rectangles, delayed content reveal, reverse close, source hidden until exit completes), but never add background blur/dim. Clicking outside, selecting a preset, applying a date, or Escape closes it; restore focus only after the closing morph finishes.
- Usage Trend hover details: use one interactive sidecar Detail Card that never covers the active bar. Every day/hour owns a full-height invisible X-slot so tiny bars remain easy to target; the slot itself is the only source of pointer retargeting—do not run a second global nearest-X scrubber. When a card is open, render a transparent DOM bridge from the active slot edge to the card so pointer travel to the CTA is physically protected from neighboring slots without timers or safe-polygon guesswork. Entering another slot immediately retargets; entering the bridge/card preserves the current node; leaving the overall chart/card region may dismiss it. Keyboard focus remains fully supported. The card shows period, Token total, ranked model composition, comparison metrics, and a prominent full-width CTA for that day/hour.
- Prompt Usage UX: preserve the project → session → prompt hierarchy as the primary/default browser. Timeline Explorer is a secondary view in the same page; it displays the selected range chronologically (oldest day first and earliest prompt first within each day), and its bounded default scope is the most recent 7 days and the UI must not expose an unbounded All Time option until the Timeline is virtualized/incrementally loaded. Keep Timeline visually flat (one content plane, lightweight filter strip, day rhythm/hairlines, no outer Card-within-Card or rounded prompt-row cards). Timeline rows keep a prominent event dot in its own dedicated rail column; when model-specific token metadata exists, use its token-dominant model and current rank palette; otherwise preserve an explicit Codex turn-context model as identity without inventing token attribution. Identity-only models sort after measured model ranks and must not reorder them. Only when neither source exists display localized Unknown Model with a fixed neutral marker. Never substitute agent names/roles such as Main Agent, generic Codex labels, or guessed GPT model names as model identity. The Timeline Prompt Inspector is an absolute right-side overlay and must never resize/reflow the underlying timeline; give that overlay enough width for the Token ledger identity column, and keep agent name plus prompt-share text single-line and fully visible (no truncation/ellipsis and no wrapping). Project Browser keeps its existing responsive inspector behavior. Do not spend page Y-space on the view switcher: keep Overview / Prompt Usage left-anchored beside the Brand at stable coordinates, and while Prompt Usage is active reveal Project Browser / Timeline in a separate contextual sibling zone to its right. Normal Header entry defaults to hierarchy. Usage Trend day/hour drill-down uses one persistent AppShell-level FLIP clock: the same card/action shells survive source lift and route change; Timeline first renders invisibly at final transform-free geometry, then the shells animate inverse translate/scale to identity while real Timeline/filter content hands off via opacity only. Never measure a moving destination, swap source clones mid-flight, animate drill-down `left/top/width/height` per frame, or let normal Timeline entrance re-trigger when the drill-down state clears. Clip all effects to the rounded app panel.
