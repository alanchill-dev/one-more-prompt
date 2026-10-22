import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageColumnBrowser } from "./prompt-usage-columns"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import type { PromptUsageProject, PromptUsageTurn } from "@/lib/prompt-usage"

const turn = (id: string, totalTokens: number): PromptUsageTurn => ({
  id, prompt: `${id} prompt`, timeLabel: "10:00", startedAt: "2026-10-16T10:00:00Z",
  tokens: { totalTokens, inputTokens: totalTokens, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 },
  agents: [], quotaObservation: null, costUsd: 1, estimationStatus: "current_rate",
})
const visible = turn("visible", 1000)
const full: PromptUsageProject = {
  id: "project", kind: "project", name: "Project", updatedAt: visible.startedAt, promptCount: 2,
  sessionCount: 1, isActive: false, codexOrder: 0,
  sessions: [{ id: "session", title: "Session", updatedAt: visible.startedAt, promptCount: 2,
    isActive: false, codexOrder: 0, turns: [visible, turn("filtered", 2000)], costUsd: 2, estimationStatus: "current_rate" }],
}

beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

describe("Flush Project prompt-list boundary", () => {
  it("counts the visible prompts without changing full summary totals or merging the scroll regions", () => {
    const filtered = { ...full, sessions: [{ ...full.sessions[0], turns: [visible] }] }
    render(<PromptUsageColumnBrowser entries={[filtered]} fullEntries={[full]} active={false}
      selectedEntryId="project" expandedEntryId="project" selectedSessionId="session" selectedTurnId={null}
      copyState={null} onSelectEntry={vi.fn()} onSelectSession={vi.fn()} onSelectTurn={vi.fn()}
      onNavigateToSession={vi.fn()} onCloseInspector={vi.fn()} onCopy={vi.fn()} />)
    const heading = screen.getByTestId("prompt-usage-prompt-list-heading")
    expect(within(heading).getByText("Prompts")).toBeInTheDocument()
    expect(within(heading).getByText("1")).toBeInTheDocument()
    const rows = screen.getByTestId("prompt-usage-scrollable-rows")
    const summary = screen.getByTestId("prompt-usage-summary-header")
    expect(within(rows).getAllByTestId("prompt-usage-prompt")).toHaveLength(1)
    expect(rows).not.toContainElement(heading)
    expect(summary).not.toContainElement(heading)
    expect(heading.parentElement).toBe(rows.parentElement)
    expect(within(summary).getByTestId("prompt-usage-session-token-total")).toHaveTextContent("3K")
    expect(within(summary).getByTestId("session-title-row")).toHaveTextContent("2 Prompts")
  })
})
