import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PromptUsageTimelineInspector } from "@/components/prompt-usage-timeline-inspector"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"

vi.mock("@/components/prompt-usage-inspector", () => ({
  PromptInspector: ({ turn, headingRef, onClose, onCopy }: {
    turn: PromptUsageTurn; headingRef: React.RefObject<HTMLHeadingElement>; onClose: () => void; onCopy: () => void
  }) => <aside role="dialog"><h3 ref={headingRef} tabIndex={-1}>{turn.prompt}</h3><button onClick={onClose}>Close</button><button onClick={onCopy}>Copy</button></aside>,
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

describe("PromptUsageTimelineInspector", () => {
  let source: HTMLButtonElement
  let completions: (() => void)[]
  let animate: ReturnType<typeof vi.fn>
  const props = { copyState: null, onCopy: vi.fn(), onNavigateToSession: vi.fn(), onClose: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    source = document.createElement("button")
    source.textContent = "Event Source"
    document.body.append(source)
    source.focus()
    completions = []
    animate = vi.fn(() => {
      let complete!: () => void
      const finished = new Promise<void>((resolve) => { complete = resolve })
      completions.push(complete)
      return { finished, cancel: vi.fn(), playState: "running" }
    })
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate })
  })

  afterEach(() => {
    source.remove()
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("keeps the inspector mounted throughout closing and restores its source after the reverse completes", async () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    await act(async () => { completions[0]() })
    expect(screen.getByRole("heading")).toHaveFocus()

    rerender(<PromptUsageTimelineInspector {...props} source={null} item={null} />)
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "closing")
    expect(screen.getByText("Selected Prompt")).toBeInTheDocument()
    await act(async () => { completions[2]() })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("lets a covered reader become interactive before restoring its prompt source", async () => {
    let restoreFocus!: () => void
    const onExitComplete = vi.fn((restore: () => void) => { restoreFocus = restore })
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} onExitComplete={onExitComplete} />)
    await act(async () => { completions[0]() })
    source.setAttribute("inert", "")
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={null} onExitComplete={onExitComplete} />)
    await act(async () => { completions[2]() })
    expect(onExitComplete).toHaveBeenCalledOnce()
    expect(source).not.toHaveFocus()
    source.removeAttribute("inert")
    restoreFocus()
    expect(source).toHaveFocus()
  })

  it("does not let an interrupted exit remove a newly selected prompt or steal focus from another event", async () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={null} />)
    const next = { session, turn: { ...turn, id: "next", prompt: "Next Prompt" } }
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={next} />)
    await act(async () => { completions[2]() })
    expect(screen.getByText("Next Prompt")).toBeInTheDocument()

    const otherEvent = document.createElement("button")
    document.body.append(otherEvent)
    otherEvent.focus()
    await act(async () => { completions[4]() })
    expect(otherEvent).toHaveFocus()
    otherEvent.remove()
  })

  it("keeps full inspector entrance and exit with system reduced motion, restoring focus after motion", async () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 440 })
    expect(source).toHaveFocus()
    await act(async () => { completions[0]() })
    expect(screen.getByRole("heading")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(props.onClose).toHaveBeenCalled()
    rerender(<PromptUsageTimelineInspector {...props} source={null} item={null} />)
    expect(animate).toHaveBeenCalledTimes(4)
    expect(animate.mock.calls[2][1]).toMatchObject({ duration: 300 })
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "closing")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await act(async () => { completions[2]() })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("opens and closes immediately when Web Animations is unavailable", () => {
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: undefined })
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    expect(screen.getByRole("heading")).toHaveFocus()
    expect(animate).not.toHaveBeenCalled()
    rerender(<PromptUsageTimelineInspector {...props} source={null} item={null} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(source).toHaveFocus()
  })

  it("retains refreshed content and its footer on exit, returning to the most recently clicked representation", async () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    await act(async () => { completions[0]() })
    const latestSource = document.createElement("button")
    document.body.append(latestSource)
    latestSource.focus()
    const refreshed = { session, turn: { ...turn, prompt: "Updated Prompt" } }
    rerender(<PromptUsageTimelineInspector {...props} source={latestSource} item={refreshed} onOpenSession={vi.fn()} openSessionLabel="Open Session" />)
    expect(animate).toHaveBeenCalledTimes(2)
    screen.getByRole("heading").focus()
    rerender(<PromptUsageTimelineInspector {...props} source={null} item={null} />)
    expect(screen.getByText("Updated Prompt")).toBeInTheDocument()
    expect(screen.getByText("Open Session")).toBeInTheDocument()
    await act(async () => { completions[2]() })
    expect(latestSource).toHaveFocus()
    latestSource.remove()
  })

  it("continues shell opacity when reopening during an exit", () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={null} />)
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ transform: "matrix(1,0,0,1,10,0)", opacity: "0.35" } as CSSStyleDeclaration)
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    expect(animate.mock.calls[4][0][0]).toMatchObject({ opacity: "0.35", transform: "matrix(1,0,0,1,10,0)" })
  })

  it("does not move focus into the hidden timeline after navigation", async () => {
    const { rerender } = render(<div><PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} /></div>)
    rerender(<div hidden inert><PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} /></div>)
    await act(async () => { completions[0]() })
    expect(source).toHaveFocus()
    fireEvent.click(document.body)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it("preserves a new keyboard target reached while closing", async () => {
    const { rerender } = render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    await act(async () => { completions[0]() })
    rerender(<PromptUsageTimelineInspector {...props} source={source} item={null} />)
    const nextTarget = document.createElement("button")
    document.body.append(nextTarget)
    nextTarget.focus()
    await act(async () => { completions[2]() })
    expect(nextTarget).toHaveFocus()
    nextTarget.remove()
  })

  it("converts viewport displacement into local coordinates during the parent scale transition", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === source
        ? new DOMRect(100, 120, 20, 30)
        : new DOMRect(500, 100, 400, 300)
    })
    render(<PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} />)
    expect(animate.mock.calls[0][0][0]).toMatchObject({ transform: "translate(-800px, 40px) scale(0.05, 0.1)" })
  })

  it("ignores the opening and inside clicks, then reverses out after an outside click", async () => {
    const openSession = vi.fn()
    function Harness() {
      const [selected, setSelected] = useState<{ session: PromptUsageSession; turn: PromptUsageTurn } | null>(null)
      const [origin, setOrigin] = useState<HTMLButtonElement | null>(null)
      return <>
        <button onClick={(event) => { setOrigin(event.currentTarget); setSelected({ session, turn }) }}>Open Prompt</button>
        <div data-testid="outside">Timeline Background</div>
        <PromptUsageTimelineInspector {...props} item={selected} source={origin} onClose={() => { props.onClose(); setSelected(null) }} onOpenSession={openSession} openSessionLabel="Open In Project Browser" />
      </>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Open Prompt" }))
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "open")
    expect(props.onClose).not.toHaveBeenCalled()
    await act(async () => { completions[0]() })
    fireEvent.click(screen.getByRole("button", { name: "Copy" }))
    fireEvent.click(screen.getByRole("button", { name: "Open In Project Browser" }))
    fireEvent.click(screen.getByRole("heading"))
    expect(props.onCopy).toHaveBeenCalledOnce()
    expect(openSession).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId("outside"))
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "closing")
    expect(screen.getByText("Selected Prompt")).toBeInTheDocument()
    await act(async () => { completions[2]() })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("preserves the selected Prompt when opening, reading or closing help", () => {
    render(<><button className="timeline-help-trigger">Help</button>
      <div className="prompt-help-frame"><button>Close Help</button></div><div className="prompt-help-backdrop" data-testid="help-backdrop" />
      <PromptUsageTimelineInspector {...props} source={source} item={{ session, turn }} /></>)
    fireEvent.click(screen.getByRole("button", { name: "Help" }))
    fireEvent.click(screen.getByRole("button", { name: "Close Help" }))
    fireEvent.click(screen.getByTestId("help-backdrop"))
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "open")
  })

  it("allows an outside prompt click to retarget rather than closing the new selection", async () => {
    function Harness() {
      const [selected, setSelected] = useState<{ session: PromptUsageSession; turn: PromptUsageTurn } | null>(null)
      const [origin, setOrigin] = useState<HTMLButtonElement | null>(null)
      return <>
        {[turn, { ...turn, id: "next", prompt: "Next Prompt" }].map((entry) => <button key={entry.id} onClick={(event) => { setOrigin(event.currentTarget); setSelected({ session, turn: entry }) }}>Open {entry.id}</button>)}
        <PromptUsageTimelineInspector {...props} item={selected} source={origin} onClose={() => { props.onClose(); setSelected(null) }} />
      </>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Open turn" }))
    fireEvent.click(screen.getByRole("button", { name: "Open turn" }))
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Open next" }))
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "open")
    expect(screen.getByRole("heading")).toHaveTextContent("Next Prompt")
    await act(async () => { completions.forEach((complete) => complete()) })
    expect(screen.getByRole("heading")).toHaveTextContent("Next Prompt")
  })

  it("lets a floating guide finish without clearing the selected Prompt, while its dim layer remains outside", () => {
    const finishGuide = vi.fn()
    function Harness() {
      const [selected, setSelected] = useState<{ session: PromptUsageSession; turn: PromptUsageTurn } | null>({ session, turn })
      return <>
        <PromptUsageTimelineInspector {...props} item={selected} source={source} onClose={() => { props.onClose(); setSelected(null) }} />
        <div className="contextual-guide-layer" data-testid="guide-dim">
          <aside className="contextual-guide-dock"><button onClick={finishGuide}><span>Finish Guide</span></button></aside>
        </div>
      </>
    }
    render(<Harness />)
    fireEvent.click(screen.getByText("Finish Guide"))
    expect(finishGuide).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "open")
    expect(screen.getByRole("heading")).toHaveTextContent("Selected Prompt")

    fireEvent.click(screen.getByTestId("guide-dim"))
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(screen.getByTestId("prompt-usage-detail-inspector-region")).toHaveAttribute("data-state", "closing")
  })
})
