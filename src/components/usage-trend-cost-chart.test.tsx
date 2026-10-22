import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { UsageTrendDailyChart } from "./usage-trend-daily-chart"
import { UsageTrendHourlyPulse } from "./usage-trend-hourly-pulse"
import { UsageTrendModelComposition, makeModelColorOrder, makeModelShares } from "./usage-trend-model-composition"
import { UsageTrendStackedColumns } from "./usage-trend-stacked-columns"
import { projectTrendPoints } from "./usage-trend-metric"
import { makeHourlySlots, type TimedBarChartPoint } from "./usage-trend-utils"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

function point(costUsd: number | null, estimationStatus: TimedBarChartPoint["estimationStatus"] = "current_rate"): TimedBarChartPoint {
  return {
    label: "8/4", startAt: new Date(2026, 7, 4, 9).toISOString(), date: "2026-08-04",
    value: 200, valueLabel: "200 Tokens", costUsd, estimationStatus,
    modelUsage: [
      { name: "GPT-5.6 Sol", tokens: 100, costUsd: costUsd == null ? null : costUsd / 10, estimationStatus },
      { name: "GPT-5.6 Luna", tokens: 100, costUsd: costUsd == null ? null : costUsd * 9 / 10, estimationStatus },
    ],
  }
}

beforeEach(() => useAppPreferencesStore.setState({ displayCurrency: "USD" }))

describe("Usage Trend API Estimate", () => {
  it("uses exact model costs for height and shares while keeping Token rank and counts", () => {
    const raw = point(10)
    const order = makeModelColorOrder([raw])
    const [projected] = projectTrendPoints([raw], "cost")
    render(<svg><UsageTrendStackedColumns points={[projected]} coordinates={[{ x: 100, y: 10 }]}
      plot={{ left: 20, right: 720, top: 10, bottom: 110 }} chartWidth={740}
      colorOrder={order} peakIndex={0} activeIndex={null} idPrefix="cost" metric="cost" /></svg>)
    const sol = screen.getByTestId("cost-column-0").querySelector('[data-model="GPT-5.6 Sol"]')!
    const luna = screen.getByTestId("cost-column-0").querySelector('[data-model="GPT-5.6 Luna"]')!
    expect(sol).toHaveAttribute("data-height", "10")
    expect(luna).toHaveAttribute("data-height", "90")
    expect(sol).toHaveAttribute("data-tokens", "100")
    expect(sol).toHaveAttribute("data-cost-usd", "1")
    expect(sol).toHaveAttribute("fill", "var(--trend-model-surface-rank-2)")
    expect(luna).toHaveAttribute("fill", "var(--trend-model-surface-rank-1)")
    expect(makeModelShares([raw], "cost")).toEqual([
      { name: "GPT-5.6 Luna", tokens: 100, costUsd: 9, share: 0.9 },
      { name: "GPT-5.6 Sol", tokens: 100, costUsd: 1, share: 0.1 },
    ])
  })

  it("aggregates exact duplicate-model prices and excludes unknown or zero prices from cost shares", () => {
    const raw = { ...point(10), modelUsage: [
      { name: "gpt-5.6-sol", tokens: 50, costUsd: 1, estimationStatus: "current_rate" as const },
      { name: "GPT-5.6 Sol", tokens: 50, costUsd: 3, estimationStatus: "current_rate" as const },
      { name: "gpt-unknown", tokens: 100, costUsd: null, estimationStatus: "unknown" as const },
      { name: "codex-auto-review", tokens: 20, costUsd: 0, estimationStatus: "current_rate" as const },
    ] }
    expect(makeModelShares([raw], "cost")).toEqual([
      { name: "GPT-5.6 Sol", tokens: 100, costUsd: 4, share: 1 },
    ])
    expect(makeModelShares([{ ...raw, modelUsage: raw.modelUsage.slice(2) }], "cost")).toEqual([])
    expect(makeModelShares([raw])).toEqual([
      { name: "GPT-5.6 Sol", tokens: 100, share: 100 / 220 },
      { name: "gpt-unknown", tokens: 100, share: 100 / 220 },
      { name: "codex-auto-review", tokens: 20, share: 20 / 220 },
    ])
  })

  it("keeps a known total with missing model prices neutral instead of splitting it by Tokens", () => {
    const raw = { ...point(10), modelUsage: [
      { name: "GPT-5.6 Sol", tokens: 190, costUsd: null, estimationStatus: "unknown" as const },
      { name: "GPT-5.6 Luna", tokens: 10, costUsd: null, estimationStatus: "unknown" as const },
    ] }
    const points = projectTrendPoints([raw], "cost")
    render(<svg><UsageTrendStackedColumns points={points} coordinates={[{ x: 100, y: 10 }]}
      plot={{ left: 20, right: 720, top: 10, bottom: 110 }} chartWidth={740}
      colorOrder={makeModelColorOrder([raw])} peakIndex={-1} activeIndex={null} idPrefix="neutral" metric="cost" /></svg>)
    const segments = screen.getByTestId("neutral-column-0").querySelectorAll("[data-segment-kind]")
    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveAttribute("data-segment-kind", "unattributed")
    expect(segments[0]).toHaveAttribute("data-height", "100")
    expect(segments[0]).toHaveAttribute("data-cost-usd", "10")
    expect(segments[0]).toHaveAttribute("fill", "var(--trend-data-secondary)")
  })

  it("uses a fractional currency axis and a readable detail for small daily estimates", () => {
    const raw = point(0.0008)
    const points = projectTrendPoints([raw], "cost")
    render(<UsageTrendDailyChart label="Usage Trend" allPoints={points} displayed={points} total={0.0008}
      colorOrder={makeModelColorOrder([raw])} revealKey="cost-daily" metric="cost" />)
    expect(screen.getByTestId("usage-trend-y-axis")).toHaveTextContent("$0.001")
    expect(screen.getByTestId("usage-trend-peak-label")).toHaveTextContent("$0.0008")
    expect(Number(screen.getByTestId("usage-trend-daily-column-0-segment-0").getAttribute("data-height"))).toBeGreaterThan(100)
    fireEvent.click(screen.getByTestId("usage-trend-slot-0"))
    const detail = screen.getByTestId("usage-trend-tooltip")
    expect(detail).toHaveTextContent("$0.0008")
    expect(detail).toHaveTextContent("API Valuation")
    expect(detail).not.toHaveTextContent("Tokens")
  })

  it("keeps unknown and free hourly prompts selectable without calling the day empty", () => {
    const day = new Date(2026, 7, 4)
    const unknown = point(null, "unknown")
    const free = { ...point(0), startAt: new Date(2026, 7, 4, 10).toISOString() }
    const slots = projectTrendPoints(makeHourlySlots([unknown, free], day, new Date(2026, 7, 5)), "cost")
    const inspect = vi.fn()
    render(<UsageTrendHourlyPulse label="Usage Trend" slots={slots} total={0} colorOrder={makeModelColorOrder([unknown, free])}
      dayLabel="8/4" revealKey="cost-hourly" metric="cost" onInspectTimeScope={inspect} />)
    expect(screen.queryByText(/No .*Activity/i)).not.toBeInTheDocument()
    const unknownSlot = screen.getByTestId("usage-trend-hour-slot-9")
    expect(unknownSlot.tagName).toBe("BUTTON")
    fireEvent.click(unknownSlot)
    let detail = screen.getByTestId("usage-trend-hourly-tooltip")
    expect(detail.querySelector("strong")).toHaveTextContent("—")
    expect(detail).not.toHaveTextContent("Day Share")
    fireEvent.click(within(detail).getByRole("button", { name: "View In Projects" }))
    expect(inspect).toHaveBeenCalledWith({ type: "hour", dateKey: "2026-08-04", hour: 9 }, expect.anything(), "hierarchy")
    fireEvent.click(screen.getByTestId("usage-trend-hour-slot-10"))
    detail = screen.getByTestId("usage-trend-hourly-tooltip")
    expect(detail.querySelector("strong")).toHaveTextContent("$0.00")
    expect(detail).not.toHaveTextContent("Not Included")
  })

  it("labels partial estimates and omits incomplete percentage comparisons", () => {
    const raw = [point(1), { ...point(2, "partial_rate"), label: "8/5", date: "2026-08-05", startAt: "2026-08-05" }]
    const points = projectTrendPoints(raw, "cost")
    render(<UsageTrendDailyChart label="Usage Trend" allPoints={points} displayed={points} total={3}
      colorOrder={makeModelColorOrder(raw)} revealKey="cost-partial" metric="cost" />)
    fireEvent.click(screen.getByTestId("usage-trend-slot-1"))
    const detail = screen.getByTestId("usage-trend-tooltip")
    expect(detail).toHaveTextContent("Only Estimable Usage Is Included")
    expect(detail).not.toHaveTextContent("Vs Previous Day")
    expect(detail).not.toHaveTextContent("Vs 2-Day Average")
  })

  it("shows cost proportions and currency in the same token-ranked composition", () => {
    const raw = point(10)
    const shares = makeModelShares([raw], "cost")
    render(<UsageTrendModelComposition shares={shares} colorOrder={makeModelColorOrder([raw])} revealKey="cost-composition" metric="cost" />)
    const sol = screen.getByTestId("usage-trend-model-segment-1")
    expect(sol).toHaveTextContent("10%")
    expect(sol).toHaveAttribute("aria-label", expect.stringContaining("$1"))
    fireEvent.pointerEnter(sol)
    expect(screen.getByRole("tooltip")).toHaveTextContent("$1")
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("Tokens")
  })
})
