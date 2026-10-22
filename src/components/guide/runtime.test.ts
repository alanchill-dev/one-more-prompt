import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useAppUiStore } from "@/stores/app-ui-store"
import { FEATURED_PROMPT_ID, FEATURED_SESSION_ID } from "@/lib/guide-demo/fixtures"
import { GUIDE_STEPS } from "./steps"
import { camera, cardPosition, isComplete, localRect, peakSlot, preset, projectRegions, target, timelineRegions } from "./runtime"

const step = (id: string) => GUIDE_STEPS.findIndex(s => s.id === id) + 1
const rect = (x = 0, y = 0, width = 120, height = 30) => new DOMRect(x, y, width, height)
function node(tag: string, attributes: Record<string, string>) {
  const item = document.createElement(tag)
  Object.entries(attributes).forEach(([key, value]) => item.setAttribute(key, value))
  item.getBoundingClientRect = () => rect()
  document.body.append(item)
  return item
}

beforeEach(() => { useAppUiStore.getState().resetState() })
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe("Guide action completion", () => {
  it("matches the Timeline Prompt by stable identity rather than translated text", () => {
    const inspector = node("aside", { "data-testid": "prompt-usage-detail-inspector-region", "data-prompt-id": "another-prompt", "data-state": "open" })
    inspector.textContent = "請完成首頁的響應式版面"
    expect(isComplete(step("event"), "relative", camera())).toBe(false)
    inspector.setAttribute("data-prompt-id", FEATURED_PROMPT_ID)
    inspector.textContent = "Complete the homepage layout"
    expect(isComplete(step("event"), "relative", camera())).toBe(true)
    inspector.setAttribute("data-state", "closing")
    expect(isComplete(step("event"), "relative", camera())).toBe(false)
  })
  it("finds presets independently of language and waits for actual selection", () => {
    const track = node("div", { "data-testid": "usage-trend-preset-track" })
    const option = node("button", { "data-preset-days": "30", "aria-pressed": "false" })
    option.textContent = "30 Tage"
    track.append(option)
    expect(preset(30)).toBe(option)
    expect(isComplete(step("month"), "relative", camera())).toBe(false)
    option.setAttribute("aria-pressed", "true")
    expect(isComplete(step("month"), "relative", camera())).toBe(true)
  })

  it("follows the open palette but completes only after Apply, not preview or cancel", () => {
    const button = node("button", { "data-testid": "usage-trend-model-colors-button" })
    const chart = node("section", { "data-testid": "usage-trend-explorer", "data-palette-applied": "false" })
    expect(target(step("model-palette"))).toBe(button)
    const panel = node("aside", { "data-testid": "usage-trend-model-color-inspector", "data-state": "open" })
    expect(target(step("model-palette"))).toBe(panel)
    expect(isComplete(step("model-palette"), "relative", camera())).toBe(false)
    panel.setAttribute("data-state", "closed")
    expect(target(step("model-palette"))).toBe(button)
    expect(isComplete(step("model-palette"), "relative", camera())).toBe(false)
    chart.setAttribute("data-palette-applied", "true")
    expect(isComplete(step("model-palette"), "relative", camera())).toBe(true)
  })

  it("preserves access to the peak input while its SVG is animating from zero height", () => {
    const peak = node("rect", { "data-guide-target": "usage-trend-daily-peak-column", "data-testid": "usage-column-25", "data-active": "false" })
    peak.getBoundingClientRect = () => rect(0, 0, 10, 0)
    const slot = node("div", { "data-testid": "usage-trend-slot-25" })
    expect(peakSlot()).toBe(slot)
    node("aside", { "data-testid": "usage-trend-tooltip" })
    expect(isComplete(step("peak"), "relative", camera())).toBe(false)
    peak.setAttribute("data-active", "true")
    peak.getBoundingClientRect = () => rect()
    expect(target(step("peak"))).toBe(peak)
    expect(GUIDE_STEPS[step("peak") - 1].type).toBe("read")
  })

  it("requires the featured session and prompt, with the inspector actually open", () => {
    const session = node("button", { "data-testid": `prompt-usage-session-${FEATURED_SESSION_ID}` })
    const prompt = node("button", { "data-prompt-id": FEATURED_PROMPT_ID, "data-selected": "false" })
    expect(isComplete(step("session"), "relative", camera())).toBe(false)
    session.setAttribute("aria-current", "page")
    expect(isComplete(step("session"), "relative", camera())).toBe(true)
    prompt.setAttribute("data-selected", "true")
    expect(isComplete(step("prompt"), "relative", camera())).toBe(false)
    node("aside", { id: "prompt-usage-inspector" })
    expect(isComplete(step("prompt"), "relative", camera())).toBe(true)
  })

  it("unlocks pan and zoom only after the visible camera really changes", () => {
    const map = node("div", { class: "prompt-session-navigation-map", "aria-valuenow": "100000" })
    const viewport = node("div", { class: "prompt-session-navigation-window", style: "width: 25%" })
    const initial = camera()
    expect(isComplete(step("pan"), "relative", initial)).toBe(false)
    expect(isComplete(step("zoom"), "relative", initial)).toBe(false)
    map.setAttribute("aria-valuenow", "80000")
    expect(isComplete(step("pan"), "relative", initial)).toBe(true)
    expect(isComplete(step("zoom"), "relative", initial)).toBe(false)
    viewport.style.width = "15%"
    expect(isComplete(step("zoom"), "relative", initial)).toBe(true)
    viewport.style.width = "35%"
    expect(isComplete(step("zoom"), "relative", initial)).toBe(true)
    map.setAttribute("aria-valuenow", "120000")
    expect(isComplete(step("pan"), "relative", initial)).toBe(true)
  })
})

describe("Guide placement", () => {
  it("frames the complete visible Project columns without adjoining outlines overlapping", () => {
    node("section", { "data-testid": "prompt-usage-panel" }).getBoundingClientRect = () => rect(100, 240, 1240, 700)
    const columns = [
      ["prompt-usage-scope-column", rect(100, 240, 280, 700)],
      ["prompt-usage-prompt-list", rect(380, 240, 420, 700)],
      ["prompt-usage-select-prompt", rect(800, 240, 540, 700)],
    ] as const
    columns.forEach(([id, bounds]) => { node("section", { "data-testid": id }).getBoundingClientRect = () => bounds })
    const regions = projectRegions(rect(100, 80, 1240, 800))
    expect(regions).toEqual([
      { n: 1, rect: { x: 3, y: 163, w: 274, h: 635 } },
      { n: 2, rect: { x: 283, y: 163, w: 414, h: 635 } },
      { n: 3, rect: { x: 703, y: 163, w: 534, h: 635 } },
    ])
    expect(regions[0].rect.x + regions[0].rect.w).toBeLessThan(regions[1].rect.x)
    expect(regions[1].rect.x + regions[1].rect.w).toBeLessThan(regions[2].rect.x)
  })

  it("clips Project columns to the visible workspace rather than its overflow content", () => {
    node("section", { "data-testid": "prompt-usage-panel" }).getBoundingClientRect = () => rect(10, 150, 960, 460)
    node("section", { "data-testid": "prompt-usage-scope-column" }).getBoundingClientRect = () => rect(10, 100, 270, 1000)
    expect(projectRegions(rect(0, 0, 980, 640))).toEqual([
      { n: 1, rect: { x: 13, y: 150, w: 264, h: 460 } },
    ])
  })

  it("keeps the Timeline entry highlight on its real tab after the route changes", () => {
    const tab = node("button", { "data-workspace-destination": "timeline" })
    node("section", { "data-testid": "prompt-usage-timeline-shell" })
    useAppUiStore.setState({ promptUsageViewMode: "timeline" })
    expect(target(step("timeline-entry"))).toBe(tab)
  })

  it("highlights four precise Timeline regions rather than exposing the entire workspace", () => {
    node("section", { "data-testid": "prompt-usage-timeline-shell" }).getBoundingClientRect = () => rect(0, 100, 1280, 700)
    const selectors = ["prompt-timeline-filter-strip", "prompt-session-navigation-map", "prompt-session-identity", "prompt-session-track"]
    selectors.forEach((className, i) => {
      const item = node("div", { class: className })
      item.getBoundingClientRect = () => rect(i === 2 ? 10 : 330, 120 + i * 60, i === 2 ? 280 : 800, 40)
      if (i === 3) { const lane = node("div", { class: "prompt-session-lane" }); lane.append(item) }
    })
    const regions = timelineRegions(rect(0, 0, 1280, 800))
    expect(regions.map(region => region.n)).toEqual([1, 2, 3, 4])
    expect(regions.every(region => region.rect.h === 50 && region.rect.w < 1280)).toBe(true)
    expect(regions.reduce((area, region) => area + region.rect.w * region.rect.h, 0)).toBeLessThan(1280 * 700 / 4)
  })

  it("clips highlight padding to the app frame", () => {
    const item = node("div", {})
    item.getBoundingClientRect = () => rect(95, 75, 500, 500)
    expect(localRect(item, rect(100, 80, 300, 240))).toEqual({ x: 2, y: 2, w: 296, h: 236 })
  })

  it.each([[1280, 800], [1440, 1000]])("keeps all coach cards inside a %s×%s workspace", (width, height) => {
    for (let step = 1; step <= GUIDE_STEPS.length; step++) {
      const position = cardPosition(step, rect(0, 0, width, height), 370, 350, { x: 20, y: 460, w: 200, h: 140 })
      expect(position.x).toBeGreaterThanOrEqual(12)
      expect(position.x + 370).toBeLessThanOrEqual(width - 12)
      expect(position.y).toBeGreaterThanOrEqual(90)
      expect(position.y + 350).toBeLessThanOrEqual(height - 12)
    }
  })
})
