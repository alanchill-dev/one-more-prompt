# Codex

> Reverse-engineered, undocumented API. May change without notice.

## Memory Use

Local Token statistics read session logs one line at a time, with at most four
files being processed together. The loader releases large temporary line buffers
after use. An unusually large single log line can still cause a temporary spike;
the reader does not discard records to enforce a size limit.

The Overview and running-task indicator read only the summary they need.
Detailed Prompt Usage data remains available to the history browser, with the
same Token, model, cost, date, and selection behavior.

## Before Your First Local Record

Codex reading stays enabled even before sign-in. The app checks on launch and
at the saved update interval while running, including with its window hidden.
Legacy disabled-source settings no longer stop these checks. A missing or
expired sign-in and a connection failure keep their normal messages and do not
disable future updates. Available account limits do not require local Prompt
history; signing in and creating local records remain separate steps.

Automatic checks report failures in the workspace while retaining the last good
values. Reopening the panel or updating local history does not clear that warning
with an older cached result. A newer successful check clears it. Background
checks do not finish or consume a manual check that is still running.

With no local records to show, Overview, Projects, and Timeline explain how to
start a Codex session on this computer and offer **Check For Records**. This
uses the existing record check; it does not install Codex or sign in for you.
Prompt history stays on this computer.

A repeat check from an empty Overview keeps the instructions visible and
disables the button while checking. Codex's expected initial sign-in request
also shows preparation instructions when there are no records to display.
This does not prove that Codex is uninstalled or that history does not exist;
sign in through Codex and check again.

Loading, parsing, expired-session, network, and read failures keep their separate
messages. Existing prompt history keeps its sign-in warning. Available account
limits or activity are still shown, and a filtered view with no matches does not
show first-use instructions.

## Overview

- **Protocol:** REST (plain JSON)
- **Base URL:** `https://chatgpt.com`
- **Authentication:** existing local Codex sign-in, read-only
- **Percentages:** provider-reported values (normally 0-100; observed decimals are preserved)
- **Timestamps:** unix seconds
- **Window durations:** seconds (18000 = 5h, 604800 = 7d)

## Endpoints

### GET /backend-api/wham/usage

Returns rate limit windows and optional credits.

#### Headers

| Header | Required | Value |
|---|---|---|
| Authorization | yes | `Bearer <access_token>` |
| Accept | yes | `application/json` |
| ChatGPT-Account-Id | no | `<account_id>` |

#### Response

```jsonc
{
  "plan_type": "plus",                     // plan tier
  "rate_limit": {
    "primary_window": {
      "used_percent": 6,                   // % used in 5h rolling window
      "reset_at": 1738300000,              // unix seconds
      "limit_window_seconds": 18000        // 5 hours
    },
    "secondary_window": {
      "used_percent": 24,                  // % used in 7-day window
      "reset_at": 1738900000,
      "limit_window_seconds": 604800       // 7 days
    }
  },
  "code_review_rate_limit": {              // separate weekly code review limit (optional)
    "primary_window": {
      "used_percent": 0,
      "reset_at": 1738900000,
      "limit_window_seconds": 604800
    }
  },
  "credits": {                             // purchased credits (optional)
    "has_credits": true,
    "unlimited": false,
    "balance": 820.6969075                 // remaining credits
  },
  "spend_control": {                       // Business workspace limit (optional)
    "individual_limit": {
      "limit": "15000",                   // monthly credit allowance
      "used": "3831.746052503586",
      "remaining": "11168.253947496414",
      "used_percent": 26,
      "remaining_percent": 74,
      "reset_at": 1785542400
    }
  },
  "rate_limit_reset_credits": {            // on-demand resets count only (optional)
    "available_count": 1
  }
}
```

Both rate_limit windows are enforced simultaneously — hitting either limit throttles the user.

One More Prompt floors the remaining credit balance to a whole number and uses
USD 0.04 per credit as its source value. The displayed equivalent uses the selected
currency and its code, while the credit count stays unchanged. For example,
820 credits at a TWD rate of 32 displays `NT$1,049.6 TWD · 820 credits`.
Without a reference exchange rate, the amount is unavailable and the credit count
remains visible. The credit balance is unbounded; the API does not provide a maximum.

Business workspaces may hide the purchased-credit balance and return a monthly per-member limit
under `spend_control.individual_limit` instead. One More Prompt shows that allowance as a **Monthly Credit
Limit** meter using the reported `used`, `limit`, and reset time, without treating a missing balance
as zero credits. Credit amounts are rounded to whole credits. The meter appears in both the overview
and Codex detail views.

### GET /backend-api/wham/rate-limit-reset-credits

Returns banked on-demand rate limit resets, including each credit's expiry time.

#### Headers

Same as `/wham/usage`.

#### Response

```jsonc
{
  "available_count": 1,
  "total_earned_count": 3,
  "history_enabled": true,
  "credits": [
    {
      "id": "RateLimitResetCredit_…",
      "reset_type": "codex_rate_limits",
      "status": "available",               // or "redeemed"
      "granted_at": "2026-06-17T00:38:38Z",
      "expires_at": "2026-07-17T00:38:38Z",
      "redeem_started_at": null,
      "redeemed_at": null
    }
  ]
}
```

One More Prompt displays the available reset count in Overview. Opening it shows each available
credit and its expiry, including separate credits that expire together. Credits are ordered by
expiry, with unknown dates last. Missing or invalid dates stay unknown. Profile details, grant
descriptions, and purchase eligibility are not passed to the interface.

If this endpoint fails, the app keeps the count from `/wham/usage` and explains that individual
credit details are unavailable. A missing or incomplete credit list is also unavailable rather
than being presented as a complete list. This view is read-only and cannot redeem a reset.

### GET /backend-api/wham/rate-limit-reset-credits/history

When `history_enabled` is true, a normal account refresh also fetches the official reset history.
The history is limited to the server's recent 30-day window. Each event supplies its actual time:

```jsonc
{
  "events": [
    { "id": "event-1", "kind": "used", "occurred_at": "2026-07-01T12:00:00Z" },
    { "id": "event-2", "kind": "granted", "occurred_at": "2026-06-17T00:38:38Z" }
  ],
  "window_start": "2026-06-14T00:00:00Z",
  "as_of": "2026-07-14T00:00:00Z",
  "next_cursor": null
}
```

`granted` means a reset was received; `used` means one was used. Usage dates come from
`occurred_at`, never an expiry date or a guessed date from changes in the available count.
The app follows `next_cursor` using `?cursor=...`, collecting up to 10 pages within an 8-second
history budget per refresh. Each request uses the remaining budget, capped at 5 seconds.
Repeated cursors, unknown event kinds, invalid event dates, and interrupted pagination leave an
explicit partial-history state and a diagnostic warning. A failed first history request is
unavailable; `history_enabled: false` disables history. Available credits remain usable when
history cannot load. History is not reconstructed or saved as a separate local ledger.

The existing `resetExpiry` array remains in usage snapshots for external clients. The richer
`resetCredits` payload carries individual credits, history state, and the server's history window.

## Authentication

### Credential Storage Locations

Codex CLI supports multiple credential storage modes:

- **file** (default): `CODEX_HOME/auth.json` (or `~/.codex/auth.json` by default)
- **keyring**: OS keychain/credential manager entry (service name `Codex Auth`)
- **auto**: keyring first, fallback to file
- **ephemeral**: memory-only (no persistence)

For `keyring`/`auto`, Codex may not keep `auth.json` on disk. If keyring save succeeds, Codex removes the fallback `auth.json`.

One More Prompt Codex plugin auth lookup order:

1. `CODEX_HOME/auth.json` (when `CODEX_HOME` is set)
2. `~/.config/codex/auth.json`
3. `~/.codex/auth.json`
4. macOS keychain service `Codex Auth` (macOS fallback only)

If file-based credentials are missing, invalid, or rejected during usage lookup, One More Prompt tries the macOS keychain fallback. Non-auth usage failures, such as server errors or invalid responses, are shown directly. A sign-in change during a query discards that result instead of falling back to another account.

Keychain fallback is available on macOS only. The Windows unsigned portable package
requires one of the file locations above; Windows Credential Manager support is
not implemented yet.

Expected auth payload shape (file or keychain JSON value):

```jsonc
{
  "OPENAI_API_KEY": null,                  // legacy API key field
  "tokens": {
    "access_token": "<jwt>",               // OAuth access token (Bearer)
    "refresh_token": "<token>",
    "id_token": "<jwt>",                   // OpenID Connect ID token
    "account_id": "<uuid>"                 // sent as ChatGPT-Account-Id header
  },
  "last_refresh": "2026-01-28T08:05:37Z"  // ISO 8601
}
```

> Note: Codex also stores MCP OAuth tokens in `~/.codex/.credentials.json` (or keyring), but that is separate from ChatGPT CLI auth used by this plugin.

## Overview Usage Trend

The Overview keeps the Today, 7 Days, 14 Days, and 30 Days presets. It also offers Custom with
Single Day and Date Range modes. Custom dates cover the most recent 365 selectable calendar days;
date ranges include both their start and end dates, and the same start and end date is treated as a
single day. Selecting a historical single day loads that calendar day's hourly activity on demand;
it does not fall back to a surrounding 30-day view. The Custom calendar is portaled above chart-local controls so it
always covers the Model Palette icon when their screen regions overlap. It uses the same shared-element container morph
as Model Palette: the real Custom trigger stays hidden for the entire open/closing transition while a temporary shell
tweens its actual viewport `left/top/width/height/border-radius` into the calendar card; calendar content reveals only
after the shell has expanded, and closing reverses that geometry before the trigger returns. This transition never adds
background blur or dimming. The calendar closes when focus moves to another control, when a preset is selected, after a
date is applied, or when Escape is pressed.

The daily history load includes one additional comparison day, while the Overview preserves exact
calendar-day totals for every displayed range. Dates with no recorded events appear as zero instead
of being removed from the timeline. Only dates and hours with recorded Tokens open a detail card.
Long ranges reduce labels for readability, but their daily values,
summaries, model composition, tooltips, and accessible data rows remain exact.
Ranges up to 60 days label the first day, last day, and weekly intervals; longer ranges label month
starts instead. Interior labels immediately beside either endpoint are omitted to prevent collisions.

Today and historical single-day selections use an hourly view built from local Codex usage-event
timestamps. Historical hourly rows are queried only after a day is selected rather than being loaded
for the full 365-day window. The current hour is partial, future hours stay unobserved, and each hour
includes its per-model Token totals. A historical query failure is shown separately from a day with no
activity. The view shows when usage events were recorded; it does not reconstruct the minute-by-minute
generation speed of a request that crossed an hour boundary.

Daily and hourly views use the same zero-baseline solid stacked signal columns. Each column's full height
represents the total Tokens recorded in that date or hour. Model color is rank-based rather than tied to a permanent
model identity. For each current selection (Today, 7/14/30 days, a single historical day, or a custom range), the app
aggregates per-model Tokens across that selection, sorts descending, and assigns ordered palette slots 1–5. Canonical
model name is only a deterministic tie-breaker and spelling-normalization mechanism; it does not own a color. The same
ranking-to-color mapping is then held constant across every bucket in that displayed chart. Switching the selected
period intentionally recalculates the ranking, so the same model can receive a different slot when its usage rank
changes. Models below rank 5 are combined as neutral **Other**. A thin separator remains between adjacent model
segments. If a bucket total is greater than the sum of its known model totals, the difference is shown separately as
**Unattributed** rather than being hidden in Other. This keeps the total height and every visible segment proportional
to recorded Token values.

The full-width band below the active chart is **Period Model Composition** and uses the same selected-period ranking.
It sums each model's Tokens across the selected period and calculates each model's share of that combined total; it is
not the arithmetic average of daily or hourly percentages. Hovering or keyboard-focusing a model promotes its current
rank-slot fill one step brighter across every visible column while dimming the other model segments; leaving the
interaction restores the idle color. Overview exposes Model Palette as an icon-only 44px Palette control in the plot
area's upper-right, positioned just below the top Y-gridline. Opening snapshots that button's viewport rectangle and
uses it as a true shared-element source. The real trigger remains hidden while a temporary container shell animates its
actual `left/top/width/height/border-radius`, background, border, and shadow from the 44px button into the final card; the
Inspector content is delayed until the shell has physically created enough space. Closing runs the same geometry in
reverse and only restores the trigger after the shell reaches its source rectangle. There is only a tiny final settle,
with no heavy blur, multi-step bouncing, fake sheen, or strong glow. The Inspector does not change chart geometry and is
constrained to the visible viewport so chart/app overflow cannot clip it. The same
persisted ordered `modelPalette` is available from Settings. Users edit color slots rather than model names. The Inspector
omits current model names, Token totals, shares, and selected-range ranking details so the task stays focused on the ordered
palette. It uses a shorter focused-palette card (~350px high): a title row with clickable info and close, five fixed circular
slots across the top, each with a small reset-to-default action beneath it, then a compact large draggable hue/chroma wheel
on the lower left with lightness and HEX controls on the lower right. A single **Apply** action sits in the footer. Per-slot
reset changes are previews and are only persisted with Apply. Interior regions use spacing instead of horizontal divider
rules. There is no visible Cancel button, rule paragraph, recommended swatches, hue/chroma readout, or palette reordering
control. All edits are transient previews until the user presses **Apply**. Closing with X or Escape, or clicking outside,
restores the palette snapshot from when the Inspector opened. While the Inspector is open, the blur/dim backdrop is
measured from `.app-panel-surface` and clipped to that exact rounded app frame rather than covering the full WebView. The
currently rendered stacked-bar segments are cloned into a sharp overlay above that blur with only subtle saturation and
brightness emphasis so the colors being tuned remain crisp without glowing. There are no user-facing per-theme color
overrides; theme adaptation is automatic. No current model-to-slot assignment is persisted; it is derived from the active
period each time the chart is rendered.
Tooltips and accessible data rows retain the exact bucket totals and known model breakdowns. Other and Unattributed
remain visually distinct in the columns. Today and historical single-day charts use the same responsive chart
footprint and column entrance animation as the multi-day chart, regardless of system animation preferences.

The Overview measure switch beside the period label offers **Tokens** and **API Valuation**.
It preserves the selected dates and changes the total, average, peak, columns, axis,
model composition and hover details together. Currency follows the saved display currency.
Model colors stay ranked by recorded Tokens within the selected period, even while
comparing costs. Each model is valued using its own recorded input, cache and output
amounts and price; costs are never divided in proportion to Token totals.

Missing prices display a dash. A partially priced period shows the known subtotal;
hovering or focusing a day/hour shows its incomplete-price status in the Detail Card.
The Overview summary has no separate pricing-basis line. Empty recorded periods
can show a truthful zero. Unpriced or zero-cost work remains available through
the chart's day/hour interaction. Estimates describe corresponding API usage,
not subscription charges.

## API Cost Estimates

Each usage scan retains the model, billable Token categories, unit prices,
category fees, pricing status and price observation date used to produce an
estimate. Model subtotals reconcile with the reported total. Missing prices
remain unknown, and different price snapshots remain separate. Daily and hourly
chart model entries carry their own costs and pricing status rather than
assigning costs in proportion to Token totals.

One More Prompt estimates what the recorded Tokens would cost through the API. These values are not ChatGPT
charges or per-prompt quota percentages. Concurrent prompts are not allocated a share of the account percentage by their estimated costs. Current USD prices come from the app's 24-hour LiteLLM cache, with the bundled snapshot available
offline.

LiteLLM does not publish verified price-effective dates. Historical days and Prompt Usage therefore use the
current rate and carry the `current_rate` status. `historical_rate` is reserved for a future verified history.
When a usage group mixes priced and unpriced models, the priced portion is preserved and marked
`partial_rate`; the UI labels it as an estimate from available rates. If none of the used models can be
priced, the amount is omitted instead of being shown as zero or as a misleading textual price state.
Codex's internal `codex-auto-review` accounting entry is excluded from API valuation and does not make an
otherwise priced summary partial.
`observedAt` records when One More Prompt downloaded a price document; it is not an effective date. Settings can
show the models currently visible in Codex and manually check LiteLLM for an update. When Codex's local model
catalog is unavailable, Settings uses the app's bundled Codex model list. The four prices are read-only per-one-
million-Token rates for input, cached input, cache writes, and output. Pricing Information also identifies the
model-list source, price source and observation time, exchange-rate source, and offline retention behavior.

Open an API amount to see the actual model calculations: billable Tokens divided
by one million, multiplied by each category's price. Source prices remain USD;
the displayed unit prices, category fees and subtotals use the selected currency
and the same reference exchange rate as the total. Category fees add to
each model subtotal and the reported total. Displayed operands and amounts use
at most two decimal places; calculations retain their full precision before
rounding. Currency conversion also retains full precision. The explanation uses the same price
snapshot as that estimate, and identifies missing prices or incomplete usage.
Older records without calculation details never receive invented operands.

## Display Currency Rates

Token costs are calculated in USD first. When another display currency is selected, One More Prompt uses
USD-based reference rates from Frankfurter for TWD, EUR, JPY, GBP, CNY, and KRW. USD always has a rate of
1. Rates are cached for 24 hours. If a refresh fails, the last successfully downloaded rates remain available
and are marked as stale. A currency with no downloaded rate remains unavailable instead of being shown as zero
or an estimated value.

Overview, Projects and Timeline use explicit currency symbols, such as `NT$`
for TWD and `CN¥` for CNY. The Overview total and calculation total also show
their currency code. Project/Session summary amounts omit that code and stay
beside the Token total on one line, shrinking only the amount text when needed.
The calculation total keeps its code as a small orange label beside the amount.
Small chart values retain enough decimal places to stay distinguishable from zero.

## Prompt Usage

The Prompt Usage page reads local Codex session logs in both `.jsonl` and
Zstandard-compressed `.jsonl.zst` form. Overview's daily and hourly usage reads
the same two formats. Compressed files are decoded as streams without changing
Codex's files or creating decompressed copies beside them.
One More Prompt indexes all discovered session files and caches parsed results under the Codex plugin data
directory; unchanged files are not reparsed on every refresh. Parser updates invalidate the cache so
older results cannot keep stale session identities or accounting. Compression keeps the same logical
Prompt IDs, so changing a file's container does not reset its read state or selection.
Overlapping and continued sources are reconciled using their thread and turn identities.
Distinct requests in continued sources are added once, including when only part
of the sources overlap. Copies of the same request are not added twice. Different
threads keep their own usage even when their timestamps and Token counts match.
A directory-listing, record-read or decompression failure reports an error instead of treating an incomplete scan as successful. The last successful parsed index is kept when a directory or entry cannot be read; Codex's original files remain unchanged. A missing initial history directory is a normal empty result, and unrelated file leaves are not treated as directories.
The initial local history scan has a five-minute limit for large archives; active account checks keep
their shorter timeout. Setup progress counts actual completed files, including compressed files,
and subsequent scans reuse unchanged parsed records.
Project names, thread titles, and project membership
are read from Codex's own desktop state so they match the Codex interface. Explicit thread-to-project
assignments remain authoritative even when Codex has not yet rewritten its sidebar order; that order is
used only to arrange sessions it already contains. Working-directory matching is used for older state
without an explicit assignment. The latest valid name in Codex's session index takes priority over the current SQLite name and its
older first-prompt title. Delegated task envelopes are decoded to their input text, never shown as XML,
and display names are normalized to a maximum of 80 characters. Routing-only skill, handoff path, and target
metadata is replaced by the neutral `Delegated Task` label. When the source thread is still available
in Codex's local index, the delegated task stays beside it in the same sidebar order and the session list exposes
same-level source and destination navigation. Opening the source also exposes links to its related delegated tasks;
missing sources show an unavailable label. Projectless threads appear directly as named sessions.
Top-level items are ordered by their newest user prompt. Sessions explicitly listed in a project follow the
same sidebar order as Codex; only older unlisted sessions fall back to newest first.
The prompt list shows `Sent To` or `From` beside the time only for the prompt whose paired relationship metadata
records that direction. The prompt inspector keeps the same relationship label inline with that prompt's metadata;
the session-level task links remain available only in the left relationship rail, and another prompt in the same
session does not inherit its relationship.

The parser accepts both legacy `event_msg / user_message` records and current `response_item / role=user`
records. When Codex persists both forms for one prompt, equivalent records within the same active turn are
deduplicated; separate prompts with the same text remain separate. Codex-injected environment and plugin
context envelopes and writing-block edit metadata are ignored rather than displayed as user prompts.

Interrupted requests remain in history, including requests stopped before any usage was recorded. They show
`Interrupted`; when the local logs contain no Token measurement, the prompt shows `No Token Data` instead of
zero and its inspector leaves usage and API estimates blank. An explicitly recorded zero still displays zero.
An interrupted attempt with zero usage across all agents is combined with the immediately following identical prompt when retried within 60 seconds and that retry has measured usage. Both browsers show the retry once, with its own timestamp, unchanged usage, and a Retried After Interruption label; original log records remain untouched. Modified text, later repetitions, and attempts with any usage remain separate. These labels do not change measured Token totals.
Running indicators follow the active prompt recorded in the session lifecycle. The project browser shows that
status in its Session navigation, current prompt and Inspector; Timeline shows it on the Session lane, event or
group, reader and Inspector. Older prompts in the same Session remain still, including when filters hide the
active prompt. Completion, interruption and stale activity stop the indicator. System animation preferences do not stop an active indicator.

After an observed running prompt stops, an orange unread dot appears on that prompt and its Session/project in Project Browser. Opening only a project or Session leaves the dot in place; opening the completed prompt clears it. If its completed result is selected in the visible Project Browser or Timeline, it is considered read. Opening a Timeline group alone does not clear unread results. Other unread prompts keep their parent dot visible. The app saves these markers locally across restarts; the first load does not mark all existing history unread, and missing/loading records do not imply completion. Mark All As Read clears current unread results across every project, including results hidden by date or search filters. The action shows the unread count and is hidden when none remain. Brief feedback at the bottom of the app offers Undo without moving the list; Undo restores the cleared results without removing newer unread results. Running and future completions stay tracked, and rerun results do not inherit an older completion’s Undo state.

Clicking a Project folder only expands or collapses its Session list, keeping the current Project, Session, Prompt and Inspector unchanged. Select a child Session to switch conversations; standalone Session rows still open directly.

Project Browser and Timeline share one saved Session pin list and order. In Project Browser,
pinned Projects appear first as expandable folders, followed by pinned Sessions with their
project name, without a duplicate
row in the hierarchy below. Pinning or reordering does not change the selected conversation
or Prompt. The same pin control, drag ordering and Alt+Up/Down ordering work in both views.
Changing dates keeps pinned Sessions visible even when they have no activity in that period;
their Prompt list still contains only the selected dates. Search and project filters still
apply, and hidden pins return when those filters are cleared. Pins survive app restarts.
Project folders have their own saved pin order in Project Browser. An empty date range keeps
the pinned folder, while its unpinned child Sessions still follow the date filter. Expanding a
pinned Project only opens its Session list; it does not select a different conversation.
Long expanded pinned folders scroll within the left list so the other entries remain reachable.

Project Browser uses the same date-range and project selectors as Timeline. Both start with **30 Days** and all projects. The 7, 14, and 30 Days filters include all of today in local time, so newly received prompts appear without waiting for the next minute. Date filtering uses each prompt's send time; Unpinned Sessions and projects with no matching prompts are hidden. List counts and sort totals reflect the selected dates. Project and Session summaries retain their complete-scope counts, Tokens, API estimates and execution time as the visible list is filtered. Multiple projects can be selected together, including standalone entries. The two workspaces keep their filters independently.

Project Browser defaults to **Recently Updated**. Other sort choices are **Most Prompts**, **Most Tokens**, **Name**, and **Codex Sidebar**. They order projects and Sessions, leaving the prompt list order unchanged. Sorting uses activity within the selected dates, before text search narrows visible prompts. Codex Sidebar follows the recorded project/sidebar order from Codex; entries without a recorded order appear later. Equal values use name and ID to keep ordering stable.

Changing filters keeps the current selection when it still matches and closes prompt details when the selected prompt is excluded. Opening a historical prompt or Session from Timeline chooses a date that includes the target. Following a related Session also makes its target accessible instead of leaving it hidden behind the current filters.

The app has three peer workspaces in the centered navigation: **Overview**, **Projects**, and **Timeline**.
Projects keeps the **project → session → prompt** hierarchy. Timeline offers chronological exploration of the same records.
Projects and Timeline preserve their current selection, filters, prompt details, and viewing position while switching workspaces.
Opening a specific prompt or Session from Timeline explicitly locates that item in Projects. Settings and window pinning remain
separate actions.
Timeline starts with a shared time axis and one lane per Session. A single Prompt always uses a line at its actual send time. Nearby marks combine only when they would collide at the current zoom and plot width. A group always shows its Prompt count inside its marker; counts are never hidden or placed above a line. Crossing a one-day viewing span does not change these rules.

Groups are computed over the complete filtered period, so panning preserves their members and Token scale. Changing zoom or plot width may change groups. Marker height reflects combined Tokens using the same bounded square-root scale. A group’s width fits its count; it does not represent execution duration. Mixed-model groups use a neutral marker, and each Prompt keeps its actual model identity in the details. Every original Prompt remains directly selectable in the group reader.
Interaction targets do not determine visual grouping. The time axis fills the workspace for both single-day and
multi-day views. The selected date range is the total exploration scope; a detailed viewing window shows part of
it. The range navigator labels hours for a single local day and calendar dates for multiple days. Dates use
year/month/day order (for example, 2026/8/9). Single-day labels show every hour when space allows,
including 01:00 and 23:00; narrower windows use evenly spaced hour labels while retaining hourly ticks. Clicking centers its selection on that time, clamped at the
boundaries. Dragging preserves the grab position and follows the pointer continuously without minute snapping;
wheel or trackpad movement over the navigator also moves the orange window without clicking. Both vertical and horizontal gestures work there; keyboard navigation remains available. The detailed axis adapts its ticks to the visible span. Scroll over the right chart to move time horizontally; scroll over the left Session names to browse rows vertically. The left vertical scrollbar moves both names and chart rows together. The bottom horizontal scrollbar moves the same time window as the orange navigator.
Drag blank chart space or the orange frame's grip to pan. Drag the orange frame's outward triangle handles or use Alt/Option plus wheel over the chart to zoom. The enlarged resize targets remain separate on opposite sides even for a very narrow range, and turn inward at the navigator boundaries. The grip remains below the frame at every width and shows the visible time span. There is no separate zoom toolbar. These controls change the viewing window, never the selected date filter. Time navigation preserves the Session list's vertical position. Explicit activity indicators and Locate On Timeline still reveal offscreen Sessions. Ctrl plus wheel and pinch gestures remain available to the system.

Clicking a record mark in the range navigator brings its time and Session into view. When more than one
Session has a record at that same instant, an already visible Session is preferred, otherwise the nearest
row is used. Clicking empty space moves only time. A drag or cancelled gesture never triggers this jump.
The navigator remains focused, and the selected filters, Session, and prompt do not change.
Selecting a Session highlights its marks in orange across the full range navigator and dims the other marks.
Selecting it again clears the emphasis; mark positions and the viewing window stay unchanged.

Lightweight indicators at the inside top and bottom edges of the chart count offscreen Sessions with records in the current time
window. Selecting a single Session hides both indicators; clearing the selection restores them when relevant. They do not count prompts or Sessions with no activity in that window. Clicking an indicator brings
the nearest relevant row into view without moving time or applying a Session filter; keyboard focus follows
the destination row. Indicators float inside the chart without resizing the scroll viewport as counts change.
Manual wheel input or a new navigator gesture interrupts a programmatic vertical scroll. System animation
preferences do not change its smooth movement. No new activity, filter refresh, or background data update triggers an
automatic vertical jump. An open reading layer pauses time navigation and hides these indicators.
Click or keyboard activation of the question mark opens Timeline help; hovering alone does not open it. The help panel explains send-time position, Token usage by bar height, grouped-prompt counts, and model colors, followed by time navigation and Session focus. Model colors follow usage rank within the selected period; unknown models use a neutral color. It can be dismissed with Escape, its close button, or an outside click.
Session titles include a pin toggle. Multiple Sessions can be pinned; the most recently pinned appears first, followed by the other pins, then the remaining Sessions in their original order. Pinned Sessions stay below the time axis while the other rows scroll vertically. Unpinning restores the original order and normal scrolling. Pins and their order are saved locally and survive app restarts. Pinned rows remain present across every date range, even when they have no activity in that range; only in-range events are drawn. Project, model, and search filters still apply. Drag a pinned Session title onto another pinned title to reorder them, or focus its title and use Alt + Up/Down. Unpinned rows keep their original order. Pinning brings the top of the list into view without changing time or Session focus. Rows animate to their new positions regardless of system animation preferences.

All Sessions remain accessible through ordinary vertical scrolling. Live updates preserve the viewing
position; changing the date scope starts a new exploration.
No record list is open initially. Bars have a small pointer allowance, up to 5px on each side, narrowed between neighboring bars so targets do not overlap. Empty chart space does not open a preview. Leaving a bar starts a quarter-second grace period. Entering the card or returning to the bar cancels that countdown; otherwise the card begins closing after a quarter second. Leaving the card starts the same grace period. Another bar changes its content immediately; clicking outside or Escape dismisses it immediately. The card remains mounted until its closing animation finishes. Keyboard focus still opens previews. A preview keeps a fixed edge during its fade-in so the passage stays connected, and an unchanged event remains open during background data refresh. Moving over an event reveals a temporary preview without moving keyboard
focus or pinning the reader. The preview stays usable while the pointer moves into it; leaving the overall chart/card region dismisses it. Its transparent passage ends at the near edge of the active bar, so moving toward a neighboring bar on the opposite side can retarget immediately. If another bar lies inside the passage itself, hovering or clicking that actual bar takes priority over keeping the current preview open. Empty passage space still protects travel into the preview. Single prompts use a preview beside the active mark with the Project Browser detail content: full prompt text, copy action, Token and agent breakdowns. Group previews show their send-time range, count and combined Tokens, with an action to open the full list. Its content scrolls within the card without moving the chart or dismissing the preview. API-equivalent explanations remain interactive; Escape closes that explanation before closing the preview. The persistent Open In Project Browser action opens the exact prompt and uses the whole card as its transition source. Clicking a grouped mark or its preview action opens the same grouped reader; individual records are directly selectable instead of paged one at a time.
Click or keyboard activation opens the full reading layer. Selecting a count marker opens its prompts and exact send times in an
overlay reader; selecting a single marker opens its prompt Inspector. Opening either overlay preserves the
chart width, time scale and scroll position. Selecting a Session highlights it and dims the other rows.
All rows, navigator records, counts, and Token scales stay in place. Selecting the same Session again clears the highlight; selecting another transfers it.
Changing the date scope clears the Session selection; other filters also clear it when the selected Session no longer matches.

Group records are ordered chronologically and use the same Prompt rows as Projects, including time, status, unread marker, Prompt text, Tokens and selection. Model identity remains available in the Prompt details. On wide windows, selecting a record updates its details beside the list. On narrow windows, details replace the list with a Back To Prompt List action; the list keeps its reading position and selection.
Close, Escape or an outside click dismisses the active reading layer. Hovering or focusing a record highlights
its chart marker without scrolling. Locate On Timeline explicitly scrolls to that Session. Change the time
scope through the date filter; there are no Focus Active Time or Return To Time Overview controls.
New log updates do not repeatedly zoom or replay the transition. Dragging blank chart space pans time without applying a date filter. Small clicks still activate records; cancelled gestures do not move the filter. Hover previews pause during dragging.
The Custom date filter uses the same calendar as Overview, with Single Day and Date Range in one picker.
Both modes stay as drafts until Apply Filter. Single Day always shows start and end times, initially
00:00–24:00 for a full day; reopening a selected time window preserves its times. Escape or an outside click dismisses an unfinished selection. Calendar dates begin at the oldest
available prompt and end today. The date filter can narrow further to a chosen time window. Model identity and token attribution are deliberately separate: token-backed `models[]` metadata determines the
dominant model when observed token usage exists, while an explicit `turn_context.model` remains a valid identity fallback
when no model-specific `token_count` attribution is available. Identity-only models appear after token-ranked models and do
not reorder the measured palette ranks. Only prompts with neither source show the localized Unknown Model state with a fixed
neutral marker; agent names/roles such as Main Agent and generic guessed model labels are never substituted as model identity. Timeline
deliberately stays on one visual plane: there is no outer rounded dashboard card and no rounded card per prompt; the filter
strip, day spacing, hairlines, and right Inspector provide the hierarchy. In Timeline mode the Inspector is a right-side
overlay and never changes the underlying row width or wrapping. Project Browser retains its original responsive behavior:
from 1100 pixels wide, projects, prompts, and the selected prompt details appear side by side in three columns;
narrower windows use the existing detail overlay.
Its filter lens accepts one bounded shared `UsageTimeScope` (`today`, 7/14/30 days, one day, one hour, or an inclusive date
range, a custom time window within one day, or an exact dragged interval), plus model, multiple selected projects, and free-text filters. No project selection means all projects; selected projects are combined, then intersected with the other filters. Counts, navigator activity, and lanes share the same filtered records. Custom time windows include the start
and exclude the end; 24:00 means the end of the selected local day.

Model palette ranks continue to use the full selected time range.
Changing time, model, project or search closes open reading overlays. Session focus does not filter records or close a reading overlay. Model ranks use the whole time scope, so focusing a
Session does not recolor the timeline.

Project Browser and Timeline both default to the most recent 30 days. Timeline starts with no prompt selected.
An empty selected period stays empty and offers an explicit link to the latest active day; it never silently changes the date.
Today and the 7/14/30-day presets remain available, and there is no unbounded All Time option.
Usage Trend keeps day and hour details stable while the pointer travels from the active column into the detail card.
The protected passage spans the full column height and actual card height across the narrow gap between them, so fast or diagonal movement stays protected; clicking the same column keeps it available.
Moving directly into another column with Tokens outside the passage changes the displayed period immediately.
An empty day or hour does not open details. Entering its slot outside the protected passage closes the current
card. Keyboard navigation skips empty slots; small columns with recorded Tokens keep their full-height target.
Usage Trend day and hour details offer separate actions for Project Browser and Timeline. Either action opens the chosen view
with that exact day or hour selected and clears unrelated search, project, and model filters so they cannot hide the requested
activity. Both actions preserve the selected date or hour through the transition. The source responds before destination filtering starts. After arrival, the time filter displays a brief range-location confirmation
to connect it to the selected chart period. It clears after three seconds or when the filter is used.
The user can change the resulting time filter or switch views at any time.

In Timeline mode, selecting a marker or a group record opens the existing Prompt Inspector on the right without navigating to another page.
Clicking outside the Inspector closes it; selecting another prompt changes the inspected prompt. The
Inspector retains the prompt's full project/session relationship metadata, agent/model Token breakdown,
and API-equivalent estimate while the timeline remains visible for context. Opening and closing preserve the source event.
The preview and Inspector offer Open In Project Browser, which selects
and locates the same project, Session, and prompt. The source card transitions into the destination reader
regardless of system animation preferences. Switching back with the Timeline workspace control preserves the mounted
Timeline, including time and project filters, viewing position, Session focus, selection, and scroll position.
There is no additional return row above Project Browser. A native file watcher monitors local Codex
session logs, task names, and project metadata. After a short debounce it runs the local-only Prompt Usage parser, replaces
only the private Prompt Usage suffix in memory, and notifies the open interface. This path does not read credentials or
contact OpenAI; full account, history, and quota refreshes continue to use the configured background cadence. When a local
prompt is active, a lightweight Usage API poll refreshes rate-limit percentages every 10 seconds without ccusage,
prompt-history scans, or Rate Limit Reset Credits requests. A full refresh still runs once after completion, and a failed
lightweight poll preserves the last good values. Newer prompts are inserted into the timeline without forcing a new
selection. The parser also follows Codex's `task_started`, `task_complete`, and `turn_aborted` lifecycle records. If an
aborted prompt is immediately followed by a promptless durable turn, the prompt and usage are kept together; a genuinely
new prompt starts a new accounting record. An unfinished record with no further log activity for six hours is treated as
abandoned so an interrupted task cannot leave a permanent spinner. The menu-bar Codex glyph can be configured
to rotate at Slow (2.0s), Standard (1.2s), or Fast (0.8s) speed
while the prompt is active.

Each user prompt is one accounting record. Its combined totals include the main agent plus every
descendant subagent spawned from that prompt, while the expanded breakdown retains each agent, model,
input, cached input, output, reasoning, and total-token value. In the Inspector, each child agent is labeled
**Subagent**, with its recorded nickname alongside it when available. Its recorded role and model remain on the next line.
A missing nickname is shown simply as Subagent; this display does not change token attribution.
Subagent-internal instructions are not
shown as separate user prompts. A subagent that Codex explicitly lists in a project sidebar remains an
independent session and is not also counted inside its parent. `sub_agent_activity` events provide exact
attribution; older logs use parent metadata and the nearest preceding parent prompt as a compatibility
fallback. Prompt text, project names, session structure, and agent details stay in the desktop interface
and are excluded from the local HTTP API. Transport-only attachment headings are removed from displayed
prompts only when the exact generated file heading and matching `My request` marker are both present, including
flattened pasted-text and ambient-metadata forms Codex can persist; without that marker the original text is
preserved. Automatically attached browser state and Page context are removed from the beginning of a prompt;
standalone context, skill instructions, and AGENTS records are not counted as user prompts. Authored text stays
complete, including line breaks, numbered lists, code, links, and skill references. The Inspector formats Markdown
and displays skill/plugin references by name instead of exposing their transport paths. Structured question replies
display each question and answer while hiding their transport tags and internal question IDs. Search includes the
readable questions and answers, and Copy Prompt keeps their complete text without the internal format. Other prompts
keep their full authored text when copied. Source code and XML examples remain visible. Safe trailing image descriptors
are omitted without reading image files or modifying the source JSONL logs. An attachment-only prompt shows its file name and keeps
its recorded Token usage. The prompt cache is versioned; parser and sanitizer changes invalidate earlier versions,
so older entries are reparsed, rewritten, and sanitized again before display.

The right Prompt Inspector includes the API-equivalent estimate beside the selected prompt and each agent's Token
breakdown. Each agent has one table row: Total includes its API estimate beneath it, Input includes
Cache Reads, and Output includes Reasoning. Token share is shown separately against this prompt, and the
combined prompt row remains separate from its contributing agents. All five columns fit the detail panel; longer labels wrap when space is limited. Estimates use the combined main-agent and
descendant-subagent accounting described above. Unpriced models do not erase priced usage from the same prompt; the UI
shows the available estimate and marks it as partial. Hover over the parenthesized summary amount, or activate it with click or keyboard,
or click the information icon in the Prompt Inspector, to open a scrollable calculation. It lists each real model,
its billable Token counts, the unit prices used for that estimate, category fees and model subtotal. Each category
uses Token count divided by one million, multiplied by the price per million Tokens. The model subtotals add up
to the displayed total. Ordinary input excludes cache reads and writes; output already includes reasoning.
The detail and total are produced together during the same usage scan, rather than fetching new prices to
reconstruct an older amount. Current prices come from the app's existing LiteLLM price snapshot, not a live bill.
The price observation date is when that snapshot was obtained, not a price-effective date. Missing model prices,
missing cache-write prices and incomplete cache-write records are explained separately; unknown costs are
not treated as free. Internal review-model usage is explicitly excluded. Older cached results without model
details show that the details are not yet available until usage refreshes; no unit prices are invented.
Missing cache-read or cache-write prices stay unavailable rather than being
derived from the ordinary input price. An explicitly supplied zero price is
valid. Overview, custom-day hourly charts and Prompt calculations retain the
same reported cache-write counts and identify incomplete measurements.
Source category calculations use USD. API calculation prices, fees, model subtotals and totals are all displayed in the selected currency using the same exchange rate, with at most two decimal places. Totals use the original unrounded values; missing exchange rates remain unavailable.
The pricing-basis text distinguishes current prices, usage-time prices, estimable usage only, and no estimate.
The ledger keeps Input and Cache
Reads visible without a permanent non-cache-read input detail. Per-prompt account-quota estimates are no longer shown
in prompt rows or the Inspector; this also applies to Timeline previews that share the Inspector. Token usage and
API-equivalent estimates remain available.

Session metadata includes the original session creation time and known descendant thread IDs for official
Session usage queries. These describe the whole Session and stay unchanged when the visible prompt date range
is narrowed. Missing creation metadata is left missing instead of inferred from the first visible prompt.
Separately listed root conversations are not included again as descendants.

### Legacy Weekly Quota Observations

The following observation data remains in the plugin and parser but is not displayed. It is separate from official
Session-level usage and must not be presented as a per-prompt quota charge.

Prompt subtitle JSON may include a `quotaObservation` object for a root prompt. This is a
prospective account-wide estimate, not a historical report or a billing-grade measurement.
The first successful probe records only the current weekly `used_percent` value and a prompt
watermark; prompts already present in the logs are not backfilled. A newly discovered root
prompt is first marked `pending` after completion and requires one unchanged weekly API sample
on a later probe before it can settle. Manual refresh can provide that repeat; the app's normal
polling cadence is 5, 15, 30, or 60 minutes depending on the current refresh setting.
Historical prompts do not receive placeholder observation objects, so bounded-cache eviction
cannot rediscover them as concurrent work and the UI does not repeat unavailable warnings.

When exactly one non-overlapping root prompt occurs between samples, the settled `delta` is
`usedAfter - usedBefore`. A zero delta is reported as `belowPrecision`. A weekly reset or a
decrease in the provider value is `unavailable`; multiple prompts between samples or overlapping
root tasks are `ambiguous`. The object retains the provider's observed decimals: an integer value
has precision `1` percentage point, while a decimal value uses its reported decimal scale. The
`subagentCount` records descendant subagents included with the root prompt.

The weekly value is account-wide. Activity from another prompt, device, or client between polls
cannot be separated from the local prompt and can make a result pending or ambiguous. Observation
state is bounded JSON under One More Prompt's Codex plugin data directory; Codex session logs are read-only
and are never rewritten. Missing or invalid state safely starts a new baseline. When the observation format
changes, estimates tied to confirmed Codex turns are kept. Estimates tied to temporary turn IDs are dropped,
those older prompts are not counted again, and a fresh baseline starts future estimates.

### Credential Ownership And Expiry

Codex owns its sign-in and token refresh. One More Prompt reads existing credentials;
it never refreshes tokens through OAuth or writes Codex's auth files or keychain entry.
Automatic usage checks continue to use Codex's current access token.

After a 401/403, the app reads the same credential source again and retries once if
Codex has supplied a newer token for the same account. Otherwise it asks the user to
open Codex and sign in again. A changed account, removed or unreadable credentials,
or a newly preferred auth file invalidates the query. Credentials are also checked
before returning the complete usage result, so an in-flight query cannot publish
the previous sign-in's data. Local Prompt and Token history is not rewritten.

### Token And Reasoning Details

Prompt logs report input totals including cache reads. The ledger labels these as Input and Cache Reads. Input includes cache reads; the shorter label does not change the accounting.
The API estimate information popup explains ordinary input separately; non-cache-read input details are not
permanently displayed in the ledger. Cache writes are retained when explicitly reported; missing records are not
proof of zero writes. Reasoning Tokens are part of output, so the fallback total is input plus output, without
adding reasoning twice. API estimates split ordinary input, cache reads, cache writes, and output by their
available rates. Daily/hourly ccusage input is already exclusive of cache reads and must not have those reads
subtracted again.

Each usage event belongs to its prompt and agent. Repeated unchanged cumulative snapshots are not charged again. A decreasing cumulative counter begins a new accounting segment; it does not imply that every cache entry was cleared. Compaction does not trigger a guessed charge or reset: the parser uses reported usage before and after it. Historical logs are reparsed after the cache-version change.

Newer logs can contain a request-level `token_usage_record` followed by a legacy
`token_count` snapshot for the same request. The request record is counted once,
even when that legacy snapshot is stale. Older stretches containing only legacy
events remain included. Request identities prevent repeated request records from
being charged twice, and another thread's usage is not assigned to the current
thread. These rules apply equally to compressed and uncompressed sources.

Model labels retain the recorded reasoning effort, such as gpt-6-astra · High. A model can show multiple observed efforts within a prompt. Main agents and subagents retain their own records; missing effort is labeled as not recorded, never copied from current settings. Effort does not create a separate model color or a guessed price multiplier.

### Official Session Allowance

Project Browser shows official lifetime weekly-allowance percentages only in the central Project and selected Session summaries; the left Session list keeps Prompt and Token counts. The Project percentage sums available and partial independent Session values; a descendant already included by a parent is counted once. A value compares the whole Session with the current full weekly allowance, including known attached subagents. It does not shrink with the date filter, represent this week's consumption, or show remaining account allowance. Across weeks it can exceed 100%.

Changing plans can change the comparison basis. These values are not a historical ledger of percentages charged under an earlier plan. Values come from the latest successful query rather than a locally computed conversion.

Queries use the private Codex session-usage endpoint and existing local Codex sign-in, only while Project Browser is active. The selected project's complete sessions are refreshed on entry, focus, and every minute while visible. The app clears old values before refreshing and does not persist a quota cache. No credentials enter the frontend.

One Project query supports up to 10,000 Sessions, with up to 1,000 known descendant threads per Session. The complete Project is checked for duplicate or overlapping groups before querying. Requests run sequentially in batches of at most 40 Sessions using one sign-in snapshot for the entire Project. The whole query has a five-minute budget; each HTTP request has at most 20 seconds and cannot exceed the remaining budget. A sign-in change, failed batch or expired budget discards the whole query; earlier batches are not presented as a complete result. Projects above the query limit show an error for official quota only; their local Prompt and Token history remains available.

An official response can omit its data timestamp by returning `null`. The app
keeps that response and its Session values instead of reporting a query failure;
the help simply leaves out the data timestamp. If any query batch has no
timestamp, the combined result also leaves it out. Otherwise it uses the oldest
batch timestamp. Invalid timestamp values still produce a query error.

Hover, focus or click a Session percentage to see its cumulative percentage inside a band against a 100% weekly-allowance reference;
the selected Session does not repeat a redundant 1/1 count. The Project detail also shows how many independent
conversations have a numeric value and how many do not, using separate filled and outlined blocks. Blocks
describe whether official weekly quota values were provided, not whether local conversation history exists or the allowance percentage. A conversation without an official quota value can still have local Prompts and Token usage. This count does not diagnose missing or unreadable local history. Missing creation times remain part of this count.
A valid zero is recorded; an absent value is unknown. Parent and included child Sessions are counted once.
No counts or percentage diagrams are invented while loading or after a query failure. The percentage bar uses
the actual value, including tiny values; values above 100% extend the scale while retaining the 100% reference.

Official `available`, `partial`, and `unavailable` results are handled separately. Partial data keeps its valid percentage without a warning badge beside the value. A partial null value stays unknown, never zero. Query failures are shown separately. The old per-Prompt account-difference estimate remains hidden in both Project Browser and Timeline.

Click the question mark beside Weekly Allowance for the illustrated explanation, source and data timestamp. The percentage opens a small coverage detail on hover, focus or click. The detail keeps the percentage diagram and Project conversation counts. The question-mark help explains the weekly reference, cross-week totals and plan changes without an incomplete-data warning section. Missing Session values are distinguished from an official partial status; the official response does not explain the cause of partial usage or promise when it will be complete. Escape closes the detail without closing the Prompt inspector. Weekly Allowance, Time and Timeline help open by click or keyboard activation, not hover. Each explanation expands from its question mark, keeps keyboard focus inside, and closes with X, Escape or the background. Closing returns focus to the question mark. The blur stays inside the app frame.

### Prompt Execution Time

Project Browser summaries show Tokens, API Valuation, weekly allowance, and total execution time for the complete selected Project or Session. Date and search filters narrow the visible list without changing these overall totals. The Prompt inspector shows the individual Prompt's execution time.

Execution time uses the recorded task start and completion timestamps. It includes time spent waiting and running tools; it is not CPU time. An active Prompt shows elapsed time and updates while visible. Missing completion timestamps and interrupted records remain unrecorded rather than borrowing the next Prompt's time. Totals sum each distinct Prompt once and do not add child-agent durations to the parent. Concurrent Prompts add their overlapping time, so this is not the elapsed span of the whole Project. Hover, focus or click an execution-time value to see its coverage counts in Prompt units: 49/60 Prompt means 49 of 60 distinct Prompts have computable duration, including valid running Prompts. Missing durations remain in the denominator. A calculable Project or Session total is prefixed with `>` when time is missing or a Prompt is still running; a finished, fully recorded total has no prefix. With no calculable duration it stays unrecorded. The detail separates included and excluded Prompt counts without treating unknown time as zero. Running counts are omitted from this summary. The Time question mark explains these counts and the overlapping-time example.

Project and Session metrics remain available together above the Prompt list. The Prompt inspector separates labeled start time and execution time, with lifecycle status in that first metadata area. Agent counts accompany the usage details rather than the time fields. Project columns, Prompt readers, and Timeline scrolling share the same scrollbar appearance; orientation and placement still follow their workspace.
