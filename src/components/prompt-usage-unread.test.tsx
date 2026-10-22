import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PromptUsageProject, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppUiStore } from "@/stores/app-ui-store"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { PromptUsagePanel } from "./prompt-usage-panel"

function projects(isActive: boolean): PromptUsageProject[] {
  const turns: PromptUsageTurn[] = ["first", "second"].map((id, index) => ({
    id, prompt: `${id} request`, timeLabel: "09:00", startedAt: `2026-09-07T09:0${index}:00`, isActive,
    tokens: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 },
    agents: [], quotaObservation: null, costUsd: null, estimationStatus: "unknown",
  }))
  return [{ id: "project", name: "Project", kind: "project", updatedAt: turns[1].startedAt, promptCount: 2, sessionCount: 1, isActive, codexOrder: 0,
    sessions: [{ id: "session", title: "Session", updatedAt: turns[1].startedAt, promptCount: 2, isActive, codexOrder: 0, turns, costUsd: null, estimationStatus: "unknown" }],
  }]
}
const panel = (isActive: boolean) => <div className="app-panel-surface relative overflow-hidden"><PromptUsagePanel projects={projects(isActive)} promptCount={2} sessionCount={1} /></div>
const promptButton = (id: string) => screen.getByRole("button", { name: new RegExp(`^Open Prompt: ${id} request`) })

describe("Project Browser unread completion indicators", () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-07T12:00:00"))
    useAppUiStore.getState().resetState()
    useAppUiStore.getState().setActiveView("prompt-usage")
    usePromptUsageUnreadStore.getState().resetState()
  })

  it("does not mark existing completed history unread", () => {
    render(panel(false))
    expect(screen.queryByTestId("prompt-usage-entry-unread")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-session-unread")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-prompt-unread")).not.toBeInTheDocument()
  })

  it("shows completion dots in both columns and clears only an opened prompt", async () => {
    const user = userEvent.setup()
    const view = render(panel(true))
    view.rerender(panel(false))
    expect(screen.getByTestId("prompt-usage-entry-unread")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-session-unread")).toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-usage-prompt-unread")).toHaveLength(2)
    // Collapsing, expanding, and selecting the session are browsing, not reading a result.
    await user.click(screen.getByRole("button", { name: /^Open Project Project/ }))
    await user.click(screen.getByRole("button", { name: /^Open Project Project/ }))
    await user.click(screen.getByRole("button", { name: /^Open Session Session/ }))
    expect(screen.getAllByTestId("prompt-usage-prompt-unread")).toHaveLength(2)
    await user.click(promptButton("first"))
    expect(screen.getAllByTestId("prompt-usage-prompt-unread")).toHaveLength(1)
    expect(screen.getByTestId("prompt-usage-entry-unread")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-session-unread")).toBeInTheDocument()
    await user.click(promptButton("second"))
    expect(screen.queryByTestId("prompt-usage-prompt-unread")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-entry-unread")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-session-unread")).not.toBeInTheDocument()
  })

  it("marks hidden filtered results read and can undo the complete batch", async () => {
    const user = userEvent.setup()
    const view = render(panel(true))
    view.rerender(panel(false))
    await user.type(screen.getByRole("searchbox"), "first request")
    expect(screen.queryByRole("button", { name: /^Open Prompt: second request/ })).not.toBeInTheDocument()
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: "Mark All Read 2" }))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual([])
    expect(screen.queryByTestId("prompt-usage-entry-unread")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toHaveLength(2)
  })

  it("acknowledges completion already visible in the inspector", async () => {
    const user = userEvent.setup()
    const view = render(panel(true))
    await user.click(promptButton("first"))
    view.rerender(panel(false))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual(['["session","second"]'])
    expect(screen.getAllByTestId("prompt-usage-prompt-unread")).toHaveLength(1)
  })

  it("retains hidden-view completion until the selected inspector is visible again", async () => {
    const user = userEvent.setup()
    const view = render(panel(true))
    await user.click(promptButton("first"))
    act(() => useAppUiStore.getState().setActiveView("home"))
    view.rerender(panel(false))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toHaveLength(2)
    act(() => useAppUiStore.getState().setActiveView("prompt-usage"))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual(['["session","second"]'])
  })
})
