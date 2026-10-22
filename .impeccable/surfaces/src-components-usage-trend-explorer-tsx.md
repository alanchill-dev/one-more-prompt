---
version: 1
slug: "src-components-usage-trend-explorer-tsx"
primary_target: "src/components/usage-trend-explorer.tsx"
related_targets: ["src/components/usage-trend-daily-chart.tsx", "src/components/usage-trend-hourly-pulse.tsx", "src/components/usage-trend-model-composition.tsx"]
---

# Overview Metric Switch

Mode: Operate. Bounded extension of the existing Overview, approved location A.
Audience: Codex users comparing activity volume and API-equivalent value.
Primary action: switch Token / API Estimate above the
large total, without changing the selected period or leaving Overview.

THESIS: The selected measure controls the complete readout, not just its label.
OWN-WORLD: Reuse the existing orange, paper, ink, typography and restrained
text controls. Preserve chart geometry, palette morph and drill-down.
STORY: Choose a period, choose a measure, inspect the same work.
FIRST VIEWPORT: Two text tabs sit above the main value. The selected tab has
foreground text and a 2px Wire Orange underline. Both have 14px semibold labels,
38px targets and a 24px gap; there is no outer capsule or solid fill. The repeated
activity-period label is removed because the range controls already show it.
The reading header keeps its original fixed 88px height and one bounded grid
row. The tabs use a 24px layout row with centered 38px hit targets; the value and
summary use compact 8px/4px upper gaps. Do not reserve extra chart height for tabs.
The main total, average, peak, vertical axis, columns, model shares and hover
readout change together. Currency follows the existing setting.
FORM: The owner selected option 1 from six interactive concepts on 2026-10-09.
Full animations remain independent of OS preferences. Metric changes retain
Token-ranked model colors so a model never changes identity during comparison.
FINISH: One batched browser review at 800 and 1240 widths in both themes,
keyboard checks and one local detector run. No new raster assets.

Implementation reaches plugin daily/hourly model estimates, generated IPC,
frontend hourly merges, chart readouts, locales and regression fixtures.
Unknown prices use a dash; day/hour Detail Cards identify partial estimates.
Estimates describe API reference prices, not a subscription bill.
The owner's 2026-10-08 refinement removes the standalone pricing-basis line
and its cost-only chart reserve. Changing measure keeps the same plot height.

Behavior docs to update: docs/providers/codex.md, docs/getting-started.md,
docs/app-state-architecture.md, docs/windows-portable-test.md. Branding also
updates README.md, docs/releasing.md and docs/capture-logs.md.

Earlier 2026-10-08 refinement verification covered 1240px dark and 800px light layouts and keyboard
activation. Period labels remain complete, both targets fit their reading column,
and the pricing-basis row is absent. The selected orange/ink pair has a 4.82:1
text contrast ratio. The detector found zero anti-patterns and two advisories for
the inherited 11px context and 10px summary sizes documented in DESIGN.md.
Five focused test files passed all 38 tests, including unchanged chart height
when switching measures and unknown/partial-price detail behavior.

The initial signed, notarized macOS candidate was installed and launched from
/Applications. Its native Overview successfully switched the total, daily
readouts and model shares to API estimates while retaining the selected range
and Token-ranked colors. The installed bundle and running Codex plugin matched
the source, and existing selected preferences were preserved. Visual acceptance
belongs to the owner; Windows native acceptance is still pending for this
candidate.

The refinement candidate was rebuilt for both platforms. The new signed and
notarized macOS App was installed from its verified DMG and launched; its running
executable, source-matching bundled plugin and preserved preferences were checked.
The native automation surface could not open the background tray panel for this
refinement, so its final visual proof uses the isolated preview. Windows ZIP
integrity and checksums passed; no Windows native test was performed.

The owner-selected 2026-10-09 text-tab refinement passed the two focused test
files (22 tests) and the production frontend build. The actual components were
reviewed with labeled synthetic data at 1240px dark and the 980px minimum-window
width in light mode. Mouse and Enter activation switched to API valuation;
the reading header had no horizontal overflow, repeated period label or
pricing-basis row. The selected tab measured 38px high with 14px text and the
Wire Orange underline. This pass did not change chart geometry or data semantics.
The signed/notarized macOS candidate passed Gatekeeper, was installed and
restarted with matching executable/plugin hashes, and preserved all eight
existing settings. Native window automation timed out, so the visual evidence
comes from the component preview, not a native window capture. No Windows
rebuild, native Windows check, Git delivery or Release publication was performed
for this refinement.

The owner's height correction restores the pre-switch header/chart geometry.
The earlier extension had raised the header minimum to 120px and deducted 32px
from the chart budget. Both changes are removed. Measured at 1240x875 dark and
980x640 light, the header is 88px and the chart stage starts at y=200 in both
Token and API modes. Chart heights use the original budget (560px and 342px).
The 38px hit targets and focus rings clear navigation, do not overlap the value,
and the summary clears the chart stage. The focused tests passed 22/22, including
the original 470px chart budget at a 768px viewport. The final signed/notarized
Mac candidate was installed/restarted with verified executable bytes and all
eight settings preserved. Native window reading still timed out; the layout
evidence uses actual components with labeled synthetic data. Windows packaging,
Git delivery and Release publication were not repeated for this correction.

The owner requested a closer tab underline on 2026-10-09. Only the decorative
2px line moves up 8px inside the 38px target; equivalent bottom padding preserves
label placement. In the 980x640 dark component preview, the underline-to-value
gap is now 9px, while the header stays 88px and the chart starts at y=200. Both
Token and API valuation preserve those dimensions. No data or interaction logic
changes, and no new CSS-mirroring test is introduced for this spacing refinement.

This underline refinement built successfully as a signed/notarized Mac candidate.
The verified DMG App was installed with a rollback backup and restarted; its
executable matched the candidate and all eight settings were preserved. Native
window reading timed out again, so visual proof uses the actual component preview
with synthetic data. No new tests, Windows rebuild, Git delivery or Release update.

The owner's number-switch cleanup fix on 2026-10-09 keeps the outgoing number
in an independent absolute row with its natural glyph positions. Only current
characters determine the active reading width; unchanged outgoing glyphs remain
invisible spacers. Cleanup follows the final actual entering animation (or the
last exit for a pure deletion), with the revision guard retained. The fixed
720ms timer is removed; initial entrance and the 520ms/220ms/24ms timing remain.
Three focused files passed 18 tests, covering long money strings, terminal
events, pure deletion, rapid switching, initial entrance and magnitude spacing.
Browser component evidence for 3.4B -> $12,480.81 measured the old code contracting
from 215.0234375px to 199.1875px at cleanup. The repaired code measured 199.1875px
both during and after animation; the outgoing digits retain separate positions.
The initial glyph-level overlay attempt collapsed old-only tail slots, so the
confirmed implementation uses the independent whole-row overlay instead.

The final component check also kept 3.4B at 78.671875px during and after cleanup.
Both directions measured zero width change; the actual AppShell preview retained
an 88px header and chart-stage y=200. The signed/notarized Mac candidate passed
Gatekeeper and was installed/restarted with verified executable/plugin hashes,
a rollback backup and all eight settings intact. Native window reading timed
out, so motion evidence comes from the real component preview with synthetic
data. No Windows rebuild, native Windows check, Git delivery or Release update.
