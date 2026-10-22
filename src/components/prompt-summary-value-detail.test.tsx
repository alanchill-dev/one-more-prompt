import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { PromptSummaryValueDetail } from "./prompt-summary-value-detail"
import { PromptInspector } from "./prompt-usage-inspector"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const detail = <PromptSummaryValueDetail label="Execution Time: 2 min. 1/2 Prompt" testId="coverage" content={<><strong data-testid="coverage">1/2 Prompt</strong><p>Missing time is excluded.</p></>}>
  <span>2 min</span>
</PromptSummaryValueDetail>
beforeEach(() => useAppPreferencesStore.setState({ language: "en" }))

it("reveals counts on hover and permits pointer travel into the readable detail", async () => {
  const user = userEvent.setup()
  render(detail)
  expect(screen.queryByTestId("coverage")).toBeNull()
  const trigger = screen.getByRole("button", { name: "Execution Time: 2 min. 1/2 Prompt" })
  await user.hover(trigger)
  expect(await screen.findByTestId("coverage")).toHaveTextContent("1/2 Prompt")
  const popup = screen.getByRole("tooltip")
  // jsdom has no physical gap geometry; preserve the real related-target transfer.
  fireEvent.mouseLeave(trigger, { relatedTarget: popup })
  fireEvent.mouseEnter(popup, { relatedTarget: trigger })
  expect(popup).toBeVisible()
  expect(popup).toHaveTextContent("Missing time is excluded.")
})

it("opens on keyboard focus, keeps the first click open, and closes on blur or outside press", async () => {
  const user = userEvent.setup()
  render(<>{detail}<button>Elsewhere</button></>)
  await user.tab()
  expect(await screen.findByTestId("coverage")).toBeVisible()
  const trigger = screen.getByTestId("coverage-trigger")
  await user.click(trigger)
  expect(screen.getByTestId("coverage")).toBeVisible()
  await user.click(trigger)
  expect(screen.getByTestId("coverage")).toBeVisible()
  await user.click(screen.getByRole("button", { name: "Elsewhere" }))
  await waitFor(() => expect(screen.queryByTestId("coverage")).toBeNull())
  await user.tab({ shift: true })
  expect(await screen.findByTestId("coverage")).toBeVisible()
  await user.tab()
  await waitFor(() => expect(screen.queryByTestId("coverage")).toBeNull())
})

it("opens from a touch press without requiring hover", async () => {
  const user = userEvent.setup()
  render(detail)
  await user.pointer([{ keys: "[TouchA>]", target: screen.getByTestId("coverage-trigger") }, { keys: "[/TouchA]" }])
  expect(await screen.findByTestId("coverage")).toHaveTextContent("1/2 Prompt")
})

it("consumes Escape before an already mounted Prompt Inspector can close", () => {
  const turn: PromptUsageTurn = { id: "prompt", prompt: "Read the implementation", startedAt: null, timeLabel: "10:00", agents: [],
    tokens: { totalTokens: 1, inputTokens: 1, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }, quotaObservation: null, costUsd: null, estimationStatus: "unknown" }
  const session: PromptUsageSession = { id: "session", title: "Selected Session", updatedAt: null, promptCount: 1, isActive: false, codexOrder: 0,
    turns: [turn], costUsd: null, estimationStatus: "unknown" }
  const onClose = vi.fn()
  render(<><PromptInspector session={session} turn={turn} copyState={null} onCopy={vi.fn()} onNavigateToSession={vi.fn()}
    onClose={onClose} headingRef={createRef<HTMLHeadingElement>()} />{detail}</>)
  fireEvent.click(screen.getByTestId("coverage-trigger"))
  expect(screen.getByTestId("coverage")).toBeVisible()
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  fireEvent(document, escape)
  expect(escape.defaultPrevented).toBe(true)
  expect(screen.queryByTestId("coverage")).toBeNull()
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: "Escape" })
  expect(onClose).toHaveBeenCalledOnce()
})
