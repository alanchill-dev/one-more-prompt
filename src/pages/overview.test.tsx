import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MetricLine, PluginDisplayState } from "@/lib/plugin-types"
import { OverviewPage } from "@/pages/overview"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: () => false }))

beforeEach(() => {
  invokeMock.mockReset().mockResolvedValue([])
  useAppPreferencesStore.getState().resetState()
  useAppUiStore.getState().resetState()
})

function codexPlugin(lines: MetricLine[] = []): PluginDisplayState {
  return {
    meta: {
      id: "codex",
      name: "Codex",
      iconUrl: "/codex.svg",
      lines: [
        { type: "text", label: "Today", scope: "detail" },
        { type: "text", label: "Prompt Usage", scope: "detail" },
      ],
      detected: true,
      primaryCandidates: [],
    },
    data: {
      providerId: "codex",
      displayName: "Codex",
      iconUrl: "/codex.svg",
      lines,
    },
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastUpdatedAt: Date.parse("2026-08-04T12:00:00Z"),
  }
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function calendarDateLabel(date: Date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function findCalendarDate(date: Date, direction: "previous" | "next") {
  const name = "Select " + calendarDateLabel(date)
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const target = screen.queryByRole("gridcell", { name })
    if (target) return target
    const navigation = screen.getByRole("button", { name: direction === "previous" ? "Previous Month" : "Next Month" })
    if (navigation.hasAttribute("disabled")) break
    fireEvent.click(navigation)
  }
  throw new Error(`Calendar date not found: ${name}`)
}

function recentDailyPoints() {
  const today = new Date()
  return Array.from({ length: 31 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    date.setDate(date.getDate() - (30 - index))
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      startAt: localDateKey(date),
      value: (index + 1) * 100,
      valueLabel: `${(index + 1) * 100} tokens`,
      modelUsage: index >= 24
        ? [
            { name: "GPT-5.6 Sol", tokens: (index + 1) * 60 },
            { name: "GPT-5.6 Luna", tokens: (index + 1) * 40 },
          ]
        : [
            { name: "GPT-5.6 Sol", tokens: (index + 1) * 80 },
            { name: "GPT-5.6 Luna", tokens: (index + 1) * 20 },
          ],
    }
  })
}

function todayHourlyPoints() {
  const now = new Date()
  const earlier = new Date(now)
  earlier.setHours(Math.max(0, now.getHours() - 2), 0, 0, 0)
  const current = new Date(now)
  current.setMinutes(0, 0, 0)
  return [
    {
      label: `${String(earlier.getHours()).padStart(2, "0")}:00`,
      startAt: earlier.toISOString(),
      value: 100,
      valueLabel: "100 tokens",
      costUsd: 0.1,
      estimationStatus: "current_rate" as const,
      modelUsage: [{ name: "GPT-5.6 Sol", tokens: 100 }],
    },
    {
      label: `${String(current.getHours()).padStart(2, "0")}:00`,
      startAt: current.toISOString(),
      value: 300,
      valueLabel: "300 tokens",
      costUsd: 0.3,
      estimationStatus: "current_rate" as const,
      modelUsage: [
        { name: "GPT-5.6 Sol", tokens: 180 },
        { name: "GPT-5.6 Luna", tokens: 120 },
      ],
    },
  ]
}

function historicalHourlyPoints(dateKey: string, value = 240) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const start = new Date(year, month - 1, day, 14, 0, 0)
  return [{
    label: "14:00",
    startAt: start.toISOString(),
    value,
    valueLabel: `${value} tokens`,
    modelUsage: [{ name: "GPT-5.6 Sol", tokens: value }],
  }]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("OverviewPage", () => {
  it("renders a useful Codex empty state", () => {
    render(
      <OverviewPage
        plugin={null}
        onRetryPlugin={vi.fn()}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Ready For Your First Codex Session" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check For Records" })).toBeInTheDocument()
  })

  it.each([
    ["undetected", { ...codexPlugin(), meta: { ...codexPlugin().meta, detected: false }, data: null, lastUpdatedAt: null }],
    ["previously disabled", { ...codexPlugin(), data: null, lastUpdatedAt: null }],
    ["empty response", codexPlugin()],
    ["prompt-only response", codexPlugin([{ type: "text", label: "Prompt Usage", value: "0 prompts · 0 sessions" }])],
  ])("shows a refreshable empty state for an existing %s Codex plugin", (_state, plugin) => {
    const onRetryPlugin = vi.fn()
    render(
      <OverviewPage
        plugin={plugin}
        onRetryPlugin={onRetryPlugin}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByRole("heading", { name: "Ready For Your First Codex Session" })).toBeInTheDocument()
    expect(screen.getByText(/after you use Codex on this computer/)).toBeInTheDocument()
    expect(screen.queryByTestId("overview-usage-field")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onRetryPlugin).toHaveBeenCalledWith("codex")
  })

  it("keeps the loading state visible while Codex is being checked", () => {
    render(
      <OverviewPage
        plugin={{ ...codexPlugin(), data: null, loading: true, lastUpdatedAt: null }}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByTestId("provider-card-body").querySelector(".animate-pulse")).toBeInTheDocument()
  })

  it("guides preparation when Codex reports its expected initial sign-in state", () => {
    const onRetryPlugin = vi.fn()
    render(
      <OverviewPage
        plugin={{ ...codexPlugin(), data: null, error: "Open Codex and sign in to continue.", lastUpdatedAt: null }}
        onRetryPlugin={onRetryPlugin}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByTestId("codex-empty-state")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onRetryPlugin).toHaveBeenCalledWith("codex")
  })

  it.each(["Session expired. Sign in again.", "Network request failed.", "Cannot read local records."])("keeps the real error visible: %s", (error) => {
    render(<OverviewPage
      plugin={{ ...codexPlugin(), data: null, error, lastUpdatedAt: null }}
      displayMode="used"
      resetTimerDisplayMode="relative"
    />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(error)
  })

  it("keeps existing activity and its sign-in warning visible", () => {
    render(<OverviewPage
      plugin={{ ...codexPlugin([
        { type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() },
        { type: "progress", label: "Weekly", used: 24, limit: 100, format: { kind: "percent" } },
      ]), error: "Open Codex and sign in to continue." }}
      displayMode="used"
      resetTimerDisplayMode="relative"
    />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-explorer")).toBeInTheDocument()
    expect(screen.getByText("Open Codex and sign in to continue.")).toBeInTheDocument()
  })

  it("keeps a successful empty response visible during refresh and shows a later error", () => {
    const plugin = codexPlugin()
    const onRetryPlugin = vi.fn()
    const props = { displayMode: "used" as const, resetTimerDisplayMode: "relative" as const, onRetryPlugin }
    const { rerender } = render(<OverviewPage plugin={plugin} {...props} />)
    const surface = screen.getByTestId("codex-empty-state")
    const action = screen.getByRole("button", { name: "Check For Records" })
    fireEvent.click(action)
    expect(onRetryPlugin).toHaveBeenCalledWith("codex")

    rerender(<OverviewPage plugin={{ ...plugin, loading: true }} {...props} />)
    expect(screen.getByTestId("codex-empty-state")).toBe(surface)
    expect(action).toBeDisabled()
    expect(action).toHaveTextContent("Checking For Records...")
    expect(screen.queryByTestId("provider-card-body")).not.toBeInTheDocument()

    rerender(<OverviewPage plugin={{ ...plugin, error: "Cannot read local records." }} {...props} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByText("Cannot read local records.")).toBeInTheDocument()
  })

  it("keeps available account quota visible even when there are no prompt records", () => {
    render(<OverviewPage
      plugin={codexPlugin([{ type: "progress", label: "Weekly", used: 24, limit: 100, format: { kind: "percent" } }])}
      displayMode="used"
      resetTimerDisplayMode="relative"
    />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByTestId("overview-usage-field")).toHaveTextContent("Weekly")
  })

  it("keeps duplicated period activity out of Overview", () => {
    render(
      <OverviewPage
        plugin={codexPlugin([
          { type: "text", label: "Today", value: "$4.00 · 12K tokens" },
          { type: "text", label: "Last 30 Days", value: "$52.00 · 156K tokens" },
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.queryByText("Today")).not.toBeInTheDocument()
    expect(screen.queryByText("Last 30 Days")).not.toBeInTheDocument()
    expect(screen.queryByText("Codex")).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Codex Usage" })).toBeInTheDocument()
    expect(screen.queryByText("Quick Usage Overview")).not.toBeInTheDocument()
  })

  it("does not leak Prompt Usage hierarchy lines into Overview", () => {
    render(
      <OverviewPage
        plugin={codexPlugin([
          { type: "text", label: "Today", value: "$4.00 · 12K tokens" },
          { type: "text", label: "Prompt Usage", value: "1 prompt · 1 session" },
          { type: "text", label: "Project Group", value: "Example Project" },
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.queryByText("Today")).not.toBeInTheDocument()
    expect(screen.queryByText("Prompt Usage")).not.toBeInTheDocument()
    expect(screen.queryByText("Example Project")).not.toBeInTheDocument()
  })

  it("moves Codex history into an interactive trend explorer instead of duplicating its sparkline", async () => {
    render(
      <OverviewPage
        plugin={codexPlugin([
          { type: "text", label: "Today", value: "$4.00 · 12K tokens" },
          {
            type: "barChart",
            label: "Usage Trend",
            granularity: "daily",
            color: "#74AA9C",
            note: "Estimated from local logs",
            points: recentDailyPoints(),
          } as MetricLine & { granularity: "daily" },
          {
            type: "barChart",
            label: "Usage Today",
            granularity: "hourly",
            points: todayHourlyPoints(),
          } as MetricLine & { granularity: "hourly" },
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByTestId("usage-trend-explorer")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-explorer")).not.toHaveClass("min-h-[calc(100dvh-7rem)]")
    expect(screen.getByTestId("usage-trend-explorer")).not.toHaveClass("rounded-3xl", "border")
    expect(screen.getByTestId("usage-trend-plot")).not.toHaveClass("rounded-2xl", "border")
    expect(screen.getByTestId("usage-trend-reading-field")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-reading-header")).not.toHaveClass("border-y", "rounded-2xl", "bg-background/20")
    expect(screen.queryByTestId("usage-trend-ledger")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "30 Days" }))
    expect(screen.getByRole("button", { name: "30 Days" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText(/^Codex Activity ·/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Source: Local Codex Logs/)).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-y-axis").querySelectorAll("line").length).toBeGreaterThan(3)
    expect(screen.queryByTestId("usage-trend-median")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hairlines")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-calendar-floor").querySelectorAll("line")).toHaveLength(30)
    const thirtyDayColumns = screen.getByTestId("usage-trend-daily-stacked-columns")
    expect(thirtyDayColumns.querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(30)
    expect(Number(thirtyDayColumns.getAttribute("data-column-width"))).toBeGreaterThan(10)
    expect(screen.queryByTestId("usage-trend-line-overlay")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-seven-day-average")).not.toBeInTheDocument()
    const thirtyDayModelMix = screen.getByTestId("usage-trend-model-composition")
    expect(thirtyDayModelMix).toHaveAttribute("data-reveal-key", "preset:30")
    expect(thirtyDayModelMix).toHaveTextContent("Period Model Composition")
    expect(thirtyDayModelMix).not.toHaveTextContent("5 Models")
    expect(thirtyDayModelMix).not.toHaveClass("mt-7", "border-t", "pt-4")
    expect(thirtyDayModelMix).toHaveTextContent("GPT-5.6 Sol")
    expect(screen.getByTestId("usage-trend-model-band")).toBeInTheDocument()
    expect(thirtyDayModelMix.querySelectorAll(".trend-model-band-segment").length).toBeGreaterThan(0)
    const firstModelSegment = screen.getByTestId("usage-trend-model-segment-0")
    fireEvent.pointerEnter(firstModelSegment)
    expect(thirtyDayColumns).toHaveAttribute("data-model-highlight", "true")
    expect(thirtyDayColumns.querySelectorAll('[data-model-highlighted="true"]').length).toBeGreaterThan(0)
    fireEvent.pointerLeave(firstModelSegment)
    expect(thirtyDayColumns).not.toHaveAttribute("data-model-highlight")
    expect(screen.getByTestId("usage-trend-model-ranking")).toHaveClass("sr-only")
    const readingHeader = screen.getByTestId("usage-trend-reading-header")
    const primaryReading = screen.getByTestId("usage-trend-primary-reading")
    const controlStack = screen.getByTestId("usage-trend-control-stack")
    const rangeGroup = screen.getByRole("group", { name: "Time Range" })
    expect(readingHeader).toHaveClass("h-[5.5rem]", "grid-cols-[minmax(15rem,0.82fr)_minmax(27rem,1.18fr)]", "items-center")
    expect(readingHeader).toContainElement(primaryReading)
    expect(readingHeader).toContainElement(controlStack)
    expect(primaryReading.compareDocumentPosition(controlStack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(controlStack).toHaveClass("border-l", "pl-7")
    expect(controlStack).toContainElement(rangeGroup)
    expect(screen.queryByRole("radiogroup", { name: "Chart Type" })).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("49,500")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveAttribute("aria-live", "polite")
    expect(within(screen.getByTestId("usage-trend-summary-line")).queryByTestId("usage-trend-live-number")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-secondary-reading")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-daily-chart").compareDocumentPosition(screen.getByTestId("usage-trend-model-composition"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    const activityChartTarget = screen.getByTestId("usage-trend-chart-target")
    const activityModelsTarget = document.querySelector<HTMLElement>('[data-guide-target="activity-models"]')
    const activityControlsTarget = document.querySelector<HTMLElement>('[data-guide-target="activity-controls"]')
    expect(document.querySelectorAll('[data-guide-target="activity-chart"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-guide-target="activity-models"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-guide-target="activity-controls"]')).toHaveLength(1)
    expect(activityChartTarget).toContainElement(screen.getByTestId("usage-trend-daily-chart"))
    expect(activityChartTarget).not.toContainElement(screen.getByTestId("usage-trend-reading-header"))
    expect(activityChartTarget).not.toContainElement(screen.getByTestId("usage-trend-model-composition"))
    expect(activityChartTarget).not.toContainElement(screen.getByTestId("usage-trend-control-stack"))
    expect(activityModelsTarget).toContainElement(screen.getByTestId("usage-trend-model-composition"))
    expect(activityChartTarget.contains(activityModelsTarget)).toBe(false)
    expect(activityChartTarget.contains(activityControlsTarget)).toBe(false)
    expect(screen.getByTestId("usage-trend-chart-stage")).not.toHaveClass("pr-36", "sm:pr-40")
    const dailyStage = screen.getByTestId("usage-trend-daily-chart").firstElementChild
    expect(dailyStage).toHaveClass("min-h-64")
    expect(Number(dailyStage?.getAttribute("data-chart-height"))).toBeGreaterThan(288)
    expect(screen.getByTestId("usage-trend-explorer")).toHaveAttribute("data-chart-height", dailyStage?.getAttribute("data-chart-height"))
    expect(screen.getByTestId("usage-trend-scrubber")).toBeInTheDocument()
    const firstDailySlot = screen.getByTestId("usage-trend-slot-0")
    expect(firstDailySlot).not.toHaveClass("size-11")
    expect(Number.parseFloat(firstDailySlot.style.height)).toBeGreaterThan(70)
    expect(screen.getByTestId("usage-trend-daily-peak-marker")).toHaveAttribute("stroke", "var(--trend-hero)")
    expect(screen.queryByText("Daily Activity")).not.toBeInTheDocument()
    expect(screen.queryByText(/One Dot = One Day/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Replay Reveal" })).not.toBeInTheDocument()
    expect(screen.queryByText(/F2 Hairline Line|Porcelain|青瓷藍/)).not.toBeInTheDocument()
    expect(screen.getByTestId("overview-usage-field")).toHaveClass("border-t")
    expect(screen.getByTestId("overview-usage-field")).not.toHaveClass("rounded-3xl", "shadow-[0_18px_50px_-34px_rgba(0,0,0,0.9)]")

    const thirtyDayLatest = screen.getByRole("button", { name: new RegExp(`${recentDailyPoints().at(-1)!.label}: 3100 tokens`, "i") })
    fireEvent.mouseEnter(thirtyDayLatest)
    const thirtyDayDetail = screen.getByTestId("usage-trend-tooltip")
    expect(thirtyDayDetail).toHaveTextContent("Vs 30-Day Average+87.9%")
    expect(thirtyDayDetail).toHaveAttribute("data-side", "left")
    expect(within(thirtyDayDetail).getByRole("button", { name: "View In Timeline" })).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-active-point").tagName.toLowerCase()).toBe("line")
    fireEvent.mouseLeave(thirtyDayLatest)

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    expect(screen.getByTestId("usage-trend-daily-stacked-columns")).not.toBe(thirtyDayColumns)
    expect(screen.getByText("19,600")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-model-composition")).not.toBe(thirtyDayModelMix)
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveAttribute("data-reveal-key", "preset:7")
    const firstSevenDayModel = screen.getByTestId("usage-trend-model-label-0")
    expect(firstSevenDayModel).toHaveTextContent("GPT-5.6 Sol")
    expect(firstSevenDayModel).toHaveAccessibleName("1. GPT-5.6 Sol, 11,760 Tokens, 60%")

    fireEvent.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-hourly-pulse")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns").querySelectorAll(".trend-stacked-column-reveal").length).toBeGreaterThan(0)
    expect(screen.getByTestId("usage-trend-hourly-peak-marker")).toHaveAttribute("stroke", "var(--trend-hero)")
    expect(screen.queryByTestId("usage-trend-hourly-rails")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-token-line")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-stems")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-beads")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveAttribute("data-reveal-key", "preset:1")
    expect(screen.queryByTestId("usage-trend-context-title")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("400")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("Hourly Average")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("Peak Hour")
    expect(screen.getByTestId("usage-trend-hourly-pulse").compareDocumentPosition(screen.getByTestId("usage-trend-model-composition"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.getByTestId("usage-trend-hourly-activity-strip")).toHaveClass("min-h-64")
    const firstHourlySlot = screen.getByTestId("usage-trend-hour-slot-0")
    expect(firstHourlySlot).not.toHaveClass("size-11")
    expect(Number.parseFloat(firstHourlySlot.style.height)).toBeGreaterThan(70)
    expect(screen.getByTestId("usage-trend-hourly-pulse").querySelector("svg")).toHaveAttribute("viewBox", expect.stringMatching(/^0 0 800 \d+$/))
    expect(screen.getByTestId("usage-trend-hourly-y-axis").querySelector('line[y1="30"]')).toBeInTheDocument()
    const hourlyHeight = Number(screen.getByTestId("usage-trend-hourly-activity-strip").getAttribute("data-chart-height"))
    expect(screen.getByTestId("usage-trend-hourly-y-axis").querySelector(`line[y1="${hourlyHeight - 36}"]`)).toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalled()
    const hourlyPoint = screen.getAllByRole("button", { name: /tokens.*Hour \d+ of/i }).at(-1)!
    fireEvent.mouseEnter(hourlyPoint)
    const hourlyDetail = screen.getByTestId("usage-trend-hourly-tooltip")
    expect(within(hourlyDetail).getByRole("button", { name: "View In Timeline" })).toBeInTheDocument()
    fireEvent.mouseLeave(hourlyPoint)

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    const latest = recentDailyPoints().at(-1)!
    const previous = recentDailyPoints().at(-2)!
    const latestPoint = screen.getByRole("button", { name: new RegExp(`${latest.label}: 3100 tokens`, "i") })
    expect(latestPoint).toBeInTheDocument()
    fireEvent.mouseEnter(latestPoint)
    const sevenDayDetail = screen.getByTestId("usage-trend-tooltip")
    expect(sevenDayDetail).toHaveTextContent(latest.label)
    expect(sevenDayDetail).toHaveTextContent("3,100")
    expect(sevenDayDetail).toHaveTextContent("Vs Previous Day+3.3%")
    expect(screen.queryByText("Period Share")).not.toBeInTheDocument()
    expect(sevenDayDetail).toHaveTextContent("Vs 7-Day Average+10.7%")
    expect(sevenDayDetail).toHaveTextContent("GPT-5.6 Sol")
    expect(within(sevenDayDetail).getByRole("button", { name: "View In Timeline" })).toBeInTheDocument()

    // Pointer travel through the scrubber toward the sidecar must not silently
    // retarget to another X-axis point. Only an explicit point hit may switch.
    fireEvent.pointerMove(screen.getByTestId("usage-trend-scrubber"), { clientX: 1, clientY: 1 })
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent(latest.label)
    const previousPoint = screen.getByRole("button", { name: new RegExp(`${previous.label}: 3000 tokens`, "i") })
    fireEvent.pointerEnter(previousPoint, { pointerType: "mouse" })
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent(previous.label)
    fireEvent.pointerEnter(latestPoint, { pointerType: "mouse" })
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent(latest.label)

    fireEvent.mouseLeave(latestPoint)
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent(latest.label)
    fireEvent.pointerLeave(screen.getByTestId("usage-trend-scrubber").parentElement!)
    await waitFor(() => expect(screen.queryByTestId("usage-trend-tooltip")).not.toBeInTheDocument())
    fireEvent.keyDown(latestPoint, { key: "ArrowLeft" })
    expect(screen.getByText(`${previous.label} · 3000 tokens`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "14 Days" }))
    expect(screen.getByRole("button", { name: "14 Days" })).toHaveAttribute("aria-pressed", "true")
    const fourteenDayLatest = screen.getByRole("button", { name: new RegExp(`${latest.label}: 3100 tokens`, "i") })
    fireEvent.mouseEnter(fourteenDayLatest)
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("Vs 14-Day Average+26.5%")
    fireEvent.mouseLeave(fourteenDayLatest)
    expect(screen.queryByText("Show Data Table")).not.toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Show Data Table" }).parentElement).toHaveClass("sr-only")
  })

  it.each([["hierarchy", "View In Projects"], ["timeline", "View In Timeline"]] as const)("drills daily and hourly cards into %s with matching scope", async (destination, actionLabel) => {
    render(
      <OverviewPage
        plugin={codexPlugin([
          { type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine,
          { type: "barChart", label: "Usage Today", granularity: "hourly", points: todayHourlyPoints() } as MetricLine,
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    const latest = recentDailyPoints().at(-1)!
    fireEvent.mouseEnter(screen.getByRole("button", { name: new RegExp(`${latest.label}: 3100 tokens`, "i") }))
    const beforeClick = useAppUiStore.getState()
    fireEvent.click(within(screen.getByTestId("usage-trend-tooltip")).getByRole("button", { name: actionLabel }))
    // Hidden destinations must not refilter or mount before the source can paint.
    expect(useAppUiStore.getState().promptUsageTimeScope).toBe(beforeClick.promptUsageTimeScope)
    expect(useAppUiStore.getState().promptUsageViewMode).toBe(beforeClick.promptUsageViewMode)
    expect(useAppUiStore.getState().promptUsageDrilldownTransition).toMatchObject({ phase: "departing", destination })
    await waitFor(() => expect(useAppUiStore.getState().activeView).toBe("prompt-usage"))
    expect(useAppUiStore.getState().promptUsageViewMode).toBe(destination)
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: localDateKey(new Date()) })

    useAppUiStore.getState().setActiveView("home")
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "lastDays", days: 7 })
    fireEvent.click(screen.getByRole("button", { name: "Today" }))
    const hourlyPoint = screen.getAllByRole("button", { name: /tokens.*Hour \d+ of/i }).at(-1)!
    fireEvent.mouseEnter(hourlyPoint)
    fireEvent.click(within(screen.getByTestId("usage-trend-hourly-tooltip")).getByRole("button", { name: actionLabel }))
    expect(useAppUiStore.getState().promptUsageDrilldownTransition).toMatchObject({ phase: "departing", destination })
    await waitFor(() => expect(useAppUiStore.getState().activeView).toBe("prompt-usage"))
    expect(useAppUiStore.getState().promptUsageViewMode).toBe(destination)
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "hour", dateKey: localDateKey(new Date()), hour: new Date().getHours() })
  })

  it("defaults Usage Trend to Tokens and offers the approved API metric switch", () => {
    const pricedPoints = recentDailyPoints().map((point, index) => ({
      ...point,
      value: point.value * 100_000,
      costUsd: ((index + 1) * 3_633.31) / 495,
      estimationStatus: "current_rate" as const,
    }))
    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points: pricedPoints } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(screen.getByRole("button", { name: "30 Days" }))

    expect(screen.queryByRole("radiogroup", { name: "Chart Type" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-mode-row")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-control-stack")).toContainElement(screen.getByTestId("usage-trend-range-row"))
    expect(screen.getByTestId("usage-trend-metric-cost")).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByTestId("usage-trend-metric-legend")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-daily-stacked-columns")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("4.95B")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveStyle({ lineHeight: "1" })
    expect(screen.getByTestId("usage-trend-primary-value-stack")).toHaveClass("mt-2")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveClass("text-[clamp(2.5rem,4.4vw,3.35rem)]", "overflow-visible", "whitespace-nowrap")
    expect(screen.getByTestId("usage-trend-primary-magnitude")).toHaveClass("ml-[0.06em]")
    expect(screen.getByTestId("usage-trend-primary-reading")).toHaveTextContent("Tokens")
    expect(screen.queryByTestId("usage-trend-cost-basis")).not.toBeInTheDocument()
  })

  it("reassigns palette slots when the selected period changes model rank", () => {
    const today = new Date()
    const points = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      date.setDate(date.getDate() - (29 - index))
      const recent = index >= 23
      const sol = recent ? 10 : 100
      const luna = recent ? 100 : 0
      return {
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        startAt: localDateKey(date),
        value: sol + luna,
        valueLabel: `${sol + luna} tokens`,
        modelUsage: [
          { name: "GPT-5.6 Sol", tokens: sol },
          ...(luna > 0 ? [{ name: "GPT-5.6 Luna", tokens: luna }] : []),
        ],
      }
    })

    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "30 Days" }))
    let luna = screen.getByTestId("usage-trend-daily-stacked-columns").querySelector('[data-model="GPT-5.6 Luna"]')
    expect(luna).toHaveAttribute("fill", "var(--trend-model-surface-rank-2)")

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    luna = screen.getByTestId("usage-trend-daily-stacked-columns").querySelector('[data-model="GPT-5.6 Luna"]')
    expect(luna).toHaveAttribute("fill", "var(--trend-model-surface-rank-1)")
    expect(screen.getByTestId("usage-trend-model-ranking").textContent?.trim().startsWith("1. GPT-5.6 Luna")).toBe(true)
  })

  it("shows Today activity with the same stacked-column language", () => {
    const hourlyPoints = todayHourlyPoints()
    render(
      <OverviewPage
        plugin={codexPlugin([
          { type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine,
          { type: "barChart", label: "Today Activity", granularity: "hourly", points: hourlyPoints } as MetricLine,
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByTestId("usage-trend-context-title")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("400")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("Hourly Average")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("Peak Hour")
    const expectedHourlyColumns = new Set(hourlyPoints.map((point) => new Date(point.startAt!).getHours())).size
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns").querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(expectedHourlyColumns)
    expect(screen.getByTestId("usage-trend-hourly-peak-marker")).toHaveAttribute("stroke", "var(--trend-hero)")
    expect(screen.queryByTestId("usage-trend-hourly-token-line")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-cost-line")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-stems")).not.toBeInTheDocument()
    expect(screen.queryByRole("radiogroup", { name: "Chart Type" })).not.toBeInTheDocument()
  })

  it("uses the guide clock for a full Today example without changing the system clock", () => {
    const chartNow = new Date(2026, 9, 20, 17, 40)
    const hourlyPoints = Array.from({ length: 12 }, (_, index) => ({
      label: `${String(index + 6).padStart(2, "0")}:00`,
      startAt: new Date(2026, 9, 20, index + 6).toISOString(),
      value: (index + 1) * 100,
      modelUsage: [{ name: "Example Model", tokens: (index + 1) * 100 }],
    }))
    const systemTimeBefore = Date.now()
    render(<OverviewPage
      plugin={codexPlugin([
        { type: "barChart", label: "Usage Trend", granularity: "daily", points: [{ label: "10/20", startAt: "2026-10-20", value: 7_800 }] },
        { type: "barChart", label: "Usage Today", granularity: "hourly", points: hourlyPoints },
      ])}
      displayMode="used"
      resetTimerDisplayMode="relative"
      chartNow={chartNow}
    />)

    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-primary-token-row")).toHaveTextContent("7,800")
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns").querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(12)
    expect(screen.getByTestId("usage-trend-hour-slot-17")).toHaveAttribute("type", "button")
    expect(screen.queryByTestId("usage-trend-hour-slot-18")).not.toBeInTheDocument()
    expect(Date.now()).toBeGreaterThanOrEqual(systemTimeBefore)
    expect(Date.now() - systemTimeBefore).toBeLessThan(5_000)
  })

  it("groups independent Codex limits into one readable allowance meter section", () => {
    const plugin = codexPlugin([
      { type: "progress", label: "Session", used: 10, limit: 100, format: { kind: "percent" } },
      { type: "progress", label: "Weekly", used: 35, limit: 100, format: { kind: "percent" } },
      { type: "progress", label: "Spark", used: 0, limit: 100, format: { kind: "percent" } },
      { type: "progress", label: "Spark Weekly", used: 20, limit: 100, format: { kind: "percent" } },
      { type: "text", label: "Rate Limit Resets", value: "1 available" },
      { type: "text", label: "Credits", value: "$119.40 · 2985 credits" },
      { type: "text", label: "Today", value: "$4.00 · 12K tokens" },
      { type: "text", label: "Yesterday", value: "$6.00 · 18K tokens" },
      { type: "text", label: "GPT-5.6 Sol", value: "69.6%" },
    ])
    plugin.meta.links = [
      { label: "Status", url: "https://status.openai.com" },
      { label: "Usage Dashboard", url: "https://platform.openai.com/usage" },
    ]

    render(
      <OverviewPage
        plugin={plugin}
        displayMode="left"
        resetTimerDisplayMode="relative"
      />,
    )

    expect(screen.getByRole("region", { name: "Usage Limits" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Usage Limits" })).toBeInTheDocument()
    expect(screen.getByTestId("overview-account-status")).toHaveTextContent("Rate Limit Resets")
    expect(screen.queryByTestId("overview-snapshot-details")).not.toBeInTheDocument()
    expect(screen.queryByTestId("overview-usage-activity")).not.toBeInTheDocument()
    expect(screen.queryByTestId("overview-model-mix")).not.toBeInTheDocument()
    expect(screen.queryByText("GPT-5.6 Sol")).not.toBeInTheDocument()
    expect(screen.getAllByRole("progressbar")).toHaveLength(4)
    expect(screen.getByText("90% left")).toBeInTheDocument()
    expect(screen.getByText("65% left")).toBeInTheDocument()
    expect(screen.getByText("Spark Weekly")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /OpenAI Service Status/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Codex Official Usage/ })).toBeInTheDocument()
    expect(screen.getByTestId("overview-usage-limits")).toContainElement(screen.getByTestId("provider-links"))
    expect(screen.queryByRole("button", { name: /Status/ })).not.toBeInTheDocument()
    const limitsWindowsTarget = document.querySelector<HTMLElement>('[data-guide-target="limits-windows"]')
    const limitsResetPaceTarget = document.querySelector<HTMLElement>('[data-guide-target="limits-reset-pace"]')
    expect(document.querySelectorAll('[data-guide-target="limits-windows"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-guide-target="limits-reset-pace"]')).toHaveLength(1)
    expect(limitsWindowsTarget).toBe(screen.getByTestId("overview-usage-limits"))
    expect(limitsResetPaceTarget).toBe(screen.getByTestId("overview-quota-reset-pace"))
    expect(screen.getByTestId("provider-card-body")).not.toHaveAttribute("data-guide-target")
    expect(limitsWindowsTarget).toContainElement(screen.getByRole("heading", { name: "Usage Limits" }))
    expect(limitsWindowsTarget).toContainElement(limitsResetPaceTarget)
    expect(limitsResetPaceTarget).not.toContainElement(screen.getByRole("heading", { name: "Usage Limits" }))
    expect(limitsResetPaceTarget).not.toContainElement(screen.getByTestId("overview-account-status"))
  })

  it("does not turn an old daily payload into fake hourly data", () => {
    render(
      <OverviewPage
        plugin={codexPlugin([{
          type: "barChart",
          label: "Usage Trend",
          points: recentDailyPoints(),
        }])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Today" }))

    expect(screen.getByTestId("usage-trend-hourly-unavailable")).toHaveTextContent("Hourly Detail Is Not Available")
    expect(screen.queryByTestId("usage-trend-daily-chart")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-pulse")).not.toBeInTheDocument()
  })

  it("normalizes missing calendar days while filtering invalid history points", () => {
    const today = new Date()
    const dates = Array.from({ length: 4 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      date.setDate(date.getDate() - (3 - index))
      return date
    })
    const labels = dates.map((date) => `${date.getMonth() + 1}/${date.getDate()}`)

    render(
      <OverviewPage
        plugin={codexPlugin([
          {
            type: "barChart",
            label: "Usage Trend",
            points: [
              { label: labels[0], startAt: localDateKey(dates[0]), value: -10 },
              { label: labels[1], startAt: localDateKey(dates[1]), value: 20, valueLabel: "20 tokens" },
              { label: labels[2], startAt: localDateKey(dates[2]), value: Number.NaN, valueLabel: "not a number" },
              { label: labels[3], startAt: localDateKey(dates[3]), value: 40, valueLabel: "40 tokens" },
            ],
          } as MetricLine,
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: new RegExp(`${labels[3]}: 40 tokens`, "i") })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: new RegExp(`${labels[0]}: 0 tokens`, "i") })).not.toBeInTheDocument()
    expect(within(screen.getByRole("table", { name: "Show Data Table" })).getByRole("row", { name: `${labels[0]} 0 Tokens` })).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-scrubber").querySelectorAll("button")).toHaveLength(2)
  })

  it("loads a historical single day as 24-hour usage, then keeps ranges daily and Today local", async () => {
    const hourlyRequest = deferred<ReturnType<typeof historicalHourlyPoints>>()
    invokeMock.mockReturnValue(hourlyRequest.promise)
    render(
      <OverviewPage
        plugin={codexPlugin([
          {
            type: "barChart",
            label: "Usage Trend",
            granularity: "daily",
            points: recentDailyPoints(),
          } as MetricLine,
          {
            type: "barChart",
            label: "Usage Today",
            granularity: "hourly",
            points: todayHourlyPoints(),
          } as MetricLine,
        ])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    const now = new Date()
    const historicalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    historicalDate.setDate(historicalDate.getDate() - 10)
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    const controlConsole = screen.getByTestId("usage-trend-control-console")
    const datePicker = screen.getByTestId("usage-trend-date-picker")
    const datePickerLayer = screen.getByTestId("usage-trend-date-picker-layer")
    const datePickerMorph = screen.getByTestId("usage-trend-date-picker-shared-morph")
    const customButton = screen.getByRole("button", { name: "Custom" })
    expect(controlConsole).toHaveClass("overflow-visible")
    expect(controlConsole).not.toHaveClass("overflow-hidden")
    expect(controlConsole).not.toContainElement(datePicker)
    expect(datePicker).toHaveClass("fixed")
    expect(datePickerLayer).toHaveClass("z-[118]")
    expect(datePickerLayer).toHaveAttribute("data-state", "open")
    expect(datePickerMorph.style.getPropertyValue("--shared-source-width")).not.toBe("")
    expect(datePickerMorph.style.getPropertyValue("--shared-destination-width")).not.toBe("")
    expect(customButton).toHaveClass("opacity-0")
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Custom Usage" }), { key: "Escape" })
    expect(customButton).toHaveClass("opacity-0")
    await waitFor(() => expect(screen.queryByTestId("usage-trend-date-picker")).not.toBeInTheDocument())
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByTestId("usage-trend-date-picker")).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(screen.getByRole("button", { name: "7 Days" }))
    await waitFor(() => expect(screen.queryByTestId("usage-trend-date-picker")).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(findCalendarDate(historicalDate, "previous"))
    const historicalKey = localDateKey(historicalDate)
    expect(within(screen.getByTestId("usage-trend-range-row")).getByRole("button", { name: `${historicalDate.getMonth() + 1}/${historicalDate.getDate()}` })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-historical-hourly-loading")).toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-historical-hourly-loading")).toHaveClass("min-h-64")
    expect(Number(screen.getByTestId("usage-trend-historical-hourly-loading").getAttribute("data-chart-height"))).toBeGreaterThan(288)
    expect(screen.queryByTestId("usage-trend-daily-chart")).not.toBeInTheDocument()
    await act(async () => hourlyRequest.resolve(historicalHourlyPoints(historicalKey)))
    await waitFor(() => expect(screen.getByTestId("usage-trend-hourly-pulse")).toBeInTheDocument())
    expect(invokeMock).toHaveBeenCalledWith("query_codex_hourly_usage", { dateKey: historicalKey })
    expect(screen.getByTestId("usage-trend-hourly-scrubber").querySelectorAll('[data-testid^="usage-trend-hour-slot-"]')).toHaveLength(24)
    expect(screen.getByTestId("usage-trend-hourly-scrubber").querySelectorAll("button")).toHaveLength(1)
    expect(screen.getByRole("table", { name: "Hourly Usage Data" }).querySelectorAll("tbody tr")).toHaveLength(24)
    expect(screen.getByTestId("usage-trend-hourly-stacked-columns").querySelectorAll(".trend-stacked-column-reveal")).toHaveLength(1)
    expect(screen.getByTestId("usage-trend-hourly-peak-marker")).toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-rails")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-hourly-beads")).not.toBeInTheDocument()
    expect(screen.queryByText("Top Model")).not.toBeInTheDocument()
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveAttribute("data-reveal-key", `single:${historicalKey}`)
    expect(screen.queryByRole("radiogroup", { name: "Chart Type" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: `${historicalDate.getMonth() + 1}/${historicalDate.getDate()}` }))
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    rangeStart.setDate(rangeStart.getDate() - 40)
    const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    rangeEnd.setDate(rangeEnd.getDate() - 1)
    fireEvent.click(findCalendarDate(rangeStart, "previous"))
    fireEvent.click(findCalendarDate(rangeEnd, "next"))
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveAttribute("data-reveal-key", `range:${localDateKey(rangeStart)}:${localDateKey(rangeEnd)}`)
    expect(screen.getByTestId("usage-trend-scrubber").querySelectorAll('[data-testid^="usage-trend-slot-"]')).toHaveLength(40)
    expect(screen.getByTestId("usage-trend-scrubber").querySelectorAll("button")).toHaveLength(30)
    expect(screen.getByRole("table", { name: "Show Data Table" }).querySelectorAll("tbody tr")).toHaveLength(40)
    const customLatest = recentDailyPoints().at(-2)!
    const customLatestPoint = screen.getByRole("button", { name: new RegExp(`${customLatest.label}: 3000 tokens`, "i") })
    fireEvent.mouseEnter(customLatestPoint)
    expect(screen.getByTestId("usage-trend-tooltip")).toHaveTextContent("Vs 40-Day Average+158.1%")
    fireEvent.mouseLeave(customLatestPoint)
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-summary-line")).toHaveTextContent("Daily Average")
    expect(screen.queryByTestId("usage-trend-context-title")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(screen.getByRole("tab", { name: "Single Day" }))
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    fireEvent.click(findCalendarDate(today, "next"))
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("usage-trend-hourly-pulse")).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledTimes(1)
  }, 15_000)

  it("shows a historical hourly error instead of misreporting zero activity", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    invokeMock.mockRejectedValue(new Error("hourly query failed"))
    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    const historicalDate = new Date()
    historicalDate.setDate(historicalDate.getDate() - 8)
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(findCalendarDate(historicalDate, "previous"))

    await waitFor(() => expect(screen.getByTestId("usage-trend-historical-hourly-error")).toBeInTheDocument())
    expect(screen.queryByTestId("usage-trend-historical-hourly-empty")).not.toBeInTheDocument()
    expect(screen.queryByTestId("usage-trend-daily-chart")).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith("Failed to load historical hourly usage", expect.objectContaining({ dateKey: localDateKey(historicalDate) }))
    consoleError.mockRestore()
  })

  it("ignores an older historical response after a newer date is selected", async () => {
    const requests = new Map<string, ReturnType<typeof deferred<ReturnType<typeof historicalHourlyPoints>>>>()
    invokeMock.mockImplementation((_command: string, args: { dateKey: string }) => {
      const request = deferred<ReturnType<typeof historicalHourlyPoints>>()
      requests.set(args.dateKey, request)
      return request.promise
    })
    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    const firstDate = new Date()
    firstDate.setDate(firstDate.getDate() - 9)
    const secondDate = new Date()
    secondDate.setDate(secondDate.getDate() - 8)
    const firstKey = localDateKey(firstDate)
    const secondKey = localDateKey(secondDate)

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(findCalendarDate(firstDate, "previous"))
    fireEvent.click(screen.getByRole("button", { name: `${firstDate.getMonth() + 1}/${firstDate.getDate()}` }))
    fireEvent.click(findCalendarDate(secondDate, "next"))

    await act(async () => requests.get(secondKey)?.resolve(historicalHourlyPoints(secondKey, 222)))
    await waitFor(() => expect(screen.getByTestId("usage-trend-hourly-pulse")).toHaveTextContent("222"))
    await act(async () => requests.get(firstKey)?.resolve(historicalHourlyPoints(firstKey, 111)))
    expect(screen.getByTestId("usage-trend-hourly-pulse")).toHaveTextContent("222")
    expect(screen.getByTestId("usage-trend-hourly-pulse")).not.toHaveTextContent("111")
  })

  it("proves the 365-day range boundary and rejects a reversed range", () => {
    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    const now = new Date()
    const minimum = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    minimum.setDate(minimum.getDate() - 364)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(screen.getByRole("tab", { name: "Date Range" }))
    fireEvent.click(findCalendarDate(minimum, "previous"))
    fireEvent.click(findCalendarDate(today, "next"))
    expect(screen.getByTestId("usage-trend-model-composition")).toHaveAttribute("data-reveal-key", `range:${localDateKey(minimum)}:${localDateKey(today)}`)
    expect(screen.getByTestId("usage-trend-scrubber").querySelectorAll('[data-testid^="usage-trend-slot-"]')).toHaveLength(365)
    expect(screen.getByTestId("usage-trend-scrubber").querySelectorAll("button")).toHaveLength(31)
    expect(screen.getByRole("table", { name: "Show Data Table" }).querySelectorAll("tbody tr")).toHaveLength(365)

    const reversedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    reversedStart.setDate(reversedStart.getDate() - 10)
    const reversedEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    reversedEnd.setDate(reversedEnd.getDate() - 20)
    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    fireEvent.click(findCalendarDate(reversedStart, "next"))
    fireEvent.click(findCalendarDate(reversedEnd, "previous"))
    expect(screen.getByText("The end date must be on or after the start date.")).toBeInTheDocument()
  }, 20_000)

  it("keeps date-grid focus across Page Up, Page Down, and arrow month boundaries", async () => {
    render(
      <OverviewPage
        plugin={codexPlugin([{ type: "barChart", label: "Usage Trend", granularity: "daily", points: recentDailyPoints() } as MetricLine])}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />,
    )

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()))
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    const todayCell = screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(today) })
    todayCell.focus()
    fireEvent.keyDown(todayCell, { key: "PageUp" })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(previousMonth) }))

    const previousMonthCell = screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(previousMonth) })
    fireEvent.keyDown(previousMonthCell, { key: "PageDown" })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(today) }))

    const firstOfMonthCell = screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(firstOfMonth) })
    firstOfMonthCell.focus()
    fireEvent.keyDown(firstOfMonthCell, { key: "ArrowLeft" })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    expect(document.activeElement).toBe(screen.getByRole("gridcell", { name: "Select " + calendarDateLabel(previousMonthEnd) }))
  })
})
