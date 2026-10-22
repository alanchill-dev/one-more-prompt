import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { UsageTrendDailyChart } from "@/components/usage-trend-daily-chart"
import { UsageTrendHourlyPulse } from "@/components/usage-trend-hourly-pulse"
import { makeHourlySlots, type TimedBarChartPoint } from "@/components/usage-trend-utils"

const points: TimedBarChartPoint[] = [0, 1, 0, 1000, 0].map((value, index) => ({
  label: `8/${index + 1}`,
  startAt: `2026-08-${String(index + 1).padStart(2, "0")}`,
  value,
  modelUsage: [],
}))

const chartCases = ["daily", "hourly"] as const

function renderChart(kind: typeof chartCases[number], values = points) {
  const total = values.reduce((sum, point) => sum + point.value, 0)
  const colorOrder = new Map<string, number>()
  if (kind === "daily") return render(
    <UsageTrendDailyChart label="Usage Trend" allPoints={values} displayed={values} total={total} colorOrder={colorOrder} revealKey="daily" />,
  )
  const day = new Date(2026, 7, 4)
  const hourlyPoints = values.map((point, hour) => ({ ...point, startAt: new Date(2026, 7, 4, hour).toISOString() }))
  return render(
    <UsageTrendHourlyPulse label="Usage Trend" slots={makeHourlySlots(hourlyPoints, day, new Date(2026, 7, 5))} total={total} colorOrder={colorOrder} dayLabel="8/4" revealKey="hourly" />,
  )
}

function testIds(kind: typeof chartCases[number]) {
  return kind === "daily"
    ? { slot: "usage-trend-slot", tooltip: "usage-trend-tooltip", bridge: "usage-trend-hover-bridge", scrubber: "usage-trend-scrubber" }
    : { slot: "usage-trend-hour-slot", tooltip: "usage-trend-hourly-tooltip", bridge: "usage-trend-hourly-hover-bridge", scrubber: "usage-trend-hourly-scrubber" }
}

describe.each(chartCases)("Usage Trend %s empty slots", (kind) => {
  it("does not offer a detail card for empty slots through pointer, click, touch, or focus", () => {
    renderChart(kind)
    const ids = testIds(kind)
    const empty = screen.getByTestId(`${ids.slot}-2`)
    expect(empty.tagName).toBe("DIV")
    expect(empty).toHaveAttribute("aria-hidden", "true")
    expect(empty).not.toHaveAttribute("tabindex")
    fireEvent.pointerEnter(empty, { pointerType: "mouse" })
    fireEvent.mouseEnter(empty)
    fireEvent.click(empty)
    fireEvent.pointerEnter(empty, { pointerType: "touch" })
    fireEvent.click(empty)
    fireEvent.focus(empty)
    fireEvent.keyDown(empty, { key: "Enter" })
    expect(screen.queryByTestId(ids.tooltip)).not.toBeInTheDocument()
    expect(screen.queryByTestId(ids.bridge)).not.toBeInTheDocument()
  })

  it("keeps tiny positive bars fully targetable and dismisses the card on entering an empty slot", () => {
    renderChart(kind)
    const ids = testIds(kind)
    const tiny = screen.getByTestId(`${ids.slot}-1`)
    expect(tiny.tagName).toBe("BUTTON")
    expect(tiny).toHaveStyle({ height: "77.08333333333334%" })
    fireEvent.pointerEnter(tiny, { pointerType: "mouse" })
    expect(screen.getByTestId(ids.tooltip)).toBeInTheDocument()
    fireEvent.pointerEnter(screen.getByTestId(ids.tooltip), { pointerType: "mouse" })
    expect(screen.getByTestId(ids.tooltip)).toBeInTheDocument()
    fireEvent.pointerEnter(screen.getByTestId(`${ids.slot}-2`), { pointerType: "mouse" })
    expect(screen.queryByTestId(ids.tooltip)).not.toBeInTheDocument()
    expect(screen.queryByTestId(ids.bridge)).not.toBeInTheDocument()
  })

  it("uses only positive-data buttons for keyboard navigation while preserving original bucket indices", () => {
    renderChart(kind)
    const ids = testIds(kind)
    const buttons = within(screen.getByTestId(ids.scrubber)).getAllByRole("button")
    expect(buttons).toHaveLength(2)
    const first = screen.getByTestId(`${ids.slot}-1`)
    const last = screen.getByTestId(`${ids.slot}-3`)
    expect(last).toHaveAttribute("tabindex", "0")
    fireEvent.focus(last)
    fireEvent.keyDown(last, { key: "Home" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: "ArrowLeft" })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: "End" })
    expect(last).toHaveFocus()
  })

  it("keeps a fully empty chart free of detail controls", () => {
    renderChart(kind, points.map((point) => ({ ...point, value: 0 })))
    const ids = testIds(kind)
    expect(within(screen.getByTestId(ids.scrubber)).queryByRole("button")).not.toBeInTheDocument()
    fireEvent.pointerEnter(screen.getByTestId(`${ids.slot}-0`), { pointerType: "mouse" })
    expect(screen.queryByTestId(ids.tooltip)).not.toBeInTheDocument()
  })
})
