import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PromptUsageSessionLanes, type PromptUsageSessionLanesProps } from "./prompt-usage-session-lanes"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"

const start = new Date("2026-09-07T09:00:00").getTime()
const end = start + 60 * 60_000
function item(id: string, minute: number, sessionId = "a"): TimelineItem {
  const startedAt = start + minute * 60_000
  const turn = {
    id, prompt: `Request ${id}`, startedAt: new Date(startedAt).toISOString(), timeLabel: "09:00",
    agents: [], quotaObservation: null, costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = { id: sessionId, title: `Session ${sessionId}`, updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const, turns: [turn] }
  const project = { id: "project", kind: "project" as const, name: "Project", updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
  return { project, session, turn, startedAt, dateKey: "2026-09-07", model: null }
}
function props(items: TimelineItem[]): PromptUsageSessionLanesProps {
  return {
    items, start, end, focusedSessionId: null, highlightedTurnId: null,
    onFocusSession: vi.fn(), onHighlight: vi.fn(), onSelect: vi.fn(), onSelectGroup: vi.fn(), markerColor: () => "#abcd00",
    labels: { session: "Sessions", sentAt: "Sent At", empty: "No Activity", focusSession: "Focus Session", prompts: "Prompts" },
  }
}

describe("PromptUsageSessionLanes", () => {

  it("reuses the complete inspector in hover and keeps internal scrolling and copying interactive", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const entry = item("one", 15)
    entry.turn.prompt = "Full prompt\n" + "Detailed content ".repeat(40) + "last sentence"
    const inputs = props([entry])
    render(<PromptUsageSessionLanes {...inputs} />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    const inspector = screen.getByTestId("prompt-usage-details-column")
    expect(inspector).toHaveTextContent("last sentence")
    expect(within(inspector).getByTestId("prompt-usage-token-ledger")).toBeInTheDocument()
    fireEvent.scroll(inspector)
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "true")
    await user.click(within(inspector).getByRole("button", { name: "Copy Prompt" }))
    expect(writeText).toHaveBeenCalledWith(entry.turn.prompt)
    expect(within(inspector).getByRole("button", { name: "Prompt Copied" })).toBeInTheDocument()
    expect(inputs.onSelect).not.toHaveBeenCalled()
  })

  it("keeps the hover inspector open while the nested API explanation handles Escape", async () => {
    const user = userEvent.setup()
    render(<PromptUsageSessionLanes {...props([item("one", 15)])} />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    await user.click(screen.getByRole("button", { name: "How Is The API Estimate Calculated?" }))
    const popup = document.querySelector<HTMLElement>("[data-cost-explanation]")!
    expect(popup).toBeInTheDocument()
    fireEvent.pointerLeave(document.querySelector(".prompt-session-preview-region")!, { relatedTarget: popup })
    fireEvent.scroll(popup)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(document.querySelector("[data-cost-explanation]")).toBeNull())
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "true")
    await user.keyboard("{Escape}")
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "false")
  })


  it("opens the exact preview prompt in Project Browser using its whole card as the animation source", () => {
    const inputs = { ...props([item("one", 15)]), onOpenPrompt: vi.fn() }
    render(<PromptUsageSessionLanes {...inputs} />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, clientY: 35, pointerType: "mouse" })
    const card = document.querySelector(".prompt-session-preview")!
    const action = within(card as HTMLElement).getByRole("button", { name: "Open In Project Browser" })
    expect(action.closest("button button")).toBeNull()
    fireEvent.click(action)
    expect(inputs.onOpenPrompt).toHaveBeenCalledWith(inputs.items[0], card)
    expect(inputs.onSelect).not.toHaveBeenCalled()
  })

  it("keeps manual horizontal movement independent of vertical Session position", async () => {
    const inputs = { ...props([item("early", 15), item("later", 800, "b")]), end: start + 24 * 60 * 60_000 }
    render(<PromptUsageSessionLanes {...inputs} />)
    const scroll = document.querySelector<HTMLDivElement>(".prompt-session-lanes-scroll")!
    const axis = document.querySelector<HTMLElement>(".prompt-session-axis")!
    const later = document.querySelector<HTMLElement>('[data-session-id="b"]')!
    vi.spyOn(scroll, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600))
    vi.spyOn(axis, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 58))
    vi.spyOn(later, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 828, 800, 70))
    const scrollTo = vi.fn()
    scroll.scrollTo = scrollTo
    fireEvent.wheel(scroll, { deltaX: 900, deltaY: 0 })
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(scrollTo).not.toHaveBeenCalled()
    expect([...scroll.querySelectorAll<HTMLElement>("[data-session-id]")].map(row => row.dataset.sessionId)).toEqual(["a", "b"])
  })

  it("uses horizontal wheel gestures to advance time while retaining session rows and pausing for a pinned reader", async () => {
    const inputs = { ...props([item("early", 15), item("later", 900, "b")]), end: start + 24 * 60 * 60_000 }
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
    const scroll = document.querySelector(".prompt-session-lanes-scroll")!
    const slider = document.querySelector<HTMLElement>(".prompt-session-navigation-map")!
    expect(document.querySelectorAll("[data-session-id]")).toHaveLength(2)
    expect(screen.queryByTestId("prompt-session-event-later")).not.toBeInTheDocument()
    const scrollTo = vi.fn()
    Object.defineProperty(scroll, "scrollTo", { value: scrollTo })
    Object.defineProperty(scroll, "clientHeight", { value: 100 })
    fireEvent.wheel(scroll, { deltaX: 100 })
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start + 60 * 60_000)
    expect(screen.queryByTestId("prompt-session-event-later")).not.toBeInTheDocument()
    fireEvent.wheel(scroll, { deltaX: 100 })
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(start + 2 * 60 * 60_000)
    fireEvent.wheel(scroll, { deltaX: 1200 })
    expect(screen.getByTestId("prompt-session-event-later")).toBeInTheDocument()
    expect(scrollTo).not.toHaveBeenCalled()
    const position = slider.getAttribute("aria-valuenow")
    rerender(<PromptUsageSessionLanes {...inputs} previewDisabled />)
    fireEvent.wheel(scroll, { deltaX: -500 })
    expect(slider.getAttribute("aria-valuenow")).toBe(position)
    rerender(<PromptUsageSessionLanes {...inputs} />)
    fireEvent.wheel(scroll, { deltaX: -700 })
    fireEvent.wheel(scroll, { deltaX: -700 })
    await waitFor(() => expect(screen.getByTestId("prompt-session-event-early")).toBeInTheDocument())
    expect(document.querySelectorAll("[data-session-id]")).toHaveLength(2)
  })

  it("lets label wheel browse rows while plot wheel moves time", () => {
    const items = Array.from({ length: 104 }, (_, index) => item(`turn-${index}`, 15, `session-${index}`))
    render(<PromptUsageSessionLanes {...props(items)} end={start + 30 * 24 * 60 * 60_000} />)
    const scroll = document.querySelector(".prompt-session-lanes-scroll")!
    const track = document.querySelector(".prompt-session-ticks")!
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({ left: 220, width: 600 } as DOMRect)
    const slider = document.querySelector<HTMLElement>(".prompt-session-navigation-map")!
    const position = slider.getAttribute("aria-valuenow")
    expect(document.querySelectorAll("[data-session-id]")).toHaveLength(104)
    const labelWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 100, deltaY: 100 })
    fireEvent(screen.getByRole("button", { name: "Focus Session: Session session-0" }), labelWheel)
    expect(labelWheel.defaultPrevented).toBe(false)
    expect(slider.getAttribute("aria-valuenow")).toBe(position)
    const chartWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 300, deltaY: 100, shiftKey: true })
    fireEvent(scroll, chartWheel)
    expect(chartWheel.defaultPrevented).toBe(true)
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(Number(position) + 60 * 60_000)
  })

  it("places prompts at their true timestamps, with no inferred duration, and excludes the next interval", () => {
    render(<PromptUsageSessionLanes {...props([item("one", 15), item("two", 45), item("next", 60)])} />)
    expect(screen.getByTestId("prompt-session-event-one")).toHaveStyle({ left: "25%" })
    expect(screen.getByTestId("prompt-session-event-two")).toHaveStyle({ left: "75%" })
    expect(screen.queryByTestId("prompt-session-event-next")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-session-event-one")).toHaveAccessibleName(/09:15:00/)
    expect(document.querySelectorAll(".prompt-session-event")).toHaveLength(2)
  })

  it("focuses a session without removing or reordering the other lanes", () => {
    const inputs = props([item("one", 15), item("two", 30, "b")])
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
    fireEvent.click(screen.getByRole("button", { name: "Focus Session: Session b" }))
    expect(inputs.onFocusSession).toHaveBeenCalledWith("b")
    rerender(<PromptUsageSessionLanes {...inputs} focusedSessionId="b" />)
    const lanes = [...document.querySelectorAll("[data-session-id]")]
    expect(lanes.map((lane) => lane.getAttribute("data-session-id"))).toEqual(["a", "b"])
    expect(lanes[0]).toHaveAttribute("data-muted", "true")
    expect(screen.getByRole("button", { name: "Focus Session: Session b" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("prompt-session-event-one")).toBeInTheDocument()
  })

  it("hides both offscreen activity hints while a session is focused and restores them on clearing focus", () => {
    const ids = ["a", "b", "c", "d", "e", "f"]
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("prompt-session-lanes-scroll")) return new DOMRect(0, 100, 400, 250)
      if (this.classList.contains("prompt-session-axis")) return new DOMRect(0, 100, 400, 40)
      const row = this.closest<HTMLElement>("[data-session-id]")
      if (!row) return new DOMRect()
      const top = ids.indexOf(row.dataset.sessionId!) * 70
      return this === row ? new DOMRect(0, top, 400, 70) : new DOMRect(100, top + 35, 300, 1)
    })
    try {
      const inputs = props(ids.map(id => item(`turn-${id}`, 15, id)))
      const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
      const hints = [...document.querySelectorAll<HTMLElement>(".prompt-session-activity-hint")]
      expect(hints).toHaveLength(2)
      expect(hints.map(hint => hint.dataset.direction)).toEqual(["above", "below"])
      for (const hint of hints) {
        expect(hint).toHaveAttribute("data-visible", "true")
        expect(hint.closest(".prompt-session-chart-viewport")).not.toBeNull()
      }
      rerender(<PromptUsageSessionLanes {...inputs} focusedSessionId="c" />)
      for (const hint of hints) {
        expect(hint).toHaveAttribute("aria-hidden", "true")
        expect(hint).not.toHaveAttribute("data-visible")
        expect(hint.querySelector("button")).toBeDisabled()
        expect(hint.querySelector("button")).toHaveAttribute("tabindex", "-1")
      }
      rerender(<PromptUsageSessionLanes {...inputs} focusedSessionId={null} />)
      for (const hint of hints) {
        expect(hint).toHaveAttribute("data-visible", "true")
        expect(hint).toHaveAttribute("aria-hidden", "false")
        expect(hint.querySelector("button")).toBeEnabled()
        expect(hint.querySelector("button")).toHaveAttribute("tabindex", "0")
      }
    } finally { geometry.mockRestore() }
  })

  it("selects every exact group member from the keyboard without opening a popover", async () => {
    const user = userEvent.setup()
    const inputs = props([item("one", 15), item("two", 15), item("three", 15)])
    render(<PromptUsageSessionLanes {...inputs} />)
    const cluster = screen.getByRole("button", { name: /3 Prompts/ })
    cluster.focus()
    await user.keyboard("{Enter}")
    expect(inputs.onSelectGroup).toHaveBeenCalledWith([...inputs.items].sort((a, b) => a.turn.id.localeCompare(b.turn.id)), cluster)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("cross-highlights events on focus and passes the stable source button for the inspector", () => {
    const inputs = props([item("one", 15)])
    render(<PromptUsageSessionLanes {...inputs} highlightedTurnId="one" />)
    const dot = screen.getByTestId("prompt-session-event-one")
    expect(dot).toHaveAttribute("data-highlighted", "true")
    fireEvent.focus(dot)
    expect(inputs.onHighlight).toHaveBeenLastCalledWith("one")
    fireEvent.click(dot)
    expect(inputs.onSelect).toHaveBeenCalledWith(inputs.items[0], dot)
    fireEvent.blur(dot)
    expect(inputs.onHighlight).toHaveBeenLastCalledWith(null)
  })

  it("keeps resolvable detail events at their true timestamps", () => {
    render(<PromptUsageSessionLanes {...props([item("one", 15), item("two", 16), item("three", 17)])} />)
    expect(document.querySelectorAll(".prompt-session-event")).toHaveLength(3)
    expect(screen.getByTestId("prompt-session-event-one")).toHaveStyle({ left: "25%" })
    expect(document.querySelectorAll(".prompt-session-baseline")).toHaveLength(1)
  })

  it("merges colliding events while preserving a separate later timestamp", () => {
    render(<PromptUsageSessionLanes {...props([item("one", 0), item("two", .05), item("three", 3)])} />)
    const cluster = screen.getByRole("button", { name: /2 Prompts/ })
    expect(cluster).toHaveAttribute("data-token-total", "200")
    expect(screen.getByTestId("prompt-session-event-three")).toBeInTheDocument()
  })

  it("retains the chosen group highlight after pointer movement", () => {
    render(<PromptUsageSessionLanes {...props([item("one", 15), item("two", 15)])} selectedGroupIds={["one", "two"]} />)
    const cluster = screen.getByRole("button", { name: /2 Prompts/ })
    fireEvent.mouseLeave(cluster)
    expect(cluster).toHaveAttribute("aria-pressed", "true")
    expect(cluster).toHaveAttribute("data-highlighted", "true")
  })

  it("maintains disjoint marker hitboxes and exact membership across uneven bursts", () => {
    const inputs = props([0, 2.7, 2.8, 2.9, 5.4, 5.5, 8, 8.1, 15, 18, 21, 48, 50.7, 50.8, 57].map((minute, index) => item(`request-${index}`, minute)))
    render(<PromptUsageSessionLanes {...inputs} />)
    const markers = [...document.querySelectorAll<HTMLButtonElement>(".prompt-session-event")]
    markers.forEach((marker) => fireEvent.click(marker))
    const selected = [
      ...vi.mocked(inputs.onSelectGroup).mock.calls.flatMap(([items]) => items.map((item) => item.turn.id)),
      ...vi.mocked(inputs.onSelect).mock.calls.map(([item]) => item.turn.id),
    ]
    expect(selected.sort()).toEqual(inputs.items.map((item) => item.turn.id).sort())
    expect(document.querySelectorAll(".prompt-session-baseline")).toHaveLength(1)
    expect(markers.every((marker) => marker.style.top === "35px")).toBe(true)
  })

  it("labels whole hours across midnight using local year/month/day", () => {
    const day = new Date(2026, 8, 7, 23).getTime()
    const onNarrowToDay = vi.fn()
    render(<PromptUsageSessionLanes {...props([])} start={day} end={day + 3 * 60 * 60_000} onNarrowToDay={onNarrowToDay} />)
    const axis = document.querySelector<HTMLElement>(".prompt-session-ticks")!
    const midnight = within(axis).getByRole("button", { name: "2026/9/8 00:00" })
    fireEvent.click(midnight)
    expect(onNarrowToDay).toHaveBeenCalledWith("2026-09-08")
    expect([...axis.children].map(tick => (tick as HTMLElement).style.left)).toEqual(["0%", "33.33333333333333%", "66.66666666666666%", "100%"])
  })

  it("keeps visual detail unchanged for coarse pointers", () => {
    const matchMedia = window.matchMedia
    const mock = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...matchMedia(query), matches: query === "(pointer: coarse)" }))
    try {
      render(<PromptUsageSessionLanes {...props([item("one", 0), item("two", 3)])} />)
      expect(screen.getByTestId("prompt-session-event-one")).toBeInTheDocument()
      expect(screen.getByTestId("prompt-session-event-two")).toBeInTheDocument()
    } finally { mock.mockRestore() }
  })

  it("unfolds a preview on the actual bar and preserves travel into the preview", () => {
    const inputs = props([item("one", 15), item("two", 21)])
    render(<PromptUsageSessionLanes {...inputs} />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, clientY: 35, pointerType: "mouse" })
    const preview = document.querySelector<HTMLElement>(".prompt-session-preview")!
    expect(preview).toHaveTextContent("Request one")
    expect(inputs.onSelect).not.toHaveBeenCalled()
    fireEvent.pointerLeave(events, { relatedTarget: preview })
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "true")
    fireEvent.click(screen.getByTestId("prompt-session-event-one"))
    expect(inputs.onSelect).toHaveBeenCalledWith(inputs.items[0], screen.getByTestId("prompt-session-event-one"))
  })

  it("dismisses hover with Escape until the pointer leaves", () => {
    render(<PromptUsageSessionLanes {...props([item("one", 15)])} />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    fireEvent.keyDown(document, { key: "Escape" })
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "false")
  })

  it("suppresses hover while the full reader owns interaction and discards previews on scroll", () => {
    const inputs = props([item("one", 15)])
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} previewDisabled />)
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    expect(document.querySelector(".prompt-session-preview")).toBeNull()
    rerender(<PromptUsageSessionLanes {...inputs} />)
    fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
    expect(document.querySelector(".prompt-session-preview")).not.toBeNull()
    fireEvent.scroll(document.querySelector(".prompt-session-lanes-scroll")!)
    expect(document.querySelector(".prompt-session-preview")).toBeNull()
  })

  it("anchors ticks to whole hours even when the viewport starts at an arbitrary minute", () => {
    const localStart = new Date(2026, 8, 7, 9, 7).getTime()
    render(<PromptUsageSessionLanes {...props([])} start={localStart} end={localStart + 3 * 60 * 60_000} />)
    const ticks = document.querySelector(".prompt-session-ticks")!
    expect(ticks).toHaveTextContent("10:00")
    expect(ticks).toHaveTextContent("11:00")
    expect(ticks).toHaveTextContent("12:00")
    expect(ticks).not.toHaveTextContent("09:07")
    expect(ticks).not.toHaveTextContent("12:07")
  })

  it("uses token-sized bars with a period-wide scale and exposes grouped totals", () => {
    const small = item("small", 15), large = item("large", 45), grouped = item("large-2", 45)
    small.turn.tokens.totalTokens = 25
    large.turn.tokens.totalTokens = 100
    grouped.turn.tokens.totalTokens = 100
    render(<PromptUsageSessionLanes {...props([small, large, grouped])} />)
    expect(parseFloat(screen.getByTestId("prompt-session-event-small").style.getPropertyValue("--event-height"))).toBeCloseTo(16 + 24 * Math.sqrt(25 / 200))
    const group = screen.getByTestId("prompt-session-event-large")
    expect(group.style.getPropertyValue("--event-height")).toBe("40px")
    expect(group).toHaveAttribute("data-token-total", "200")
    expect(group).toHaveAccessibleName(/2 Prompts · 200 Tokens/)
  })
})


it("links navigator marks to session identity even at identical timestamps and clears emphasis", () => {
  const inputs = { ...props([item("later", 50, "b"), item("one", 15), item("same", 15, "b")]), end: start + 24 * 60 * 60_000 }
  const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
  const marks = () => [...document.querySelectorAll(".prompt-session-navigation-marks i")]
  const positions = marks().map(mark => mark.getAttribute("style"))
  rerender(<PromptUsageSessionLanes {...inputs} focusedSessionId="b" />)
  expect(marks().map(mark => mark.hasAttribute("data-selected"))).toEqual([false, true, true])
  expect(marks().map(mark => mark.hasAttribute("data-muted"))).toEqual([true, false, false])
  rerender(<PromptUsageSessionLanes {...inputs} focusedSessionId="a" />)
  expect(marks().map(mark => mark.hasAttribute("data-selected"))).toEqual([true, false, false])
  rerender(<PromptUsageSessionLanes {...inputs} />)
  expect(marks().every(mark => !mark.hasAttribute("data-selected") && !mark.hasAttribute("data-muted"))).toBe(true)
  expect(marks().map(mark => mark.getAttribute("style"))).toEqual(positions)
})


it.each([200, 1000])("places the tall preview beside the source at %ipx within the frame", x => {
  render(<PromptUsageSessionLanes {...props([item("one", 15)])} />)
  const frame = screen.getByTestId("prompt-session-lanes")
  const source = screen.getByTestId("prompt-session-event-one")
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 1200, height: 680 } as DOMRect)
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue({ left: x - 1, top: 300, width: 2, height: 44 } as DOMRect)
  const events = document.querySelector<HTMLElement>(".prompt-session-events")!
  vi.spyOn(events, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 600, height: 70 } as DOMRect)
  fireEvent.pointerMove(screen.getByTestId("prompt-session-event-one"), { clientX: 150, pointerType: "mouse" })
  const card = document.querySelector<HTMLElement>(".prompt-session-preview")!
  const left = parseFloat(card.style.left), top = parseFloat(card.style.top)
  const width = parseFloat(card.style.width), height = parseFloat(card.style.height)
  expect(width).toBe(480)
  expect(height).toBe(620)
  expect(left).toBeGreaterThanOrEqual(0)
  expect(left + width).toBeLessThanOrEqual(1200)
  expect(top).toBeGreaterThanOrEqual(0)
  expect(top + height).toBeLessThanOrEqual(680)
  expect(x < left || x > left + width).toBe(true)
  const bridge = document.querySelector<HTMLElement>(".prompt-session-preview-bridge")!
  const bridgeLeft = parseFloat(bridge.style.left), bridgeWidth = parseFloat(bridge.style.width)
  if (left > x) {
    expect(bridgeLeft).toBe(x + 1)
    expect(bridgeLeft + bridgeWidth).toBe(left)
  } else {
    expect(bridgeLeft).toBe(left + width)
    expect(bridgeLeft + bridgeWidth).toBe(x - 1)
  }
})


it.each([{ x: 800, direction: -1 }, { x: 400, direction: 1 }])(
  "retargets a bridge-covered neighboring group with the card on direction $direction",
  ({ x, direction }) => {
    const single = item("single", 15)
    const grouped = [item("group-first", 15 + direction * 6), item("group-second", 15 + direction * 6)]
    const inputs = props([single, ...grouped])
    render(<PromptUsageSessionLanes {...inputs} />)
    const frame = screen.getByTestId("prompt-session-lanes")
    const source = screen.getByTestId("prompt-session-event-single")
    const group = screen.getByTestId("prompt-session-event-group-first")
    const neighborX = x + direction * 10
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1200, 680))
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(x - 1, 300, 2, 44))
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue(new DOMRect(neighborX - 1, 300, 2, 44))
    const events = document.querySelector<HTMLElement>(".prompt-session-events")!
    vi.spyOn(events, "getBoundingClientRect").mockReturnValue(new DOMRect(x - 150, 287, 600, 70))
    const preview = () => document.querySelector<HTMLElement>(".prompt-session-preview")!
    const bridge = () => document.querySelector<HTMLElement>(".prompt-session-preview-bridge")!
    fireEvent.pointerMove(source, { clientX: x, clientY: 322, pointerType: "mouse" })
    expect(preview()).toHaveTextContent("Request single")
    const passageLeft = parseFloat(bridge().style.left)
    expect(neighborX).toBeGreaterThan(passageLeft)
    expect(neighborX).toBeLessThan(passageLeft + parseFloat(bridge().style.width))

    // Empty passage preserves access to the current card instead of nearest-X scrubbing.
    fireEvent.pointerMove(bridge(), { clientX: x + direction * 5, clientY: 322, pointerType: "mouse" })
    expect(preview()).toHaveTextContent("Request single")
    fireEvent.pointerMove(bridge(), { clientX: neighborX, clientY: 322, pointerType: "mouse" })
    expect(preview()).toHaveTextContent("2 Prompts")
    expect(within(preview()).getByRole("button", { name: "Open 2 Prompts" })).toBeInTheDocument()
    expect(within(preview()).queryByTestId("prompt-usage-token-ledger")).not.toBeInTheDocument()
    expect(group).toHaveAttribute("data-preview-active", "true")
    expect(source).not.toHaveAttribute("data-preview-active")

    // Travel back to the original bar must also switch immediately.
    fireEvent.pointerMove(source, { clientX: x, clientY: 322, pointerType: "mouse" })
    expect(preview()).toHaveTextContent("Request single")
    expect(source).toHaveAttribute("data-preview-active", "true")
    expect(group).not.toHaveAttribute("data-preview-active")
    fireEvent.click(bridge(), { clientX: neighborX, clientY: 322 })
    expect(inputs.onSelectGroup).toHaveBeenCalledWith(grouped, group)
    expect(inputs.onSelect).not.toHaveBeenCalled()
  },
)


it("ignores empty lane space even when it is close to a bar", () => {
  const inputs = props([item("one", 15)])
  render(<PromptUsageSessionLanes {...inputs} />)
  const events = document.querySelector<HTMLElement>(".prompt-session-events")!
  vi.spyOn(events, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 70))
  for (const [clientX, clientY] of [[155, 35], [150, 5]]) {
    fireEvent.pointerMove(events, { clientX, clientY, pointerType: "mouse" })
    fireEvent.click(events, { clientX, clientY })
  }
  expect(document.querySelector(".prompt-session-preview")).toBeNull()
  expect(inputs.onSelect).not.toHaveBeenCalled()
  expect(inputs.onSelectGroup).not.toHaveBeenCalled()
})

it("keeps a slow bridge crossing open through an equivalent data refresh", () => {
  vi.useFakeTimers()
  try {
    const inputs = props([item("one", 15)])
    const { rerender } = render(<PromptUsageSessionLanes {...inputs} />)
    const source = screen.getByTestId("prompt-session-event-one")
    vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(199, 300, 2, 40))
    vi.spyOn(screen.getByTestId("prompt-session-lanes"), "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1200, 680))
    fireEvent.pointerMove(source, { clientX: 200, clientY: 320, pointerType: "mouse" })
    const bridge = document.querySelector<HTMLElement>(".prompt-session-preview-bridge")!
    fireEvent.pointerLeave(document.querySelector(".prompt-session-events")!, { relatedTarget: bridge })
    fireEvent.pointerMove(bridge, { clientX: 210, clientY: 320, pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(5000))
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "true")
    rerender(<PromptUsageSessionLanes {...inputs} items={[item("one", 15)]} />)
    act(() => vi.advanceTimersByTime(5000))
    expect(document.querySelector(".prompt-session-preview-region")).toHaveAttribute("data-open", "true")
    expect(document.querySelector(".prompt-session-preview")).toHaveTextContent("Request one")
  } finally { vi.useRealTimers() }
})
