import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UsageTrendExplorer } from "@/components/usage-trend-explorer"
import { projectTrendPoints, trendTokenValue } from "@/components/usage-trend-metric"
import { makeHourlySlots, summarizeCost, type TimedBarChartPoint } from "@/components/usage-trend-utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@/hooks/use-exchange-rates", () => ({
  useExchangeRates: () => ({ rates: [
    { code: "USD", rate: 1, status: "base" },
    { code: "TWD", rate: 32, status: "current" },
  ] }),
}))

function point(date: string, costUsd: number | null, name = "Model A"): TimedBarChartPoint {
  return { label: date.slice(5).replace("-", "/"), date, startAt: date, value: 100, valueLabel: "100 Tokens", costUsd,
    estimationStatus: costUsd == null ? "unknown" : "current_rate",
    modelUsage: [{ name, tokens: 100, costUsd, estimationStatus: costUsd == null ? "unknown" : "current_rate" }] }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 8, 14, 30))
  useAppPreferencesStore.getState().resetState()
})
afterEach(() => vi.useRealTimers())

describe("Overview metric switch", () => {
  it("changes totals, peak and model shares together while preserving Token-ranked colors and period", () => {
    expect(window.innerHeight).toBe(768)
    render(<UsageTrendExplorer label="Usage Trend" points={[point("2026-10-06", 1), point("2026-10-07", 3, "Model B")]} hourlyPoints={[]} loadHistoricalHourly={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    const chartHeight = screen.getByTestId("usage-trend-explorer").getAttribute("data-chart-height")
    expect(chartHeight).toBe("470")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("200")
    expect(screen.getByTestId("usage-trend-model-ranking")).toHaveTextContent("Model A, 100 Tokens, 50%")
    fireEvent.click(screen.getByTestId("usage-trend-metric-cost"))
    expect(screen.getByTestId("usage-trend-metric-cost")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("$4")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("10/07 · $3")
    expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByTestId("usage-trend-context-title")).not.toBeInTheDocument()
    const ranking = screen.getByTestId("usage-trend-model-ranking")
    expect(ranking).toHaveTextContent("Model A, $1, 25%")
    expect(ranking).toHaveTextContent("Model B, $3, 75%")
    expect(screen.getByTestId("usage-trend-model-segment-0").style.backgroundColor).toContain("rank-1")
    expect(screen.queryByTestId("usage-trend-cost-basis")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-explorer")).toHaveAttribute("data-chart-height", chartHeight)
    expect(screen.getByTestId("usage-trend-daily-chart").firstElementChild).toHaveAttribute("data-chart-height", chartHeight)
    fireEvent.click(screen.getByTestId("usage-trend-metric-tokens"))
    expect(screen.getByTestId("usage-trend-metric-tokens")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-metric-cost")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("200")
    expect(screen.getByTestId("usage-trend-daily-chart").firstElementChild).toHaveAttribute("data-chart-height", chartHeight)
  })

  it("uses configured currency for the total and axis", () => {
    useAppPreferencesStore.getState().setDisplayCurrency("TWD")
    render(<UsageTrendExplorer label="Usage Trend" points={[point("2026-10-07", 1)]} hourlyPoints={[]} loadHistoricalHourly={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    fireEvent.click(screen.getByTestId("usage-trend-metric-cost"))
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("NT$32")
    expect(screen.getByTestId("usage-trend-primary-value-stack")).toHaveTextContent("TWD")
    expect(screen.getByTestId("usage-trend-y-axis")).toHaveTextContent("NT$32")
    expect(screen.getByTestId("usage-trend-y-axis")).not.toHaveTextContent("TWD")
  })

  it("shows unknown and partial prices explicitly, retaining access to the recorded work", () => {
    const { rerender } = render(<UsageTrendExplorer label="Usage Trend" points={[point("2026-10-07", null)]} hourlyPoints={[]} loadHistoricalHourly={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    fireEvent.click(screen.getByTestId("usage-trend-metric-cost"))
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("—")
    expect(screen.queryByTestId("usage-trend-cost-basis")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-slot-5")).toHaveAttribute("type", "button")
    fireEvent.click(screen.getByTestId("usage-trend-slot-5"))
    expect(within(screen.getByTestId("usage-trend-tooltip")).getByText("—")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("API Cost Cannot Yet Be Estimated")
    rerender(<UsageTrendExplorer label="Usage Trend" points={[point("2026-10-06", 1), point("2026-10-07", null)]} hourlyPoints={[]} loadHistoricalHourly={vi.fn()} />)
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("$1")
    expect(screen.queryByTestId("usage-trend-cost-basis")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("usage-trend-slot-5"))
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("API Cost Cannot Yet Be Estimated")
  })
})

describe("metric data preservation", () => {
  it("keeps recorded Tokens and model data when plotting dollars", () => {
    const source = point("2026-10-07", 0.002)
    const plotted = projectTrendPoints([source], "cost")[0]
    expect(plotted.value).toBe(0.002)
    expect(trendTokenValue(plotted)).toBe(100)
    expect(plotted.modelUsage).toBe(source.modelUsage)
    expect(source.value).toBe(100)
    expect(projectTrendPoints([source], "tokens")[0]).toBe(source)
    const unknown = projectTrendPoints([point("2026-10-07", null)], "cost")
    expect(summarizeCost(unknown)).toEqual({ costUsd: null, estimationStatus: "unknown" })
  })

  it("merges hourly model estimates without losing known costs or treating missing prices as zero", () => {
    const now = new Date(2026, 9, 8, 14, 30)
    const startAt = new Date(2026, 9, 8, 13).toISOString()
    const slots = makeHourlySlots([
      { ...point("2026-10-08", 1), startAt },
      { ...point("2026-10-08", 2), startAt },
      { ...point("2026-10-08", null), startAt },
    ], now, now)
    expect(slots[13]).toMatchObject({ value: 300, costUsd: 3, estimationStatus: "partial_rate" })
    expect(slots[13].modelUsage).toEqual([{ name: "Model A", tokens: 300, costUsd: 3, estimationStatus: "partial_rate" }])
  })
})
