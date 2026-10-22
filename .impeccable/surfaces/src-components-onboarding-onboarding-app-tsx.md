---
version: 1
slug: "src-components-onboarding-onboarding-app-tsx"
primary_target: "src/components/onboarding/onboarding-app.tsx"
related_targets: ["src/components/app/contextual-guide.tsx"]
---

# First-run onboarding

Mode: Operate. Scope: setup and optional workspace guide only. The owner approved
the proposed sequence and direct implementation on 2026-10-07 ("照推薦").
Audience: existing Codex users with local records; no-record users get a short
preparation path. Primary action: inspect one's own work without forced playback.

## Direction contract

THESIS: Confirm local data, then prove value in three real tasks: understand
Overview, inspect a Prompt, compare concurrent work in Timeline. Remove the
passive timed lecture and abstract signal illustration.

OWN-WORLD: Inherit the existing paper/ink/orange tokens, system UI typography,
saved light/dark appearance, Phosphor icons and native window chrome. Orange
marks the current action and precise target; flat aligned content carries facts.

STORY: A brief welcome leads to a local count check. Found records enter the
optional manual guide; empty/unavailable records get an actionable preparation
or retry path and can enter the app without touring absent controls.

FIRST VIEWPORT: Inside the existing 720x640 setup frame, brand and language sit
above one clear heading, a short purpose sentence and three aligned workflow
rows. A stable footer contains Skip and Check Local Records. The workspace guide
uses a readable floating callout beside the current target and dims the rest
of the app frame. The user explicitly rejected bottom-footer guidance on
2026-10-07. The real target remains visible and clickable; ordered selection
fallbacks prioritize the Prompt list over Project/Session navigation. Selection
instructions explain which action enables Next. Each Next/Back moves one step, never a timer.

FORM: User-pinned workflow from the approved recommendation; no random concept
round. Signature interaction: one spotlight follows the real target while the
task's instruction stays next to the focused area until the user proceeds. Transitions are
150-250ms. On 2026-10-08 the owner chose full animations independent of system
preferences, with no motion-mode option. Every step still waits for user input.
Seed key: user-pinned-20261007.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Verification: use current production components with isolated memory-only IPC
fixtures. Required sizes: setup 720x640 and 560x540; workspace 1240x875 and 800x700;
light and dark, no-record/error, keyboard and full animations even when the
system requests reduced motion.
Behavior documentation: docs/getting-started.md and docs/windows-portable-test.md.
