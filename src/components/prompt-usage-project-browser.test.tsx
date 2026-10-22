import userEvent from "@testing-library/user-event"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PromptInspector } from "@/components/prompt-usage-inspector"
import { PromptUsageProjectBrowser } from "@/components/prompt-usage-project-browser"
import type {
  PromptUsageAgent,
  PromptUsageProject,
  PromptUsageQuotaObservation,
  PromptUsageSession,
  PromptUsageTokens,
  PromptUsageTurn,
} from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

// Keep this legacy browsing suite's multi-day fixtures visible; real default/date
// behavior is exercised in prompt-usage-project-scope.test.tsx.
vi.mock("@/lib/time-scope", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/time-scope")>(),
  DEFAULT_PROMPT_USAGE_TIME_SCOPE: { type: "range", startKey: "2026-08-01", endKey: "2026-08-31" },
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({
    children,
    render,
    ...props
  }: {
    children: ReactNode
    render?: ((props: Record<string, unknown>) => ReactNode) | ReactNode
  }) => {
    if (typeof render === "function") return render({ ...props, children })
    if (render) return render
    return <div {...props}>{children}</div>
  },
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const tokens = (totalTokens: number): PromptUsageTokens => ({
  totalTokens,
  inputTokens: Math.floor(totalTokens * 0.6),
  cachedInputTokens: Math.floor(totalTokens * 0.2),
  outputTokens: Math.floor(totalTokens * 0.4),
  reasoningOutputTokens: Math.floor(totalTokens * 0.1),
})

const agent = (id: string, name: string, role: string | null, totalTokens: number): PromptUsageAgent => ({
  id,
  kind: role ? "subagent" : "main",
  name,
  role,
  tokens: tokens(totalTokens),
  models: [{ name: role ? "GPT-5.6 Luna" : "GPT-5.6 Sol", ...tokens(totalTokens) }],
  costUsd: totalTokens / 1_000,
  estimationStatus: "current_rate",
})

const turn = (
  id: string,
  prompt: string,
  totalTokens: number,
  agents: PromptUsageAgent[],
  startedAt: string,
  quotaObservation: PromptUsageQuotaObservation | null = null,
): PromptUsageTurn => ({
  id,
  prompt,
  timeLabel: "14:30",
  startedAt,
  tokens: tokens(totalTokens),
  agents,
  quotaObservation,
  costUsd: totalTokens / 1_000,
  estimationStatus: "current_rate",
})

const notionSession: PromptUsageSession = {
  id: "notion-first",
  title: "First Codex Session",
  updatedAt: "2026-08-01T10:00:00Z",
  promptCount: 1,
  isActive: false,
  codexOrder: 0,
  costUsd: 1,
  estimationStatus: "current_rate",
  turns: [turn(
    "notion-turn",
    "Investigate The Upload Path",
    1_000,
    [agent("main-notion", "Main Agent", null, 1_000)],
    "2026-08-01T10:00:00Z",
    {
      status: "measured",
      usedBefore: 0,
      usedAfter: 4,
      delta: 4,
      precision: 1,
      resetAt: null,
      subagentCount: 0,
      reason: null,
    },
  )],
}

const lrduSession: PromptUsageSession = {
  id: "lrdu-latest",
  title: "Latest Control Session",
  updatedAt: "2026-08-03T10:00:00Z",
  promptCount: 2,
  isActive: false,
  codexOrder: 0,
  costUsd: 5,
  estimationStatus: "current_rate",
  turns: [
    turn(
      "lrdu-turn-one",
      "Tune Fan Control",
      2_000,
      [agent("main-lrdu", "Main Agent", null, 1_500), agent("locke", "Locke", "explorer", 500)],
      "2026-08-03T09:00:00Z",
      {
        status: "measured",
        usedBefore: "0",
        usedAfter: "4",
        delta: "4",
        precision: "1",
        resetAt: null,
        subagentCount: "1",
        reason: null,
      },
    ),
    turn(
      "lrdu-turn-two",
      "Check Alarm State",
      3_000,
      [agent("main-alarm", "Main Agent", null, 3_000)],
      "2026-08-03T10:00:00Z",
    ),
  ],
}

const projects: PromptUsageProject[] = [
  {
    id: "notion",
    kind: "project",
    name: "Notion",
    updatedAt: "2026-08-01T10:00:00Z",
    promptCount: 1,
    sessionCount: 7,
    isActive: false,
    codexOrder: 0,
    sessions: [notionSession],
  },
  {
    id: "lrdu",
    kind: "project",
    name: "LRDU",
    updatedAt: "2026-08-03T10:00:00Z",
    promptCount: 2,
    sessionCount: 1,
    isActive: false,
    codexOrder: 1,
    sessions: [lrduSession],
  },
  {
    id: "standalone",
    kind: "standalone",
    name: "Standalone Codex Session",
    updatedAt: "2026-08-02T10:00:00Z",
    promptCount: 1,
    sessionCount: 1,
    isActive: false,
    codexOrder: null,
    sessions: [{
      id: "standalone-session",
      title: "Standalone Prompt",
      updatedAt: "2026-08-02T10:00:00Z",
      promptCount: 1,
      isActive: false,
      codexOrder: null,
      costUsd: 0.4,
      estimationStatus: "current_rate",
      turns: [turn(
        "standalone-turn",
        "Review The Standalone Task",
        400,
        [agent("main-standalone", "Main Agent", null, 400)],
        "2026-08-02T10:00:00Z",
      )],
    }],
  },
]

const defaultProps = {
  projects,
  promptCount: 4,
  sessionCount: 3,
  privacyNote: "Stored On This Mac",
}

describe("PromptUsageProjectBrowser", () => {

  it("opens the exact project, session and prompt supplied by Timeline", () => {
    const scroll = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    try {
      render(<PromptUsageProjectBrowser projects={projects} promptCount={4} sessionCount={3} initialProjectId="lrdu" initialSessionId="lrdu-latest" initialTurnId="lrdu-turn-one" />)
      expect(screen.getByTestId("prompt-usage-entry-lrdu")).toHaveAttribute("aria-current", "page")
      expect(screen.getByRole("button", { name: "Open Session Latest Control Session" })).toHaveAttribute("aria-current", "page")
      expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Tune Fan Control")
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "instant" })
      expect(screen.getByTestId("prompt-usage-details-column")).not.toHaveClass("animate-in")
    } finally { HTMLElement.prototype.scrollIntoView = original }
  })

  beforeEach(() => {
    window.localStorage.clear()
    useAppPreferencesStore.getState().resetState()
  })

  it("starts on the newest session with prompt details closed", () => {
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    const navigation = screen.getByTestId("prompt-usage-navigation")
    expect(navigation).toHaveAttribute("data-layout", "prompt-inspector")
    expect(navigation.className).toContain("overflow-hidden")
    expect(navigation.className).toContain("flex-1")
    expect(navigation.className).toContain("grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)]")
    expect(navigation.className).not.toContain("h-[clamp")
    expect(navigation.className).not.toContain("overflow-x-auto")
    expect(screen.getByRole("combobox", { name: "Sort Prompt Usage" })).toHaveTextContent("Recently Updated")
    const searchControl = screen.getByRole("searchbox", { name: "Search Prompt Usage" })
    const sortControl = screen.getByRole("combobox", { name: "Sort Prompt Usage" })
    expect(searchControl).toHaveClass("prompt-usage-filter-control")
    expect(sortControl).toHaveClass("prompt-browser-sort-trigger")
    expect(searchControl.className).not.toContain("focus-visible:ring")
    expect(sortControl.className).not.toContain("focus-visible:ring")
    expect(searchControl.className).not.toContain("focus-visible:border-ring")
    expect(sortControl.className).not.toContain("focus-visible:border-ring")
    expect(screen.getByTestId("prompt-usage-entry-notion")).toHaveAttribute("data-kind", "project")
    expect(screen.getByTestId("prompt-usage-entry-standalone")).toHaveAttribute("data-kind", "standalone")
    expect(within(screen.getByTestId("prompt-usage-entry-notion")).getByTestId("prompt-usage-entry-count")).toHaveTextContent("7")
    expect(within(screen.getByTestId("prompt-usage-entry-standalone")).getByTestId("prompt-usage-entry-count")).toHaveTextContent("1")
    expect(screen.getAllByTestId("prompt-usage-project-icon")).toHaveLength(2)
    const promptRoot = screen.getByTestId("prompt-usage-panel")
    const promptHierarchyTarget = document.querySelector<HTMLElement>('[data-guide-target="prompts-hierarchy"]')
    const promptExploreTarget = document.querySelector<HTMLElement>('[data-guide-target="prompts-explore"]')
    const promptLocalTarget = document.querySelector<HTMLElement>('[data-guide-target="prompts-local"]')
    expect(document.querySelectorAll('[data-guide-target="prompts-hierarchy"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-guide-target="prompts-explore"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-guide-target="prompts-local"]')).toHaveLength(1)
    expect(promptRoot).not.toHaveAttribute("data-guide-target")
    expect(promptHierarchyTarget).toBe(screen.getByTestId("prompt-usage-scope-column"))
    expect(promptLocalTarget).toBe(screen.getByTestId("prompt-usage-prompt-list"))
    expect(promptHierarchyTarget?.contains(promptExploreTarget)).toBe(false)
    expect(promptHierarchyTarget?.contains(promptLocalTarget)).toBe(false)
    expect(promptExploreTarget?.contains(promptLocalTarget)).toBe(false)
    expect(screen.getAllByTestId("prompt-usage-standalone-icon")).toHaveLength(1)
    expect(within(screen.getByTestId("prompt-usage-entry-standalone")).getByTestId("prompt-usage-entry-action-spacer")).toHaveClass("size-[13px]")
    expect(screen.getByRole("button", { name: "Open Session Latest Control Session" }).querySelector("svg")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-entry-lrdu")).toHaveAttribute("aria-current", "page")
    expect(screen.getByTestId("prompt-usage-session-column")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Session Latest Control Session" })).toHaveAttribute("aria-current", "page")
    const sessionSummary = screen.getByTestId("prompt-usage-session-summary")
    expect(sessionSummary).toHaveAttribute("data-layout", "project-container")
    expect(sessionSummary).toHaveAttribute("data-scope", "session")
    expect(screen.getByTestId("session-title-row")).toHaveTextContent("Latest Control Session2 Prompts")
    expect(screen.getByTestId("prompt-usage-session-token-total")).toHaveTextContent("5K")
    expect(screen.getByTestId("prompt-usage-session-cost")).toHaveTextContent("$5")
    expect(within(sessionSummary).getByRole("group", { name: "Total Tokens" })).not.toHaveTextContent("API Valuation")
    expect(within(sessionSummary).getByRole("button", { name: /API Valuation/ })).toHaveTextContent(/^\(\$5\)$/)
    expect(screen.getByRole("button", { name: "Open Prompt: Check Alarm State" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
  })

  it("keeps project sessions in the scope rail and opens details without horizontal scrolling", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    const scope = screen.getByTestId("prompt-usage-scope-column")
    const sessionColumn = screen.getByTestId("prompt-usage-session-column")
    expect(scope).toContainElement(sessionColumn)
    expect(scope.className).toContain("overflow-y-auto")
    expect(screen.getByRole("button", { name: "Open Session First Codex Session" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))
    const detailsColumn = screen.getByTestId("prompt-usage-details-column")
    expect(detailsColumn.className).toContain("min-w-0")
    expect(detailsColumn.className).toContain("overflow-y-auto")
    expect(screen.getAllByText("Investigate The Upload Path")).toHaveLength(2)
    expect(within(screen.getByTestId("prompt-usage-token-ledger-columns")).getByText("Total")).toBeInTheDocument()
    expect(screen.getAllByText("Main Agent").length).toBeGreaterThan(0)
    expect(screen.getByText("GPT-5.6 Sol · Effort Not Recorded")).toBeInTheDocument()
  })

  it("uses a neutral unavailable value instead of a Price Unknown state", () => {
    const unpricedSession: PromptUsageSession = {
      ...lrduSession,
      costUsd: null,
      estimationStatus: "unknown",
    }
    render(<PromptUsageProjectBrowser {...defaultProps} projects={[{
      ...projects[1],
      sessions: [unpricedSession],
    }]} />)

    expect(screen.getByTestId("prompt-usage-session-cost")).toHaveTextContent("—")
    expect(screen.getByTestId("prompt-usage-session-cost")).toHaveAccessibleName(expect.stringContaining("API Cost Cannot Yet Be Estimated"))
    expect(screen.queryByText("Price Unknown")).not.toBeInTheDocument()
  })

  it("toggles an open project closed and open from the same project button", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    const project = screen.getByRole("button", { name: "Open Project LRDU" })
    expect(project).toHaveAttribute("aria-expanded", "true")

    await user.click(project)
    expect(project).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTestId("prompt-usage-session-column")).not.toBeInTheDocument()

    await user.click(project)
    expect(project).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("prompt-usage-session-column")).toBeInTheDocument()
  })

  it("shows five sessions first and reveals ten more per click", async () => {
    const user = userEvent.setup()
    const sessions = Array.from({ length: 16 }, (_, index): PromptUsageSession => ({
      ...notionSession,
      id: `session-${index + 1}`,
      title: `Session ${index + 1}`,
      updatedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
    })).reverse()
    const longProject: PromptUsageProject = {
      ...projects[0],
      promptCount: 16,
      sessionCount: 16,
      sessions,
    }

    render(<PromptUsageProjectBrowser projects={[longProject]} promptCount={16} sessionCount={16} />)

    const sessionButtons = () => within(screen.getByTestId("prompt-usage-session-column"))
      .queryAllByRole("button", { name: /^Open Session/ })
    expect(sessionButtons()).toHaveLength(5)

    await user.click(screen.getByRole("button", { name: "Show More" }))
    expect(sessionButtons()).toHaveLength(15)

    await user.click(screen.getByRole("button", { name: "Show More" }))
    expect(sessionButtons()).toHaveLength(16)
    expect(screen.queryByRole("button", { name: "Show More" })).not.toBeInTheDocument()
  })

  it("moves the running indicator from a collapsed project to its active session", async () => {
    const user = userEvent.setup()
    const activeProject: PromptUsageProject = {
      ...projects[1],
      isActive: true,
      sessions: [{ ...lrduSession, isActive: true }],
    }

    render(<PromptUsageProjectBrowser projects={[activeProject]} promptCount={2} sessionCount={1} />)

    expect(screen.getByTestId("prompt-usage-session-running")).toHaveClass("animate-spin")
    expect(screen.queryByTestId("prompt-usage-entry-running")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Session Latest Control Session, Running" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open Project LRDU, Running" }))
    expect(screen.queryByTestId("prompt-usage-session-running")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-entry-running")).toHaveClass("animate-spin")
  })

  it("aligns active indicators without showing a standalone disclosure icon", async () => {
    const user = userEvent.setup()
    const activeProject: PromptUsageProject = {
      ...projects[1],
      isActive: true,
      sessions: [{ ...lrduSession, isActive: true }],
    }
    const activeStandalone: PromptUsageProject = {
      ...projects[2],
      isActive: true,
      sessions: projects[2].sessions.map((session) => ({ ...session, isActive: true })),
    }

    render(<PromptUsageProjectBrowser projects={[activeProject, activeStandalone]} promptCount={3} sessionCount={2} />)
    await user.click(screen.getByRole("button", { name: "Open Project LRDU, Running" }))

    const projectButton = screen.getByRole("button", { name: "Open Project LRDU, Running" })
    const standaloneButton = screen.getByRole("button", { name: "Open Standalone Session Standalone Codex Session, Running" })
    const projectSpinner = within(projectButton).getByTestId("prompt-usage-entry-running")
    const standaloneSpinner = within(standaloneButton).getByTestId("prompt-usage-entry-running")

    expect(projectSpinner.nextElementSibling).toHaveAttribute("width", "13")
    const standaloneSpacer = within(standaloneButton).getByTestId("prompt-usage-entry-action-spacer")
    expect(standaloneSpinner.nextElementSibling).toBe(standaloneSpacer)
    expect(standaloneSpacer).toHaveClass("size-[13px]")
    expect(standaloneSpacer).toHaveAttribute("aria-hidden", "true")
    expect(standaloneButton.querySelector('svg[width="13"]')).not.toBeInTheDocument()
    expect(standaloneButton).toHaveAccessibleName("Open Standalone Session Standalone Codex Session, Running")
  })

  it("skips the session-list column for standalone entries", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Standalone Session Standalone Codex Session" }))
    expect(screen.queryByTestId("prompt-usage-session-column")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: Review The Standalone Task" }))
    expect(screen.getByTestId("prompt-usage-details-column")).toBeInTheDocument()
    expect(screen.getAllByText("Standalone Prompt")).toHaveLength(2)
    expect(screen.getAllByText("Review The Standalone Task")).toHaveLength(2)
  })

  it("closes prompt details when another Session is chosen or the selected branch disappears", async () => {
    const user = userEvent.setup()
    const view = render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))
    expect(screen.getByTestId("prompt-usage-details-column")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Open Project LRDU" }))
    await user.click(screen.getByRole("button", { name: "Open Session Latest Control Session" }))
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-entry-lrdu")).toHaveAttribute("aria-current", "page")

    view.rerender(<PromptUsageProjectBrowser {...defaultProps} projects={[projects[1]]} promptCount={2} sessionCount={1} />)
    expect(screen.queryByTestId("prompt-usage-entry-notion")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
  })

  it("does not let newly arrived prompts replace the current session", async () => {
    const user = userEvent.setup()
    const view = render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    expect(screen.getByTestId("prompt-usage-entry-notion")).toHaveAttribute("aria-current", "page")

    const newestProject: PromptUsageProject = {
      id: "newest",
      kind: "project",
      name: "Newest Project",
      updatedAt: "2026-08-04T10:00:00Z",
      promptCount: 1,
      sessionCount: 1,
      isActive: false,
      codexOrder: 2,
      sessions: [{
        id: "newest-session",
        title: "Newest Session",
        updatedAt: "2026-08-04T10:00:00Z",
        promptCount: 1,
        isActive: false,
        codexOrder: 0,
        turns: [turn(
          "newest-turn",
          "Newest Prompt",
          900,
          [agent("newest-main", "Main Agent", null, 900)],
          "2026-08-04T10:00:00Z",
        )],
      }],
    }

    view.rerender(
      <PromptUsageProjectBrowser
        {...defaultProps}
        projects={[...projects, newestProject]}
        promptCount={5}
        sessionCount={4}
      />,
    )

    await waitFor(() => expect(screen.getByTestId("prompt-usage-entry-notion")).toHaveAttribute("aria-current", "page"))
    expect(screen.getByTestId("prompt-usage-entry-newest")).not.toHaveAttribute("aria-current", "page")
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
  })

  it("keeps global search and sort connected to the scope rail without a duplicate project filter", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    screen.getByRole("combobox", { name: "Sort Prompt Usage" }).focus()
    await user.keyboard("{Enter}")
    await user.click(await screen.findByRole("option", { name: /Most Prompts/ }))
    const entries = screen.getByRole("navigation", { name: "Prompt Usage Entries" })
    const entryButtons = within(entries).getAllByRole("button")
    expect(entryButtons[0]).toHaveAccessibleName("Open Project LRDU")
    expect(screen.getByRole("combobox", { name: "Sort Prompt Usage" })).toHaveTextContent("Most Prompts")
    expect(screen.queryByRole("combobox", { name: "Filter Project" })).not.toBeInTheDocument()

    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "Locke")
    expect(screen.getByTestId("prompt-usage-entry-lrdu")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-entry-notion")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-no-matches")).not.toBeInTheDocument()

    await user.clear(screen.getByRole("searchbox", { name: "Search Prompt Usage" }))
    screen.getByRole("combobox", { name: "Sort Prompt Usage" }).focus()
    await user.keyboard("{Enter}")
    await user.click(await screen.findByRole("option", { name: /Codex Sidebar/ }))
    expect(within(entries).getAllByRole("button")[0]).toHaveAccessibleName("Open Project Notion")
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "No Such Prompt")
    expect(screen.getByTestId("prompt-usage-no-matches")).toHaveTextContent("No matching prompts")
  })

  it("omits redundant result counts above the browser", () => {
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    expect(screen.queryByText("4 Prompts")).not.toBeInTheDocument()
    expect(screen.queryByText("Stored On This Mac")).not.toBeInTheDocument()
    expect(screen.queryByText(/4 Prompts · 3 Sessions/)).not.toBeInTheDocument()
  })

  it("copies prompts and exposes token, main-agent, subagent, and model detail", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Prompt: Tune Fan Control" }))
    expect(screen.getAllByText("Tune Fan Control")).toHaveLength(2)
    const inspectorHeader = screen.getByTestId("prompt-usage-inspector-header")
    expect(inspectorHeader).toContainElement(screen.getByTestId("prompt-usage-inspector-session-stats"))
    expect(inspectorHeader).toHaveTextContent("2 Prompts")
    expect(inspectorHeader).toHaveTextContent("5K Total Tokens")
    const inspectorTitle = inspectorHeader.querySelector("h3")
    const sessionStats = screen.getByTestId("prompt-usage-inspector-session-stats")
    expect(inspectorTitle).not.toBeNull()
    expect(sessionStats.previousElementSibling).toBe(inspectorTitle)
    expect(inspectorHeader.querySelector("button")).toHaveAccessibleName("Close Prompt Details")
    const promptBlock = screen.getByTestId("prompt-usage-inspector-prompt-block")
    expect(promptBlock).toContainElement(screen.getByTestId("prompt-usage-inspector-metadata"))
    expect(screen.getByTestId("prompt-usage-inspector-metadata")).toHaveClass("items-end")
    expect(promptBlock).toHaveTextContent("Tune Fan Control")
    expect(screen.getByText("(Locke)")).toBeInTheDocument()
    expect(screen.getByText("GPT-5.6 Luna · Effort Not Recorded")).toBeInTheDocument()
    expect(screen.queryByText("Agent Breakdown")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-inspector-agents")).toHaveTextContent("1 Main Agent")
    await user.click(screen.getByRole("button", { name: "Copy Prompt" }))
    expect(writeText).toHaveBeenCalledWith("Tune Fan Control")
    expect(screen.getByRole("button", { name: "Prompt Copied" })).toHaveTextContent("Copied")
  })

  it("keeps delegated tasks at the same level and navigates from the rail and inspector relationship links", async () => {
    const user = userEvent.setup()
    const sourceSession: PromptUsageSession = {
      ...notionSession,
      id: "source-session",
      title: "Source Task",
      updatedAt: "2026-08-01T10:00:00Z",
    }
    const delegatedSession: PromptUsageSession = {
      ...notionSession,
      id: "delegated-session",
      title: "Luna Task",
      updatedAt: "2026-08-04T10:00:00Z",
      isDelegated: true,
      relatedSourceId: sourceSession.id,
      relatedSourceTitle: sourceSession.title,
      turns: [{
        ...notionSession.turns[0],
        id: "delegated-turn",
        prompt: "Review The Accepted Implementation",
        isDelegated: true,
        sourceThreadId: sourceSession.id,
        startedAt: "2026-08-04T10:00:00Z",
      }, {
        ...notionSession.turns[0],
        id: "delegated-unrelated-turn",
        prompt: "Unrelated Delegated Prompt",
        isDelegated: true,
        sourceThreadId: "different-source-id",
        startedAt: "2026-08-04T11:00:00Z",
      }],
    }
    const relatedProject: PromptUsageProject = {
      ...projects[0],
      id: "related-project",
      name: "Related Work",
      promptCount: 4,
      sessionCount: 2,
      sessions: [sourceSession, delegatedSession].map((session) => (
        session.id === sourceSession.id
          ? {
            ...session,
            promptCount: 2,
            relatedTaskCount: 1,
            relatedTasks: [{ id: delegatedSession.id, title: delegatedSession.title }],
            turns: [
              { ...session.turns[0], id: "unrelated-source-turn", prompt: "Unrelated Source Prompt" },
              { ...session.turns[0], id: "sending-source-turn", outgoingTasks: [{ id: delegatedSession.id, title: delegatedSession.title }] },
            ],
          }
          : session
      )),
    }

    render(<PromptUsageProjectBrowser projects={[relatedProject]} promptCount={4} sessionCount={2} />)

    const scope = within(screen.getByTestId("prompt-usage-scope-column"))
    expect(scope.getByTestId("prompt-usage-session-row-source-session")).toHaveClass("h-[3.75rem]")
    expect(scope.getByTestId("prompt-usage-session-row-delegated-session")).toHaveClass("h-[3.75rem]")
    const sourceEndpoint = scope.getByRole("button", { name: "Sent To “Luna Task”" })
    expect(sourceEndpoint).toHaveClass("size-11", "-right-2.5", "duration-200")
    expect(sourceEndpoint.closest("[data-testid='prompt-usage-relationship-rail']")).toHaveClass("right-10")
    expect(scope.getByText("Sent To “Luna Task”")).toBeInTheDocument()
    const endpoint = scope.getByRole("button", { name: "From “Source Task”" })
    expect(endpoint).toHaveClass("size-11", "left-0", "duration-200")
    expect(scope.getAllByTestId("prompt-usage-relationship-stem")[0]).toHaveClass("right-3")
    expect(scope.getAllByTestId("prompt-usage-relationship-branch")[0]).toHaveClass("left-5", "right-3")
    expect(scope.getByText("From “Source Task”")).toBeInTheDocument()
    expect(scope.getAllByTestId("prompt-usage-relationship-stem")).toHaveLength(2)
    const delegatedPromptRows = screen.getAllByTestId("prompt-usage-prompt")
    expect(within(delegatedPromptRows[0]!).getByText("From “Source Task”")).toBeInTheDocument()
    expect(within(delegatedPromptRows[1]!).queryByText("From “Source Task”")).not.toBeInTheDocument()
    await user.click(scope.getByRole("button", { name: "Open Session Source Task" }))
    expect(screen.queryByTestId("prompt-usage-inspector-relationship")).not.toBeInTheDocument()
    const sourcePromptRows = screen.getAllByTestId("prompt-usage-prompt")
    expect(within(sourcePromptRows[0]!).queryByText("Sent To “Luna Task”")).not.toBeInTheDocument()
    expect(within(sourcePromptRows[1]!).getByText("Sent To “Luna Task”")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))
    expect(screen.getByTestId("prompt-usage-inspector-related-task-link-delegated-session")).toHaveTextContent("Sent To “Luna Task”")
    const promptMetadata = screen.getByTestId("prompt-usage-inspector-metadata")
    expect(promptMetadata).not.toHaveTextContent("1 Main Agent")
    expect(screen.getByTestId("prompt-usage-inspector-prompt-block")).toContainElement(screen.getByTestId("prompt-usage-inspector-related-task-link-delegated-session"))
    await user.click(sourceEndpoint)
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-session-token-total")).toBeInTheDocument()
    expect(scope.getByRole("button", { name: "Open Session Source Task" }).querySelector("span.absolute")).toHaveClass("right-2.5")
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))
    await user.click(endpoint)
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: Review The Accepted Implementation" }))
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Review The Accepted Implementation")
    expect(screen.getByTestId("prompt-usage-inspector-related-source-link")).toHaveTextContent("From “Source Task”")

    await user.click(screen.getByTestId("prompt-usage-inspector-related-source-link"))
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(scope.getByRole("button", { name: "Open Session Source Task" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByTestId("prompt-usage-related-task-row")).not.toBeInTheDocument()
  })

  it("highlights every visible branch row and rail on endpoint hover", async () => {
    const user = userEvent.setup()
    const sourceSession: PromptUsageSession = {
      ...notionSession,
      id: "branch-source",
      title: "Branch Source",
    }
    const delegatedSessions = ["One", "Two"].map((label, index): PromptUsageSession => ({
      ...notionSession,
      id: `branch-${label.toLowerCase()}`,
      title: `Branch ${label}`,
      updatedAt: `2026-08-0${index + 2}T10:00:00Z`,
      isDelegated: true,
      relatedSourceId: sourceSession.id,
      relatedSourceTitle: sourceSession.title,
    }))
    const branchProject: PromptUsageProject = {
      ...projects[0],
      id: "branch-project",
      name: "Branches",
      promptCount: 3,
      sessionCount: 3,
      sessions: [{
        ...sourceSession,
        relatedTaskCount: 2,
        relatedTasks: delegatedSessions.map(({ id, title }) => ({ id, title })),
      }, ...delegatedSessions],
    }

    render(<PromptUsageProjectBrowser projects={[branchProject]} promptCount={3} sessionCount={3} />)

    const scope = within(screen.getByTestId("prompt-usage-scope-column"))
    expect(scope.getByRole("button", { name: "Sent To 2 Related Tasks" })).toHaveClass("size-11")
    expect(scope.getByText("Sent To 2 Related Tasks")).toBeInTheDocument()
    const endpoint = scope.getAllByRole("button", { name: "From “Branch Source”" })[0]
    expect(scope.getAllByText("From “Branch Source”")).not.toHaveLength(0)
    await user.hover(endpoint)
    expect(scope.getByTestId("prompt-usage-session-row-branch-source")).toHaveAttribute("data-relationship-highlighted", "true")
    expect(scope.getByTestId("prompt-usage-session-row-branch-one")).toHaveAttribute("data-relationship-highlighted", "true")
    expect(scope.getByTestId("prompt-usage-session-row-branch-two")).toHaveAttribute("data-relationship-highlighted", "true")
    expect(scope.getAllByTestId("prompt-usage-relationship-rail").every((rail) => rail.getAttribute("data-relationship-highlighted") === "true")).toBe(true)
    expect(scope.getAllByTestId("prompt-usage-relationship-branch")).toHaveLength(2)
    await user.unhover(endpoint)
    expect(scope.getByTestId("prompt-usage-session-row-branch-source")).toHaveAttribute("data-relationship-highlighted", "false")
  })

  it("shows an unavailable non-link when a delegated source is missing", async () => {
    const user = userEvent.setup()
    const missingSourceSession: PromptUsageSession = {
      ...notionSession,
      id: "missing-source-task",
      title: "Luna Task Without Source",
      isDelegated: true,
      relatedSourceId: "missing-source-id",
      relatedSourceTitle: null,
      turns: [{
        ...notionSession.turns[0],
        id: "missing-source-turn",
        prompt: "Review Without A Source",
        isDelegated: true,
        sourceThreadId: "missing-source-id",
      }],
    }
    const missingProject: PromptUsageProject = {
      ...projects[0],
      id: "missing-project",
      sessions: [missingSourceSession],
      promptCount: 1,
      sessionCount: 1,
    }

    render(<PromptUsageProjectBrowser projects={[missingProject]} promptCount={1} sessionCount={1} />)

    expect(screen.getByTestId("prompt-usage-relationship-unavailable")).toHaveAccessibleName("Source Unavailable")
    expect(screen.queryByTestId("prompt-usage-relationship-destination")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: Review Without A Source" }))
    expect(screen.getByTestId("prompt-usage-inspector-related-source-unavailable")).toBeInTheDocument()
  })

  it("opens one right inspector without changing prompt-row height and returns focus on close", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    const firstRow = screen.getByRole("button", { name: "Open Prompt: Tune Fan Control" })
    const secondRow = screen.getByRole("button", { name: "Open Prompt: Check Alarm State" })
    await user.click(firstRow)
    expect(firstRow).toHaveAttribute("aria-expanded", "true")
    expect(firstRow).toHaveAttribute("aria-controls", "prompt-usage-inspector")
    expect(secondRow).toHaveAttribute("aria-expanded", "false")
    const details = screen.getByTestId("prompt-usage-details-column")
    expect(details).toHaveAttribute("data-layout", "right-inspector")
    expect(details.className).toContain("max-[1099px]:absolute")
    expect(details.className).toContain("max-[1099px]:right-0")
    expect(details).toHaveClass("animate-in", "slide-in-from-right-4", "duration-200")
    expect(screen.getByTestId("prompt-usage-navigation").className).toContain("min-[1100px]:grid-cols-[minmax(14rem,0.72fr)_minmax(18rem,1fr)_minmax(22rem,1.28fr)]")
    const scrim = screen.getAllByRole("button", { name: "Close Prompt Details" }).find((button) => button.className.includes("min-[1100px]:hidden"))
    expect(scrim).toHaveClass("z-10")
    expect(details).toHaveClass("z-20")
    expect(screen.getAllByTestId("prompt-usage-details-column")).toHaveLength(1)
    expect(within(screen.getAllByTestId("prompt-usage-prompt")[0]!).queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()

    await user.click(secondRow)
    expect(screen.getByRole("button", { name: "Collapse Prompt: Check Alarm State" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.queryByRole("button", { name: "Collapse Prompt: Tune Fan Control" })).not.toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-usage-details-column")).toHaveLength(1)

    await user.click(within(screen.getByTestId("prompt-usage-details-column")).getByRole("button", { name: "Close Prompt Details" }))
    await waitFor(() => expect(document.activeElement).toBe(secondRow))
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
  })

  it("omits legacy per-prompt quota estimates while preserving the Token ledger", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))

    expect(screen.queryByTestId("prompt-usage-prompt-quota")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-quota-detail-row")).not.toBeInTheDocument()
    expect(screen.queryByText(/of 7-day quota|remaining|Observed to .* precision/i)).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-main-agent")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-token-ledger-columns")).toHaveTextContent("API Valuation")
  })

  it("shows each agent's share against its prompt total", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Prompt: Tune Fan Control" }))

    const shares = screen.getAllByTestId("prompt-usage-agent-share")
    expect(shares).toHaveLength(2)
    expect(shares[0]).toHaveTextContent(/^75%$/)
    expect(shares[1]).toHaveTextContent(/^25%$/)
    const ledgerColumns = screen.getByTestId("prompt-usage-token-ledger-columns")
    const tokenSummary = screen.getByTestId("prompt-usage-token-summary")
    const mainAgent = screen.getByTestId("prompt-usage-main-agent")
    const subagent = screen.getByTestId("prompt-usage-subagent-agent")
    expect(ledgerColumns.tagName).toBe("TR")
    expect(within(ledgerColumns).getAllByRole("columnheader")).toHaveLength(5)
    expect(within(ledgerColumns).getByText("Agent")).toBeInTheDocument()
    expect(within(ledgerColumns).getByText("Total")).toBeInTheDocument()
    expect(within(ledgerColumns).getByText("API Valuation")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-token-cost")).toHaveClass("text-foreground")
    expect(screen.getByTestId("prompt-usage-token-cost")).not.toHaveClass("text-[var(--wire-orange)]")
    expect(screen.getAllByTestId("prompt-usage-agent-cost")).toHaveLength(2)
    screen.getAllByTestId("prompt-usage-agent-cost").forEach((cost) => {
      expect(cost).toHaveClass("text-foreground")
      expect(cost).not.toHaveClass("text-[var(--wire-orange)]")
    })
    expect(screen.queryByTestId("prompt-usage-prompt-cost")).not.toBeInTheDocument()
    expect(tokenSummary.tagName).toBe("TR")
    expect(mainAgent.tagName).toBe("TR")
    expect(subagent.tagName).toBe("TR")
    const identity = within(subagent).getByTestId("prompt-usage-agent-identity")
    expect(identity).toHaveTextContent("Subagent (Locke)")
    expect(identity).not.toHaveClass("truncate")
    expect(within(identity).getByText("(Locke)")).toHaveClass("font-normal", "text-muted-foreground")
    expect(within(subagent).getByText("explorer")).toBeInTheDocument()
    expect(within(subagent).getByTestId("prompt-usage-agent-models")).toHaveTextContent("GPT-5.6 Luna")
    expect(within(subagent).getByTestId("prompt-usage-agent-share")).toHaveClass("whitespace-nowrap")
    expect(screen.getByTestId("prompt-usage-main-agent")).not.toHaveClass("rounded-lg", "border")
    expect(screen.getAllByTestId("prompt-usage-agent-token-summary")).toHaveLength(2)
    const table = within(screen.getByTestId("prompt-usage-token-ledger")).getByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(4)
    expect(within(mainAgent).getAllByRole("cell")).toHaveLength(4)
    expect(within(subagent).getAllByRole("cell")).toHaveLength(4)
  })

  it("does not repeat a fallback Subagent nickname or replace its recorded role", () => {
    const fallbackTurn = {
      ...lrduSession.turns[0],
      agents: [agent("fallback-child", "Subagent", "worker", 500)],
    }
    render(<PromptInspector session={lrduSession} turn={fallbackTurn} copyState={null} onCopy={() => {}} onNavigateToSession={() => {}} onClose={() => {}} headingRef={{ current: null }} />)
    const row = screen.getByTestId("prompt-usage-subagent-agent")
    expect(within(row).getByTestId("prompt-usage-agent-identity")).toHaveTextContent(/^Subagent$/)
    expect(within(row).getByText("worker")).toBeInTheDocument()
    expect(within(row).getByTestId("prompt-usage-agent-models")).toHaveTextContent("GPT-5.6 Luna")
  })

  it("shows a single Main Agent row without subagents", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))

    expect(screen.getByTestId("prompt-usage-main-agent")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-main-agent")).toHaveTextContent("Main Agent")
    expect(screen.queryByTestId("prompt-usage-main-node")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-subagent-agent")).not.toBeInTheDocument()
  })

  it("omits the repeated account-wide concurrency explanation", () => {
    const ambiguousProjects: PromptUsageProject[] = [{
      ...projects[0],
      sessions: [{
        ...notionSession,
        turns: [{
          ...notionSession.turns[0],
          quotaObservation: {
            status: "ambiguous",
            usedBefore: 10,
            usedAfter: 12,
            delta: null,
            precision: 1,
            resetAt: null,
            subagentCount: 0,
            reason: "overlapping_root_tasks",
          },
        }],
      }],
    }]

    render(<PromptUsageProjectBrowser projects={ambiguousProjects} promptCount={1} sessionCount={1} />)

    expect(screen.queryByTestId("prompt-usage-quota-detail-row")).not.toBeInTheDocument()
    expect(screen.queryByText("Quota Change Unavailable")).not.toBeInTheDocument()
    expect(screen.queryByText(/account-wide concurrent or multiple prompts/i)).not.toBeInTheDocument()
  })

  it("localizes core navigation and percentage labels in Traditional Chinese", async () => {
    const user = userEvent.setup()
    useAppPreferencesStore.getState().setLanguage("zh-TW")
    render(<PromptUsageProjectBrowser {...defaultProps} privacyNote={null} />)

    expect(screen.getByRole("region", { name: "提示詞使用量" })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "搜尋提示詞使用量" })).toHaveAttribute(
      "placeholder",
      "搜尋專案、工作階段、提示詞或代理",
    )
    expect(screen.queryByRole("combobox", { name: "篩選專案" })).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "排序提示詞使用量" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "提示詞使用量項目" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "開啟提示詞：Tune Fan Control" }))

    expect(screen.queryByTestId("prompt-usage-prompt-quota")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-quota-detail-row")).not.toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-usage-agent-share")[0]).toHaveTextContent(/^75%$/)
    expect(within(screen.getByTestId("prompt-usage-token-ledger-columns")).getByText("代理")).toBeInTheDocument()
    expect(within(screen.getByTestId("prompt-usage-token-ledger-columns")).getByText("總數")).toBeInTheDocument()
    expect(within(screen.getByTestId("prompt-usage-token-ledger-columns")).getByText("API估值")).toBeInTheDocument()
    expect(screen.getByText("主要代理")).toBeInTheDocument()
    expect(screen.getByText("子代理")).toBeInTheDocument()
    expect(screen.getByText("explorer")).toBeInTheDocument()
  })

  it("renders zero shares without NaN or Infinity", async () => {
    const user = userEvent.setup()
    const zeroProjects: PromptUsageProject[] = [{
      ...projects[0],
      promptCount: 1,
      sessions: [{
        ...notionSession,
        turns: [{
          ...notionSession.turns[0],
          tokens: tokens(0),
          agents: notionSession.turns[0].agents.map((entry) => ({
            ...entry,
            tokens: tokens(0),
            models: entry.models.map((model) => ({ ...model, ...tokens(0) })),
          })),
          quotaObservation: null,
        }],
      }],
    }]

    render(<PromptUsageProjectBrowser projects={zeroProjects} promptCount={1} sessionCount={1} />)
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))

    expect(screen.queryByTestId("prompt-usage-prompt-quota")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-agent-share")).toHaveTextContent(/^0%$/)
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it("hides unavailable quota diagnostics and never leaks provider reason codes", async () => {
    const user = userEvent.setup()
    const baselineProjects: PromptUsageProject[] = [{
      ...projects[0],
      sessions: [{
        ...notionSession,
        turns: [{
          ...notionSession.turns[0],
          quotaObservation: {
            status: "unavailable",
            usedBefore: null,
            usedAfter: null,
            delta: null,
            precision: null,
            resetAt: null,
            subagentCount: 0,
            reason: "baseline_only",
          },
        }],
      }],
    }]

    render(<PromptUsageProjectBrowser projects={baselineProjects} promptCount={1} sessionCount={1} />)
    await user.click(screen.getByRole("button", { name: "Open Session First Codex Session" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: Investigate The Upload Path" }))

    expect(screen.queryByTestId("prompt-usage-quota-detail-row")).not.toBeInTheDocument()
    expect(screen.queryByText(/Measurement starts with future prompts/i)).not.toBeInTheDocument()
    expect(screen.queryByText("baseline_only")).not.toBeInTheDocument()
  })

  it("keeps one aggregated token summary per agent and omits model token grids", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    await user.click(screen.getByRole("button", { name: "Open Prompt: Tune Fan Control" }))

    expect(screen.getAllByTestId("prompt-usage-agent-token-summary")).toHaveLength(2)
    expect(screen.queryByTestId("prompt-usage-model-token-summary")).not.toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-usage-agent-models").some((entry) => entry.textContent?.includes("GPT-5.6 Luna"))).toBe(true)
  })

  it("omits density controls and attributes", () => {
    render(<PromptUsageProjectBrowser {...defaultProps} />)

    expect(screen.queryByRole("button", { name: "Compact" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Comfortable" })).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-panel")).not.toHaveAttribute("data-density")
  })

  it("renders deterministic loading, error, and empty states", () => {
    const { rerender } = render(<PromptUsageProjectBrowser projects={[]} promptCount={0} sessionCount={0} loading />)
    expect(screen.getByTestId("prompt-usage-panel")).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("prompt-usage-navigation")).not.toBeInTheDocument()

    rerender(<PromptUsageProjectBrowser {...defaultProps} error="Local Session Logs Are Unavailable." />)
    expect(screen.getByRole("alert")).toHaveTextContent("Local Session Logs Are Unavailable.")

    const onCheckForRecords = vi.fn()
    rerender(<PromptUsageProjectBrowser projects={[]} promptCount={0} sessionCount={0} onCheckForRecords={onCheckForRecords} />)
    expect(screen.getByRole("heading", { name: "Ready For Your First Codex Session" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onCheckForRecords).toHaveBeenCalledTimes(1)
  })
})
