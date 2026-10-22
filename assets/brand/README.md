# Brand Assets

Public media for One More Prompt v1.0.0. Every workspace image uses the current
production frontend with the built-in synthetic guide fixtures. No account,
credential, private project, or real Prompt history is used.

- `hero.svg` is the editable repository Hero composition; `hero.png` is its rendered README image.
- `logo-dark.svg` and `logo-light.svg` are the README marks for dark and light backgrounds. Keep the orange chevron identical in both.
- `social-preview.png` is the 1280 × 640, opaque GitHub social preview rendered from `hero.svg`; its fixed background keeps it readable in either sharing theme.
- `overview-demo.png` shows 30 days of Token activity and the sample account limits.
- `api-valuation-demo.png` shows the same records in API Valuation mode, in USD.
- `projects-demo.png` shows Project, Session, Prompt, and main/subagent details in the current metric order.
- `timeline-demo.png` shows activity across a complete synthetic day.
- `palette-demo.png` shows a live model-color preview without changing saved user preferences.

The English, dark-mode images are browser renders of the real page components,
with a visible Demo Data label. This verifies the displayed frontend, separately
from native macOS or Windows package acceptance. The fixture contains seven
projects, 46 sessions, 340 Prompts and 411 agents across 25 active days; its
30-day peak is inside the range rather than at the final bar.

Regenerate workspace captures with the production components and
[synthetic guide data](../../src/lib/guide-demo/fixtures.ts). Preserve the Demo
Data label and the full application content; capture after transitions and
hover cards have settled. Render the Hero from its SVG and the updated Overview
image without stretching or cropping the workspace. Do not bundle fonts or
replace screenshots with hand-drawn interface imitations.

Render the social preview from the same source:

```sh
rsvg-convert --width 1280 --height 640 assets/brand/hero.svg \
  --output assets/brand/social-preview.png
```

Upload `social-preview.png` in the repository's Settings → General → Social
preview. Keep it below GitHub's 1 MB upload limit. The nine README files use
`picture` sources so GitHub's dark theme receives the white ring and its light
theme receives the dark ring. The application and bundled icon files are separate.

The One More Prompt name and original brand artwork are covered by
[Trademark & Attribution](../../TRADEMARK.md). Third-party code attribution
remains in [NOTICE](../../NOTICE).
