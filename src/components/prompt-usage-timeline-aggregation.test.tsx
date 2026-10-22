import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { PromptUsageSessionLanes } from "./prompt-usage-session-lanes"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
const hour = 3_600_000
const start = new Date(2026, 8, 7).getTime()
function item(id: string, offset: number, tokens: number, model: string): TimelineItem {
  const startedAt = start + offset * hour
  const turn = { id, prompt: id, startedAt: new Date(startedAt).toISOString(), timeLabel: "00:00", agents: [], quotaObservation: null, costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: tokens, inputTokens: tokens, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 } }
  const session = { id: "session", title: "Session", turns: [turn], updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const }
  const project = { id: "project", name: "Project", kind: "project" as const, sessions: [session], updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0 }
  return { startedAt, turn, session, project, dateKey: "2026-09-07", model: { name: model, canonicalName: model, totalTokens: tokens } }
}
it("keeps group-total scaling stable across a pan and uses neutral color for mixed models", () => {
  const items = [item("group-a", .5, 100, "a"), item("group-b", .5, 100, "b"), item("largest", 20, 1000, "a")]
  render(<PromptUsageSessionLanes items={items} start={start} end={start + 24 * hour} focusedSessionId={null} highlightedTurnId={null} onFocusSession={vi.fn()} onHighlight={vi.fn()} onSelect={vi.fn()} onSelectGroup={vi.fn()} markerColor={() => "#cc3300"}
    labels={{ session: "Session", sentAt: "Sent At", empty: "Empty", focusSession: "Focus", prompts: "Prompts" }} />)
  const first = screen.getByTestId("prompt-session-event-group-a")
  const height = first.style.getPropertyValue("--event-height")
  expect(parseFloat(height)).toBeCloseTo(16 + 24 * Math.sqrt(200 / 1000))
  expect(first.style.getPropertyValue("--event-color")).toBe("var(--muted-foreground)")
  expect(screen.queryByRole("button", { name: "Zoom In" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Move Through Time" })).toBeInTheDocument()
  const scroll = document.querySelector(".prompt-session-lanes-scroll")!
  fireEvent.wheel(scroll, { deltaX: 6000 })
  expect(screen.getByTestId("prompt-session-event-largest").style.getPropertyValue("--event-height")).toBe("40px")
  expect(screen.getByTestId("prompt-session-event-largest").style.getPropertyValue("--event-color")).toBe("#cc3300")
  fireEvent.wheel(scroll, { deltaX: -6000 })
  expect(screen.getByTestId("prompt-session-event-group-a").style.getPropertyValue("--event-height")).toBe(height)
  expect(screen.getByTestId("prompt-session-event-group-a")).toHaveAttribute("data-token-total", "200")
  expect(scroll).toHaveClass("omp-scrollbar")
})

it("keeps a group summary and its bridge outside the full width of a wide activity block", () => {
  render(<PromptUsageSessionLanes items={[item("first", .5, 100, "a"), item("second", .5, 100, "a")]} start={start} end={start + 24 * hour} focusedSessionId={null} highlightedTurnId={null} onFocusSession={vi.fn()} onHighlight={vi.fn()} onSelect={vi.fn()} onSelectGroup={vi.fn()} markerColor={() => "#cc3300"}
    labels={{ session: "Session", sentAt: "Sent At", empty: "Empty", focusSession: "Focus", prompts: "Prompts" }} />)
  const frame = screen.getByTestId("prompt-session-lanes")
  const source = screen.getByTestId("prompt-session-event-first")
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1200, 680))
  vi.spyOn(source, "getBoundingClientRect").mockReturnValue(new DOMRect(270, 300, 60, 44))
  fireEvent.pointerEnter(source, { pointerType: "mouse" })
  const card = document.querySelector<HTMLElement>(".prompt-session-preview")!
  expect(parseFloat(card.style.left)).toBe(342)
  const bridge = document.querySelector<HTMLElement>(".prompt-session-preview-bridge")!
  expect(parseFloat(bridge.style.left)).toBe(330)
  expect(parseFloat(bridge.style.width)).toBe(12)
})
