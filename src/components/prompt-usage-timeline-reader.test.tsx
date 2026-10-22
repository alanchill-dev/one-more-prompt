import { fireEvent, render, screen, within } from "@testing-library/react"
import { createRef, useState } from "react"
import { PromptInspector } from "./prompt-usage-inspector"
import { describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { PromptUsageTimelineReader, type PromptUsageTimelineReaderProps } from "./prompt-usage-timeline-reader"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"

function item(id: string, dateKey: string, minute = 0): TimelineItem {
  const startedAt = new Date(`${dateKey}T09:00:00`).getTime() + minute * 60_000
  const turn = {
    id, prompt: `Request ${id}`, startedAt: new Date(startedAt).toISOString(), timeLabel: `09:${String(minute).padStart(2, "0")}`,
    agents: [], quotaObservation: null, costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = { id: "session", title: "Session", updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const, turns: [turn] }
  const project = { id: "project", kind: "project" as const, name: "Project", updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
  return { project, session, turn, startedAt, dateKey, model: null }
}
function props(): PromptUsageTimelineReaderProps {
  return { items: [item("one", "2026-09-07"), item("two", "2026-09-07", 10), item("three", "2026-09-08")], clusterItems: null, highlightedTurnId: null, focusedSessionId: null, markerColor: () => "#abc", onSelect: vi.fn(), onHighlight: vi.fn(), onLocate: vi.fn(), onClearCluster: vi.fn() }
}

describe("PromptUsageTimelineReader", () => {
  it("renders nothing until a group is selected", () => {
    render(<PromptUsageTimelineReader {...props()} />)
    expect(screen.getByTestId("timeline-reader")).toBeEmptyDOMElement()
    expect(screen.queryByTestId("prompt-reader-dates")).not.toBeInTheDocument()
  })

  it("returns to the timeline and updates records when a different group is selected", () => {
    const inputs = props()
    const { rerender } = render(<PromptUsageTimelineReader {...inputs} clusterItems={inputs.items.slice(0, 2)} />)
    expect(screen.getAllByRole("button", { name: /Open Prompt/ })).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Back To Timeline" }))
    expect(inputs.onClearCluster).toHaveBeenCalledOnce()
    rerender(<PromptUsageTimelineReader {...inputs} clusterItems={[inputs.items[2]]} />)
    expect(screen.getAllByRole("button", { name: /Open Prompt/ })).toHaveLength(1)
    expect(screen.getByTestId("prompt-reader-cluster-item-three")).toBeInTheDocument()
    expect(screen.queryByTestId("prompt-reader-cluster-item-one")).not.toBeInTheDocument()
  })

  it("locates a group record without opening its inspector and hovering only highlights", () => {
    const inputs = props()
    render(<PromptUsageTimelineReader {...inputs} clusterItems={inputs.items.slice(0, 2)} />)
    const record = screen.getByTestId("prompt-reader-cluster-item-one")
    fireEvent.pointerEnter(record)
    expect(inputs.onHighlight).toHaveBeenLastCalledWith("one")
    expect(inputs.onLocate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /Locate On Timeline:.*09:00.*Session/ }))
    expect(inputs.onLocate).toHaveBeenCalledWith(inputs.items[0])
    expect(inputs.onSelect).not.toHaveBeenCalled()
  })

  it("shows actual cluster range and opens each record from its own source button", () => {
    const inputs = props()
    render(<PromptUsageTimelineReader {...inputs} clusterItems={[inputs.items[1], inputs.items[0]]} />)
    const cluster = screen.getByTestId("prompt-reader-cluster")
    expect(cluster).toHaveTextContent("09:00:00")
    expect(cluster).toHaveTextContent("09:10:00")
    expect(cluster).toHaveTextContent("2 Prompts")
    const button = within(cluster).getByRole("button", { name: "Open Prompt: Request two" })
    fireEvent.click(button)
    expect(inputs.onSelect).toHaveBeenCalledWith(inputs.items[1], button)
    const scroller = screen.getByTestId("prompt-reader-cluster-scroll")
    scroller.scrollTop = 90
    expect(screen.getByTestId("prompt-reader-cluster-scroll").scrollTop).toBe(90)
  })
  it("distinguishes missing token evidence from a recorded zero", () => {
    const inputs = props()
    const request = inputs.items[0]
    request.turn = { ...request.turn, interrupted: true, tokenUsageRecorded: false, tokens: { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 } }
    const { rerender } = render(<PromptUsageTimelineReader {...inputs} clusterItems={[request]} />)
    const row = screen.getByTestId("prompt-reader-cluster-item-one")
    expect(row).toHaveTextContent("Interrupted")
    expect(row).toHaveTextContent("No Token Data")
    expect(row).not.toHaveTextContent("0 Token")
    request.turn = { ...request.turn, interrupted: false, tokenUsageRecorded: true }
    rerender(<PromptUsageTimelineReader {...inputs} clusterItems={[request]} />)
    expect(within(row).getByText("0", { exact: true })).toBeInTheDocument()
    expect(row).not.toHaveTextContent("No Token Data")
  })

  it("keeps unknown usage and cost distinct from zero in the shared inspector", () => {
    const request = props().items[0]
    request.turn = { ...request.turn, interrupted: true, tokenUsageRecorded: false }
    render(<PromptInspector session={request.session} turn={request.turn} headingRef={createRef()} copyState={null} onCopy={vi.fn()} onNavigateToSession={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByTestId("prompt-usage-inspector-metadata")).toHaveTextContent("Interrupted")
    expect(screen.getByTestId("prompt-usage-no-token-data")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-usage-token-metrics")).not.toHaveTextContent("100")
    expect(screen.queryByTestId("prompt-usage-token-cost")).not.toBeInTheDocument()
  })

  it("directly selects the twentieth Prompt without pagination and restores the mounted list after details", async () => {
    const user = userEvent.setup(), onCopy = vi.fn()
    const items = Array.from({ length: 20 }, (_, index) => item(`prompt-${index + 1}`, "2026-09-07", index))
    function IntegratedReader() {
      const [selectedItem, setSelected] = useState<TimelineItem | null>(null)
      return <PromptUsageTimelineReader {...props()} clusterItems={items} selectedItem={selectedItem} onSelect={setSelected} onCloseItem={() => setSelected(null)} onNavigateToSession={vi.fn()} onCopy={onCopy} />
    }
    render(<IntegratedReader />)
    const scroll = screen.getByTestId("prompt-reader-cluster-scroll")
    expect(document.querySelector(".prompt-reader-content")).toHaveAttribute("data-integrated", "true")
    expect(document.querySelector(".prompt-reader-placeholder")).toBeInTheDocument()
    scroll.scrollTop = 900
    const first = screen.getByTestId("prompt-reader-cluster-item-prompt-1")
    first.focus()
    await user.keyboard("{End}")
    const twentieth = screen.getByTestId("prompt-reader-cluster-item-prompt-20")
    expect(twentieth).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Request prompt-20")
    expect(twentieth).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(twentieth.getAttribute("aria-controls")!)).toContainElement(screen.getByTestId("prompt-usage-details-column"))
    expect(screen.getByTestId("prompt-reader-cluster-scroll")).toBe(scroll)
    expect(scroll.scrollTop).toBe(900)
    await user.click(screen.getByRole("button", { name: "Copy Prompt" }))
    expect(onCopy).toHaveBeenCalledOnce()
    await user.click(screen.getByRole("button", { name: "Close Prompt Details" }))
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    expect(scroll.scrollTop).toBe(900)
    expect(twentieth).toHaveFocus()
    expect(screen.queryByText("1 / 20")).not.toBeInTheDocument()
  })

})
