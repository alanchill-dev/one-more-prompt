import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PromptUsageTimelineExplorer } from "@/components/prompt-usage-timeline-explorer"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

// Keep camera animation out of a test focused on the mounted view's date clock.
vi.mock("@/components/prompt-usage-timeline-camera", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/prompt-usage-timeline-camera")>(),
  useTimelineCamera: (start: number, end: number) => ({ start, end, span: end - start, moving: false, target: { current: start }, move: vi.fn(), advance: vi.fn() }),
}))

const startedAt = new Date(2026, 8, 4, 12).toISOString()
const projects: PromptUsageProject[] = [{
  id: "project",
  kind: "project",
  name: "Project",
  updatedAt: startedAt,
  promptCount: 1,
  sessionCount: 1,
  isActive: false,
  codexOrder: 0,
  sessions: [{
    id: "session",
    title: "Session",
    updatedAt: startedAt,
    promptCount: 1,
    isActive: false,
    codexOrder: 0,
    costUsd: 0,
    estimationStatus: "current_rate",
    turns: [{
      id: "today-turn",
      prompt: "Prompt",
      timeLabel: "12:00",
      startedAt,
      tokens: { totalTokens: 15, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 0 },
      agents: [],
      quotaObservation: null,
      costUsd: 0,
      estimationStatus: "current_rate",
    }],
  }],
}]
const props = { projects, promptCount: 1, sessionCount: 1 }

describe("Timeline Date Clock", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 4, 23, 59, 30))
    window.localStorage.clear()
    useAppPreferencesStore.getState().resetState()
    useAppUiStore.getState().resetState()
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "today" })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("stops the clock while inactive and refreshes Today immediately on activation without remounting", () => {
    const setInterval = vi.spyOn(window, "setInterval")
    const clearInterval = vi.spyOn(window, "clearInterval")
    const { rerender } = render(<PromptUsageTimelineExplorer {...props} active={false} />)
    const surface = screen.getByTestId("prompt-usage-timeline-shell")
    const search = screen.getByRole("searchbox", { name: "Search Prompt Usage" })
    fireEvent.change(search, { target: { value: "Prompt" } })

    expect(setInterval).not.toHaveBeenCalled()
    expect(screen.getByTestId("prompt-session-event-today-turn")).toBeInTheDocument()

    rerender(<PromptUsageTimelineExplorer {...props} active />)
    expect(setInterval).toHaveBeenCalledOnce()
    expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), 60_000)
    const interval = setInterval.mock.results[0].value

    rerender(<PromptUsageTimelineExplorer {...props} active={false} />)
    expect(clearInterval).toHaveBeenCalledWith(interval)
    act(() => vi.advanceTimersByTime(90_000))
    expect(setInterval).toHaveBeenCalledOnce()
    expect(screen.getByTestId("prompt-session-event-today-turn")).toBeInTheDocument()

    rerender(<PromptUsageTimelineExplorer {...props} active />)
    expect(setInterval).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId("prompt-session-event-today-turn")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-timeline-shell")).toBe(surface)
    expect(screen.getByRole("searchbox", { name: "Search Prompt Usage" })).toBe(search)
    expect(search).toHaveValue("Prompt")
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "today" })
  })
})
