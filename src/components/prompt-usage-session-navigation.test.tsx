import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageSessionLanes, type PromptUsageSessionLanesProps } from "./prompt-usage-session-lanes"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const hour = 3_600_000
const start = new Date("2026-09-08T00:00:00").getTime()
const rowTops: Record<string, number> = { aboveFar: 0, aboveNear: 80, visible: 200, belowNear: 450, belowFar: 600, future: 800 }
function item(id: string, at = 1): TimelineItem {
  const startedAt = start + at * hour
  const turn = {
    id, prompt: `Prompt ${id}`, startedAt: new Date(startedAt).toISOString(), timeLabel: "01:00", agents: [],
    quotaObservation: null, costUsd: null, estimationStatus: "unavailable" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = { id, title: id, updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "unavailable" as const, turns: [turn] }
  const project = { id: "project", kind: "project" as const, name: "Project", updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
  return { project, session, turn, startedAt, dateKey: "2026-09-08", model: null }
}
let frames: Map<number, FrameRequestCallback>
let scrollTo: ReturnType<typeof vi.fn>
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo")

beforeEach(() => {
  useAppPreferencesStore.setState({ language: "en" })
  frames = new Map()
  let nextFrame = 0
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame }))
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)))
  scrollTo = vi.fn()
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, writable: true, value: scrollTo })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("prompt-session-navigation-map")) return new DOMRect(0, 50, 240, 24)
    if (this.classList.contains("prompt-session-lanes-scroll")) return new DOMRect(0, 100, 900, 300)
    if (this.classList.contains("prompt-session-axis")) return new DOMRect(0, 100, 900, 60)
    if (this.dataset.sessionId) return new DOMRect(0, rowTops[this.dataset.sessionId], 900, 70)
    if (this.classList.contains("prompt-session-baseline")) {
      const id = this.closest<HTMLElement>("[data-session-id]")!.dataset.sessionId!
      return new DOMRect(300, rowTops[id] + 35, 600, 1)
    }
    return new DOMRect(0, 0, 900, 700)
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollTo", scrollDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
})

function setup(overrides: Partial<PromptUsageSessionLanesProps> = {}) {
  const props: PromptUsageSessionLanesProps = {
    items: [item("aboveFar"), item("aboveNear"), item("visible"), item("belowNear"), item("belowFar"), item("future", 18)],
    start, end: start + 24 * hour, focusedSessionId: null, highlightedTurnId: null,
    onFocusSession: vi.fn(), onHighlight: vi.fn(), onSelect: vi.fn(), onSelectGroup: vi.fn(), onNarrowToDay: vi.fn(), markerColor: () => "#eee",
    labels: { session: "Sessions", sentAt: "Sent At", empty: "No Activity", focusSession: "Focus Session", prompts: "Prompts" },
    ...overrides,
  }
  const view = render(<PromptUsageSessionLanes {...props} />)
  const slider = document.querySelector<HTMLElement>(".prompt-session-navigation-map")!
  slider.setPointerCapture = vi.fn()
  slider.releasePointerCapture = vi.fn()
  const scroll = document.querySelector<HTMLElement>(".prompt-session-lanes-scroll")!
  scroll.scrollTop = 200
  const camera = () => Number(slider.getAttribute("aria-valuenow"))
  const clickAt = (at: number) => {
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: at * 10, clientY: 60 })
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: at * 10, clientY: 60 })
  }
  const wheel = (target: Element, options: WheelEventInit) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options })
    act(() => { target.dispatchEvent(event) })
    return event
  }
  return { ...view, props, slider, scroll, camera, clickAt, wheel }
}

function flushFrame(at: number) {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach(callback => callback(at)))
}

describe("Session Timeline navigation integration", () => {
  it("reveals an offscreen record immediately even before its new time window finishes animating", () => {
    const { clickAt, camera, props } = setup()
    const originalCamera = camera()
    expect(screen.queryByTestId("prompt-session-event-future")).not.toBeInTheDocument()
    clickAt(18)
    expect(camera()).toBe(originalCamera)
    expect(frames.size).toBeGreaterThan(0)
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 670, behavior: "smooth" })
    expect(props.onFocusSession).not.toHaveBeenCalled()
    expect(props.onNarrowToDay).not.toHaveBeenCalled()
    flushFrame(0)
    flushFrame(320)
    expect(screen.getByTestId("prompt-session-event-future")).toBeInTheDocument()
  })

  it("does not move Y when a clicked navigator record already has a visible matching row", () => {
    const { clickAt } = setup()
    // Several sessions share 01:00; select the visible one, never an arbitrary offscreen sibling.
    clickAt(1)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("keeps Y unchanged for blank navigator clicks, dragging over records, and horizontal wheel panning", () => {
    const { slider, clickAt, wheel, scroll, camera } = setup()
    clickAt(12)
    expect(scrollTo).not.toHaveBeenCalled()
    fireEvent.pointerDown(slider, { button: 0, pointerId: 2, clientX: 120, clientY: 60 })
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 180, clientY: 60 })
    fireEvent.pointerUp(slider, { pointerId: 2, clientX: 180, clientY: 60 })
    const prior = camera()
    expect(wheel(scroll, { deltaX: -60 }).defaultPrevented).toBe(true)
    expect(camera()).toBeLessThan(prior)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("counts only offscreen sessions active in the current time window", () => {
    const { scroll, wheel } = setup()
    expect(screen.getByRole("button", { name: "2 Sessions With Activity Above" })).toBeVisible()
    expect(screen.getByRole("button", { name: "2 Sessions With Activity Below" })).toBeVisible()
    wheel(scroll, { deltaX: 1500 })
    expect(screen.queryByRole("button", { name: /Activity Above/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "1 Sessions With Activity Below" })).toBeVisible()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("reveals the nearest below session and focuses its row without changing time or filters", () => {
    const { camera, props } = setup()
    const prior = camera()
    fireEvent.click(screen.getByRole("button", { name: "2 Sessions With Activity Below" }))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 320, behavior: "smooth" })
    expect(screen.getByRole("button", { name: "Focus Session: belowNear" })).toHaveFocus()
    expect(camera()).toBe(prior)
    expect(props.onFocusSession).not.toHaveBeenCalled()
    expect(props.onNarrowToDay).not.toHaveBeenCalled()
  })

  it("reveals the nearest above session rather than the first session in the list", () => {
    const { camera, props } = setup()
    const prior = camera()
    fireEvent.click(screen.getByRole("button", { name: "2 Sessions With Activity Above" }))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 120, behavior: "smooth" })
    expect(screen.getByRole("button", { name: "Focus Session: aboveNear" })).toHaveFocus()
    expect(camera()).toBe(prior)
    expect(props.onFocusSession).not.toHaveBeenCalled()
  })

  it("keeps label wheel vertical, maps plot wheel to time and leaves Ctrl alone", () => {
    const { camera, wheel } = setup()
    const row = document.querySelector('[data-session-id="visible"]')!
    const left = row.querySelector(".prompt-session-identity")!
    const right = row.querySelector(".prompt-session-track")!
    const prior = camera()
    expect(wheel(left, { deltaY: 120 }).defaultPrevented).toBe(false)
    expect(wheel(right, { deltaY: 120 }).defaultPrevented).toBe(true)
    expect(camera()).toBe(prior + 1.2 * hour)
    expect(wheel(right, { deltaX: 60 }).defaultPrevented).toBe(true)
    expect(camera()).toBe(prior + 1.8 * hour)
    expect(wheel(left, { deltaY: 120, shiftKey: true }).defaultPrevented).toBe(true)
    expect(camera()).toBe(prior + 3 * hour)
    expect(wheel(right, { deltaX: 120, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(wheel(left, { deltaY: 120, shiftKey: true, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(camera()).toBe(prior + 3 * hour)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("accumulates navigator wheel input without moving Sessions or changing focus", () => {
    const { slider, wheel, camera, scroll, props } = setup()
    const prior = camera()
    wheel(slider, { deltaY: 60 })
    wheel(slider, { deltaX: 60 })
    expect(camera()).toBe(prior + 1.2 * hour)
    expect(scroll.scrollTop).toBe(200)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(props.onFocusSession).not.toHaveBeenCalled()
    expect(wheel(slider, { deltaY: 120, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(camera()).toBe(prior + 1.2 * hour)
  })

  it("hides activity hints and suppresses Y reveal while a reader is open", () => {
    const { clickAt, camera, wheel, scroll, slider, props } = setup({ previewDisabled: true })
    const hints = [...document.querySelectorAll<HTMLElement>(".prompt-session-activity-hint")]
    expect(hints).toHaveLength(2)
    hints.forEach(hint => {
      expect(hint).toHaveAttribute("aria-hidden", "true")
      expect(within(hint).getByRole("button", { hidden: true })).toBeDisabled()
    })
    const prior = camera()
    expect(wheel(scroll, { deltaX: 120 }).defaultPrevented).toBe(false)
    wheel(slider, { deltaY: 120 })
    expect(camera()).toBe(prior)
    clickAt(18)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(props.onFocusSession).not.toHaveBeenCalled()
  })
})
