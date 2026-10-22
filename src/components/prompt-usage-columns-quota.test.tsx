import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { PromptUsageColumnBrowser } from "./prompt-usage-columns"
import type { PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import type { SessionQuotaState } from "@/hooks/use-session-quota"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const turn: PromptUsageTurn = {
  id: "prompt", prompt: "Review the implementation", startedAt: "2026-10-15T09:00:00Z", timeLabel: "09:00",
  agents: [], quotaObservation: null, costUsd: 1, estimationStatus: "current_rate",
  tokens: { totalTokens: 1000, inputTokens: 800, cachedInputTokens: 0, outputTokens: 200, reasoningOutputTokens: 0 },
}
const session: PromptUsageSession = {
  id: "project-session", title: "Project Session", updatedAt: turn.startedAt, promptCount: 1,
  isActive: false, codexOrder: 0, costUsd: 1, estimationStatus: "current_rate", turns: [turn],
}
const project: PromptUsageProject = {
  id: "project", name: "Project", kind: "project", updatedAt: turn.startedAt, promptCount: 1,
  sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session],
}
const standalone: PromptUsageProject = {
  ...project, id: "standalone", name: "Standalone Session", kind: "standalone",
  sessions: [{ ...session, id: "standalone-session", title: "Standalone Session" }],
}
const quota: SessionQuotaState = { loading: false, error: false, response: {
  dataAsOf: "2026-10-15T10:00:00Z", entries: [
    { threadId: session.id, weeklyPercent: 12.5, status: "partial" },
    { threadId: "standalone-session", weeklyPercent: 7.25, status: "partial" },
  ],
} }
const callbacks = { onSelectEntry: vi.fn(), onSelectSession: vi.fn(), onSelectTurn: vi.fn(), onNavigateToSession: vi.fn(), onCloseInspector: vi.fn(), onCopy: vi.fn() }
beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

it("keeps official quota values in the summary while both left-hand Session kinds show only browsing metadata", () => {
  const browser = (selected: PromptUsageProject) => <PromptUsageColumnBrowser {...callbacks}
    entries={[project, standalone]} sessionQuota={quota} selectedEntryId={selected.id} expandedEntryId={project.id}
    selectedSessionId={selected.sessions[0].id} selectedTurnId={null} copyState={null} />
  const view = render(browser(project))
  const scope = screen.getByTestId("prompt-usage-scope-column")
  expect(scope).toHaveTextContent("1K Tokens")
  expect(within(scope).getByTestId("prompt-usage-session-project-session")).toHaveTextContent("1 Prompt")
  expect(within(scope).getByTestId("prompt-usage-entry-standalone")).toHaveTextContent("1K Tokens")
  expect(scope).not.toHaveTextContent(/%|Partial/i)
  expect(within(scope).queryByTestId("session-quota-inline")).not.toBeInTheDocument()
  for (const kind of ["project", "session"]) {
    expect(within(screen.getByTestId(`prompt-usage-${kind}-summary`)).getByTestId("session-quota-value")).toHaveTextContent("12.5%")
  }
  view.rerender(browser(standalone))
  expect(screen.getByTestId("prompt-usage-scope-column")).not.toHaveTextContent(/%|Partial/i)
  expect(within(screen.getByTestId("prompt-usage-session-summary")).getByTestId("session-quota-value")).toHaveTextContent("7.25%")
})

it("uses every full-project root in quota coverage even when filtered rows and query inputs omit one", () => {
  const completeProject = { ...project, sessions: [
    { ...session, descendantThreadIds: ["child"] },
    { ...session, id: "child" },
    { ...session, id: "missing-created-at", createdAt: null },
  ] }
  render(<PromptUsageColumnBrowser {...callbacks} entries={[project]} fullEntries={[completeProject]} sessionQuota={quota}
    selectedEntryId={project.id} expandedEntryId={project.id} selectedSessionId={session.id} selectedTurnId={null} copyState={null} />)
  const projectSummary = within(screen.getByTestId("prompt-usage-project-summary"))
  expect(projectSummary.getByTestId("session-quota-value")).toHaveTextContent("12.5%")
  expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
  fireEvent.click(projectSummary.getByTestId("session-quota-coverage-trigger"))
  expect(screen.getByTestId("session-quota-coverage")).toHaveAccessibleName("Of 2 conversations (Session), official weekly quota values are provided for 1 and not provided for 1.")
  fireEvent.keyDown(document, { key: "Escape" })
  expect(projectSummary.queryByTestId("session-quota-partial")).toBeNull()
  fireEvent.click(within(screen.getByTestId("prompt-usage-session-summary")).getByTestId("session-quota-coverage-trigger"))
  expect(screen.queryByTestId("session-quota-coverage")).toBeNull()
  expect(screen.getByRole("tooltip")).not.toHaveTextContent("1/1")
})


it("keeps all 28 local conversations, Prompts and Tokens accessible when official quota is provided for only one", () => {
  const sessions: PromptUsageSession[] = Array.from({ length: 28 }, (_, index) => ({
    ...session, id: `history-${index}`, title: `Local conversation ${index + 1}`, promptCount: 2,
    turns: Array.from({ length: 2 }, (_, promptIndex) => ({
      ...turn, id: `local-prompt-${index}-${promptIndex}`, prompt: `Recorded work ${index + 1}, Prompt ${promptIndex + 1}`,
    })),
  }))
  const fullProject: PromptUsageProject = { ...project, sessions, sessionCount: 28, promptCount: 56 }
  const officialQuota: SessionQuotaState = { loading: false, error: false, response: {
    dataAsOf: "2026-10-21T10:00:00Z",
    entries: sessions.map((item, index) => ({ threadId: item.id,
      status: index === 0 ? "partial" : "unavailable", weeklyPercent: index === 0 ? 57.37601251912773 : null })),
  } }
  function Browser() {
    const [selectedSession, selectSession] = useState(sessions[0])
    const [selectedTurn, selectTurn] = useState<PromptUsageTurn | null>(null)
    return <PromptUsageColumnBrowser {...callbacks} entries={[fullProject]} sessionQuota={officialQuota}
      selectedEntryId={project.id} expandedEntryId={project.id} selectedSessionId={selectedSession.id}
      selectedTurnId={selectedTurn?.id ?? null} copyState={null}
      onSelectSession={item => { selectSession(item); selectTurn(null) }} onSelectTurn={selectTurn} />
  }
  render(<Browser />)
  const projectSummary = screen.getByTestId("prompt-usage-project-summary")
  expect(projectSummary).toHaveTextContent("56 Prompts")
  expect(screen.getByTestId("prompt-usage-project-token-total")).toHaveTextContent("56K")
  expect(within(projectSummary).getByTestId("session-quota-value")).toHaveTextContent("57.38%")
  fireEvent.click(within(projectSummary).getByTestId("session-quota-coverage-trigger"))
  const coverage = screen.getByTestId("session-quota-coverage")
  expect(coverage).toHaveAccessibleName("Of 28 conversations (Session), official weekly quota values are provided for 1 and not provided for 27.")
  expect(coverage).toHaveTextContent("With official quota: 1 · Quota not provided: 27")
  expect(coverage).not.toHaveTextContent("Missing data")
  expect(coverage.querySelectorAll('[data-recorded="true"]')).toHaveLength(1)
  expect(coverage.querySelectorAll('[data-recorded="false"]')).toHaveLength(27)
  fireEvent.keyDown(document, { key: "Escape" })
  const scope = screen.getByTestId("prompt-usage-scope-column")
  for (let page = 0; page < 3; page++) {
    fireEvent.click(within(scope).getByRole("button", { name: "Show More" }))
  }
  expect(within(scope).queryByRole("button", { name: "Show More" })).toBeNull()
  expect(within(scope).getAllByTestId(/^prompt-usage-session-history-/)).toHaveLength(28)
  for (const item of sessions) {
    const sessionButton = within(scope).getByTestId(`prompt-usage-session-${item.id}`)
    expect(sessionButton).toHaveTextContent("2 Prompts")
    expect(sessionButton).toHaveTextContent("2K Tokens")
    fireEvent.click(sessionButton)
    expect(screen.getByTestId("prompt-usage-session-summary")).toHaveTextContent(item.title)
    expect(screen.getByTestId("prompt-usage-session-token-total")).toHaveTextContent("2K")
    const promptRows = within(screen.getByTestId("prompt-usage-scrollable-rows")).getAllByTestId("prompt-usage-prompt")
    expect(promptRows).toHaveLength(2)
    for (const [index, prompt] of item.turns.entries()) {
      fireEvent.click(within(promptRows[index]).getByRole("button"))
      expect(screen.getByTestId("prompt-usage-inspector-prompt-block")).toHaveTextContent(prompt.prompt)
      expect(screen.getByTestId("prompt-usage-project-token-total")).toHaveTextContent("56K")
    }
  }
})
