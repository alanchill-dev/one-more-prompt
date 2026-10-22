import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  UsageTrendStackedColumns,
  getStackedColumnWidth,
  type StackedColumnCoordinate,
  type StackedColumnPlot,
} from "@/components/usage-trend-stacked-columns"
import type { TimedBarChartPoint } from "@/components/usage-trend-utils"

const plot: StackedColumnPlot = { left: 20, right: 720, top: 10, bottom: 110 }
const colorOrder = new Map([
  ["GPT-5.6 Sol", 0],
  ["GPT-5.6 Luna", 1],
  ["GPT-5.6 Terra", 2],
  ["GPT-5.5", 3],
  ["Model E", 4],
  ["Unknown Model", 5],
])

function point(value: number, modelUsage: TimedBarChartPoint["modelUsage"] = []): TimedBarChartPoint {
  return { label: "8/20", value, modelUsage }
}

function renderColumns(
  points: TimedBarChartPoint[],
  coordinates: StackedColumnCoordinate[],
  peakIndex = -1,
  activeIndex: number | null = null,
  activeModelName: string | null = null,
) {
  return render(
    <svg>
      <UsageTrendStackedColumns
        points={points}
        coordinates={coordinates}
        plot={plot}
        chartWidth={740}
        colorOrder={colorOrder}
        peakIndex={peakIndex}
        activeIndex={activeIndex}
        activeModelName={activeModelName}
        idPrefix="trend"
      />
    </svg>,
  )
}

describe("UsageTrendStackedColumns", () => {
  it("keeps total height and model segment lengths proportional to Tokens", () => {
    renderColumns([
      point(100, [
        { name: "GPT-5.6 Sol", tokens: 60 },
        { name: "GPT-5.6 Luna", tokens: 40 },
      ]),
    ], [{ x: 100, y: 10 }])

    const segments = screen.getByTestId("trend-column-0").querySelectorAll<SVGElement>("[data-segment-kind]")
    expect(segments).toHaveLength(2)
    expect([...segments].reduce((sum, segment) => sum + Number(segment.dataset.height), 0)).toBeCloseTo(100)
    expect(screen.getByTestId("trend-column-0-segment-0")).toHaveAttribute("data-height", "60")
    expect(screen.getByTestId("trend-column-0-segment-1")).toHaveAttribute("data-height", "40")
    expect(screen.getByTestId("trend-column-0-segment-1").tagName.toLowerCase()).toBe("path")
  })

  it("keeps the current top-five models visible and aggregates lower ranks into Other", () => {
    renderColumns([
      point(100, [
        { name: "GPT-5.6 Sol", tokens: 70 },
        { name: "GPT-5.5", tokens: 20 },
        { name: "Unknown Model", tokens: 10 },
      ]),
    ], [{ x: 100, y: 10 }])

    const column = screen.getByTestId("trend-column-0")
    const other = column.querySelector('[data-segment-kind="other"]')
    expect(column.querySelector('[data-model="GPT-5.5"]')).toHaveAttribute("fill", "var(--trend-model-surface-rank-4)")
    expect(other).toHaveAttribute("data-tokens", "10")
    expect(other).toHaveAttribute("fill", "var(--trend-model-other)")
    expect(column.querySelectorAll('[data-segment-kind="other"]')).toHaveLength(1)
  })

  it("renders the difference from the point total as neutral unattributed usage", () => {
    renderColumns([
      point(100, [{ name: "GPT-5.6 Sol", tokens: 60 }]),
    ], [{ x: 100, y: 10 }])

    const unattributed = screen.getByTestId("trend-column-0").querySelector('[data-segment-kind="unattributed"]')
    expect(unattributed).toHaveAttribute("data-tokens", "40")
    expect(unattributed).toHaveAttribute("data-height", "40")
    expect(unattributed).toHaveAttribute("fill", "var(--trend-data-secondary)")
    expect(screen.getByTestId("trend-column-0").querySelector('[data-segment-kind="other"]')).not.toBeInTheDocument()
  })

  it("uses the whole neutral column when model usage is unavailable", () => {
    renderColumns([point(100)], [{ x: 100, y: 10 }])

    const segments = screen.getByTestId("trend-column-0").querySelectorAll('[data-segment-kind]')
    expect(segments).toHaveLength(1)
    expect(segments[0]).toHaveAttribute("data-segment-kind", "unattributed")
    expect(segments[0]).toHaveAttribute("data-height", "100")
  })

  it("normalizes inconsistent model totals without exceeding the recorded column height", () => {
    renderColumns([
      point(100, [
        { name: "GPT-5.6 Sol", tokens: 90 },
        { name: "GPT-5.6 Luna", tokens: 60 },
      ]),
    ], [{ x: 100, y: 10 }])

    const column = screen.getByTestId("trend-column-0")
    const segments = column.querySelectorAll<SVGElement>("[data-segment-kind]")
    expect([...segments].reduce((sum, segment) => sum + Number(segment.dataset.height), 0)).toBeCloseTo(100)
    expect(column).toHaveAttribute("data-model-overflow", "50")
  })

  it("shrinks a 365-day range to signal pins while keeping shorter ranges readable", () => {
    const daily365 = Array.from({ length: 365 }, (_, index) => ({ x: 20 + (700 / 364) * index, y: 100 }))
    const daily30 = Array.from({ length: 30 }, (_, index) => ({ x: 20 + (700 / 29) * index, y: 100 }))

    expect(getStackedColumnWidth(daily365, plot, 740)).toBeGreaterThanOrEqual(1)
    expect(getStackedColumnWidth(daily365, plot, 740)).toBeLessThan(2)
    expect(getStackedColumnWidth(daily30, plot, 740)).toBeGreaterThan(10)
  })

  it("marks peak and active columns without replacing their model color", () => {
    renderColumns([
      point(100, [{ name: "GPT-5.6 Sol", tokens: 100 }]),
    ], [{ x: 100, y: 10 }], 0, 0)

    expect(screen.getByTestId("trend-column-0-segment-0")).toHaveAttribute("fill", "var(--trend-model-surface-rank-1)")
    expect(screen.queryByTestId("trend-column-0-accent-0")).not.toBeInTheDocument()
    expect(screen.getByTestId("trend-peak-marker")).toHaveAttribute("stroke", "var(--trend-hero)")
    expect(screen.getByTestId("trend-active-outline")).toHaveAttribute("stroke", "var(--trend-foreground)")
    expect(screen.getByTestId("trend-column-0")).toHaveClass("trend-stacked-column-reveal")
  })

  it("marks only the selected model across the stacked columns and keeps one-pixel segment separators", () => {
    renderColumns([
      point(100, [
        { name: "GPT-5.6 Sol", tokens: 60 },
        { name: "GPT-5.6 Luna", tokens: 40 },
      ]),
    ], [{ x: 100, y: 10 }], -1, null, "gpt-5.6-luna")

    expect(screen.getByTestId("trend-stacked-columns")).toHaveAttribute("data-model-highlight", "true")
    expect(screen.getByTestId("trend-column-0-segment-0")).not.toHaveAttribute("data-model-highlighted")
    expect(screen.getByTestId("trend-column-0-segment-0")).toHaveAttribute("fill", "var(--trend-model-surface-rank-1)")
    expect(screen.getByTestId("trend-column-0-segment-1")).toHaveAttribute("data-model-highlighted", "true")
    expect(screen.getByTestId("trend-column-0-segment-1")).toHaveAttribute("fill", "var(--trend-model-rank-2)")
    expect(screen.queryByTestId("trend-column-0-accent-1")).not.toBeInTheDocument()
    expect(screen.getByTestId("trend-column-0-separator-0")).toHaveAttribute("stroke-width", "1")
  })
})
