---
name: One More Prompt
description: Warm-Gray Workspace With Deep Summaries And Brand-Orange Scope Labels
colors:
  wire-orange: "#f5572f"
  surface-header-dark: "#18191b"
  project-toolbar-dark: "#34322f"
  project-navigation-dark: "#2c2b29"
  project-summary-dark: "#242321"
  session-summary-dark: "#282624"
  project-prompt-separator-dark: "#55514b"
  project-prompts-dark: "#363432"
  project-inspector-dark: "#41403d"
  project-popover-dark: "#57534e"
  project-foreground-dark: "#ffffff"
  project-secondary-dark: "#d8d2ca"
  project-scope-accent-dark: "#f5572f"
  project-selected-session-dark: "#493024"
  project-selected-prompt-dark: "#52382a"
  project-border-dark: "rgba(244, 236, 224, 0.17)"
typography:
  interface:
    fontFamily: "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
  project-title:
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  scope-label:
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "20px"
  metric:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  api-estimate:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "26px"
  metadata:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  detail-title:
    fontSize: "17px"
    fontWeight: 650
    lineHeight: "24px"
  detail-body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "22px"
rounded:
  workspace-plane: "0px"
  app-frame: "12px"
  selected-tree-row: "4px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
components:
  project-workspace:
    backgroundColor: "{colors.project-prompts-dark}"
    textColor: "{colors.project-foreground-dark}"
    rounded: "{rounded.workspace-plane}"
    padding: "0"
  value-detail:
    backgroundColor: "{colors.project-popover-dark}"
    textColor: "{colors.project-foreground-dark}"
    width: "360px"
---

# One More Prompt Design System

## Selected Direction

The owner selected **diagram detail A and palette B**, then approved the
**deep-summary refinement on 2026-10-16**. This is the current visual authority
for the Projects workspace. Keep palette B's overall working planes while
deepening only the two summaries, brightening the Prompt separator, restoring
pure white text and using the original vivid brand orange.

One More Prompt remains a local-first Codex desktop tool. Preserve its existing
logo, system UI sans typography, Phosphor icons, saved appearance and native
window behavior. Premium quality comes from readable text, distinct working
planes and precise alignment. It does not come from decorative effects.

## Palette B

Header and Overview retain Header black `#18191b`. The dark Projects hierarchy
uses these explicit planes:

| Plane | Color |
| --- | --- |
| Filter and search toolbar | `#34322f` |
| Project and Session navigation | `#2c2b29` |
| Project summary | `#242321` |
| Session summary | `#282624` |
| Prompt separator | `#55514b` |
| Prompt list | `#363432` |
| Prompt inspector and its card-based ledger details | `#41403d` |
| Value details and help surfaces | `#57534e` |

Primary text is pure white `#ffffff`; supporting text is `#d8d2ca`. Project and
Session scope labels are bold brand orange `#f5572f`, with no peach tint or
opacity treatment. Their deeper backgrounds preserve small-text contrast:
4.70:1 on Project and 4.51:1 on Session. Use the same orange for the visible
summary warning and existing thin selection markers.

The brighter Prompt separator uses white and supporting text, not small orange
text. White on that plane has 7.88:1 contrast. Do not dim the whole App to make
the summaries look deeper; toolbar, navigation, Prompt list and inspector keep
their palette B colors. Do not apply persistent opacity or a color filter to an
ancestor of these values.

Selected Session rows use `#493024`; selected Prompt rows use `#52382a`. The active
Project folder remains a quiet neutral selection. Borders use warm paper at 17%
opacity. There are no decorative gradients, texture, glass, colored glow or
metallic effects.

These colors are scoped to Projects and Timeline. Do not replace root
light/dark theme values; Overview retains the Header black and Settings keeps
its existing surfaces. Timeline uses the toolbar gray for filters, navigation
gray for the minimap and Session rail, workspace gray for the chart, and
inspector gray for the time axis and reader. Preserve model marker colors.
Light appearance continues to use semantic card, foreground, muted, border and
popover values. Portaled explanations receive the active workspace palette
without changing unrelated popovers or pages.

## Workspace Structure

Keep the rounded outer App frame. Inside Projects, the filter strip and three
panes meet the same inner frame boundary. Panes have no gutters between them.
The center summary fills its pane without an enclosing card, outer padding,
rounded container or shadow. Text keeps a consistent internal inset.

Project is the parent context. Session sits directly below it on a distinct
continuous plane. Both use identical tracks for scope label, name, Prompt total
and metric groups. The Project name has slightly greater weight and size;
Project and Session scope labels remain bold orange.

A full-width Prompt heading separates the summary from the list. It uses the
brighter `#55514b` plane in dark Projects. The summary and Prompt rows retain independent scrolling
so a large summary cannot make the list inaccessible. The heading counts the
currently visible Prompt rows; summary values still cover the complete scope.

Timeline is also full bleed: from the minimap through the bottom scrollbar,
the navigation rail and chart fill the App's inner frame without outer gutters.
Keep readable internal insets for labels, pin controls and axis ticks. Filters
join this workspace directly; readers overlay it without resizing the chart.
The navigator uses outward filled triangles for resizing, with separate 36×44px
hit areas beside the range. Boundary targets move inside the rail. The span
capsule retains its 44px pan target and sits close to the chart axis below.

## Metrics And Inline Estimates

Keep all four values visible for both scopes: Token total, API valuation,
weekly quota spent and execution time. Organize them as three groups, with the
API estimate attached to its Token value:

`133M ($28)`

Token is the primary value. The parenthesized API estimate is smaller and shares
its baseline when it fits. The API estimate retains its own pricing-basis hover
and keyboard explanation. It is an estimate, not a subscription charge or bill.
Never change currency formatting, omit its unit or truncate the amount to fit.

If a longer estimate cannot fit beside the Token total, move the complete
parenthesized estimate to the next line in the same group. Do not shrink the
whole summary or push the other groups out of alignment. Corresponding Project
and Session values keep the same horizontal tracks. Execution-time strings do
not wrap; narrow layouts move the entire time group to a full row for both
scopes.

## Value Detail A

Coverage counts appear on demand rather than as repeated lines below every
value. Weekly quota and execution time each have one combined, discoverable
trigger. A partial-data warning stays visible and belongs inside the same
trigger as its value, so either part opens the same explanation.

The default value detail is 360px wide, bounded by the available App viewport.
Use a 17px heading, 14–15px body copy, comfortable line spacing and a small number
of focused visual explanations. It is a lightweight detail surface, not a new
modal or a second dashboard.

For time coverage, use exact dots when the denominator is at most 60: one dot represents one record.
For larger totals, use a proportional band with the exact numeric fraction.
Never imply that a small decorative dot set represents hundreds of individual
records. Pair color with readable labels and exact counts.

Quota C places the large cumulative percentage inside a broad, truthful band.
Put the 0% and 100% weekly-allowance labels below it on one baseline; omit the
redundant recorded-value caption. Do not repeat 1/1 Session. Project details add
human-readable included/missing conversation counts with filled/outlined blocks,
without an extra section title. End the value detail after these counts (or
after the band for Session); omit the repeated incomplete-data warning and plan
basis footer. Keep the warning beside the summary value and the full question-mark
explanation. Extend the scale beyond 100% when needed and
retain a labeled 100% marker; never inflate tiny percentages with minimum widths.
Time coverage uses **Prompt** units. Missing data is unknown, not zero. Having
values for every Session does not guarantee complete official quota usage;
keep the summary warning and question-mark explanation independent of the counts.

Hover and keyboard focus reveal the same details. Click or touch also provides
access. Keep the trigger and detail connected during pointer travel, allow
Escape dismissal without closing the underlying Prompt inspector, and retain
complete accessible names and descriptions. Do not rely on an inaccessible
native title or color alone.

The small question buttons still open the existing general explanations. Keep
their established shared-element expansion, reverse close, focus restoration
and blur clipped to the App frame. A value detail does not blur the entire App.

## Calculation Truth

API amounts open an interactive, scrollable 480px detail surface, bounded by the
viewport. Summary amounts support hover and click or keyboard activation; Inspector information
icons keep click activation. Use real per-model Token counts, the same price
snapshot, category fees, a proportional fee band, and model subtotals that
reconcile with the headline. Equations stay in USD even when the headline uses
another display currency. Missing prices and incomplete usage have explicit
reasons. Older data without a ledger never receives invented operands.

This design does not change the calculation scope:

- Project cost details use the same deduplicated Prompt collection as their total.
- Session cost details travel with their recorded total; date scoping rebuilds
  both together, while text-search results do not invent a different cost scope.
- Time adds computable Prompt durations. Concurrent execution can therefore count
  overlapping time more than once; missing timing data is not counted as zero.
- Quota uses the official Session-level data, with related parent/child scopes
  counted once. Valid zero values remain distinct from unavailable data.
- Retain official partial numeric values and distinguish loading, failure and
  unavailable states. Do not manufacture coverage counts before resolution.

Real values come from the App's data. Diagram examples must be labeled as
examples and must not be presented as a user's actual activity.

## Shared Product Rules

Use system sans text with tabular numerals for measurements. Preserve visible
keyboard focus, existing navigation, unread indicators, relationship rails and
running state. Do not add controls, model identities, charts or statistics as
visual decoration.

Overview keeps its established metric tabs, model palette, chart geometry and
animation behavior. Setup and first-run guidance retain their established
layout, required progression and user-selected full animations. This Projects
refinement does not redesign those surfaces or introduce a motion setting.

No outer summary cards, repeated coverage footnotes, giant dashboard numbers,
monospace styling as a technical costume or second icon library are part of
this direction.

## Implementation Authority

The current palette is a bounded refinement of palette B. The production
sources below are the shared, versioned reference for its appearance and actual
behavior:

- `src/components/app-surface-depth.css`: scoped surface and selection palette.
- `src/components/session-quota.css`: aligned summary layout and value details.
- `src/components/prompt-usage-summary.tsx`: complete-scope metrics and estimate.
- `src/components/session-quota.tsx`: official quota states and coverage.
- `src/components/prompt-usage-help-dialog.tsx`: general help interaction.

A static reference establishes visual direction. It does not prove installed
behavior, native platform acceptance or release readiness.
