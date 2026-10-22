import { createRef } from "react"
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PromptUsageTimelineExplorer } from "@/components/prompt-usage-timeline-explorer"
import { FEATURED_PROMPT_ID, fixtureStats, projects } from "@/lib/guide-demo/fixtures"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { useGuideInteraction } from "./use-guide-interaction"
import { GUIDE_STEPS } from "./steps"

const featured = projects.flatMap(p => p.sessions.flatMap(s => s.turns)).find(t => t.id === FEATURED_PROMPT_ID)!
const eventStep = GUIDE_STEPS.findIndex(s => s.id === "event") + 1
const hour = 3_600_000
const at = Date.parse(featured.startedAt!)
const day = new Date(at)
day.setHours(0, 0, 0, 0)

beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
  useAppUiStore.getState().resetState()
  useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: featured.startedAt!.slice(0, 10) })
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1280, 800))
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function timeline(locate: boolean) {
  return <div className="guide-workspace">
    <PromptUsageTimelineExplorer projects={projects} promptCount={fixtureStats.prompts} sessionCount={fixtureStats.sessions}
      locateTurnId={locate ? FEATURED_PROMPT_ID : null} />
    <section className="guide-card"><button>Next</button></section>
  </div>
}

it.each(["late", "earliest", "minimum", "wide"])("recovers the final lesson from a %s viewport with the input guard active", async mode => {
  const view = render(timeline(false))
  const map = screen.getByRole("slider", { name: "Timeline Position" })
  if (mode === "minimum") for (let i = 0; i < 8; i++) fireEvent.keyDown(map, { key: "+" })
  if (mode === "wide") fireEvent.keyDown(map, { key: "0" })
  fireEvent.keyDown(map, { key: mode === "earliest" ? "Home" : "End" })
  await waitFor(() => expect(Number(map.getAttribute("aria-valuenow"))).toBe(
    Number(map.getAttribute(mode === "earliest" ? "aria-valuemin" : "aria-valuemax"))))
  if (mode !== "wide") expect(screen.queryByTestId(`prompt-session-event-${FEATURED_PROMPT_ID}`)).not.toBeInTheDocument()
  const card = createRef<HTMLElement>()
  card.current = view.container.querySelector(".guide-card")
  const guard = renderHook(({ step }) => useGuideInteraction(step, () => {}, card, { current: false }), { initialProps: { step: eventStep } })
  view.rerender(timeline(true))
  await waitFor(() => expect(screen.getByTestId(`prompt-session-event-${FEATURED_PROMPT_ID}`)).toBeInTheDocument())
  const start = Number(map.getAttribute("aria-valuenow"))
  const span = day.getTime() + 24 * hour - Number(map.getAttribute("aria-valuemax"))
  expect(at).toBeGreaterThan(start)
  expect(at).toBeLessThan(start + span)
  expect(span).toBeLessThanOrEqual(6 * hour)
  expect(span).toBeGreaterThanOrEqual(5 * 60_000)
  // User input remains restricted; automatic positioning must not require unlocking the map.
  const position = map.getAttribute("aria-valuenow")
  fireEvent.keyDown(map, { key: "End" })
  expect(map).toHaveAttribute("aria-valuenow", position)
  // Back to navigation, move away again, then re-enter the final lesson.
  view.rerender(timeline(false))
  guard.rerender({ step: GUIDE_STEPS.findIndex(s => s.id === "pan") + 1 })
  fireEvent.keyDown(map, { key: "End" })
  await waitFor(() => expect(map.getAttribute("aria-valuenow")).toBe(map.getAttribute("aria-valuemax")))
  guard.rerender({ step: eventStep })
  view.rerender(timeline(true))
  await waitFor(() => expect(screen.getByTestId(`prompt-session-event-${FEATURED_PROMPT_ID}`)).toBeInTheDocument())
  fireEvent.click(screen.getByTestId(`prompt-session-event-${FEATURED_PROMPT_ID}`))
  await waitFor(() => expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveTextContent("請完成首頁的響應式版面"))
})
