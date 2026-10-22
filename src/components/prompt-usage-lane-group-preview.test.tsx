import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { PromptUsageLaneGroupPreview } from "./prompt-usage-lane-group-preview"

const start = new Date("2026-09-07T09:00:00").getTime()
function item(id: string, minute: number, sessionId = "a"): TimelineItem {
  const startedAt = start + minute * 60_000
  const turn = {
    id, prompt: `Request ${id}`, startedAt: new Date(startedAt).toISOString(), timeLabel: "09:00",
    agents: [], quotaObservation: null, costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = { id: sessionId, title: `Session ${sessionId}`, updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const, turns: [turn] }
  const project = { id: "project", kind: "project" as const, name: "Project", updatedAt: turn.startedAt, promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
  return { project, session, turn, startedAt, dateKey: "2026-09-07", model: null }
}

describe("PromptUsageLaneGroupPreview", () => {
  it("omits pagination for a single prompt", () => {
    render(<PromptUsageLaneGroupPreview items={[item("only", 1)]} onClose={vi.fn()} onOpenGroup={vi.fn()} />)
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Request only")
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Next Activity" })).not.toBeInTheDocument()
  })

  it("opens the directly selectable group from its concise interval summary", async () => {
    const user = userEvent.setup()
    const onOpenGroup = vi.fn()
    render(<PromptUsageLaneGroupPreview items={[item("one", 1), item("two", 2)]} summary={{ range: "2026/9/7 09:00 – 12:00", tokens: 200 }} onClose={vi.fn()} onOpenGroup={onOpenGroup} />)
    const summary = document.querySelector(".prompt-session-group-summary")!
    expect(summary).toHaveTextContent("2026/9/7 09:00 – 12:00")
    expect(summary).toHaveTextContent("2 Prompts")
    expect(summary).toHaveTextContent("200 Tokens")
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument()
    expect(screen.queryByTestId("prompt-usage-details-column")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open 2 Prompts" }))
    expect(onOpenGroup).toHaveBeenCalledOnce()
  })
  it("discloses a singleton overview bucket while retaining exact Prompt details", () => {
    render(<PromptUsageLaneGroupPreview items={[item("only", 1)]} summary={{ range: "09:00 – 12:00", tokens: 100 }} onClose={vi.fn()} onOpenGroup={vi.fn()} />)
    expect(document.querySelector(".prompt-session-group-summary")).toHaveTextContent("1 Prompts")
    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument()
  })

})
