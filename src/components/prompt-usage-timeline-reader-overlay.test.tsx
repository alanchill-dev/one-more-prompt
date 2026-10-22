import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageTimelineReaderOverlay } from "./prompt-usage-timeline-reader-overlay"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"

vi.mock("./prompt-usage-timeline-reader", () => ({
  PromptUsageTimelineReader: ({ clusterItems, onClearCluster }: { clusterItems: TimelineItem[]; onClearCluster: () => void }) => <section><button className="prompt-reader-back" onClick={onClearCluster}>Back To Timeline</button><span>{clusterItems[0].turn.prompt}</span></section>,
}))
const tokens = { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }
const turn: PromptUsageTurn = {
  id: "turn", prompt: "Selected Prompt", timeLabel: "09:00", startedAt: "2026-09-07T09:00:00+08:00",
  tokens, agents: [], costUsd: null, estimationStatus: "unavailable", quotaObservation: null,
}
const session: PromptUsageSession = {
  id: "session", title: "Session", updatedAt: turn.startedAt, promptCount: 1, isActive: false,
  codexOrder: 0, costUsd: null, estimationStatus: "unavailable", turns: [turn],
}

const item: TimelineItem = { session, turn, project: { id: "p", name: "Project", kind: "project", updatedAt: null, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }, startedAt: 1, dateKey: "2026-09-07", model: null }

describe("Timeline Reader Overlay", () => {
  let source: HTMLButtonElement
  let completions: (() => void)[]
  let animate: ReturnType<typeof vi.fn>
  const props = { items: [item], clusterItems: [item], covered: false, highlightedTurnId: null, focusedSessionId: null, markerColor: () => "#fff", onSelect: vi.fn(), onHighlight: vi.fn(), onLocate: vi.fn(), onClearCluster: vi.fn() }
  beforeEach(() => {
    vi.clearAllMocks()
    source = document.createElement("button"); document.body.append(source); source.focus()
    completions = []
    animate = vi.fn(() => {
      let resolve!: () => void
      const finished = new Promise<void>(complete => { resolve = complete })
      completions.push(resolve)
      return { finished, cancel: vi.fn(), playState: "running" }
    })
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
  })
  afterEach(() => { source.remove(); delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate; vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it("retains its group through reverse motion and restores focus after completion", async () => {
    const { rerender } = render(<PromptUsageTimelineReaderOverlay {...props} source={source} />)
    await act(async () => completions[0]())
    expect(screen.getByRole("button", { name: "Back To Timeline" })).toHaveFocus()
    rerender(<PromptUsageTimelineReaderOverlay {...props} source={source} clusterItems={null} />)
    expect(screen.getByTestId("timeline-reader-overlay")).toHaveAttribute("data-state", "closing")
    expect(screen.getByText("Selected Prompt")).toBeInTheDocument()
    await act(async () => completions[2]())
    expect(screen.queryByTestId("timeline-reader-overlay")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })
  it("keeps group reading open while interacting with its portaled cost explanation", () => {
    render(<PromptUsageTimelineReaderOverlay {...props} source={source} onCloseItem={vi.fn()} />)
    const portal = document.createElement("div")
    portal.dataset.costExplanation = ""
    const button = document.createElement("button"); portal.append(button); document.body.append(portal)
    fireEvent.click(button)
    expect(props.onClearCluster).not.toHaveBeenCalled()
    portal.remove()
  })
  it("ignores a stale close completion when another group opens", async () => {
    const { rerender } = render(<PromptUsageTimelineReaderOverlay {...props} source={source} />)
    rerender(<PromptUsageTimelineReaderOverlay {...props} source={source} clusterItems={null} />)
    const next = { ...item, turn: { ...turn, id: "next", prompt: "Next Group" } }
    rerender(<PromptUsageTimelineReaderOverlay {...props} source={source} clusterItems={[next]} />)
    await act(async () => completions[2]())
    expect(screen.getByText("Next Group")).toBeInTheDocument()
  })
  it("keeps the same reader DOM and does not replay entrance while covered or refreshed", () => {
    const { rerender } = render(<PromptUsageTimelineReaderOverlay {...props} source={source} />)
    const shell = screen.getByTestId("timeline-reader-overlay")
    rerender(<PromptUsageTimelineReaderOverlay {...props} source={source} covered clusterItems={[{ ...item, turn: { ...turn, isActive: true } }]} />)
    expect(screen.getByTestId("timeline-reader-overlay")).toBe(shell)
    expect(shell).toHaveAttribute("inert")
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.click(document.body)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(props.onClearCluster).not.toHaveBeenCalled()
  })
  it("only dismisses the topmost layer on outside click or Escape", () => {
    render(<div><PromptUsageTimelineReaderOverlay {...props} source={source} /><div data-testid="prompt-usage-detail-inspector-region" /></div>)
    fireEvent.click(document.body); fireEvent.keyDown(document, { key: "Escape" })
    expect(props.onClearCluster).not.toHaveBeenCalled()
    screen.getByTestId("prompt-usage-detail-inspector-region").remove()
    fireEvent.click(document.body)
    expect(props.onClearCluster).toHaveBeenCalledOnce()
  })
  it("keeps forward and reverse motion with system reduced motion and restores focus after completion", async () => {
    const { rerender } = render(<PromptUsageTimelineReaderOverlay {...props} source={source} />)
    expect(animate).toHaveBeenCalledTimes(2)
    await act(async () => completions[0]())
    expect(screen.getByRole("button", { name: "Back To Timeline" })).toHaveFocus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(props.onClearCluster).toHaveBeenCalledOnce()
    rerender(<PromptUsageTimelineReaderOverlay {...props} source={source} clusterItems={null} />)
    expect(animate).toHaveBeenCalledTimes(4)
    expect(screen.getByTestId("timeline-reader-overlay")).toHaveAttribute("data-state", "closing")
    await act(async () => completions[2]())
    expect(screen.queryByTestId("timeline-reader-overlay")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("cancels active animations on unmount and ignores later completion", async () => {
    const { unmount } = render(<PromptUsageTimelineReaderOverlay {...props} source={source} />)
    const active = animate.mock.results.map(result => result.value)
    unmount()
    active.forEach(animation => expect(animation.cancel).toHaveBeenCalledOnce())
    await act(async () => completions[0]())
    expect(source).toHaveFocus()
    active.forEach(animation => expect(animation.cancel).toHaveBeenCalledOnce())
  })
  it("lets a floating guide control activate without clearing the reader, while the dim layer still dismisses", () => {
    const finishGuide = vi.fn()
    function Harness() {
      const [clusterItems, setClusterItems] = useState<TimelineItem[] | null>([item])
      return <>
        <PromptUsageTimelineReaderOverlay {...props} source={source} clusterItems={clusterItems} onClearCluster={() => { props.onClearCluster(); setClusterItems(null) }} />
        <div className="contextual-guide-layer" data-testid="guide-dim">
          <aside className="contextual-guide-dock"><button onClick={finishGuide}><span>Finish Guide</span></button></aside>
        </div>
      </>
    }
    render(<Harness />)
    fireEvent.click(screen.getByText("Finish Guide"))
    expect(finishGuide).toHaveBeenCalledOnce()
    expect(props.onClearCluster).not.toHaveBeenCalled()
    expect(screen.getByTestId("timeline-reader-overlay")).toHaveAttribute("data-state", "open")
    expect(screen.getByText("Selected Prompt")).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("guide-dim"))
    expect(props.onClearCluster).toHaveBeenCalledOnce()
    expect(screen.getByTestId("timeline-reader-overlay")).toHaveAttribute("data-state", "closing")
  })
})
