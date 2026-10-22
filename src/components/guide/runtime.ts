import { useAppUiStore } from "@/stores/app-ui-store"
import { FEATURED_PROMPT_ID, FEATURED_SESSION_ID } from "@/lib/guide-demo/fixtures"
import type { Rect } from "./positioning"
import { GUIDE_STEPS } from "./steps"
export { cardPosition, type Rect } from "./positioning"

export const visible = (node: Element | null): node is HTMLElement =>
  !!node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0

export const find = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(visible) ?? null

export const preset = (days: number) =>
  document.querySelector<HTMLButtonElement>(`[data-testid="usage-trend-preset-track"] [data-preset-days="${days}"]`)

export function peakSlot() {
  // The SVG column can still have zero height during the entrance animation.
  const peak = document.querySelector('[data-guide-target="usage-trend-daily-peak-column"]')
  const index = peak?.getAttribute("data-testid")?.match(/(\d+)$/)?.[1]
  return index ? find(`[data-testid="usage-trend-slot-${index}"]`) : null
}

export const sessionTarget = () => find(`[data-testid="prompt-usage-session-${FEATURED_SESSION_ID}"]`)
export const promptTarget = () => find(`[data-prompt-id="${FEATURED_PROMPT_ID}"]`)
export const timelineEntry = () => find('[data-workspace-destination="timeline"]')
export const map = () => find(".prompt-session-navigation-map")
export const camera = () => ({
  start: Number(map()?.getAttribute("aria-valuenow") ?? 0),
  width: parseFloat(find(".prompt-session-navigation-window")?.style.width ?? "0"),
})

export function target(step: number): HTMLElement | null {
  const ui = useAppUiStore.getState()
  switch (GUIDE_STEPS[step - 1]?.id) {
    case "chart-intro": return find('[data-guide-target="activity-chart"]') ?? find("#overview-local-activity")
    case "quota-intro": return find("#overview-usage-field")
    case "month": return preset(30)
    case "model-palette": return find('[data-testid="usage-trend-model-color-inspector"][data-state="open"]') ?? find('[data-testid="usage-trend-model-colors-button"]')
    case "api-estimate": return find('[data-guide-target="usage-trend-api-metric"]')
    case "peak": return find('[data-guide-target="usage-trend-daily-peak-column"]')
    case "drill": return ui.activeView === "home" ? find('[data-testid="usage-trend-tooltip"] button:has([data-destination="hierarchy"])') : null
    case "project-intro": return find('[data-testid="prompt-usage-panel"]')
    case "session": return sessionTarget()
    case "summary": return find('[data-testid="prompt-usage-summary-matrix"]')
    case "prompt": return promptTarget()
    case "prompt-original": return find('#prompt-usage-inspector [data-testid="prompt-usage-text"]')
    case "prompt-timing": return find('[data-testid="prompt-usage-inspector-metadata"]')
    case "prompt-usage": return find('[data-testid="prompt-usage-token-summary"]')
    case "prompt-agents": return find('[data-testid="prompt-usage-main-agent"]')
    case "timeline-entry": return timelineEntry()
    case "timeline-intro": return find('[data-testid="prompt-usage-timeline-shell"]')
    case "pan": return find(".prompt-session-navigation-window")
    case "zoom": return find(".prompt-navigation-handle-end")
    case "event": return find('[data-testid="prompt-usage-detail-inspector-region"]')
      ?? find(`[data-testid="prompt-session-event-${FEATURED_PROMPT_ID}"]`)
    default: return null
  }
}

export function allowed(step: number): HTMLElement[] {
  const id = GUIDE_STEPS[step - 1]?.id
  const nodes: (HTMLElement | null)[] = []
  if (["month", "model-palette", "api-estimate", "session", "prompt"].includes(id)) nodes.push(target(step))
  if (id === "drill") {
    nodes.push(peakSlot(), find('[data-testid="usage-trend-tooltip"]'), find('[data-testid="usage-trend-hover-bridge"]'))
  }
  if (id === "timeline-entry") nodes.push(timelineEntry())
  if (id === "pan") nodes.push(map(), find(".prompt-navigation-handle-pan"))
  if (id === "zoom") nodes.push(find(".prompt-navigation-handle-end"))
  if (id === "event") {
    nodes.push(find(`[data-testid="prompt-session-event-${FEATURED_PROMPT_ID}"]`), find('[data-testid="prompt-usage-detail-inspector-region"]'))
  }
  return nodes.filter(visible)
}

export function isComplete(step: number, _reset: string, baseline: ReturnType<typeof camera>) {
  const ui = useAppUiStore.getState()
  switch (GUIDE_STEPS[step - 1]?.id) {
    case "month": return preset(30)?.getAttribute("aria-pressed") === "true"
    case "model-palette": return find('[data-testid="usage-trend-explorer"]')?.getAttribute("data-palette-applied") === "true"
    case "api-estimate": return find('[data-guide-target="usage-trend-api-metric"]')?.getAttribute("aria-pressed") === "true"
    case "drill": return ui.activeView === "prompt-usage" && ui.promptUsageViewMode === "hierarchy" && ui.promptUsageTimeScope.type === "day"
    case "session": return sessionTarget()?.getAttribute("aria-current") === "page"
    case "prompt": return promptTarget()?.getAttribute("data-selected") === "true" && !!find("#prompt-usage-inspector")
    case "timeline-entry": return ui.activeView === "prompt-usage" && ui.promptUsageViewMode === "timeline" && !!map()
    case "pan": return baseline.start > 0 && Math.abs(camera().start - baseline.start) > 5000
    case "zoom": return baseline.width > 0 && Math.abs(camera().width - baseline.width) > 0.05
    case "event": return !!find(`[data-testid="prompt-usage-detail-inspector-region"][data-prompt-id="${FEATURED_PROMPT_ID}"][data-state="open"]`)
    default: return false
  }
}

export function projectRegions(app: DOMRect) {
  const panel = find('[data-testid="prompt-usage-panel"]')
  const workspace = panel ? localRect(panel, app, 0) : { x: 2, y: 2, w: app.width - 4, h: app.height - 4 }
  return [
    '[data-testid="prompt-usage-scope-column"]',
    '[data-testid="prompt-usage-prompt-list"]',
    '[data-testid="prompt-usage-select-prompt"],[data-testid="prompt-usage-details-column"]',
  ].flatMap((selector, index) => {
    const node = find(selector)
    if (!node) return []
    const bounds = localRect(node, app, -3)
    const x = Math.max(bounds.x, workspace.x)
    const y = Math.max(bounds.y, workspace.y)
    const w = Math.min(bounds.x + bounds.w, workspace.x + workspace.w) - x
    const h = Math.min(bounds.y + bounds.h, workspace.y + workspace.h) - y
    return w > 0 && h > 0 ? [{ n: index + 1, rect: { x, y, w, h } }] : []
  })
}

export function localRect(node: Element, app: DOMRect, pad = 7): Rect {
  const r = node.getBoundingClientRect()
  const x = Math.max(2, r.left - app.left - pad)
  const y = Math.max(2, r.top - app.top - pad)
  return {
    x, y,
    w: Math.max(0, Math.min(r.right - app.left + pad, app.width - 2) - x),
    h: Math.max(0, Math.min(r.bottom - app.top + pad, app.height - 2) - y),
  }
}

export function timelineRegions(app: DOMRect) {
  return [
    ".prompt-timeline-filter-strip", ".prompt-session-navigation-map",
    ".prompt-session-identity", ".prompt-session-lane .prompt-session-track",
  ].flatMap((selector, index) => {
    const node = find(selector)
    if (!node) return []
    const rect = localRect(node, app, 5)
    return rect.w && rect.h ? [{ n: index + 1, rect }] : []
  })
}

export function timelinePlot(app: DOMRect): Rect | null {
  const viewport = find(".prompt-session-chart-viewport")
  const ticks = find(".prompt-session-ticks")
  if (!viewport || !ticks) return null
  const bounds = localRect(viewport, app, 0)
  const track = localRect(ticks, app, 0)
  return { ...bounds, x: track.x, w: bounds.x + bounds.w - track.x }
}
