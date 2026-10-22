import userEvent from "@testing-library/user-event"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PromptUsageTimelineExplorer } from "@/components/prompt-usage-timeline-explorer"
import type {
  PromptUsageAgent,
  PromptUsageProject,
  PromptUsageSession,
  PromptUsageTokens,
  PromptUsageTurn,
} from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { promptUnreadKey, usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { useAppUiStore } from "@/stores/app-ui-store"

// Reader/filter contracts use a stationary full-scope camera. Guided navigation has its own integration suite.
vi.mock("@/components/prompt-usage-timeline-camera", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/prompt-usage-timeline-camera")>(),
  useTimelineCamera: (start: number, end: number) => ({ start, end, span: end - start, moving: false, minimumSpan: 300_000, resize: vi.fn(), zoom: vi.fn(), fit: vi.fn(), target: { current: start }, move: vi.fn(), advance: vi.fn() }),
}))

const tokens = (totalTokens: number): PromptUsageTokens => ({
  totalTokens,
  inputTokens: Math.floor(totalTokens * 0.6),
  cachedInputTokens: Math.floor(totalTokens * 0.2),
  outputTokens: Math.floor(totalTokens * 0.4),
  reasoningOutputTokens: Math.floor(totalTokens * 0.1),
})

const agent = (id: string, model: string, totalTokens: number): PromptUsageAgent => ({
  id,
  kind: "main",
  name: "Main Agent",
  role: null,
  tokens: tokens(totalTokens),
  models: [{ name: model, ...tokens(totalTokens) }],
  costUsd: totalTokens / 1_000_000,
  estimationStatus: "current_rate",
})

const turn = (id: string, prompt: string, totalTokens: number, startedAt: string, model = "GPT-5.6 Sol"): PromptUsageTurn => ({
  id,
  prompt,
  timeLabel: new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  startedAt,
  tokens: tokens(totalTokens),
  agents: [agent(`agent-${id}`, model, totalTokens)],
  quotaObservation: null,
  costUsd: totalTokens / 1_000_000,
  estimationStatus: "current_rate",
})

const sessions: PromptUsageSession[] = [
  {
    id: "session-1",
    title: "Usage Trend polish",
    updatedAt: "2026-09-04T14:32:00+08:00",
    promptCount: 2,
    isActive: false,
    codexOrder: 0,
    costUsd: 0.03,
    estimationStatus: "current_rate",
    turns: [
      turn("turn-1", "Redesign the tooltip card", 18_400_000, "2026-09-04T14:32:00+08:00", "GPT-5.6 Sol"),
      turn("turn-2", "Tune the transition animation", 9_200_000, "2026-09-04T14:08:00+08:00", "GPT-5.6 Luna"),
    ],
  },
  {
    id: "session-2",
    title: "Earlier exploration",
    updatedAt: "2026-09-03T11:20:00+08:00",
    promptCount: 1,
    isActive: false,
    codexOrder: 1,
    costUsd: 0.01,
    estimationStatus: "current_rate",
    turns: [turn("turn-3", "Review the previous implementation", 7_600_000, "2026-09-03T11:20:00+08:00", "GPT-5.6 Sol")],
  },
]

const projects: PromptUsageProject[] = [{
  id: "one-more-prompt",
  kind: "project",
  name: "One More Prompt",
  updatedAt: "2026-09-04T14:32:00+08:00",
  promptCount: 3,
  sessionCount: 2,
  isActive: false,
  codexOrder: 0,
  sessions,
}]

const defaultProps = {
  projects,
  promptCount: 3,
  sessionCount: 2,
  privacyNote: "Stored On This Mac",
}

const groupButton = () => within(screen.getByTestId("prompt-session-lanes")).getByRole("button", { name: /Usage Trend polish · 2/ })
const lane = (id: string) => screen.getByTestId("prompt-session-lanes").querySelector(`[data-session-id="${id}"]`)

async function selectModel(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Filter Model" }))
  await user.click(await screen.findByRole("option", { name, exact: true }))
}

describe("PromptUsageTimelineExplorer", () => {
  beforeEach(() => {
    const media = window.matchMedia
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media(query), matches: query.includes("prefers-reduced-motion") }))
    window.localStorage.clear()
    useAppPreferencesStore.getState().resetState()
    useAppUiStore.getState().resetState()
    usePromptUsageUnreadStore.getState().resetState()
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "range", startKey: "2026-09-01", endKey: "2026-09-05" })
  })

  it("animates date scope changes with system reduced motion and cancels on rapid changes or exit", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate")
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }))
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    try {
      const { unmount } = render(<PromptUsageTimelineExplorer {...defaultProps} />)
      expect(animate).not.toHaveBeenCalled()
      act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" }))
      expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: .25, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" })
      act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-03" }))
      expect(cancel).toHaveBeenCalledOnce()
      expect(animate).toHaveBeenCalledTimes(2)
      unmount()
      expect(cancel).toHaveBeenCalledTimes(2)
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "animate", descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, "animate")
    }
  })

  it("keeps pinned Session rows across empty date scopes without showing out-of-range events", () => {
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    fireEvent.click(screen.getByRole("button", { name: "Pin Session: Usage Trend polish" }))
    act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-08-01" }))
    expect(lane("session-1")).toHaveAttribute("data-pinned", "true")
    expect(lane("session-2")).toBeNull()
    expect(document.querySelectorAll(".prompt-session-event")).toHaveLength(0)
    expect(screen.queryByTestId("prompt-usage-no-matches")).not.toBeInTheDocument()
    act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" }))
    expect(lane("session-1")).toHaveAttribute("data-pinned", "true")
    expect(lane("session-1")!.querySelectorAll(".prompt-session-event")).toHaveLength(2)
    expect(lane("session-1")!.querySelectorAll("[data-cluster]")).toHaveLength(0)
    act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-08-01" }))
    fireEvent.click(screen.getByRole("button", { name: "Unpin Session: Usage Trend polish" }))
    expect(screen.getByTestId("prompt-usage-no-matches")).toBeInTheDocument()
  })

  it("starts with the full timeline and no permanent list or detail pane", () => {
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect(screen.getByTestId("prompt-usage-timeline-shell")).toHaveClass("prompt-timeline-surface")
    expect(screen.getByTestId("prompt-usage-timeline-primary-plane")).toHaveClass("basis-full")
    expect(screen.getByTestId("prompt-session-lanes")).toBeInTheDocument()
    expect(lane("session-1")).toHaveTextContent("Usage Trend polish")
    expect(lane("session-2")).toHaveTextContent("Earlier exploration")
    expect(groupButton()).toHaveTextContent("2")
    expect(screen.getByTestId("prompt-session-event-turn-3")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-reader-dates")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-navigation")).not.toBeInTheDocument()
  })

  it("acknowledges only the completed Prompt actually opened in a visible reader", async () => {
    const user = userEvent.setup()
    const keys = sessions[0].turns.map(turn => promptUnreadKey(sessions[0].id, turn.id))
    usePromptUsageUnreadStore.setState({ unreadKeys: keys })
    const view = render(<PromptUsageTimelineExplorer {...defaultProps} active={false} />)
    await user.click(groupButton())
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual(keys)
    await user.click(screen.getByTestId("prompt-reader-cluster-item-turn-1"))
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual(keys)
    view.rerender(<PromptUsageTimelineExplorer {...defaultProps} active />)
    expect(usePromptUsageUnreadStore.getState().unreadKeys).toEqual([keys[1]])
    expect(within(screen.getByTestId("prompt-reader-cluster-item-turn-1")).queryByTestId("prompt-usage-prompt-unread")).not.toBeInTheDocument()
    expect(within(screen.getByTestId("prompt-reader-cluster-item-turn-2")).getByTestId("prompt-usage-prompt-unread")).toBeInTheDocument()
  })

  it("orders Sessions by first activity and reads grouped prompts chronologically", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect([...screen.getByTestId("prompt-session-lanes").querySelectorAll("[data-session-id]")].map((node) => node.getAttribute("data-session-id"))).toEqual(["session-2", "session-1"])
    await user.click(groupButton())
    const rows = [...screen.getByTestId("prompt-reader-cluster").querySelectorAll('[data-testid^="prompt-reader-cluster-item-"]')]
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual(["prompt-reader-cluster-item-turn-2", "prompt-reader-cluster-item-turn-1"])
    expect(rows[1]).toHaveTextContent("Redesign the tooltip card")
    expect(rows[1]).not.toHaveTextContent("GPT-5.6 Sol")
    expect(rows[1]).toHaveClass("min-h-[4.75rem]")
    expect(rows[1]).toHaveTextContent("18M")
  })

  it("keeps missing model metadata distinct from Main Agent and known palette colors", async () => {
    const user = userEvent.setup()
    const unknown = { ...turn("unknown", "Missing model metadata", 90_000_000, "2026-09-04T13:50:00+08:00"), agents: [{ ...agent("unknown-agent", "GPT-5.6 Sol", 90_000_000), models: [] }] }
    const data = [{ ...projects[0], promptCount: 4, sessions: [{ ...sessions[0], turns: [...sessions[0].turns, unknown] }, sessions[1]] }]
    render(<PromptUsageTimelineExplorer {...defaultProps} projects={data} promptCount={4} />)
    await user.click(screen.getByRole("combobox", { name: "Filter Model" }))
    expect(await screen.findByRole("option", { name: "Unknown model" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Main Agent" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: "Unknown model" }))
    expect(screen.getByTestId("prompt-session-event-unknown").getAttribute("style")).toContain("var(--muted-foreground)")
    expect(screen.queryByTestId("prompt-session-event-turn-3")).not.toBeInTheDocument()
    await selectModel(user, "GPT-5.6 Sol")
    expect(screen.getByTestId("prompt-session-event-turn-1").getAttribute("style")).not.toContain("var(--muted-foreground)")
    expect(screen.queryByTestId("prompt-session-event-unknown")).not.toBeInTheDocument()
  })

  it("uses explicit turn model identity when token attribution is unavailable", async () => {
    const user = userEvent.setup()
    const identity: PromptUsageTurn = { ...turn("identity", "Context model only", 0, "2026-09-04T13:40:00+08:00"), model: "gpt-5.6-terra", agents: [{ ...agent("identity-agent", "GPT-5.6 Terra", 0), models: [] }] }
    const data = [{ ...projects[0], promptCount: 4, sessions: [{ ...sessions[0], turns: [...sessions[0].turns, identity] }, sessions[1]] }]
    render(<PromptUsageTimelineExplorer {...defaultProps} projects={data} promptCount={4} />)
    await selectModel(user, "gpt-5.6-terra")
    expect(screen.getByTestId("prompt-session-event-identity").getAttribute("style")).not.toContain("var(--muted-foreground)")
    expect(screen.queryByTestId("prompt-session-event-turn-3")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("1")
  })

  it("filters the chart from the shared day scope", () => {
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" })
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect(lane("session-1")).toBeInTheDocument()
    expect(lane("session-2")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("2")
  })

  it("supports hour-level drill-down with distinct events", () => {
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "hour", dateKey: "2026-09-04", hour: 14 })
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect(screen.getByTestId("prompt-session-event-turn-1")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-session-event-turn-2")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-session-event-turn-3")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-time-filter")).toHaveTextContent("14:00–14:59")
  })

  it("filters by model and prompt search without changing Session hierarchy", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await selectModel(user, "GPT-5.6 Luna")
    expect(screen.getByTestId("prompt-session-event-turn-2")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-session-event-turn-1")).not.toBeInTheDocument()
    await selectModel(user, "All Models")
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "previous implementation")
    expect(screen.getByTestId("prompt-session-event-turn-3")).toBeInTheDocument()
    expect(lane("session-1")).not.toBeInTheDocument()
  })

  it("intersects multiple selected projects with model and search filters and resets stale readers", async () => {
    const user = userEvent.setup()
    const secondTurn = turn("other-turn", "Review another project", 1000, "2026-09-04T15:00:00+08:00", "GPT-5.6 Sol")
    const secondSession = { ...sessions[1], id: "other-session", turns: [secondTurn] }
    const otherProject = { ...projects[0], id: "other-project", name: "Another Project", sessions: [secondSession] }
    const { rerender } = render(<PromptUsageTimelineExplorer {...defaultProps} projects={[...projects, otherProject]} />)
    await user.click(screen.getByTestId("prompt-session-event-turn-3"))
    expect(screen.getByTestId("prompt-usage-details-column")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "Another Project" }))
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("1 Prompts")
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(lane("session-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-session-event-other-turn")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "One More Prompt" }))
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("4 Prompts")
    await selectModel(user, "GPT-5.6 Sol")
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "Review")
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("2 Prompts")
    expect(screen.queryByTestId("prompt-session-event-turn-1")).not.toBeInTheDocument()
    // A data refresh preserves the user's selection rather than resetting it.
    rerender(<PromptUsageTimelineExplorer {...defaultProps} projects={[...projects, otherProject]} />)
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("2 Prompts")
  })

  it("opens a standalone event directly in an overlay without narrowing the timeline", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(screen.getByTestId("prompt-session-event-turn-3"))
    const inspector = screen.getByTestId("prompt-usage-details-column")
    expect(inspector).toHaveTextContent("Review the previous implementation")
    expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveClass("absolute", "right-0")
    expect(screen.getByTestId("prompt-usage-timeline-primary-plane")).toHaveClass("basis-full")
    expect(within(screen.getByTestId("prompt-usage-main-agent")).getByText("Main Agent")).not.toHaveClass("truncate")
    expect(screen.getByTestId("prompt-usage-agent-share")).toHaveClass("whitespace-nowrap")
  })

  it("shows a calm empty state when filters remove every prompt", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "nothing matches this")
    expect(screen.getByTestId("prompt-usage-no-matches")).toHaveTextContent("No prompts in this view")
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
  })

  it("offers bounded presets and the custom calendar", async () => {
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "lastDays", days: 7 })
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button", { expanded: false }))
    const menu = screen.getByTestId("prompt-usage-time-menu")
    expect(within(menu).queryByRole("button", { name: "All Time" })).not.toBeInTheDocument()
    for (const name of ["Today", "7 Days", "Custom"]) expect(within(menu).getByRole("button", { name, exact: true })).toBeInTheDocument()
  })

  it("supports keyboard selection, Escape focus restoration, and outside filter dismissal", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    const model = screen.getByRole("combobox", { name: "Filter Model" })
    model.focus()
    await user.keyboard("{ArrowDown}")
    await screen.findByRole("option", { name: "GPT-5.6 Luna" })
    await user.keyboard("{End}{Enter}")
    expect(model).toHaveTextContent("GPT-5.6 Luna")
    expect(screen.getByTestId("prompt-session-event-turn-2")).toBeInTheDocument()
    await waitFor(() => expect(model).toHaveFocus())
    await user.keyboard("{ArrowDown}")
    await screen.findByRole("option", { name: "GPT-5.6 Luna" })
    await user.keyboard("{Escape}")
    await waitFor(() => expect(model).toHaveFocus())
    const time = within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button", { expanded: false })
    await user.click(time)
    await screen.findByTestId("prompt-usage-time-menu")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(time).toHaveFocus())
    expect(time).toHaveAttribute("aria-expanded", "false")
    await user.click(time)
    await screen.findByTestId("prompt-usage-time-menu")
    await user.click(screen.getByRole("searchbox", { name: "Search Prompt Usage" }))
    expect(time).toHaveAttribute("aria-expanded", "false")
  })

  it("applies a custom date from the portaled calendar", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button", { expanded: false }))
    await user.click(await screen.findByRole("button", { name: "Custom", exact: true }))
    await user.click(screen.getByRole("tab", { name: "Single Day", exact: true }))
    await user.click(screen.getByRole("gridcell", { name: "Select 2026/9/3" }))
    await user.click(screen.getByRole("button", { name: "Apply Filter" }))
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: "2026-09-03" })
    expect(screen.getByTestId("prompt-session-event-turn-3")).toBeInTheDocument()
    expect(lane("session-1")).not.toBeInTheDocument()
  })

  it("keeps stale chart results visible during refresh and surfaces errors", () => {
    render(<PromptUsageTimelineExplorer {...defaultProps} loading error="probe delayed" />)
    expect(groupButton()).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing local data")
    expect(screen.getByRole("alert")).toHaveTextContent("probe delayed")
  })

  it("dims other Sessions without filtering and toggles focus off when clicked again", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    const button = screen.getByRole("button", { name: "Focus Session: Usage Trend polish" })
    await user.click(button)
    expect(lane("session-2")).toHaveAttribute("data-muted")
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("3 Prompts")
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("checkbox", { name: "Only This Session" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show All Sessions" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Focused Session:/)).not.toBeInTheDocument()
    await user.click(button)
    expect(lane("session-2")).not.toHaveAttribute("data-muted")
    expect(button).toHaveAttribute("aria-pressed", "false")
    await user.click(button)
    // The selected Session still exists in this new scope; date changes must clear it anyway.
    act(() => useAppUiStore.getState().setPromptUsageTimeScope({ type: "range", startKey: "2026-09-02", endKey: "2026-09-05" }))
    expect(lane("session-2")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("3 Prompts")
    expect(screen.getByRole("button", { name: "Focus Session: Usage Trend polish" })).toHaveAttribute("aria-pressed", "false")
  })

  it("clears Session selection when another filter makes it invalid", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(screen.getByRole("button", { name: "Focus Session: Earlier exploration" }))
    expect(lane("session-1")).toHaveAttribute("data-muted")
    await selectModel(user, "GPT-5.6 Luna")
    expect(lane("session-2")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-session-event-turn-2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Focus Session: Usage Trend polish" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps empty Today explicit and offers the latest active day", async () => {
    const user = userEvent.setup()
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "today" })
    const old = projects.map((project) => ({ ...project, sessions: project.sessions.map((session) => ({ ...session, turns: session.turns.map((item) => ({ ...item, startedAt: "2000-01-01T10:00:00" })) })) }))
    render(<PromptUsageTimelineExplorer {...defaultProps} projects={old} />)
    expect(screen.getByText("No Prompts Today")).toBeInTheDocument()
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "today" })
    await user.click(screen.getByRole("button", { name: "View Latest Active Day" }))
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: "2000-01-01" })
    expect(lane("session-1")).toBeInTheDocument()
  })

  it("filters chart events to the same half-open time window as the totals", () => {
    const date = new Date(sessions[0].turns[0].startedAt!)
    const minute = date.getHours() * 60 + date.getMinutes()
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "window", dateKey: "2026-09-04", startMinute: minute, endMinute: minute + 1 })
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect(screen.getByTestId("prompt-session-event-turn-1")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-session-event-turn-2")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("1")
  })

  it("opens the resolved Session from its inspector action", async () => {
    const user = userEvent.setup()
    const openSession = vi.fn()
    render(<PromptUsageTimelineExplorer {...defaultProps} onOpenSession={openSession} />)
    await user.click(screen.getByTestId("prompt-session-event-turn-3"))
    await user.click(screen.getByRole("button", { name: "Open In Project Browser" }))
    expect(openSession).toHaveBeenCalledWith(sessions[1].id)
  })

  it("returns from details to the same mounted group and scroll position before closing to the source", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    const group = groupButton()
    group.focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("button", { name: "Back To Timeline" })).toHaveFocus())
    expect(group).toHaveAttribute("aria-pressed", "true")
    const readerScroll = screen.getByTestId("prompt-reader-cluster-scroll")
    readerScroll.scrollTop = 80
    await user.click(screen.getByTestId("prompt-reader-cluster-item-turn-1"))
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Redesign the tooltip card")
    expect(screen.getByTestId("timeline-reader-overlay")).not.toHaveAttribute("inert")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument())
    expect(screen.getByTestId("prompt-reader-cluster-scroll")).toBe(readerScroll)
    expect(readerScroll.scrollTop).toBe(80)
    await user.click(screen.getByRole("button", { name: "Back To Timeline" }))
    await waitFor(() => expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument())
    expect(group).toHaveFocus()
  })

  it("only scrolls lanes on explicit Locate and preserves group reader position", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(groupButton())
    const laneScroll = screen.getByTestId("prompt-session-lanes").querySelector<HTMLElement>(".prompt-session-lanes-scroll")!
    const scrollTo = vi.fn()
    laneScroll.scrollTo = scrollTo
    const reader = screen.getByTestId("prompt-reader-cluster-scroll")
    reader.scrollTop = 50
    fireEvent.pointerEnter(screen.getByTestId("prompt-reader-cluster-item-turn-2"))
    expect(scrollTo).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole("button", { name: /Locate On Timeline:.*Usage Trend polish/ })[0])
    expect(scrollTo).toHaveBeenCalledOnce()
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }))
    expect(reader.scrollTop).toBe(50)
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
  })

  it("dismisses group reading on outside click and on filter changes", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(groupButton())
    await user.click(screen.getByTestId("prompt-usage-filter-summary"))
    await waitFor(() => expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument())
    await user.click(groupButton())
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "previous")
    await waitFor(() => expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument())
    expect(screen.getByTestId("prompt-session-event-turn-3")).toBeInTheDocument()
  })

  it("closes only the Inspector on outside click before returning to the group", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    await user.click(groupButton())
    await user.click(screen.getByTestId("prompt-reader-cluster-item-turn-1"))
    await user.click(screen.getByTestId("prompt-usage-filter-summary"))
    await waitFor(() => expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument())
    expect(screen.getByTestId("prompt-reader-cluster")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("timeline-reader-overlay")).not.toHaveAttribute("inert"))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("prompt-reader-cluster")).not.toBeInTheDocument())
  })

  it("keeps scope selection in the explicit time filter without active-time or return shortcuts", () => {
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    expect(screen.queryByRole("button", { name: "Focus Active Time" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Return To Time Overview" })).not.toBeInTheDocument()
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "range", startKey: "2026-09-01", endKey: "2026-09-05" })
  })

  it("narrows a chart date while keeping focus on the explicit time filter", async () => {
    const user = userEvent.setup()
    render(<PromptUsageTimelineExplorer {...defaultProps} />)
    const axis = screen.getByTestId("prompt-session-lanes").querySelector(".prompt-session-ticks")!
    await user.click(within(axis as HTMLElement).getAllByRole("button")[0])
    expect(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button", { expanded: false })).toHaveFocus()
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: "2026-09-01" })
    expect(screen.queryByRole("button", { name: "Return To Time Overview" })).not.toBeInTheDocument()
  })
})
