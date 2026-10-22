import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageProjectBrowser } from "./prompt-usage-project-browser"
import { PromptExecutionTime } from "./prompt-usage-execution-time"
import { PromptUsageSummary } from "./prompt-usage-summary"
import { PromptUsageColumnBrowser } from "./prompt-usage-columns"
import type { PromptUsageProject, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { APP_LANGUAGES, createTranslator } from "@/lib/i18n"

const turn = (id: string, date: string, tokens: number): PromptUsageTurn => ({
  id, prompt: `${id} request`, timeLabel: "10:00", startedAt: `${date}T10:00:00Z`, completedAt: `${date}T10:02:18Z`,
  tokens: { totalTokens: tokens, inputTokens: tokens, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 },
  agents: [], quotaObservation: null, costUsd: tokens / 1000, estimationStatus: "current_rate",
})
const first = turn("recent", "2026-10-14", 1000)
const old = turn("historical", "2026-07-01", 9000)
const project: PromptUsageProject = {
  id: "project", kind: "project", name: "Complete Project", updatedAt: first.startedAt, promptCount: 2, sessionCount: 1,
  isActive: false, codexOrder: 0, sessions: [{ id: "session", title: "Complete Session", updatedAt: first.startedAt,
    promptCount: 2, isActive: false, codexOrder: 0, costUsd: 10, estimationStatus: "current_rate", turns: [first, old] }],
}

beforeEach(() => {
  useAppPreferencesStore.setState({ language: "en" })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-14T10:05:00Z"))
})
afterEach(() => vi.useRealTimers())

describe("Project and Session complete summaries", () => {
  it.each([
    { state: "complete", turns: [first, old], expected: "4 min 36 sec" },
    { state: "missing time", turns: [first, { ...old, completedAt: null }], expected: ">2 min 18 sec" },
    { state: "running", turns: [{ ...first, isActive: true, completedAt: null }], expected: ">5 min" },
    { state: "unrecorded", turns: [{ ...first, completedAt: null }], expected: "Time Not Recorded" },
  ])("shows a lower bound only for incomplete totals: $state", ({ turns, expected }) => {
    render(<PromptUsageSummary session={{ ...project.sessions[0], turns }} />)
    expect(screen.getByTestId("total-execution-time").textContent).toBe(expected)
    expect(screen.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(expect.stringContaining(expected))
  })

  it("keeps the API amount parenthesized with a readable hover calculation", async () => {
    const user = userEvent.setup()
    const t = createTranslator("en")
    render(<PromptUsageSummary session={project.sessions[0]} />)
    const amount = screen.getByTestId("prompt-usage-session-cost")
    expect(amount).toHaveTextContent(/^\(\$10\)$/)
    expect(amount).toHaveAccessibleName(new RegExp(`API Valuation: \\$10`))
    expect(amount).toHaveAccessibleName(expect.stringContaining(t("cost.currentRateEstimate")))
    await user.hover(amount)
    expect(await screen.findByRole("dialog")).toHaveTextContent(t("cost.currentRateEstimate"))
  })

  it.each(APP_LANGUAGES)("keeps localized labels, all values and unit-bearing counts in $value", ({ value: language }) => {
    useAppPreferencesStore.setState({ language })
    const t = createTranslator(language)
    render(<PromptUsageSummary project={project} session={project.sessions[0]} sessionQuota={{ loading: false, error: false, response: {
      dataAsOf: "2026-10-14T10:00:00Z", entries: [{ threadId: "session", status: "available", weeklyPercent: 0 }],
    } }} />)
    expect(screen.queryByText(t("promptUsage.summaryCountsLegend"))).toBeNull()
    for (const kind of ["project", "session"]) {
      const scope = within(screen.getByTestId(`prompt-usage-${kind}-summary`))
      expect(scope.getByRole("group", { name: t("promptUsage.summaryWeekly") })).toHaveTextContent("0%")
      expect(scope.getByRole("group", { name: t("promptUsage.summaryTime") })).toContainElement(scope.getByTestId("total-execution-time"))
      expect(scope.getByTestId(`prompt-usage-${kind}-token-total`)).toHaveTextContent("10K")
      expect(scope.getByTestId(`prompt-usage-${kind}-cost`).textContent).not.toBe("")
      expect(scope.queryByTestId("duration-coverage")).toBeNull()
      expect(scope.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(/2\/2 Prompt/)
      expect(scope.queryByTestId("session-quota-coverage")).toBeNull()
      expect(scope.getByTestId("session-quota-coverage-trigger")).toHaveAccessibleName(new RegExp(t(kind === "project" ? "summaryDetail.quotaProjectTitle" : "summaryDetail.quotaSessionTitle")))
      expect(scope.getByRole("heading")).toHaveTextContent(kind === "project" ? project.name : project.sessions[0].title)
    }
  })

  it("keeps initial prompt scrolling inside the rows and outside both summaries", () => {
    const scroll = vi.fn(function (this: HTMLElement) {
      const rows = this.closest('[data-testid="prompt-usage-scrollable-rows"]')
      expect(rows).not.toBeNull()
      expect(rows?.contains(screen.getByTestId("prompt-usage-summary-header"))).toBe(false)
    })
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    try {
      render(<PromptUsageColumnBrowser entries={[project]} fullEntries={[project]} initialTurnId={first.id}
        selectedEntryId={project.id} expandedEntryId={project.id} selectedSessionId="session" selectedTurnId={first.id}
        copyState={null} onSelectEntry={vi.fn()} onSelectSession={vi.fn()} onSelectTurn={vi.fn()}
        onNavigateToSession={vi.fn()} onCloseInspector={vi.fn()} onCopy={vi.fn()} />)
      const header = screen.getByTestId("prompt-usage-summary-header")
      expect(header).toHaveClass("max-h-[calc(100%_-_10rem)]", "shrink-0", "overflow-y-auto")
      expect(header).toContainElement(screen.getByTestId("prompt-usage-project-summary"))
      expect(header).toContainElement(screen.getByTestId("prompt-usage-session-summary"))
      expect(screen.getByTestId("prompt-usage-scrollable-rows")).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "instant" })
    } finally { HTMLElement.prototype.scrollIntoView = previous }
  })

  it("keeps total metrics independent of date and text filters", () => {
    const other = turn("other", "2026-10-13", 1000)
    render(<PromptUsageProjectBrowser projects={[{ ...project, sessions: [...project.sessions, {
      ...project.sessions[0], id: "second", title: "Second Session", updatedAt: other.startedAt, promptCount: 1, turns: [other], costUsd: 1,
    }] }]} promptCount={3} sessionCount={2} />)
    expect(screen.queryByRole("button", { name: "Open Prompt: historical request" })).toBeNull()
    for (const kind of ["project", "session"]) {
      const summary = within(screen.getByTestId(`prompt-usage-${kind}-summary`))
      expect(summary.getByTestId(`prompt-usage-${kind}-token-total`)).toHaveTextContent(kind === "project" ? "11K" : "10K")
      expect(summary.getByTestId(`prompt-usage-${kind}-cost`)).toHaveTextContent(kind === "project" ? "$11" : "$10")
      expect(summary.getByTestId(`prompt-usage-${kind}-cost`)).toHaveAccessibleName(new RegExp(kind === "project" ? "\\$11" : "\\$10"))
      expect(summary.getByTestId("total-execution-time")).toHaveTextContent(kind === "project" ? "6 min 54 sec" : "4 min 36 sec")
      expect(summary.getByTestId("session-quota-value")).toHaveTextContent("Not Provided By Codex")
    }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "recent request" } })
    expect(screen.getByTestId("prompt-usage-session-token-total")).toHaveTextContent("10K")
    fireEvent.click(screen.getByRole("button", { name: "Open Prompt: recent request" }))
    expect(screen.getByTestId("prompt-execution-time")).toHaveTextContent("2 min 18 sec")
  })
  it("distinguishes ongoing elapsed time from missing completion and updates while running", () => {
    vi.useFakeTimers()
    const running = { ...first, isActive: true, completedAt: null }
    const view = render(<PromptExecutionTime turn={running} />)
    expect(screen.getByTestId("prompt-execution-time")).toHaveTextContent("5 min")
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId("prompt-execution-time")).toHaveTextContent("5 min 1 sec")
    view.rerender(<PromptExecutionTime turn={{ ...running, isActive: false }} />)
    expect(screen.getByTestId("prompt-execution-time")).toHaveTextContent("Not Recorded")
    view.rerender(<PromptUsageSummary session={{ ...project.sessions[0], turns: [first, { ...old, interrupted: true }] }} />)
    expect(screen.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(/1\/2 Prompt/)
    expect(screen.getByTestId("total-execution-time")).toHaveTextContent("2 min 18 sec")
  })
  it("keeps accessible Prompt counts accurate while active total time stays live", () => {
    vi.useFakeTimers()
    const summary = (turns: PromptUsageTurn[]) => <PromptUsageSummary session={{ ...project.sessions[0], turns }} />
    const view = render(summary([first, old]))
    expect(screen.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(/2\/2 Prompt/)
    view.rerender(summary([first, { ...old, completedAt: null }]))
    expect(screen.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(/1\/2 Prompt/)
    view.rerender(summary([{ ...first, isActive: true }]))
    expect(screen.getByTestId("duration-coverage-trigger")).toHaveAccessibleName(/1\/1 Prompt/)
    expect(screen.queryByTestId("duration-running")).toBeNull()
    expect(screen.getByTestId("total-execution-time")).toHaveTextContent("5 min")
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByTestId("total-execution-time")).toHaveTextContent("5 min 1 sec")
    expect(screen.queryByTestId("duration-running")).toBeNull()
  })
  it("keeps Project and Session inside one container with aligned identity fields and complete metric groups", () => {
    const view = render(<PromptUsageSummary project={project} session={project.sessions[0]} />)
    const summary = screen.getByTestId("prompt-usage-summary-matrix")
    const container = summary.firstElementChild!
    expect(summary).toHaveAttribute("data-has-project", "true")
    expect(container).toHaveClass("prompt-summary-container")
    expect(screen.queryByRole("table", { name: "Overall Totals" })).toBeNull()
    expect(within(summary).queryByText("Record Counts: Available / Total")).toBeNull()
    for (const kind of ["project", "session"]) {
      const section = screen.getByTestId(`prompt-usage-${kind}-summary`)
      expect(section.parentElement).toBe(container)
      const header = within(section).getByTestId(`${kind}-title-row`)
      expect([...header.children].map(field => field.getAttribute("data-summary-field"))).toEqual(["scope", "name", "count"])
      expect(within(header).getByRole("heading")).toHaveTextContent(kind === "project" ? "Complete Project" : "Complete Session")
      const groups = within(section).getAllByRole("group")
      expect(groups).toHaveLength(3)
      expect(groups.map(group => group.getAttribute("data-summary-field"))).toEqual(["tokens", "time", "quota"])
      expect(groups[0]).toContainElement(within(section).getByTestId(`prompt-usage-${kind}-token-total`))
      expect(groups[0]).toContainElement(within(section).getByTestId(`prompt-usage-${kind}-cost`))
      expect(groups[0]).not.toHaveTextContent("API Valuation")
      expect(within(groups[0]).getByRole("button", { name: /API Valuation/ })).toHaveTextContent(/^\(\$10\)$/)
      expect(groups[1]).toContainElement(within(section).getByTestId("prompt-time-help-trigger"))
      expect(groups[1]).toContainElement(within(section).getByTestId("total-execution-time"))
      expect(groups[1]).toContainElement(within(section).getByTestId("duration-coverage-trigger"))
      expect(within(groups[2]).getByRole("button", { name: "Weekly Allowance Explained" })).toHaveClass("timeline-help-trigger")
      expect(groups[2]).toContainElement(within(section).getByTestId("session-quota-value"))
      expect(within(section).queryByTestId("duration-coverage")).toBeNull()
    }
    view.rerender(<PromptUsageSummary session={project.sessions[0]} />)
    expect(screen.queryByTestId("prompt-usage-project-summary")).toBeNull()
    expect(summary).toHaveAttribute("data-has-project", "false")
    expect(within(summary).getAllByRole("heading")).toHaveLength(1)
    expect(within(summary).queryByText("Record Counts: Available / Total")).toBeNull()
  })
  it("reveals each scope's real Prompt denominator only from its time value and keeps missing time unknown", () => {
    const selected = { ...project.sessions[0], turns: [first, { ...old, completedAt: null }] }
    const other = { ...selected, id: "other-session", turns: [turn("other", "2026-10-13", 1000)] }
    const view = render(<PromptUsageSummary project={{ ...project, sessions: [selected, other] }} session={selected} />)
    expect(screen.queryByTestId("duration-coverage")).toBeNull()
    for (const [kind, count] of [["project", "2/3"], ["session", "1/2"]]) {
      const row = within(screen.getByTestId(`prompt-usage-${kind}-summary`))
      const value = row.getByTestId("total-execution-time")
      expect(value).toHaveClass("prompt-summary-time")
      fireEvent.click(row.getByTestId("duration-coverage-trigger"))
      expect(screen.getByTestId("duration-coverage")).toHaveAccessibleName(`${count} Prompt`)
      expect(screen.getByRole("tooltip")).not.toHaveTextContent("49/60")
      fireEvent.keyDown(document, { key: "Escape" })
      expect(screen.queryByTestId("duration-coverage")).toBeNull()
    }
    expect(screen.getByTestId("prompt-usage-summary-matrix").querySelector(".prompt-summary-legend")).toBeNull()
    view.rerender(<PromptUsageSummary session={{ ...selected, turns: [{ ...first, completedAt: null }] }} />)
    expect(screen.getByTestId("total-execution-time")).toHaveTextContent("Time Not Recorded")
    fireEvent.click(screen.getByTestId("duration-coverage-trigger"))
    expect(screen.getByTestId("duration-coverage")).toHaveAccessibleName("0/1 Prompt")
    expect(screen.getByTestId("total-execution-time")).not.toHaveTextContent("0 sec")
  })
})
