import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UsageTrendDailyChart } from "@/components/usage-trend-daily-chart"
import type { TimedBarChartPoint } from "@/components/usage-trend-utils"

const points: TimedBarChartPoint[] = Array.from({ length: 30 }, (_, index) => ({
  label: `8/${index + 1}`,
  startAt: `2026-08-${String(index + 1).padStart(2, "0")}`,
  date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  value: 100 + (index % 4) * 50,
  valueLabel: "Tokens",
  modelUsage: [],
}))

describe("Usage Trend DOM hover bridge", () => {
  afterEach(() => vi.restoreAllMocks())
  it("creates a transparent bridge after a mouse enters a full-height slot", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(336)
    render(
      <UsageTrendDailyChart
        label="Usage Trend"
        allPoints={points}
        displayed={points}
        total={580}
        colorOrder={new Map()}
        revealKey="preset:7"
        chartWidth={800}
        chartHeight={320}
      />,
    )

    const slot = screen.getByTestId("usage-trend-slot-1")
    expect(slot).toHaveStyle({ height: "79.375%" })

    fireEvent.pointerEnter(slot, { pointerType: "mouse", clientX: 330, clientY: 180 })

    const bridge = screen.getByTestId("usage-trend-hover-bridge")
    expect(bridge).toHaveClass("z-[15]")
    expect(bridge.style.clipPath).toBe("")
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("8/2")

    // The entire transit strip stays protected even without intermediate move events.
    const initialGeometry = bridge.getAttribute("style")
    fireEvent.pointerMove(slot, { pointerType: "mouse", clientX: 332, clientY: 90 })
    expect(bridge.getAttribute("style")).toBe(initialGeometry)
    fireEvent.focus(slot)
    fireEvent.click(slot)
    expect(screen.getByTestId("usage-trend-hover-bridge").getAttribute("style")).toBe(initialGeometry)
    fireEvent.pointerEnter(bridge, { pointerType: "mouse" })
    fireEvent.pointerEnter(screen.getByTestId("usage-trend-tooltip"), { pointerType: "mouse" })
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("8/2")
    // The passage ends at the measured card bottom, not the 410px envelope.
    expect(parseFloat(bridge.style.top) + parseFloat(bridge.style.height)).toBeCloseTo(344 / 320 * 100)

    fireEvent.pointerEnter(screen.getByTestId("usage-trend-slot-2"), { pointerType: "mouse", clientX: 500, clientY: 90 })
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("8/3")
  })
})
