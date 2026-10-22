---
version: 1
slug: "src-components-codex-empty-state-tsx"
primary_target: "src/components/codex-empty-state.tsx"
related_targets: ["src/pages/overview.tsx","src/pages/prompt-usage.tsx"]
---

# Codex First-Use State

Mode: Operate. Scope: the empty content branches in Overview, Projects, and Timeline.
Audience: people opening One More Prompt before local Codex data is available.
Primary action: Check For Records, using the existing Codex refresh operation.

Direction: inherit paper, ink, orange, system UI typography, Phosphor icons, and the user's saved appearance. Use a flat two-column introduction and ordered preparation steps, collapsing to a single column within a narrow app window. The left column has one clear heading, a short explanation, a 44px action, and a local-history privacy note. The right column describes using Codex here, sending a first prompt, and returning to check records. Hairlines separate the steps. There are no sample graphs, status cards, or new modal flows.

Behavior: show this state when content is absent, including the exact expected initial Codex sign-in requirement. Preserve real read/network/parser errors, valid quota content, existing history, and filtered no-results states. A check keeps its accessible action identity and disables repeated activation while running. Follow the owner's existing full-animation preference with one short, already-visible entrance.

Verification: focused component and page regressions, TypeScript and Windows portable build, then one batched Windows inspection of Overview, Projects, Timeline and the real check action. Capture compact or dark layouts when the existing settings controls are reliable; restore the user's original view before handing over the installed normal app.

Behavior documents: docs/getting-started.md, docs/providers/codex.md, docs/windows-portable-test.md.
