import { useAppUiStore } from "@/stores/app-ui-store"
import { PromptUsageTimelineExplorer } from "./prompt-usage-timeline-explorer"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { PromptUsageProjectBrowser } from "./prompt-usage-project-browser"
import { scopeForSession, scopeProjects } from "./prompt-usage-project-scope"
import { sortProjects } from "./prompt-usage-sort"

function turn(id: string, date: string, totalTokens: number, isActive = false): PromptUsageTurn {
  return { id, prompt: `${id} request`, startedAt: `${date}T10:00:00`, timeLabel: "10:00", isActive,
    tokens: { totalTokens, inputTokens: totalTokens, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 },
    agents: [], quotaObservation: null, costUsd: totalTokens / 1000, estimationStatus: "current_rate",
    costBreakdown: { inputUsd: totalTokens / 1000, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 } }
}
function project(id: string, turns: PromptUsageTurn[], kind: "project" | "standalone" = "project"): PromptUsageProject {
  const session: PromptUsageSession = { id: `${id}-session`, title: `${id} Session`, updatedAt: turns.at(-1)!.startedAt, promptCount: turns.length,
    isActive: turns.some(turn => turn.isActive), codexOrder: 0, turns, costUsd: turns.reduce((sum, turn) => sum + turn.costUsd!, 0), estimationStatus: "current_rate" }
  return { id, name: id, kind, updatedAt: session.updatedAt, promptCount: turns.length, sessionCount: 1, isActive: session.isActive, codexOrder: 0, sessions: [session] }
}
const projects = [
  project("Alpha", [turn("old", "2026-09-01", 9000, true), turn("today", "2026-09-10", 1000)]),
  project("Beta", [turn("beta", "2026-09-10", 2000)]),
  project("Solo", [turn("solo", "2026-09-10", 300)], "standalone"),
  project("Past", [turn("past", "2026-08-01", 500)]),
]

beforeEach(() => {
  useAppUiStore.getState().resetState()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-09-10T12:00:00"))
})
afterEach(() => vi.useRealTimers())

describe("Project Browser time and project filters", () => {
  it("retains a pinned Project folder across empty dates without retaining unpinned Sessions", () => {
    const scoped = scopeProjects(projects, { type: "today" }, [], new Date(), [], ["Past"])
    expect(scoped.find(entry => entry.id === "Past")).toMatchObject({ sessions: [], sessionCount: 0, promptCount: 0, isActive: false })
    expect(scopeProjects(projects, { type: "today" }, ["Beta"], new Date(), [], ["Past"]).map(entry => entry.id)).toEqual(["Beta"])
    const mixed = scopeProjects(projects, { type: "today" }, [], new Date(), ["Past-session"], ["Past"])
    expect(mixed.find(entry => entry.id === "Past")?.sessions[0]).toMatchObject({ id: "Past-session", turns: [] })
  })

  it("keeps a pinned Project through date and search changes without opening historical child Sessions", async () => {
    const user = userEvent.setup()
    useAppUiStore.getState().togglePromptUsageProjectPin("Past")
    render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4} />)
    const folder = screen.getByRole("button", { name: "Open Project Past" })
    expect(screen.getByRole("button", { name: "Unpin Project: Past" })).toHaveAttribute("aria-pressed", "true")
    await user.click(folder)
    expect(folder).toHaveAttribute("aria-expanded", "true")
    expect(screen.queryByRole("button", { name: "Open Session Past Session" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Prompt: today request" })).toBeInTheDocument()
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button"))
    await user.click(screen.getByRole("button", { name: "7 Days" }))
    expect(screen.getByRole("button", { name: "Unpin Project: Past" })).toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "past request")
    expect(screen.getByRole("button", { name: "Open Project Past" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Prompt: past request" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "Beta" }))
    expect(screen.queryByRole("button", { name: "Unpin Project: Past" })).not.toBeInTheDocument()
    expect(useAppUiStore.getState().promptUsagePinnedProjectIds).toEqual(["Past"])
    await user.click(screen.getByRole("checkbox", { name: "Beta" }))
    await user.click(screen.getByRole("button", { name: "Unpin Project: Past" }))
    expect(screen.queryByRole("button", { name: "Open Project Past" })).not.toBeInTheDocument()
  })

  it("keeps pinned sessions across dates without including out-of-range prompts or bypassing project filters", () => {
    const scoped = scopeProjects(projects, { type: "today" }, [], new Date(), ["Past-session"])
    const past = scoped.find(entry => entry.id === "Past")!
    expect(past).toMatchObject({ promptCount: 0, sessionCount: 1, isActive: false })
    expect(past.sessions[0]).toMatchObject({ id: "Past-session", promptCount: 0, turns: [], costUsd: null, estimationStatus: "unknown" })
    expect(scopeProjects(projects, { type: "today" }, ["Alpha"], new Date(), ["Past-session"]).map(entry => entry.id)).toEqual(["Alpha"])
    expect(scopeProjects(projects, { type: "day", dateKey: "2026-08-01" }, [], new Date(), ["Past-session"])[0].sessions[0].turns).toHaveLength(1)
    expect(scopeProjects(projects, { type: "today" }, []).some(entry => entry.id === "Past")).toBe(false)
  })

  it("retains a pin through date changes and full-history search while keeping the Prompt list scoped", async () => {
    const user = userEvent.setup()
    useAppUiStore.getState().togglePromptUsageSessionPin("Past-session")
    render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4} />)
    expect(screen.getByRole("button", { name: "Unpin Session: Past Session" })).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "Open Session Past Session" }))
    expect(screen.getByTestId("prompt-usage-no-prompts")).toHaveTextContent("No prompts in this view")
    expect(screen.queryByRole("button", { name: "Open Prompt: past request" })).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button"))
    await user.click(screen.getByRole("button", { name: "7 Days" }))
    expect(screen.getByRole("button", { name: "Unpin Session: Past Session" })).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-no-prompts")).toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "past request")
    expect(screen.getByRole("button", { name: "Unpin Session: Past Session" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "Beta" }))
    expect(screen.queryByRole("button", { name: "Unpin Session: Past Session" })).not.toBeInTheDocument()
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["Past-session"])
    await user.click(screen.getByRole("checkbox", { name: "Beta" }))
    expect(screen.getByRole("button", { name: "Unpin Session: Past Session" })).toBeInTheDocument()
  })

  it("shares pins with Timeline and removes an empty-date entry after unpinning there", async () => {
    const user = userEvent.setup()
    useAppUiStore.getState().togglePromptUsageSessionPin("Past-session")
    const props = { projects, promptCount: 5, sessionCount: 4 }
    const hierarchy = render(<PromptUsageProjectBrowser {...props} />)
    expect(screen.getByRole("button", { name: "Unpin Session: Past Session" })).toBeInTheDocument()
    hierarchy.unmount()
    const timeline = render(<PromptUsageTimelineExplorer {...props} />)
    await user.click(screen.getByRole("button", { name: "Unpin Session: Past Session" }))
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual([])
    timeline.unmount()
    render(<PromptUsageProjectBrowser {...props} />)
    expect(screen.queryByTestId("prompt-usage-entry-Past")).not.toBeInTheDocument()
  })

  it("scopes by prompt start and recalculates session/project summaries before sorting", () => {
    const scoped = scopeProjects(projects, { type: "today" }, [])
    expect(scoped.map(project => project.id)).toEqual(["Alpha", "Beta", "Solo"])
    expect(scoped[0]).toMatchObject({ promptCount: 1, sessionCount: 1, isActive: false, updatedAt: "2026-09-10T10:00:00" })
    expect(scoped[0].sessions[0]).toMatchObject({ promptCount: 1, isActive: false, costUsd: 1, estimationStatus: "current_rate", costBreakdown: { inputUsd: 1 }, turns: [{ id: "today" }] })
    expect(sortProjects(scoped, "tokens").map(project => project.id)).toEqual(["Beta", "Alpha", "Solo"])
    expect(scopeProjects(projects, { type: "range", startKey: "2026-09-01", endKey: "2026-09-10" }, ["Alpha", "Solo"]).map(project => project.id)).toEqual(["Alpha", "Solo"])
    expect(scopeProjects(projects, { type: "day", dateKey: "2026-09-01" }, ["Alpha"])[0]).toMatchObject({ promptCount: 1, isActive: true, updatedAt: "2026-09-01T10:00:00" })
  })

  it("rebuilds the model ledger from scoped turns and keeps missing old details unknown", () => {
    const costLine = { model: "gpt-6-astra", tokens: { input: 1000, cacheRead: 0, cacheWrite: 0, output: 0 }, rates: { input: 1000, cacheRead: null, cacheWrite: null, output: null }, fees: { inputUsd: 1, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }, costUsd: 1, estimationStatus: "current_rate" as const, observedAt: null, issues: [] }
    const entry = project("Ledger", [turn("old", "2026-09-01", 9000), { ...turn("today", "2026-09-10", 1000), costLines: [costLine] }])
    entry.sessions[0].costLines = [{ ...costLine, costUsd: 10 }]
    const scoped = scopeProjects([entry], { type: "today" }, [])[0].sessions[0]
    expect(scoped.costLines).toEqual([costLine])
    expect(scoped.costUsd).toBe(1)
    delete entry.sessions[0].turns[1].costLines
    expect(scopeProjects([entry], { type: "today" }, [])[0].sessions[0].costLines).toBeNull()
  })

  it("retains partial pricing when a scoped turn is unpriced", () => {
    const mixed = project("Mixed", [turn("excluded", "2026-09-01", 9000), turn("priced", "2026-09-10", 1000), { ...turn("unknown", "2026-09-10", 1000), costUsd: null, estimationStatus: "unknown" }])
    expect(scopeProjects([mixed], { type: "today" }, [])[0].sessions[0]).toMatchObject({ costUsd: 1, estimationStatus: "partial_rate" })
  })

  it("keeps unmeasured zero-token estimates unknown and finds valid historical timestamps", () => {
    const unknown = { ...turn("no-usage", "2026-09-10", 0), costUsd: null, costBreakdown: null, estimationStatus: "unknown" as const }
    const entry = project("Unmeasured", [turn("excluded", "2026-09-01", 9000), unknown])
    expect(scopeProjects([entry], { type: "today" }, [])[0].sessions[0]).toMatchObject({ costUsd: null, estimationStatus: "unknown" })
    expect(scopeForSession({ ...entry.sessions[0], turns: [{ ...unknown, startedAt: null }, turn("historical", "2026-08-01", 10)] })).toEqual({ type: "day", dateKey: "2026-08-01" })
  })

  it("uses the same real controls with 30-day default, multi-select and no stale inspector", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4} />)
    expect(screen.getByTestId("prompt-usage-time-filter")).toHaveTextContent("30 Days")
    expect(screen.queryByTestId("prompt-usage-entry-Past")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Prompt: today request" }))
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("today request")
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "Beta" }))
    await user.click(screen.getByRole("checkbox", { name: "Solo" }))
    expect(screen.queryByTestId("prompt-usage-entry-Alpha")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-entry-Beta")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-entry-Solo")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    // Historical projects remain in the options even when Today excludes them.
    expect(screen.getByRole("checkbox", { name: "Past" })).toBeInTheDocument()
  })

  it("changes the date preset and preserves text filtering within the date scope", async () => {
    const user = userEvent.setup()
    render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4} />)
    await user.click(within(screen.getByTestId("prompt-usage-time-filter")).getByRole("button"))
    await user.click(screen.getByRole("button", { name: "14 Days" }))
    expect(screen.getByRole("button", { name: "Open Prompt: old request, Running" })).toBeInTheDocument()
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "old request")
    expect(screen.queryByRole("button", { name: "Open Prompt: today request" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Prompt: old request, Running" })).toBeInTheDocument()
  })

  it.each(["hierarchy", "timeline"] as const)("applies explicit Overview hour to an already mounted %s and clears stale filters", async mode => {
    const user = userEvent.setup()
    const props = { projects, promptCount: 5, sessionCount: 4 }
    render(mode === "hierarchy" ? <PromptUsageProjectBrowser {...props} /> : <PromptUsageTimelineExplorer {...props} />)
    await user.type(screen.getByRole("searchbox", { name: "Search Prompt Usage" }), "no matching prompt")
    await user.click(screen.getByRole("button", { name: "Filter Projects" }))
    await user.click(screen.getByRole("checkbox", { name: "Past" }))
    const scope = { type: "hour", dateKey: "2026-09-01", hour: 10 } as const
    act(() => {
      useAppUiStore.getState().setPromptUsageTimeScope(scope)
      useAppUiStore.getState().setPromptUsageDrilldownTransition({
        destination: mode, scope, phase: "arriving",
        sourceCardRect: { left: 20, top: 20, width: 200, height: 200 },
        sourceActionRect: { left: 20, top: 100, width: 100, height: 40 },
        destinationSurfaceRect: null, destinationFilterRect: null,
      })
    })
    expect(screen.getByRole("searchbox", { name: "Search Prompt Usage" })).toHaveValue("")
    expect(screen.getByRole("checkbox", { name: "Past" })).not.toBeChecked()
    expect(screen.getByTestId("prompt-usage-time-filter")).toHaveTextContent("2026/9/1 · 10:00–10:59")
    if (mode === "hierarchy") {
      expect(screen.getByRole("button", { name: "Open Prompt: old request, Running" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Open Prompt: today request" })).not.toBeInTheDocument()
    } else expect(screen.getByTestId("prompt-usage-filter-summary")).toHaveTextContent("1 Prompts")
  })

  it("opens the requested historical prompt from Timeline and keeps the target's day", () => {
    const scroll = vi.fn()
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    try {
      render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4} initialProjectId="Alpha" initialSessionId="Alpha-session" initialTurnId="old" />)
      expect(screen.getByTestId("prompt-usage-time-filter")).toHaveTextContent("2026/9/1")
      expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("old request")
      expect(screen.queryByRole("button", { name: "Open Prompt: today request" })).not.toBeInTheDocument()
      expect(scopeForSession(projects[3].sessions[0])).toEqual({ type: "day", dateKey: "2026-08-01" })
    } finally { HTMLElement.prototype.scrollIntoView = previous }
  })
})
