import { fireEvent, render, screen, within } from "@testing-library/react"
import { createRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PromptInspector } from "./prompt-usage-inspector"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const tokens = { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 }
const turn: PromptUsageTurn = {
  id: "prompt", prompt: "Read the current implementation", startedAt: "2026-10-14T10:00:00Z", completedAt: "2026-10-14T10:02:18Z", timeLabel: "10:00",
  tokens, costUsd: null, estimationStatus: "unknown", quotaObservation: null,
  agents: [{ id: "main", kind: "main", name: "Main Agent", role: null, tokens, models: [], costUsd: null, estimationStatus: "unknown" },
    { id: "child", kind: "subagent", name: "Luna", role: "explorer", tokens, models: [], costUsd: null, estimationStatus: "unknown" }],
}
const session: PromptUsageSession = { id: "session", title: "Current Session", updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0,
  turns: [turn], costUsd: null, estimationStatus: "unknown" }
const inspector = (values: Partial<PromptUsageTurn>) => <PromptInspector session={session} turn={{ ...turn, ...values }} copyState={null}
  onCopy={vi.fn()} onNavigateToSession={vi.fn()} onClose={vi.fn()} headingRef={createRef<HTMLHeadingElement>()} />
beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

describe("Prompt time and execution context", () => {
  it("keeps the selected Prompt open when Escape belongs to a help dialog", () => {
    const onClose = vi.fn()
    render(<><div className="prompt-help-frame" /><PromptInspector session={session} turn={turn} copyState={null}
      onCopy={vi.fn()} onNavigateToSession={vi.fn()} onClose={onClose} headingRef={createRef<HTMLHeadingElement>()} /></>)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).not.toHaveBeenCalled()
  })
  it.each([
    [{ interrupted: true, completedAt: null }, "Interrupted"],
    [{ isActive: true, completedAt: null }, "Running"],
    [{ retriedFromStartedAt: "2026-10-14T09:59:00Z" }, "Retried After Interruption"],
  ] as const)("keeps %s in the first time strip rather than among agent counts", (values, status) => {
    render(inspector(values))
    const metadata = screen.getByTestId("prompt-usage-inspector-metadata")
    expect(within(metadata).getByTestId("prompt-usage-start-time")).toHaveTextContent("Start Time")
    expect(within(metadata).getByTestId("prompt-usage-start-time")).toHaveClass("flex-col")
    expect(within(metadata).getByTestId("prompt-execution-time")).toBeVisible()
    expect(within(metadata).getByTestId("prompt-execution-time")).toHaveClass("flex-col")
    expect(within(metadata).getByText(status)).toBeVisible()
    const copy = within(metadata).getByRole("button", { name: "Copy Prompt" })
    expect(copy.parentElement).toHaveClass("ml-auto", "shrink-0", "items-end")
    expect(within(metadata).getByText(status).compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(metadata).not.toHaveTextContent("Main Agent")
    expect(metadata).not.toHaveTextContent("Subagent")
    const usage = screen.getByTestId("prompt-usage-inspector-agents")
    expect(usage).toHaveTextContent("Usage Details")
    expect(usage).toHaveTextContent("1 Main Agent")
    expect(usage).toHaveTextContent("1 Subagent")
    expect(within(metadata).getByRole("button", { name: "Copy Prompt" })).toHaveClass("items-end")
    expect(within(screen.getByTestId("prompt-usage-inspector-prompt-block")).getByRole("button", { name: "Copy Prompt" })).toBeVisible()
    expect(screen.getByTestId("prompt-usage-details-column")).toHaveClass("omp-scrollbar")
  })
  it.each(["responsive", "overlay", "preview"] as const)("keeps Copy at the far right of the value baseline in %s layout", layout => {
    render(<PromptInspector session={session} turn={turn} copyState={null} layout={layout}
      onCopy={vi.fn()} onNavigateToSession={vi.fn()} onClose={vi.fn()} headingRef={createRef<HTMLHeadingElement>()} />)
    const metadata = screen.getByTestId("prompt-usage-inspector-metadata")
    expect(metadata).toHaveClass("items-end")
    expect(within(metadata).getByRole("button", { name: "Copy Prompt" }).parentElement).toHaveClass("ml-auto", "items-end")
  })
})
