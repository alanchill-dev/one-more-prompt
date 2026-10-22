import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageProjectBrowser } from "./prompt-usage-project-browser"
import { PromptUsageTimelineReader } from "./prompt-usage-timeline-reader"
import { PromptUsageSessionLanes } from "./prompt-usage-session-lanes"
import type { PromptUsageProject, PromptUsageTurn } from "@/lib/prompt-usage"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"

function data() {
  const turn = (id: string, isActive: boolean): PromptUsageTurn => ({ id, prompt: `${id} request`, timeLabel: "09:00", startedAt: `2026-09-07T09:${isActive ? "30" : "00"}:00`, isActive, tokens: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 }, agents: [], quotaObservation: null, costUsd: null, estimationStatus: "unknown" })
  const turns = [turn("current", true), turn("older", false)]
  const session = { id: "session", title: "Session", updatedAt: turns[0].startedAt, promptCount: 2, isActive: true, codexOrder: 0, turns, costUsd: null, estimationStatus: "unknown" as const }
  const project: PromptUsageProject = { id: "project", name: "Project", kind: "project", updatedAt: turns[0].startedAt, promptCount: 2, sessionCount: 1, isActive: true, codexOrder: 0, sessions: [session] }
  const items: TimelineItem[] = turns.map((turn) => ({ project, session, turn, startedAt: new Date(turn.startedAt!).getTime(), dateKey: "2026-09-07", model: null }))
  return { project, items }
}

describe("Precise prompt running indicators", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-07T12:00:00")) })
  afterEach(() => vi.useRealTimers())
  it("spins only the current prompt and inspector even when the OS requests reduced motion", async () => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media, media: query, matches: query === "(prefers-reduced-motion: reduce)" }))
    const user = userEvent.setup()
    const { project } = data()
    render(<PromptUsageProjectBrowser projects={[project]} promptCount={2} sessionCount={1} />)
    expect(screen.queryByTestId("prompt-usage-summary-running")).not.toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-usage-prompt-running")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Open Prompt: older request" }))
    expect(screen.queryByTestId("prompt-usage-inspector-running")).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId("prompt-usage-details-column")).getByRole("button", { name: "Close Prompt Details" }))
    await user.click(screen.getByRole("button", { name: "Open Prompt: current request, Running" }))
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true)
    expect(screen.getByTestId("prompt-usage-inspector-running")).toHaveClass("animate-spin")
    expect(screen.getByTestId("prompt-usage-inspector-running")).not.toHaveClass("motion-reduce:animate-none")
    await user.click(within(screen.getByTestId("prompt-usage-details-column")).getByRole("button", { name: "Close Prompt Details" }))
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "older request")
    expect(within(screen.getByRole("button", { name: "Open Prompt: older request" })).queryByTestId("prompt-usage-prompt-running")).not.toBeInTheDocument()
  })

  it("keeps reader activity tied to the record when filtering or showing a cluster", () => {
    const { items } = data()
    const callbacks = { markerColor: () => "#aaa", onSelect: () => {}, onHighlight: () => {}, onLocate: () => {}, onClearCluster: () => {}, highlightedTurnId: null, focusedSessionId: null }
    const view = render(<PromptUsageTimelineReader items={items} clusterItems={items}  {...callbacks} />)
    expect(within(screen.getByTestId("prompt-reader-cluster-item-current")).getByTestId("prompt-usage-prompt-running")).toHaveAccessibleName("Running")
    expect(within(screen.getByTestId("prompt-reader-cluster-item-older")).queryByTestId("prompt-usage-prompt-running")).not.toBeInTheDocument()
    view.rerender(<PromptUsageTimelineReader items={[items[1]]} clusterItems={[items[1]]} {...callbacks} />)
    expect(screen.queryByTestId("prompt-usage-prompt-running")).not.toBeInTheDocument()
    view.rerender(<PromptUsageTimelineReader items={items} clusterItems={[items[0]]} {...callbacks} />)
    expect(within(screen.getByTestId("prompt-reader-cluster")).getByTestId("prompt-usage-prompt-running")).toBeInTheDocument()
  })

  it("shows activity on its lane and exact event, preserving cluster counts", () => {
    const { items } = data()
    const start = new Date("2026-09-07T09:00:00").getTime()
    const props = { items, start, end: start + 3600000, focusedSessionId: null, highlightedTurnId: null, onFocusSession: () => {}, onHighlight: () => {}, onSelect: () => {}, onSelectGroup: () => {}, markerColor: () => "#aaa", labels: { session: "Sessions", sentAt: "Sent At", empty: "Empty", focusSession: "Focus", prompts: "Prompts" } }
    const view = render(<PromptUsageSessionLanes {...props} />)
    expect(screen.getAllByTestId("prompt-session-lane-running")).toHaveLength(1)
    expect(within(screen.getByTestId("prompt-session-event-current")).getByTestId("prompt-session-event-running")).toBeInTheDocument()
    expect(within(screen.getByTestId("prompt-session-event-older")).queryByTestId("prompt-session-event-running")).not.toBeInTheDocument()
    view.rerender(<PromptUsageSessionLanes {...props} items={items.map(item => ({ ...item, startedAt: start }))} end={start + 30 * 86400000} />)
    const cluster = screen.getByRole("button", { name: /2 Prompts/ })
    // Even at the clipped edge, the marker keeps its full count visibly inside.
    expect(cluster).toHaveAccessibleName(/2 Prompts/)
    expect(cluster.querySelector("small")).toHaveTextContent("2")
    fireEvent.pointerEnter(cluster, { pointerType: "mouse" })
    expect(document.querySelector(".prompt-session-group-summary")).toHaveTextContent("2 Prompts")
    expect(within(cluster).getByTestId("prompt-session-cluster-running")).toBeInTheDocument()
  })
})
