# App State Architecture

## Product Scope

One More Prompt loads one data source: Codex. The native runtime and bundle script both enforce that allowlist. Old official provider folders are cleaned up safely, while unknown custom folders stay untouched and are not executed.

## Source Of Truth Stores

- `app-ui-store`: persisted navigation state and transient dialogs
- `app-plugin-store`: the Codex manifest, probe state, and local cache
- `app-preferences-store`: display, theme, tray, shortcut, notification, and system preferences

## Main Data Flow

1. `App.tsx` loads the single Codex manifest and preferences.
2. The probe hook refreshes Codex usage in the background.
3. The overview and menu-bar status read the same Codex view model.
4. A native watcher refreshes only the private Prompt Usage suffix when local Codex logs or task metadata change. The page defaults to recent-first order and selects the newest session with prompt details closed. New data does not replace a valid current selection, and the mounted page preserves its local browsing state across top-level navigation.
5. The native scheduler uses the configured cadence for full Codex refreshes whether or not a prompt is active. While a local Codex prompt is active, a lightweight Usage API rate-limit poll runs every 10 seconds, preserving the last good full snapshot on failure; one full refresh runs when the prompt finishes.
6. The native tray runtime receives the rendered provider icon bounds and rotates only that glyph around its own center while local Codex work is active. Adjacent quota text stays still. On macOS, when both account-level Session and Weekly limits are present, the default Dual Line style renders `5H` above `7D`; Weekly-only accounts do not expose that style. Windows Numbers keeps its orange integer still and uses taskbar appearance to select its contrast; complete percentages remain in the tooltip. Windows can rotate the provider glyph when no numeric quota is available. The rotation speed is saved in `app-preferences-store`. The native runtime keeps eligible glyphs moving while the panel is hidden without a WebView timer, regardless of system animation preferences.
7. Navigation writes the active top-level page to `app-ui-store` so reopening restores the last page.
8. The local HTTP API exposes only the cached Codex snapshot.
9. The panel starts as a transient tray surface. Pinning it moves it to a normal window level, keeps it visible when focus changes, exposes it in the Windows taskbar, and lets the header move it. The main-window capability must allow Tauri's start-dragging command for that header interaction. Unpinning restores tray anchoring, always-on-top placement, and hide-on-blur behavior.

## Startup And First Guide

Codex reading is always active, independent of credential detection or local
Prompt records. Startup repairs old disabled-Codex preferences and starts a
check. The native scheduler also ignores that old flag and continues checks at
the saved interval with the panel hidden. Sign-in and network errors do not
disable later attempts. Credential detection remains diagnostic information.

Manual launches reveal the existing Setup, release notes, or main window without
toggling it closed. One instance owns the tray and local cache; opening the app
again reveals that instance. Windows checks the actual foreground window before
hiding on blur, so focus inside its WebView does not hide the panel.

The centered setup starts with language selection, then the Codex-check welcome
and local-record result screen. Language must be saved before continuing; a save
failure keeps the screen available with an error. The guide host rereads the saved
language before initializing the demo and synchronizes the workspace preference.
First setup is required. Its completion flag and marker are independent of the
optional guide. Older completion records could also represent Skip, so they
require setup once. First setup rejects Skip; completing the result screen is
allowed even with no records or a scan error. An unavailable scan stays distinct
from an empty history, and Retry remains available.

The local check reports waiting, record discovery, file checking, and result
organization. Once the file count is known, progress uses real checked/total
counts, including cache-validated files. The percentage measures files, never
elapsed time. Checking every file does not enable Open Workspace until result
organization finishes.

Open Workspace completes setup and offers an optional three-stage, 20-step guide.
The guide uses isolated demo data in all nine supported languages, so it works
without sign-in or local history. Demo actions do not change Codex records,
account limits, or saved preferences. Completing or skipping it restores the
prior workspace, including filters, selections, and scroll position. Action steps
wait for the requested operation; reading steps use Continue. Back retains
completed operations. The guide waits for its native listener before reading
state; older pending reads cannot reverse a setup handoff or reopen a finished guide.

Settings → Support → Troubleshooting provides Replay Guide and Recheck Codex
separately. Replay Guide starts at the introduction without saved guide progress.
Recheck Codex opens the local-record and sign-in check, with Skip Setup available
after first setup. It never starts the guide. The check window opens before the
main window hides; a failure leaves Settings available and shows an error.

## Memory And Background Work

- Native update events share one cache read at a time. Events received during a
  read are combined into one follow-up read so the latest data is still shown.
- Overview reads the quota/chart prefix without parsing the prompt hierarchy.
  The running-task indicator reads project and Session activity metadata.
- Generated menu-bar Images are released after their native consumers finish,
  including failed updates. The displayed tray icon retains its own pixel copy.
- Timeline's minute clock pauses while the view is inactive or the panel is
  hidden, and refreshes when it becomes active again. Filters and selections
  stay in place.
- Pending cache writes share a stable snapshot and write buffered JSON directly
  to the temporary file. An update during a write keeps the older write snapshot
  stable and schedules the newer data for persistence.

## Guardrails

- Never load a plugin whose manifest id is not `codex`.
- Never delete an unknown custom plugin directory.
- Keep prompt content, project names, and session names local.
- Keep local prompt refresh separate from account and quota probes so log writes never trigger remote usage requests.
- Keep active-prompt quota refreshes in the native scheduler; the local watcher only publishes activity state and the private Prompt Usage suffix.
- Keep source state in stores and derive page-specific values in hooks or pure helpers.
- Do not mirror derived values into a second store through effects.
- Treat refresh, loading, empty, stale, and error states as explicit UI states.

## Workspace Navigation

Overview, Projects, and Timeline are peer destinations. The existing home/prompt-usage routes and hierarchy/timeline mode remain internal implementation details. Navigation does not reset the Timeline date scope. Visited Projects and Timeline views remain mounted to preserve local filters and selections; hidden views are inert and prompt readers are inactive. Explicit Timeline-to-Projects links initialize the requested prompt or Session.

Workspace changes take effect immediately; animation never delays routing or resets filters. Background data refreshes do not replay page transitions. Normal navigation uses only an opacity transition on the content surface, leaving chart and reader coordinates unchanged. A chart-to-Timeline drill-down keeps exclusive control of its existing shared-element transition. The app uses full animations regardless of system animation preferences, with no separate motion-mode setting. The temporary A/B/C design comparison control is no longer part of the app.

## Overview Measures And Error Recovery

Overview starts with Today. The measure is local view state. Switching Tokens/API
Valuation preserves the date selection and Token-ranked model palette. Raw Token records stay intact;
cost geometry uses the known USD amounts and display text uses the saved currency.
Daily and hourly model records retain exact prices and their completeness status.
Unknown prices remain unknown, including after duplicate hourly records merge.

Guide targets use explicit chart markers, so the first step does not depend on
`:has()` selector support. Root render failures show a localized reload action;
uncaught frontend errors are logged by category and component location without
logging error messages or payloads that may contain local Prompt text.

## Timeline View And Execution Time

The selected date scope controls which records are explored. Timeline pan, zoom, navigator edges, and horizontal scrollbar share one viewing window inside that scope. They do not rewrite the date filter or automatically scroll Session rows. One vertical scroll position keeps the Session names and chart rows aligned.

Project and Session summaries derive overall values from the unfiltered selected record, while their visible Prompt list keeps its current filters. Prompt duration comes from recorded start/completion timestamps; active records use elapsed time. Missing end times stay unknown. Project and Session totals show `>` before a calculable duration when any Prompt lacks time or is still running; a fully recorded finished scope has no prefix, and a scope without any calculable duration stays unrecorded. Hover, focus or click a weekly or execution-time value to see its coverage counts; a weekly warning belongs to the same trigger. Weekly detail distinguishes numeric availability from completeness, while execution-time detail distinguishes included and excluded Prompt counts. Time uses Prompt units; weekly coverage uses independent Session groups. Counts do not take up space in the default summary, and there is no running-count line. Escape dismisses this small detail without closing the Prompt inspector. Concurrent durations are added rather than merged. Official partial weekly values retain their numeric percentage and a warning; unavailable values remain unknown. Weekly coverage counts independent Session groups, including unqueryable groups in the denominator. A recorded percentage does not prove complete data.

Weekly, Time and Timeline question marks open modal explanations on click. They share the existing source-to-card animation, restrict the blur to the app frame, keep focus inside while open, and restore the source after closing. Source buttons stay hidden until their closing animation finishes.

Timeline groups resolve marker collisions at the current zoom and plot width over the complete filtered period. The period supplies group membership and the Token maximum; panning only selects intersecting groups. Singletons keep exact timestamps and groups always expose their count. The grouped reader retains original Prompt IDs and chronological order. Record selection updates the details inside that reader; it does not open a second overlay. Narrow layouts retain the mounted list and its scroll position while displaying details.

Bulk read updates clear only the captured unread completions. Active observations remain intact; Undo merges eligible captured completions with newer unread results. A rerun invalidates eligibility for an earlier completion. Neither action changes source Codex records or the current filters.
