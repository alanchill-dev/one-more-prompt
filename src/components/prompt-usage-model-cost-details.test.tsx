import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiEquivalentCell } from "./prompt-usage-cost-explanation"
import { TokenLedger } from "./prompt-usage-token-ledger"
import { PromptUsageSummary } from "./prompt-usage-summary"
import { parseCostLines, type PromptUsageCostLine } from "@/lib/prompt-usage-cost"
import type { PromptUsageCostEstimate, PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@/hooks/use-exchange-rates", () => ({ useExchangeRates: () => ({ status: "ready", rates: [
  { code: "USD", rate: 1, status: "base", date: null, source: "USD Base" },
  { code: "EUR", rate: 2, status: "current", date: "2026-10-16", source: "Fixture" },
  { code: "TWD", rate: 32, status: "current", date: "2026-10-16", source: "Fixture" },
] }) }))

const longModel = "gpt-model-with-a-long-explicit-snapshot-and-reasoning-profile-2026-10-16"
const lines: PromptUsageCostLine[] = [
  {
    model: longModel, tokens: { input: 1_000_000, cacheRead: 2_000_000, cacheWrite: 500_000, output: 250_000 },
    rates: { input: 2, cacheRead: .2, cacheWrite: 4, output: 8 },
    fees: { inputUsd: 2, cacheReadUsd: .4, cacheWriteUsd: 2, outputUsd: 2 },
    costUsd: 6.4, estimationStatus: "current_rate", observedAt: "2026-10-16T08:00:00Z", issues: [],
  },
  {
    model: "gpt-second-model", tokens: { input: 500_000, cacheRead: 0, cacheWrite: 0, output: 100_000 },
    rates: { input: 3, cacheRead: .3, cacheWrite: 6, output: 12 },
    fees: { inputUsd: 1.5, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 1.2 },
    costUsd: 2.7, estimationStatus: "historical_rate", observedAt: "2026-10-15T08:00:00Z", issues: [],
  },
]
const estimate: PromptUsageCostEstimate = {
  costUsd: 9.1, estimationStatus: "current_rate", costLines: lines,
  costBreakdown: { inputUsd: 3.5, cacheReadUsd: .4, cacheWriteUsd: 2, outputUsd: 3.2 },
}
const turn: PromptUsageTurn = {
  ...estimate, id: "prompt", prompt: "A real arithmetic fixture", timeLabel: "08:00", startedAt: "2026-10-16T08:00:00Z",
  tokens: { totalTokens: 4_350_000, inputTokens: 4_000_000, cachedInputTokens: 2_000_000,
    cacheWriteInputTokens: 500_000, cacheWriteInputTokensComplete: true, outputTokens: 350_000, reasoningOutputTokens: 200_000 },
  agents: [], quotaObservation: null,
}
const popup = () => document.querySelector<HTMLElement>("[data-cost-explanation]")
async function open(trigger: HTMLElement) {
  const user = userEvent.setup()
  await user.click(trigger)
  await waitFor(() => expect(popup()).toBeVisible())
  return user
}
function model(name: string) {
  return within(popup()!).getByRole("heading", { name: new RegExp(name) }).closest("section")!
}
function category(section: HTMLElement, name: string) {
  const row = within(section).getByText(name, { selector: "dt > span" }).closest(".cost-model-category")!
  return { operands: row.querySelector(".cost-model-operands"), subtotal: row.querySelector("dd") }
}

beforeEach(() => useAppPreferencesStore.setState({ language: "en", displayCurrency: "USD" }))

describe("Public API estimate model calculations", () => {
  it("rounds every displayed price and amount to at most two places without rounding the underlying ledger", async () => {
    const line: PromptUsageCostLine = {
      ...lines[0], model: "rounding-model",
      tokens: { input: 11_928_012, cacheRead: 355_706_880, cacheWrite: 0, output: 1_038_624 },
      rates: { input: 2, cacheRead: .1, cacheWrite: null, output: 10 },
      fees: { inputUsd: 23.856024, cacheReadUsd: 35.570688, cacheWriteUsd: 0, outputUsd: 10.38624 },
      costUsd: 69.812952,
    }
    const fractional: PromptUsageCostLine = {
      ...lines[0], model: "fractional-price", tokens: { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 },
      rates: { input: 2.345678, cacheRead: null, cacheWrite: null, output: null },
      fees: { inputUsd: 2.345678, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }, costUsd: 2.345678,
    }
    const cost = { costUsd: line.costUsd! + fractional.costUsd!, estimationStatus: "current_rate" as const, costLines: [line, fractional] }
    expect(parseCostLines(cost.costLines, cost.costUsd)).not.toBeNull()
    render(<ApiEquivalentCell estimate={cost} testId="rounded" inline />)
    expect(screen.getByTestId("rounded")).toHaveTextContent("($72.16)")
    await open(screen.getByTestId("rounded"))
    expect(category(model("rounding-model"), "Regular Input").subtotal).toHaveTextContent("= $23.86")
    expect(category(model("rounding-model"), "Cache Reads").subtotal).toHaveTextContent("= $35.57")
    expect(category(model("rounding-model"), "Output").subtotal).toHaveTextContent("= $10.39")
    expect(within(model("rounding-model")).getByRole("heading")).toHaveTextContent("$69.81")
    expect(category(model("fractional-price"), "Regular Input").operands).toHaveTextContent("× $2.35")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent("$72.16")
    expect(popup()).not.toHaveTextContent(/\d\.\d{3}/)
    expect(line.costUsd).toBe(69.812952)
    expect(fractional.rates.input).toBe(2.345678)
  })

  it.each([true, false])("shows verifiable categories, rates and model sums through inline=%s", async inline => {
    // The fixture must satisfy the same ledger contract as plugin metadata.
    expect(parseCostLines(lines, 9.1)).not.toBeNull()
    render(<ApiEquivalentCell estimate={estimate} testId="model-estimate" inline={inline} />)
    await open(inline ? screen.getByTestId("model-estimate") : screen.getByRole("button", { name: "How Is The API Estimate Calculated?" }))
    const first = model(longModel)
    expect(category(first, "Regular Input").operands).toHaveTextContent("1,000,000 ÷ 1,000,000 × $2")
    expect(category(first, "Regular Input").subtotal).toHaveTextContent(/^= \$2$/)
    expect(category(first, "Cache Reads").operands).toHaveTextContent("2,000,000 ÷ 1,000,000 × $0.2")
    expect(category(first, "Cache Reads").subtotal).toHaveTextContent(/^= \$0.4$/)
    expect(category(first, "Cache Writes").operands).toHaveTextContent("500,000 ÷ 1,000,000 × $4")
    expect(category(first, "Cache Writes").subtotal).toHaveTextContent(/^= \$2$/)
    expect(category(first, "Output").operands).toHaveTextContent("250,000 ÷ 1,000,000 × $8")
    expect(category(first, "Output").subtotal).toHaveTextContent(/^= \$2$/)
    expect(within(first).getByRole("heading")).toHaveTextContent(`${longModel}$6.4`)
    const second = model("gpt-second-model")
    expect(category(second, "Regular Input").operands).toHaveTextContent("500,000 ÷ 1,000,000 × $3")
    expect(category(second, "Output").operands).toHaveTextContent("100,000 ÷ 1,000,000 × $12")
    expect(within(second).getByRole("heading")).toHaveTextContent("$2.7")
    expect(popup()!.querySelector(".cost-model-sum")).toHaveTextContent("Sum Of Model Subtotals$9.1 USD")
    expect(popup()!.querySelectorAll(".cost-model-calculation")).toHaveLength(2)
    expect(popup()!.querySelector(".cost-explanation-total strong")).toHaveTextContent("$9.1")
    // The long model identity remains actual, accessible text rather than a shortened label.
    expect(within(first).getByRole("heading")).toHaveAccessibleName(new RegExp(longModel))
  })

  it("uses the same calculations in the real Token ledger without charging reasoning a second time", async () => {
    render(<TokenLedger turn={turn} />)
    expect(screen.getByTestId("prompt-usage-token-cost")).toHaveTextContent("$9.1")
    await open(screen.getByRole("button", { name: "How Is The API Estimate Calculated?" }))
    expect(popup()!.querySelectorAll(".cost-model-category")).toHaveLength(6)
    expect(Array.from(popup()!.querySelectorAll("dt > span")).map(node => node.textContent))
      .toEqual(["Regular Input", "Cache Reads", "Cache Writes", "Output", "Regular Input", "Output"])
    expect(category(model(longModel), "Output").operands).toHaveTextContent("250,000 ÷ 1,000,000 × $8")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^\$9.1$/)
  })

  it("retains priced amounts and explains unpriced models or cache writes rather than inventing prices", async () => {
    const unpriced: PromptUsageCostLine = {
      model: "unpriced-model", tokens: { input: 800_000, cacheRead: 0, cacheWrite: 0, output: 100_000 },
      rates: { input: null, cacheRead: null, cacheWrite: null, output: null },
      fees: { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 },
      costUsd: null, estimationStatus: "unknown", observedAt: null, issues: ["missing_price"],
    }
    const missingWrite: PromptUsageCostLine = { ...lines[0],
      rates: { ...lines[0].rates, cacheWrite: null }, fees: { ...lines[0].fees, cacheWriteUsd: 0 },
      costUsd: 4.4, estimationStatus: "partial_rate", issues: ["missing_cache_write_price"],
    }
    const partial = { ...estimate, costUsd: 4.4, estimationStatus: "partial_rate" as const, costLines: [missingWrite, unpriced],
      costBreakdown: { inputUsd: 2, cacheReadUsd: .4, cacheWriteUsd: 0, outputUsd: 2 } }
    expect(parseCostLines(partial.costLines, partial.costUsd)).not.toBeNull()
    render(<ApiEquivalentCell estimate={partial} testId="partial-estimate" inline />)
    await open(screen.getByTestId("partial-estimate"))
    expect(model("unpriced-model")).toHaveTextContent("No model price is available; this usage is not included.")
    expect(category(model("unpriced-model"), "Regular Input").operands).toHaveTextContent("800,000 ÷ 1,000,000 × —")
    expect(category(model("unpriced-model"), "Regular Input").subtotal).toHaveTextContent("Not Included")
    expect(model("unpriced-model")).not.toHaveTextContent("$0")
    expect(category(model(longModel), "Cache Writes").operands).toHaveTextContent("500,000 ÷ 1,000,000 × —")
    expect(category(model(longModel), "Cache Writes").subtotal).toHaveTextContent("Not Included")
    expect(model(longModel)).toHaveTextContent("Cache write pricing is unavailable; that portion is not included.")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^\$4.4$/)
    expect(popup()).toHaveTextContent("Some costs cannot be estimated.")
  })

  it("retains and explains missing cache-read prices through the ledger boundary", async () => {
    const missingRead: PromptUsageCostLine = { ...lines[0],
      rates: { ...lines[0].rates, cacheRead: null }, fees: { ...lines[0].fees, cacheReadUsd: 0 },
      costUsd: 6, estimationStatus: "partial_rate", issues: ["missing_cache_read_price"],
    }
    const partial = { ...estimate, costUsd: 6, estimationStatus: "partial_rate" as const,
      costLines: [missingRead], costBreakdown: { inputUsd: 2, cacheReadUsd: 0, cacheWriteUsd: 2, outputUsd: 2 } }
    expect(parseCostLines(partial.costLines, partial.costUsd)).toEqual([missingRead])
    render(<ApiEquivalentCell estimate={partial} testId="missing-read-estimate" inline />)
    await open(screen.getByTestId("missing-read-estimate"))
    expect(category(model(longModel), "Cache Reads").operands).toHaveTextContent("2,000,000 ÷ 1,000,000 × —")
    expect(category(model(longModel), "Cache Reads").subtotal).toHaveTextContent("Not Included")
    expect(model(longModel)).toHaveTextContent("Cache read pricing is unavailable; that portion is not included.")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^\$6$/)
  })

  it("converts the header, model prices, fees and total to the same selected currency", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "EUR" })
    render(<ApiEquivalentCell estimate={estimate} testId="eur-estimate" inline />)
    expect(screen.getByTestId("eur-estimate")).toHaveTextContent("(€18.2)")
    await open(screen.getByTestId("eur-estimate"))
    expect(popup()!.querySelector(".cost-explanation-total strong")).toHaveTextContent("€18.2")
    expect(category(model(longModel), "Regular Input").operands).toHaveTextContent("× €4")
    expect(category(model(longModel), "Regular Input").subtotal).toHaveTextContent(/^= €4$/)
    expect(within(model(longModel)).getByRole("heading")).toHaveTextContent("€12.8")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^€18.2$/)
    expect(popup()!.querySelector(".cost-model-sum .cost-explanation-currency")).toHaveTextContent(/^EUR$/)
    expect(popup()).toHaveTextContent("Unit prices: EUR per million Tokens")
    expect(popup()!.querySelector(".cost-model-details")).not.toHaveTextContent("USD")
  })

  it("uses explicit TWD symbols and codes in Project and Session summaries and their model details", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "TWD" })
    const original = JSON.stringify(estimate)
    const session: PromptUsageSession = { ...estimate, id: "session", title: "Session", updatedAt: turn.startedAt,
      promptCount: 1, isActive: false, codexOrder: 0, turns: [turn] }
    const project: PromptUsageProject = { id: "project", kind: "project", name: "Project", updatedAt: turn.startedAt,
      promptCount: 1, sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
    render(<PromptUsageSummary project={project} session={session} />)
    expect(screen.getByTestId("prompt-usage-project-cost")).toHaveTextContent("(NT$291.2)")
    expect(screen.getByTestId("prompt-usage-session-cost")).toHaveTextContent("(NT$291.2)")
    await open(screen.getByTestId("prompt-usage-session-cost"))
    expect(category(model(longModel), "Regular Input").operands).toHaveTextContent("× NT$64")
    expect(category(model(longModel), "Cache Reads").operands).toHaveTextContent("× NT$6.4")
    expect(category(model(longModel), "Cache Reads").subtotal).toHaveTextContent("= NT$12.8")
    expect(within(model(longModel)).getByRole("heading")).toHaveTextContent("NT$204.8")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent("NT$291.2")
    expect(popup()!.querySelector(".cost-model-sum strong")).not.toHaveTextContent("TWD")
    expect(popup()!.querySelector(".cost-model-sum .cost-explanation-currency")).toHaveTextContent(/^TWD$/)
    expect(popup()).toHaveTextContent("Unit prices: TWD per million Tokens")
    expect(JSON.stringify(estimate)).toBe(original)
    act(() => useAppPreferencesStore.setState({ displayCurrency: "EUR" }))
    expect(screen.getByTestId("prompt-usage-project-cost")).toHaveTextContent("(€18.2)")
    expect(screen.getByTestId("prompt-usage-session-cost")).toHaveTextContent("(€18.2)")
    expect(category(model(longModel), "Regular Input").operands).toHaveTextContent("× €4")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent("€18.2")
  })

  it("retains unknown conversion amounts when the selected currency has no downloaded rate", async () => {
    useAppPreferencesStore.setState({ displayCurrency: "GBP" })
    render(<ApiEquivalentCell estimate={estimate} testId="missing-rate" inline />)
    expect(screen.getByTestId("missing-rate")).toHaveTextContent("Exchange Rate Unavailable")
    await open(screen.getByTestId("missing-rate"))
    expect(category(model(longModel), "Regular Input").operands).toHaveTextContent("1,000,000 ÷ 1,000,000 × Exchange Rate Unavailable")
    expect(category(model(longModel), "Regular Input").subtotal).toHaveTextContent("= Exchange Rate Unavailable")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent("Exchange Rate Unavailable")
    expect(popup()!.querySelector(".cost-model-sum .cost-explanation-currency")).toBeNull()
    expect(popup()!.querySelector(".cost-model-details")).not.toHaveTextContent("USD")
  })

  it("keeps the inline hover popup open when moving onto its readable calculations", async () => {
    const user = userEvent.setup()
    render(<ApiEquivalentCell estimate={estimate} testId="hover-estimate" inline />)
    expect(popup()).toBeNull()
    await user.hover(screen.getByTestId("hover-estimate"))
    await waitFor(() => expect(popup()).toBeVisible())
    await user.hover(popup()!)
    await act(() => new Promise(resolve => setTimeout(resolve, 220)))
    expect(popup()).toBeVisible()
    await user.click(within(popup()!).getByText("Model Calculations"))
    expect(popup()).toBeVisible()
  })

  it("opens the inline calculation with keyboard activation and dismisses with Escape", async () => {
    const user = userEvent.setup()
    render(<ApiEquivalentCell estimate={estimate} testId="keyboard-estimate" inline />)
    await user.tab()
    expect(screen.getByTestId("keyboard-estimate")).toHaveFocus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(popup()).toBeVisible())
    await user.keyboard("{Escape}")
    await waitFor(() => expect(popup()).toBeNull())
  })

  it("keeps missing model details honest without fabricating operands or a zero price", async () => {
    render(<ApiEquivalentCell estimate={{ costUsd: 9.1, estimationStatus: "current_rate", costLines: null, costBreakdown: null }} testId="missing-estimate" inline />)
    await open(screen.getByTestId("missing-estimate"))
    expect(popup()).toHaveTextContent("Model calculation details are not yet available for this record.")
    expect(popup()!.querySelector(".cost-model-calculation")).toBeNull()
    expect(popup()!.querySelector(".cost-model-operands")).toBeNull()
    expect(popup()!.querySelector(".cost-model-sum")).toBeNull()
    expect(popup()).not.toHaveTextContent("$0")
    expect(popup()!.querySelector(".cost-explanation-total strong")).toHaveTextContent("$9.1")
  })

  it("uses full Session cost lines and counts each Project Prompt once across duplicate descendants", async () => {
    const one: PromptUsageTurn = { ...turn, id: "one", costUsd: 6.4, costLines: [lines[0]], costBreakdown: lines[0].fees,
      tokens: { ...turn.tokens, totalTokens: 3_750_000, inputTokens: 3_500_000, outputTokens: 250_000, reasoningOutputTokens: 150_000 } }
    const two: PromptUsageTurn = { ...turn, id: "two", costUsd: 2.7, costLines: [lines[1]], costBreakdown: lines[1].fees,
      tokens: { ...turn.tokens, totalTokens: 600_000, inputTokens: 500_000, cachedInputTokens: 0,
        cacheWriteInputTokens: 0, outputTokens: 100_000, reasoningOutputTokens: 50_000 } }
    const session: PromptUsageSession = { ...estimate, id: "session", title: "Full conversation", updatedAt: turn.startedAt,
      promptCount: 2, isActive: false, codexOrder: 0, turns: [one, two] }
    const project: PromptUsageProject = { id: "project", kind: "project", name: "Full project", updatedAt: turn.startedAt,
      promptCount: 2, sessionCount: 2, isActive: false, codexOrder: 0,
      sessions: [session, { ...session, id: "child", turns: [one], costUsd: 6.4, costLines: [lines[0]] }] }
    render(<PromptUsageSummary project={project} session={{ ...session, turns: [one] }} />)
    const user = await open(screen.getByTestId("prompt-usage-session-cost"))
    expect(popup()!.querySelectorAll(".cost-model-calculation")).toHaveLength(2)
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^\$9.1$/)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(popup()).toBeNull())
    await user.click(screen.getByTestId("prompt-usage-project-cost"))
    await waitFor(() => expect(popup()).toBeVisible())
    expect(popup()!.querySelectorAll(".cost-model-calculation")).toHaveLength(2)
    expect(category(model(longModel), "Regular Input").operands).toHaveTextContent("1,000,000 ÷ 1,000,000 × $2")
    expect(popup()!.querySelector(".cost-model-sum strong")).toHaveTextContent(/^\$9.1$/)
  })
})
