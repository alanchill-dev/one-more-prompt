import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UsageTrendDailyChart } from "@/components/usage-trend-daily-chart"
import { UsageTrendHourlyPulse } from "@/components/usage-trend-hourly-pulse"
import { makeHourlySlots, type TimedBarChartPoint } from "@/components/usage-trend-utils"

const colorOrder = new Map<string, number>()
const animationCss = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8")
const dailySource = readFileSync(resolve(process.cwd(), "src/components/usage-trend-daily-chart.tsx"), "utf8")
const hourlySource = readFileSync(resolve(process.cwd(), "src/components/usage-trend-hourly-pulse.tsx"), "utf8")

function dailyPoints(): TimedBarChartPoint[] {
  return [
    { label: "8/1", startAt: "2026-08-01", date: "2026-08-01", value: 100, valueLabel: "100 tokens", modelUsage: [] },
    { label: "8/2", startAt: "2026-08-02", date: "2026-08-02", value: 240, valueLabel: "240 tokens", modelUsage: [] },
    { label: "8/3", startAt: "2026-08-03", date: "2026-08-03", value: 160, valueLabel: "160 tokens", modelUsage: [] },
    { label: "8/4", startAt: "2026-08-04", date: "2026-08-04", value: 80, valueLabel: "80 tokens", modelUsage: [] },
  ]
}

function historicalHourlySlots(value: number) {
  const day = new Date(2026, 7, 4)
  const point = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14)
  return makeHourlySlots([{
    label: "14:00",
    startAt: point.toISOString(),
    value,
    valueLabel: `${value} tokens`,
    modelUsage: [],
  }], day, new Date(2026, 7, 5))
}

function todayHourlySlots() {
  const now = new Date(2026, 7, 4, 14, 30)
  const point = new Date(2026, 7, 4, 14)
  return makeHourlySlots([{
    label: "14:00",
    startAt: point.toISOString(),
    value: 240,
    valueLabel: "240 tokens",
    modelUsage: [{ name: "GPT-5.6 Sol", tokens: 240 }],
  }], now, now)
}

describe("usage trend animation identity", () => {
  it("keeps the hero value on one motion layer without an overshoot", () => {
    expect(animationCss).not.toMatch(/\.trend-reading-value-reveal\s*\{[^}]*animation:/s)
    expect(animationCss).not.toContain("@keyframes trend-reading-value-reveal")
    expect(animationCss).not.toContain("scale(1.003)")
    expect(animationCss).not.toContain("rotateX(2deg)")
  })

  it("keeps daily column identity on refresh and replays only for a new selection", () => {
    const points = dailyPoints()
    const { rerender } = render(
      <UsageTrendDailyChart label="Usage Trend" allPoints={points} displayed={points} total={580} colorOrder={colorOrder} revealKey="preset:30" />,
    )

    const firstSvg = screen.getByTestId("usage-trend-daily-chart").querySelector("svg")
    const firstColumns = screen.getByTestId("usage-trend-daily-stacked-columns")
    const firstPeakLabel = screen.getByTestId("usage-trend-peak-label")
    expect(firstSvg).toHaveAttribute("data-reveal-key", "preset:30")
    expect(firstColumns.querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(4)
    expect(screen.getByTestId("usage-trend-furniture")).toHaveClass("trend-furniture-reveal")
    expect(screen.getByTestId("usage-trend-y-axis").querySelector("line")).toHaveClass("trend-gridline-calibrate")
    expect(screen.getByTestId("usage-trend-calendar-floor").querySelector("line")).toHaveClass("trend-floor-tick-calibrate")
    expect(firstPeakLabel).toHaveClass("trend-hero-lock")

    const refreshed = points.map((point, index) => ({ ...point, value: point.value + index * 10 }))
    rerender(
      <UsageTrendDailyChart label="Usage Trend" allPoints={refreshed} displayed={refreshed} total={640} colorOrder={colorOrder} revealKey="preset:30" />,
    )
    expect(screen.getByTestId("usage-trend-daily-chart").querySelector("svg")).toBe(firstSvg)
    expect(screen.getByTestId("usage-trend-daily-stacked-columns")).toBe(firstColumns)
    expect(screen.getByTestId("usage-trend-peak-label")).toBe(firstPeakLabel)

    rerender(
      <UsageTrendDailyChart label="Usage Trend" allPoints={refreshed.slice(1)} displayed={refreshed.slice(1)} total={540} colorOrder={colorOrder} revealKey="preset:7" />,
    )
    expect(screen.getByTestId("usage-trend-daily-chart").querySelector("svg")).not.toBe(firstSvg)
    expect(screen.getByTestId("usage-trend-daily-chart").querySelector("svg")).toHaveAttribute("data-reveal-key", "preset:7")
    expect(screen.getByTestId("usage-trend-daily-stacked-columns")).not.toBe(firstColumns)
  })

  it("keeps hourly column identity independent from value refreshes", () => {
    const { rerender } = render(
      <UsageTrendHourlyPulse label="Usage Trend" slots={historicalHourlySlots(240)} total={240} colorOrder={colorOrder} dayLabel="8/4" revealKey="single:2026-08-04" />,
    )

    const firstSvg = screen.getByTestId("usage-trend-hourly-pulse").querySelector("svg")
    const firstColumns = screen.getByTestId("usage-trend-hourly-stacked-columns")
    expect(firstSvg).toHaveAttribute("data-reveal-key", "single:2026-08-04")
    expect(screen.getByTestId("usage-trend-hourly-furniture")).toHaveClass("trend-furniture-reveal")
    expect(firstColumns.querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(1)
    expect(screen.queryByTestId("usage-trend-hourly-rails")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-token-line")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-beads")).not.toBeInTheDocument()

    rerender(
      <UsageTrendHourlyPulse label="Usage Trend" slots={historicalHourlySlots(360)} total={360} colorOrder={colorOrder} dayLabel="8/4" revealKey="single:2026-08-04" />,
    )
    expect(screen.getByTestId("usage-trend-hourly-pulse").querySelector("svg")).toBe(firstSvg)
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns")).toBe(firstColumns)

    rerender(
      <UsageTrendHourlyPulse label="Usage Trend" slots={historicalHourlySlots(360)} total={360} colorOrder={colorOrder} dayLabel="8/4" revealKey="single:2026-08-03" />,
    )
    expect(screen.getByTestId("usage-trend-hourly-pulse").querySelector("svg")).not.toBe(firstSvg)
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns")).not.toBe(firstColumns)
  })

  it("keeps a near-ceiling peak label clear of its column", () => {
    render(
      <UsageTrendHourlyPulse label="Usage Trend" slots={historicalHourlySlots(76_280_000)} total={76_280_000} colorOrder={colorOrder} dayLabel="8/4" revealKey="single:2026-08-04" />,
    )

    const column = screen.getByTestId("usage-trend-hourly-column-14-segment-0")
    const label = screen.getByTestId("usage-trend-hourly-peak-label")
    expect(Number(column.getAttribute("data-y")) - Number(label.getAttribute("y"))).toBeGreaterThanOrEqual(10)
  })

  it("reserves orange for the Today marker without replacing model fill", () => {
    render(
      <UsageTrendHourlyPulse label="Usage Trend" slots={todayHourlySlots()} total={240} colorOrder={new Map([["GPT-5.6 Sol", 0]])} dayLabel="Today" revealKey="preset:1" />,
    )

    expect(screen.getByTestId("usage-trend-hourly-column-14-segment-0")).toHaveAttribute("fill", "var(--trend-model-surface-rank-1)")
    expect(screen.queryByTestId("usage-trend-hourly-column-14-accent-0")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-hourly-peak-marker")).toHaveAttribute("stroke", "var(--trend-hero)")
  })

  it("uses solid stacked columns without the F7 rung or legacy line reveals", () => {
    const source = `${dailySource}\n${hourlySource}`
    expect(source).not.toMatch(/animateMotion|<mpath|pathLength|trend-signal-head/)
    expect(source).not.toMatch(/linearGradient|scan-blade|line-aperture|ink-wash|ink-body/)
    expect(animationCss).not.toContain("stroke-dashoffset")
    expect(animationCss).not.toContain("trend-scan-blade")
    expect(animationCss).toContain("@keyframes trend-stacked-column-reveal")
    expect(animationCss).toContain("@keyframes trend-live-number-character-enter")
    expect(animationCss).toContain("animation: trend-live-number-character-enter 520ms cubic-bezier(.4, 0, .2, 1) backwards")
    expect(animationCss).not.toContain("animation: trend-live-number-character-enter 520ms cubic-bezier(.4, 0, .2, 1) both")
    expect(animationCss).toContain("@keyframes trend-live-number-character-exit")
    expect(animationCss).toContain("@keyframes trend-gridline-calibrate")
    expect(animationCss).toContain("@keyframes trend-model-segment-reveal")
    expect(animationCss).toContain(".trend-model-column-segment")
    expect(animationCss).toContain("[data-model-highlight=\"true\"] .trend-model-column-segment:not([data-model-highlighted=\"true\"])")
    expect(animationCss).toContain("opacity: 0.28")
    expect(animationCss).toContain("@keyframes trend-model-mini-card-enter")
  })

  it("retains the full staged chart when the OS requests reduced motion", () => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media, media: query, matches: query === "(prefers-reduced-motion: reduce)" }))
    const style = document.createElement("style")
    style.textContent = animationCss.replace(/^@import.+$/gm, "")
    document.head.append(style)
    try {
      const points = dailyPoints()
      render(<UsageTrendDailyChart label="Usage Trend" allPoints={points} displayed={points} total={580} colorOrder={colorOrder} revealKey="preset:30" />)
      expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true)
      const column = screen.getByTestId("usage-trend-daily-stacked-columns").querySelector(".trend-stacked-column-reveal")!
      expect(getComputedStyle(column).animation).toContain("trend-stacked-column-reveal 520ms")
      expect(getComputedStyle(screen.getByTestId("usage-trend-furniture")).animation).toContain("trend-furniture-reveal 340ms")
      expect(animationCss).not.toContain("prefers-reduced-motion")
    } finally {
      style.remove()
    }
  })
})
