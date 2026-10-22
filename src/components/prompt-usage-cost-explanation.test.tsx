import userEvent from "@testing-library/user-event"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiEquivalentCell } from "./prompt-usage-cost-explanation"
import { PromptUsageTimelineInspector } from "./prompt-usage-timeline-inspector"
import type { PromptUsageCostEstimate, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@/hooks/use-exchange-rates", () => ({
  useExchangeRates: () => ({ status: "ready", rates: [
    { code: "USD", rate: 1, status: "base", date: null, source: "USD Base" },
    { code: "EUR", rate: 2, status: "current", date: "2026-09-08", source: "Fixture" },
    { code: "TWD", rate: 32, status: "current", date: "2026-09-08", source: "Fixture" },
  ] }),
}))

const title = "How Is The API Estimate Calculated?"
const complete: PromptUsageCostEstimate = {
  costUsd: 12.5, estimationStatus: "current_rate",
  costBreakdown: { inputUsd: 1.25, cacheReadUsd: 2.5, cacheWriteUsd: 0, outputUsd: 8.75 },
}
const popup = () => document.querySelector<HTMLElement>("[data-cost-explanation]")!
const rowAmount = (label: string) => within(popup()).getByText(label).closest("dt")!.nextElementSibling
async function openExplanation() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: title }))
  await waitFor(() => expect(popup()).toBeVisible())
  return user
}

beforeEach(() => useAppPreferencesStore.setState({ language: "en", displayCurrency: "USD" }))

describe("API estimate explanation", () => {
  it("opens only on click and shows plain-language cache and allowance explanations", async () => {
    render(<ApiEquivalentCell estimate={complete} testId="estimate" />)
    expect(popup()).toBeNull()
    fireEvent.pointerEnter(screen.getByRole("button", { name: title }))
    expect(popup()).toBeNull()
    await openExplanation()
    expect(popup()).toHaveTextContent("Tokens ÷ 1,000,000 × Price Per Million Tokens")
    expect(popup()).toHaveTextContent("Total input minus cache reads and cache writes.")
    expect(popup()).toHaveTextContent("Includes reasoning tokens; they are not charged again.")
    expect(popup()).toHaveTextContent("Calculate each category at its model’s rate, then add the amounts across models.")
    expect(popup()).toHaveTextContent("not an actual bill or a percentage of your allowance")
    expect(rowAmount("Regular Input")).toHaveTextContent("$1.25")
    expect(rowAmount("Cache Reads")).toHaveTextContent("$2.5")
    expect(rowAmount("Output")).toHaveTextContent("$8.75")
    expect(popup().querySelector(".cost-explanation-total strong")).toHaveTextContent("$12.5")
    expect(within(popup()).queryByText("Cache Writes")).not.toBeInTheDocument()
  })

  it("uses the provided fee components and total without reconstructing them", async () => {
    render(<ApiEquivalentCell estimate={{ ...complete, costUsd: 100, costBreakdown: { ...complete.costBreakdown!, cacheWriteUsd: .75 } }} testId="estimate" />)
    await openExplanation()
    expect(rowAmount("Regular Input")).toHaveTextContent("$1.25")
    expect(rowAmount("Cache Writes")).toHaveTextContent("$0.75")
    expect(popup().querySelector(".cost-explanation-total strong")).toHaveTextContent("$100")
  })

  it("marks partial estimates clearly while retaining their available fee components", async () => {
    render(<ApiEquivalentCell estimate={{ ...complete, estimationStatus: "partial_rate" }} testId="estimate" />)
    await openExplanation()
    expect(popup()).toHaveTextContent("Some costs cannot be estimated.")
    expect(rowAmount("Regular Input")).toHaveTextContent("$1.25")
  })

  it.each([null, undefined])("does not invent a fee breakdown when components are %s", async costBreakdown => {
    render(<ApiEquivalentCell estimate={{ costUsd: 12.5, estimationStatus: "current_rate", costBreakdown }} testId="estimate" />)
    await openExplanation()
    expect(screen.getByTestId("estimate")).toHaveTextContent("$12.5")
    expect(popup()).toHaveTextContent("Some costs cannot be estimated.")
    expect(popup().querySelector("dl")).toBeNull()
  })

  it("shows unavailable rather than zero when there is no estimate", async () => {
    render(<ApiEquivalentCell estimate={{ costUsd: null, estimationStatus: "unavailable", costBreakdown: null }} testId="estimate" />)
    await openExplanation()
    expect(screen.getByTestId("estimate")).toHaveTextContent("—")
    expect(popup()).toHaveTextContent("Some costs cannot be estimated.")
    expect(popup()).not.toHaveTextContent("$0")
  })

  it("converts component amounts using the same display currency as the estimate", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "EUR" })
    render(<ApiEquivalentCell estimate={complete} testId="estimate" />)
    await openExplanation()
    expect(rowAmount("Regular Input")).toHaveTextContent("€2.5")
    expect(rowAmount("Cache Reads")).toHaveTextContent("€5")
    expect(rowAmount("Output")).toHaveTextContent("€17.5")
    expect(popup().querySelector(".cost-explanation-total strong")).toHaveTextContent("€25")
    expect(popup().querySelector(".cost-explanation-total strong")).not.toHaveTextContent("EUR")
    expect(popup().querySelector(".cost-explanation-currency")).toHaveTextContent(/^EUR$/)
  })

  it("keeps inline amounts compact while exposing the complete currency in its accessible label and title", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "TWD" })
    render(<ApiEquivalentCell estimate={complete} testId="inline-estimate" inline />)
    const trigger = screen.getByTestId("inline-estimate")
    expect(trigger).toHaveTextContent(/^\(NT\$400\)$/)
    expect(trigger).toHaveAccessibleName(expect.stringContaining("NT$400 TWD"))
    expect(trigger).toHaveAttribute("title", expect.stringContaining("NT$400 TWD"))
    await userEvent.click(trigger)
    await waitFor(() => expect(popup()).toBeVisible())
    expect(popup().querySelector(".cost-explanation-total strong")).toHaveTextContent(/^NT\$400$/)
    expect(popup().querySelector(".cost-explanation-currency")).toHaveTextContent(/^TWD$/)
  })

  it("does not label unavailable exchange amounts as the selected currency", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "GBP" })
    render(<ApiEquivalentCell estimate={complete} testId="unavailable" inline />)
    const trigger = screen.getByTestId("unavailable")
    expect(trigger).toHaveTextContent("(Exchange Rate Unavailable)")
    await userEvent.click(trigger)
    await waitFor(() => expect(popup()).toBeVisible())
    expect(popup().querySelector(".cost-explanation-total strong")).toHaveTextContent("Exchange Rate Unavailable")
    expect(popup().querySelector(".cost-explanation-currency")).toBeNull()
  })

  it("keeps the Timeline Inspector open for portal interaction and the first Escape", async () => {
    const turn: PromptUsageTurn = {
      ...complete, id: "prompt", prompt: "Selected Prompt", timeLabel: "09:00", startedAt: "2026-09-08T09:00:00+08:00",
      tokens: { totalTokens: 1000, inputTokens: 900, cachedInputTokens: 800, outputTokens: 100, reasoningOutputTokens: 0 },
      agents: [], quotaObservation: null,
    }
    const session: PromptUsageSession = { ...complete, id: "session", title: "Selected Session", updatedAt: turn.startedAt, promptCount: 1, isActive: false, codexOrder: 0, turns: [turn] }
    const onClose = vi.fn()
    render(<PromptUsageTimelineInspector item={{ session, turn }} source={null} copyState={null} onCopy={vi.fn()} onNavigateToSession={vi.fn()} onClose={onClose} />)
    const user = await openExplanation()
    const region = screen.getByTestId("prompt-usage-detail-inspector-region")
    expect(region).not.toContainElement(popup())
    await user.click(within(popup()).getByText("Regular Input"))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(popup()).getByRole("button", { name: "Close Prompt Details" }))
    await waitFor(() => expect(popup()).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: title }))
    await waitFor(() => expect(popup()).toBeVisible())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(popup()).toBeNull())
    expect(onClose).not.toHaveBeenCalled()
    expect(region).toHaveAttribute("data-state", "open")
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledOnce()
  })
})
