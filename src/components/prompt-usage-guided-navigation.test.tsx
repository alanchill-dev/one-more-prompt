import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { PromptUsageTimelineExplorer } from "./prompt-usage-timeline-explorer"
import { useAppUiStore } from "@/stores/app-ui-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import type { PromptUsageProject, PromptUsageTurn } from "@/lib/prompt-usage"

const makeTurn = (id: string, day: string): PromptUsageTurn => ({
  id, prompt: `Request ${id}`, timeLabel: "12:00", startedAt: `${day}T12:00:00`, agents: [],
  tokens: { totalTokens: 100, inputTokens: 100, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 },
  costUsd: null, estimationStatus: "unknown", quotaObservation: null,
})
const turns = [makeTurn("early", "2026-09-02"), makeTurn("later", "2026-09-08")]
const project: PromptUsageProject = {
  id: "project", name: "Project", kind: "project", updatedAt: turns[1].startedAt, promptCount: 2, sessionCount: 2, isActive: false, codexOrder: 0,
  sessions: turns.map(turn => ({ id: turn.id, title: `Session ${turn.id}`, updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, turns: [turn], costUsd: null, estimationStatus: "unknown" })),
}
const scope = { type: "range" as const, startKey: "2026-09-02", endKey: "2026-09-08" }
beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
  useAppUiStore.getState().resetState()
  useAppUiStore.getState().setPromptUsageTimeScope(scope)
})
it("navigates to later activity without changing the selected date filter or Session order", async () => {
  render(<PromptUsageTimelineExplorer projects={[project]} promptCount={2} sessionCount={2} />)
  expect(screen.getByTestId("prompt-session-event-early")).toBeInTheDocument()
  expect(screen.queryByTestId("prompt-session-event-later")).not.toBeInTheDocument()
  const laneIds = () => [...document.querySelectorAll<HTMLElement>("[data-session-id]")].map(row => row.dataset.sessionId)
  expect(laneIds()).toEqual(["early", "later"])
  const slider = screen.getByRole("slider", { name: "Timeline Position" })
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 168 } as DOMRect)
  slider.setPointerCapture = vi.fn()
  slider.releasePointerCapture = vi.fn()
  // Seven days at one pixel per hour: center the six-hour window at Sep 8, 13:00.
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 157 })
  fireEvent.pointerUp(slider, { pointerId: 1 })
  await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", String(new Date("2026-09-08T10:00:00").getTime())))
  await waitFor(() => expect(screen.getByTestId("prompt-session-event-later")).toBeInTheDocument())
  expect(useAppUiStore.getState().promptUsageTimeScope).toEqual(scope)
  expect(laneIds()).toEqual(["early", "later"])
  fireEvent.click(screen.getByTestId("prompt-session-event-later"))
  await waitFor(() => expect(screen.getByTestId("prompt-usage-details-column")).toBeInTheDocument())
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", String(new Date("2026-09-08T10:00:00").getTime()))
})

it("keeps navigator records, time position, totals and row order when Session focus changes", () => {
  render(<PromptUsageTimelineExplorer projects={[project]} promptCount={2} sessionCount={2} />)
  const slider = screen.getByRole("slider")
  const position = slider.getAttribute("aria-valuenow")
  const marks = () => slider.querySelectorAll(".prompt-session-navigation-marks i").length
  const rows = () => [...document.querySelectorAll<HTMLElement>("[data-session-id]")]
  const early = screen.getByRole("button", { name: "Focus Session: Session early" })
  const later = screen.getByRole("button", { name: "Focus Session: Session later" })
  fireEvent.click(early)
  expect(rows().map(row => row.dataset.sessionId)).toEqual(["early", "later"])
  expect(rows()[1]).toHaveAttribute("data-muted")
  expect(marks()).toBe(2)
  expect(slider).toHaveAttribute("aria-valuenow", position)
  expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("2 Prompts")
  fireEvent.click(later)
  expect(early).toHaveAttribute("aria-pressed", "false")
  expect(later).toHaveAttribute("aria-pressed", "true")
  expect(rows()[0]).toHaveAttribute("data-muted")
  fireEvent.click(later)
  expect(rows().every(row => !row.hasAttribute("data-muted"))).toBe(true)
  expect(marks()).toBe(2)
  expect(slider).toHaveAttribute("aria-valuenow", position)
})
