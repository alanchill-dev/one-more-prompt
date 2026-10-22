import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PromptUsageSessionLanes } from "./prompt-usage-session-lanes"
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
function Chart({ items }: { items: TimelineItem[] }) {
  const [highlightedTurnId, onHighlight] = useState<string | null>(null)
  return <PromptUsageSessionLanes items={items} start={start} end={end} focusedSessionId={null}
    highlightedTurnId={highlightedTurnId} onHighlight={onHighlight}
    onFocusSession={vi.fn()} onSelect={vi.fn()} onSelectGroup={vi.fn()} markerColor={() => "#abcd00"}
    labels={{ session: "Sessions", sentAt: "Sent At", empty: "No Activity", focusSession: "Focus Session", prompts: "Prompts" }} />
}
const openPreview = () => document.querySelector('.prompt-session-preview-region[data-open="true"]')

describe("Timeline Hover Stability", () => {
  it("allows a quarter second to reach the card and dismisses an abandoned crossing", () => {
    vi.useFakeTimers()
    try {
      render(<Chart items={[item("one", 15), item("two", 30, "b")]} />)
      const source = screen.getByTestId("prompt-session-event-one")
      const host = source.closest(".prompt-session-events")!
      fireEvent.pointerEnter(source, { pointerType: "mouse" })
      fireEvent.pointerLeave(source, { relatedTarget: host })
      act(() => vi.advanceTimersByTime(249))
      expect(openPreview()).toHaveTextContent("Request one")
      act(() => vi.advanceTimersByTime(1))
      expect(openPreview()).toBeNull()
      expect(document.querySelector('.prompt-session-preview-region[data-open="false"]')).toHaveTextContent("Request one")
      act(() => vi.advanceTimersByTime(239))
      expect(document.querySelector(".prompt-session-preview")).not.toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(document.querySelector(".prompt-session-preview")).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it("cancels dismissal on entering the card and allows a quarter second after leaving it", () => {
    vi.useFakeTimers()
    try {
      render(<Chart items={[item("one", 15)]} />)
      const source = screen.getByTestId("prompt-session-event-one")
      const host = source.closest(".prompt-session-events")!
      fireEvent.pointerEnter(source, { pointerType: "mouse" })
      fireEvent.pointerLeave(source, { relatedTarget: host })
      act(() => vi.advanceTimersByTime(125))
      const card = document.querySelector(".prompt-session-preview")!
      fireEvent.pointerEnter(card, { pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(5000))
      expect(openPreview()).toHaveTextContent("Request one")
      fireEvent.pointerLeave(card, { relatedTarget: host })
      act(() => vi.advanceTimersByTime(249))
      expect(openPreview()).toHaveTextContent("Request one")
      act(() => vi.advanceTimersByTime(1))
      expect(openPreview()).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it("cancels pending dismissal on returning to the same bar or card, including a frame crossing", () => {
    vi.useFakeTimers()
    try {
      render(<Chart items={[item("one", 15)]} />)
      const source = screen.getByTestId("prompt-session-event-one")
      const host = source.closest(".prompt-session-events")!
      fireEvent.pointerEnter(source, { pointerType: "mouse" })
      fireEvent.pointerLeave(source, { relatedTarget: host })
      act(() => vi.advanceTimersByTime(125))
      fireEvent.pointerEnter(source, { pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(5000))
      expect(openPreview()).toHaveTextContent("Request one")
      const card = document.querySelector(".prompt-session-preview")!
      fireEvent.pointerEnter(card, { pointerType: "mouse" })
      fireEvent.pointerLeave(card, { relatedTarget: host })
      act(() => vi.advanceTimersByTime(125))
      fireEvent.pointerEnter(card, { pointerType: "mouse" })
      act(() => vi.advanceTimersByTime(5000))
      expect(openPreview()).toHaveTextContent("Request one")
      fireEvent.pointerLeave(screen.getByTestId("prompt-session-lanes"), { relatedTarget: document.body })
      act(() => vi.advanceTimersByTime(249))
      expect(openPreview()).toHaveTextContent("Request one")
      act(() => vi.advanceTimersByTime(1))
      expect(openPreview()).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it("replaces the previous session preview when another session bar is reached", () => {
    render(<Chart items={[item("one", 15), item("two", 30, "b")]} />)
    const first = screen.getByTestId("prompt-session-event-one")
    const second = screen.getByTestId("prompt-session-event-two")
    fireEvent.pointerEnter(first, { pointerType: "mouse" })
    fireEvent.pointerEnter(second, { pointerType: "mouse" })
    expect(document.querySelectorAll(".prompt-session-preview-region")).toHaveLength(1)
    expect(openPreview()).toHaveTextContent("Request two")
    expect(first).not.toHaveAttribute("data-preview-active")
    expect(second).toHaveAttribute("data-preview-active", "true")
    fireEvent.pointerEnter(first, { pointerType: "mouse" })
    expect(document.querySelectorAll(".prompt-session-preview-region")).toHaveLength(1)
    expect(openPreview()).toHaveTextContent("Request one")
  })

  it("gives isolated marks modest padding while preventing dense target overlap", () => {
    const small = item("small", 40)
    small.turn.tokens.totalTokens = 0
    render(<Chart items={[item("one", 15), item("close", 15.8), small]} />)
    const first = screen.getByTestId("prompt-session-event-one")
    const close = screen.getByTestId("prompt-session-event-close")
    const isolated = screen.getByTestId("prompt-session-event-small")
    // A 600px track over 60 minutes places these resolvable marks 8px apart.
    expect(parseFloat(first.style.width)).toBeCloseTo(8)
    expect(parseFloat(close.style.width)).toBeCloseTo(8)
    expect(isolated).toHaveStyle({ width: "28px", height: "24px" })
    expect(first).toHaveStyle({ height: "48px" })
    const gap = (parseFloat(close.style.left) - parseFloat(first.style.left)) / 100 * 600
    expect((parseFloat(first.style.width) + parseFloat(close.style.width)) / 2).toBeLessThanOrEqual(gap + 1e-10)
    for (const button of [first, close, isolated]) expect(parseFloat(button.style.width)).toBeLessThanOrEqual(28)
  })
})
