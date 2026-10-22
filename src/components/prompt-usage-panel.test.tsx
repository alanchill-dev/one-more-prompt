import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PromptUsagePanel } from "@/components/prompt-usage-panel"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { useAppUiStore } from "@/stores/app-ui-store"

vi.mock("@/components/prompt-usage-project-browser", () => ({
  PromptUsageProjectBrowser: ({ active, initialProjectId, initialSessionId, initialTurnId }: { active?: boolean; initialProjectId?: string; initialSessionId?: string; initialTurnId?: string }) => <div data-testid="project-browser-mock" data-active={active}>project browser {initialProjectId} {initialSessionId} {initialTurnId}<input aria-label="Project Selection" /></div>,
}))

vi.mock("@/components/prompt-usage-timeline-explorer", () => ({
  PromptUsageTimelineExplorer: ({ active, onOpenSession, onOpenPrompt }: { active?: boolean; onOpenSession: (id: string) => void; onOpenPrompt: (item: TimelineItem, source: HTMLElement) => void }) => <div data-testid="timeline-explorer-mock" data-active={active}><input aria-label="Timeline Position" /><input aria-label="Timeline Filter" /><button onClick={() => onOpenSession("session-42")}>Open Session</button><button onClick={event => onOpenPrompt({ project: { id: "project-42" }, session: { id: "session-42" }, turn: { id: "turn-42" } } as TimelineItem, event.currentTarget)}>Open Exact Prompt</button></div>,
}))

const projects: PromptUsageProject[] = [{
  id: "project-1",
  kind: "project",
  name: "One More Prompt",
  updatedAt: null,
  promptCount: 0,
  sessionCount: 0,
  isActive: false,
  codexOrder: 0,
  sessions: [],
}]

const props = { projects, promptCount: 0, sessionCount: 0 }

describe("PromptUsagePanel view modes", () => {
  beforeEach(() => useAppUiStore.getState().resetState())

  it("keeps the project/session/prompt hierarchy as the primary default view", () => {
    render(<PromptUsagePanel {...props} />)

    expect(screen.getByTestId("project-browser-mock")).toBeInTheDocument()
    expect(screen.queryByTestId("timeline-explorer-mock")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-view-switcher-row")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-mode-stage")).toHaveAttribute("data-mode", "hierarchy")
  })

  it("keeps visited workspaces mounted without adding page-level chrome", () => {
    render(<PromptUsagePanel {...props} />)

    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    expect(screen.getByTestId("timeline-explorer-mock")).toBeInTheDocument()
    expect(screen.getByTestId("project-browser-mock")).not.toBeVisible()
    expect(screen.getByTestId("prompt-usage-mode-stage")).toHaveAttribute("data-mode", "timeline")

    act(() => useAppUiStore.getState().setPromptUsageViewMode("hierarchy"))
    expect(screen.getByTestId("project-browser-mock")).toBeInTheDocument()
  })

  it("preserves both workspaces on ordinary navigation and deactivates hidden content", () => {
    useAppUiStore.getState().setActiveView("prompt-usage")
    render(<PromptUsagePanel {...props} />)
    const browser = screen.getByTestId("project-browser-mock")
    const selection = screen.getByRole("textbox", { name: "Project Selection" })
    fireEvent.change(selection, { target: { value: "selected session and prompt" } })

    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    const timeline = screen.getByTestId("timeline-explorer-mock")
    const position = screen.getByRole("textbox", { name: "Timeline Position" })
    const filter = screen.getByRole("textbox", { name: "Timeline Filter" })
    fireEvent.change(position, { target: { value: "camera at 14:00" } })
    fireEvent.change(filter, { target: { value: "model filter" } })
    expect(browser).toHaveAttribute("data-active", "false")
    expect(browser.parentElement).toHaveAttribute("inert")
    expect(timeline).toHaveAttribute("data-active", "true")

    act(() => useAppUiStore.getState().setPromptUsageViewMode("hierarchy"))
    expect(screen.getByRole("textbox", { name: "Project Selection" })).toBe(selection)
    expect(selection).toHaveValue("selected session and prompt")
    expect(timeline).toHaveAttribute("data-active", "false")
    expect(timeline.parentElement).toHaveAttribute("inert")

    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    expect(screen.getByRole("textbox", { name: "Timeline Position" })).toBe(position)
    expect(position).toHaveValue("camera at 14:00")
    expect(filter).toHaveValue("model filter")

    act(() => useAppUiStore.getState().setActiveView("home"))
    expect(timeline).toHaveAttribute("data-active", "false")
    expect(browser).toHaveAttribute("data-active", "false")
    act(() => useAppUiStore.getState().setActiveView("prompt-usage"))
    expect(timeline).toHaveAttribute("data-active", "true")
    expect(position).toHaveValue("camera at 14:00")
  })

  it("can be opened directly in Timeline mode by Usage Trend drill-down", () => {
    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    render(<PromptUsagePanel {...props} />)

    expect(screen.getByTestId("timeline-explorer-mock")).toBeInTheDocument()
    expect(screen.queryByTestId("project-browser-mock")).not.toBeInTheDocument()
  })

  it("opens the selected Session without an extra return row and preserves Timeline on Header switching", () => {
    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    render(<PromptUsagePanel {...props} />)
    const position = screen.getByRole("textbox", { name: "Timeline Position" })
    fireEvent.change(position, { target: { value: "saved time and scroll" } })
    fireEvent.click(screen.getByRole("button", { name: "Open Session" }))
    expect(screen.getByTestId("project-browser-mock")).toHaveTextContent("session-42")
    expect(position).not.toBeVisible()
    expect(screen.queryByRole("button", { name: "Return To Timeline" })).not.toBeInTheDocument()
    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    expect(screen.getByRole("textbox", { name: "Timeline Position" })).toBe(position)
    expect(position).toHaveValue("saved time and scroll")
    expect(position).toBeVisible()
  })

  it("routes the exact project/session/prompt and retains the Timeline instance when the Header switches back", () => {
    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    render(<PromptUsagePanel {...props} />)
    const timeline = screen.getByTestId("timeline-explorer-mock")
    fireEvent.click(screen.getByRole("button", { name: "Open Exact Prompt" }))
    expect(screen.getByTestId("project-browser-mock")).toHaveTextContent("project-42 session-42 turn-42")
    expect(timeline).not.toBeVisible()
    expect(screen.queryByRole("button", { name: "Return To Timeline" })).not.toBeInTheDocument()
    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    expect(screen.getByTestId("timeline-explorer-mock")).toBe(timeline)
    expect(timeline).toBeVisible()
  })

  it("applies an explicit Timeline target even when the project workspace was already visited", () => {
    render(<PromptUsagePanel {...props} />)
    const previousBrowser = screen.getByTestId("project-browser-mock")
    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    fireEvent.click(screen.getByRole("button", { name: "Open Exact Prompt" }))
    expect(screen.getByTestId("project-browser-mock")).not.toBe(previousBrowser)
    expect(screen.getByTestId("project-browser-mock")).toHaveTextContent("project-42 session-42 turn-42")
  })

  it("keeps normal Timeline entrance suppressed after the drill-down shell hands off", () => {
    useAppUiStore.getState().setActiveView("prompt-usage")
    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    useAppUiStore.getState().setPromptUsageDrilldownTransition({
      sourceCardRect: { left: 10, top: 20, width: 276, height: 266 },
      sourceActionRect: { left: 20, top: 220, width: 252, height: 58 },
      destinationSurfaceRect: null,
      destinationFilterRect: null,
      phase: "arriving",
    })
    render(<PromptUsagePanel {...props} />)

    expect(screen.getByTestId("prompt-usage-mode-stage")).toHaveAttribute("data-drilldown-origin", "true")

    act(() => useAppUiStore.getState().setPromptUsageDrilldownTransition(null))
    expect(screen.getByTestId("prompt-usage-mode-stage")).toHaveAttribute("data-drilldown-origin", "true")

    act(() => useAppUiStore.getState().setPromptUsageViewMode("hierarchy"))
    expect(screen.getByTestId("prompt-usage-mode-stage")).not.toHaveAttribute("data-drilldown-origin")
  })
})
