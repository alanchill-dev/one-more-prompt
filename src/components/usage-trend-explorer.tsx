import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { Palette } from "@phosphor-icons/react"
import { ModelColorInspector } from "@/components/model-color-inspector"
import { UsageTrendDailyChart } from "@/components/usage-trend-daily-chart"
import { UsageTrendReading } from "@/components/usage-trend-reading"
import { projectTrendPoints, useTrendMetric, type TrendMetric } from "@/components/usage-trend-metric"
import type { UsageTrendDatePickerSelection } from "@/components/usage-trend-date-picker"
import { UsageTrendRangeControls, type TrendSelection } from "@/components/usage-trend-range-controls"
import { UsageTrendHourlyPulse } from "@/components/usage-trend-hourly-pulse"
import type { UsageTrendDrilldownGeometry } from "@/components/usage-trend-detail-card"
import {
  UsageTrendModelComposition,
  makeModelColorOrder,
  makeModelShares,
} from "@/components/usage-trend-model-composition"
import {
  DAILY_HISTORY_DAYS,
  dateFromLocalKey,
  findPointIndexByDate,
  formatDayLabel,
  formatHourLabel,
  isSelectableDateKey,
  isUsablePoint,
  localDateKey,
  MAX_CUSTOM_RANGE_DAYS,
  makeHourlySlots,
  normalizeCalendarDays,
  selectableDateBounds,
  summarizeCost,
  type TimedBarChartPoint,
} from "@/components/usage-trend-utils"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useI18n } from "@/hooks/use-i18n"
import { useModelColorPreferences } from "@/hooks/use-model-color-preferences"
import { makeModelColorCssVariables } from "@/lib/model-colors"
import type { BarChartPoint } from "@/lib/plugin-types"
import { cn } from "@/lib/utils"
import type { UsageTimeScope } from "@/lib/time-scope"
import { type PromptUsageViewMode, useAppUiStore } from "@/stores/app-ui-store"

type UsageTrendExplorerProps = {
  label: string
  points: BarChartPoint[]
  /** Undefined means this is an old payload without the hourly contract. */
  hourlyPoints?: BarChartPoint[]
  loadHistoricalHourly: (dateKey: string) => Promise<BarChartPoint[]>
  chartNow?: Date
  modelPaletteGuideActive?: boolean
}

const RANGE_OPTIONS = [1, 7, 14, 30] as const
const DEFAULT_CHART_WIDTH = 800
const MIN_CHART_HEIGHT = 288
const MAX_CHART_HEIGHT = 560
const CHART_VERTICAL_RESERVE = 298
const SHARED_MORPH_EXIT_MS = 320

export function getTrendChartHeight(viewportHeight: number) {
  return Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, Math.round(viewportHeight - CHART_VERTICAL_RESERVE)))
}

type HistoricalHourlyState =
  | { status: "idle" }
  | { status: "loading"; dateKey: string }
  | { status: "success"; dateKey: string; points: TimedBarChartPoint[] }
  | { status: "error"; dateKey: string }

/** Shared daily/hourly stacked-column explorer with preset and custom ranges. */
export function UsageTrendExplorer({ label, points, hourlyPoints, loadHistoricalHourly, chartNow, modelPaletteGuideActive }: UsageTrendExplorerProps) {
  const t = useI18n()
  const isDark = useDarkMode()
  const [metric, setMetric] = useState<TrendMetric>("tokens")
  const metricFormat = useTrendMetric(metric)
  const { preferences: modelColorPreferences } = useModelColorPreferences()
  const setActiveView = useAppUiStore((state) => state.setActiveView)
  const setPromptUsageDrilldownTransition = useAppUiStore((state) => state.setPromptUsageDrilldownTransition)
  const now = chartNow ?? new Date()
  const todayKey = localDateKey(now)
  const validDaily = useMemo(() => points.filter(isUsablePoint), [points])
  const validHourly = useMemo(() => hourlyPoints?.filter(isUsablePoint), [hourlyPoints])
  const historicalPoints = useMemo(
    () => normalizeCalendarDays(validDaily, DAILY_HISTORY_DAYS, now),
    [validDaily, chartNow],
  )
  const selectablePoints = historicalPoints.slice(-MAX_CUSTOM_RANGE_DAYS)
  const hourlySlots = useMemo(
    () => validHourly === undefined ? null : makeHourlySlots(validHourly, now, now),
    [validHourly, chartNow],
  )
  const rangeOptions = validDaily.length > 0 ? RANGE_OPTIONS : RANGE_OPTIONS.slice(0, 1)
  const [selection, setSelection] = useState<TrendSelection>({ type: "preset", days: 1 })
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [datePickerSourceHidden, setDatePickerSourceHidden] = useState(false)
  const [historicalHourly, setHistoricalHourly] = useState<HistoricalHourlyState>({ status: "idle" })
  const customButtonRef = useRef<HTMLButtonElement | null>(null)
  const plotRef = useRef<HTMLElement | null>(null)
  const hourlyRequestSequence = useRef(0)
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH)
  const [highlightedModel, setHighlightedModel] = useState<string | null>(null)
  const [modelColorInspectorOpen, setModelColorInspectorOpen] = useState(false)
  const [modelPaletteApplied, setModelPaletteApplied] = useState(false)
  const [modelPaletteSourceHidden, setModelPaletteSourceHidden] = useState(false)
  const [modelColorInspectorSlot, setModelColorInspectorSlot] = useState(0)
  const modelPaletteButtonRef = useRef<HTMLButtonElement | null>(null)
  const sourceRevealTimersRef = useRef<{ date: ReturnType<typeof setTimeout> | null; palette: ReturnType<typeof setTimeout> | null }>({ date: null, palette: null })
  const drilldownFrameRef = useRef<number | null>(null)
  const [modelPaletteAnchorRect, setModelPaletteAnchorRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => () => {
    if (sourceRevealTimersRef.current.date) clearTimeout(sourceRevealTimersRef.current.date)
    if (sourceRevealTimersRef.current.palette) clearTimeout(sourceRevealTimersRef.current.palette)
    if (drilldownFrameRef.current != null) cancelAnimationFrame(drilldownFrameRef.current)
  }, [])

  useLayoutEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    const measure = () => {
      if (plot.clientWidth > 0) setChartWidth(plot.clientWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(plot)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (selection.type === "preset" && !rangeOptions.includes(selection.days)) {
      setSelection({ type: "preset", days: rangeOptions[rangeOptions.length - 1] as (typeof RANGE_OPTIONS)[number] })
    }
  }, [rangeOptions, selection])

  useEffect(() => {
    setHighlightedModel(null)
  }, [selection])

  useEffect(() => {
    const requestSequence = ++hourlyRequestSequence.current
    if (selection.type !== "single") {
      setHistoricalHourly({ status: "idle" })
      return
    }

    const dateKey = selection.dateKey
    setHistoricalHourly({ status: "loading", dateKey })
    loadHistoricalHourly(dateKey).then((loaded) => {
      if (hourlyRequestSequence.current !== requestSequence) return
      setHistoricalHourly({ status: "success", dateKey, points: loaded.filter(isUsablePoint) })
    }).catch((error: unknown) => {
      if (hourlyRequestSequence.current !== requestSequence) return
      console.error("Failed to load historical hourly usage", { dateKey, error })
      setHistoricalHourly({ status: "error", dateKey })
    })
  }, [loadHistoricalHourly, selection])

  if (validDaily.length === 0 && hourlyPoints === undefined) return null

  const isToday = selection.type === "preset" && selection.days === 1
  const displayedDaily = isToday
    ? []
    : selection.type === "preset"
      ? selectablePoints.slice(-selection.days)
      : selection.type === "single"
        ? []
        : selectablePoints.filter((point) => {
            const key = point.date ?? point.startAt ?? ""
            return key >= selection.startKey && key <= selection.endKey
          })
  const dailyTotal = displayedDaily.reduce((sum, point) => sum + point.value, 0)

  const observedHours = hourlySlots?.filter((slot) => !slot.future) ?? []
  const todayTotal = observedHours.reduce((sum, slot) => sum + slot.value, 0)

  const selectedSingleIndex = selection.type === "single"
    ? findPointIndexByDate(historicalPoints, selection.dateKey, now)
    : -1
  const selectedSinglePoint = selectedSingleIndex >= 0 ? historicalPoints[selectedSingleIndex] : null
  const selectedDay = selection.type === "single" ? dateFromLocalKey(selection.dateKey) : null
  const selectedDayLabel = selectedDay ? formatDayLabel(selectedDay) : ""
  const loadedHistoricalPoints = selection.type === "single"
    && historicalHourly.status === "success"
    && historicalHourly.dateKey === selection.dateKey
      ? historicalHourly.points
      : null
  const historicalSlots = selectedDay && loadedHistoricalPoints
    ? makeHourlySlots(loadedHistoricalPoints, selectedDay, now)
    : null
  const historicalDayTotal = historicalSlots
    ? historicalSlots.reduce((sum, slot) => sum + slot.value, 0)
    : selectedSinglePoint?.value ?? 0
  const compositionPoints = isToday
    ? observedHours
    : selection.type === "single"
      ? historicalSlots ?? (selectedSinglePoint ? [selectedSinglePoint] : [])
      : displayedDaily
  // One selection produces one ranking and one color mapping for the entire chart.
  // Switching Today / 7 / 14 / 30 / custom range intentionally recalculates it.
  const colorOrder = makeModelColorOrder(compositionPoints)
  const modelColorStyle = makeModelColorCssVariables(modelColorPreferences, isDark ? "dark" : "light") as CSSProperties
  const periodModelShares = makeModelShares(compositionPoints, metric)
  const selectionKey = selection.type === "preset"
    ? `preset:${selection.days}`
    : selection.type === "single"
      ? `single:${selection.dateKey}`
      : `range:${selection.startKey}:${selection.endKey}`
  const sceneKey = metric === "tokens" ? selectionKey : `${selectionKey}:cost`
  const chartDaily = projectTrendPoints(displayedDaily, metric)
  const chartAllDaily = projectTrendPoints(historicalPoints, metric)
  const chartTodaySlots = hourlySlots ? projectTrendPoints(hourlySlots, metric) : null
  const chartHistoricalSlots = historicalSlots ? projectTrendPoints(historicalSlots, metric) : null
  const pickerSelection: UsageTrendDatePickerSelection = selection.type === "single"
    ? { mode: "single", dateKey: selection.dateKey }
    : selection.type === "range"
      ? { mode: "range", startKey: selection.startKey, endKey: selection.endKey }
      : { mode: "single", dateKey: todayKey }
  const dateBounds = selectableDateBounds(now)
  const chartHeight = getTrendChartHeight(viewportHeight)

  function openDatePicker() {
    if (sourceRevealTimersRef.current.date) clearTimeout(sourceRevealTimersRef.current.date)
    setDatePickerSourceHidden(true)
    setDatePickerOpen(true)
  }

  function closeDatePicker(restoreFocus = true) {
    setDatePickerOpen(false)
    if (sourceRevealTimersRef.current.date) clearTimeout(sourceRevealTimersRef.current.date)
    sourceRevealTimersRef.current.date = setTimeout(() => {
      setDatePickerSourceHidden(false)
      if (restoreFocus) customButtonRef.current?.focus()
      sourceRevealTimersRef.current.date = null
    }, SHARED_MORPH_EXIT_MS)
  }

  function selectSingleDate(dateKey: string) {
    closeDatePicker()
    if (dateKey === todayKey) {
      setSelection({ type: "preset", days: 1 })
    } else if (isSelectableDateKey(dateKey, now)) {
      setSelection({ type: "single", dateKey })
    }
  }

  function selectDateRange(startKey: string, endKey: string) {
    if (startKey === endKey) {
      selectSingleDate(startKey)
      return
    }
    closeDatePicker()
    setSelection({ type: "range", startKey, endKey })
  }

  const selectorProps = {
    options: rangeOptions,
    selection,
    setPreset: (days: (typeof RANGE_OPTIONS)[number]) => {
      if (datePickerOpen) closeDatePicker(false)
      setSelection({ type: "preset", days })
    },
    onOpenCustom: openDatePicker,
    customButtonRef,
    datePickerOpen,
    datePickerSourceHidden,
    pickerSelection,
    todayKey,
    minimumKey: dateBounds.minimum,
    onClose: closeDatePicker,
    onSelectSingle: selectSingleDate,
    onSelectRange: selectDateRange,
  }
  const summaryPoints: TimedBarChartPoint[] = isToday
    ? observedHours
    : selection.type === "single"
      ? historicalSlots ?? (selectedSinglePoint ? [selectedSinglePoint] : [])
      : displayedDaily
  const summaryIsHourly = isToday || selection.type === "single"
  const costSummary = summarizeCost(summaryPoints)
  const summaryMetricPoints = projectTrendPoints(summaryPoints, metric)
  const summaryTotal = metric === "cost" ? costSummary.costUsd : summaryPoints.reduce((sum, point) => sum + point.value, 0)
  const primaryValue = isToday && !hourlySlots ? t("overview.notAvailableShort") : metricFormat.formatAmount(summaryTotal)
  const primaryExact = metricFormat.formatExact(summaryTotal)
  const summaryAverage = summaryPoints.length > 0 && summaryTotal != null
    ? metricFormat.formatAmount(summaryTotal / summaryPoints.length)
    : metric === "cost" && costSummary.costUsd == null ? "—" : t("overview.noActivityShort")
  const summaryPeak = summaryMetricPoints.reduce<TimedBarChartPoint | null>((best, point) => {
    return point.value > 0 && point.value > (best?.value ?? -1) ? point : best
  }, null)
  const summaryPeakValue = summaryPeak ? metricFormat.formatAmount(summaryPeak.value) : "—"
  const summaryPeakLabel = summaryPeak
    ? summaryIsHourly && summaryPeak.startAt
      ? formatHourLabel(new Date(summaryPeak.startAt))
      : summaryPeak.label
    : t("overview.noActivityShort")
  function inspectPromptScope(scope: UsageTimeScope, geometry: UsageTrendDrilldownGeometry, destination: PromptUsageViewMode) {
    if (drilldownFrameRef.current != null) cancelAnimationFrame(drilldownFrameRef.current)
    const transition = {
      destination,
      scope,
      sourceCardRect: geometry.cardRect,
      sourceActionRect: geometry.actionRect,
      destinationSurfaceRect: null,
      destinationFilterRect: null,
    }
    // Paint the lightweight source response before mounting/filtering the destination.
    // Two frames yield a real paint opportunity, without a fixed pre-navigation pause.
    setPromptUsageDrilldownTransition({ ...transition, phase: "departing" })
    drilldownFrameRef.current = requestAnimationFrame(() => {
      drilldownFrameRef.current = requestAnimationFrame(() => {
        useAppUiStore.setState({
          promptUsageViewMode: destination,
          promptUsageTimeScope: scope,
          promptUsageDrilldownTransition: { ...transition, phase: "arriving" },
        })
        setActiveView("prompt-usage")
        drilldownFrameRef.current = null
      })
    })
  }

  function openModelPalette(slotIndex = 0) {
    if (sourceRevealTimersRef.current.palette) clearTimeout(sourceRevealTimersRef.current.palette)
    const rect = modelPaletteButtonRef.current?.getBoundingClientRect()
    if (rect) {
      setModelPaletteAnchorRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    }
    setModelPaletteSourceHidden(true)
    setModelColorInspectorSlot(slotIndex)
    setModelColorInspectorOpen(true)
  }

  function closeModelPalette() {
    setModelColorInspectorOpen(false)
    if (sourceRevealTimersRef.current.palette) clearTimeout(sourceRevealTimersRef.current.palette)
    sourceRevealTimersRef.current.palette = setTimeout(() => {
      setModelPaletteSourceHidden(false)
      sourceRevealTimersRef.current.palette = null
    }, SHARED_MORPH_EXIT_MS)
  }

  useEffect(() => {
    if (modelPaletteGuideActive === false && modelColorInspectorOpen) closeModelPalette()
  }, [modelPaletteGuideActive, modelColorInspectorOpen])

  const chartControls = <UsageTrendRangeControls {...selectorProps} />

  return (
    <section id="guide-activity-root" aria-label={label} className="usage-trend-surface relative px-2 pb-8 pt-3 sm:px-4" style={modelColorStyle} data-testid="usage-trend-explorer" data-chart-height={chartHeight} data-palette-applied={modelPaletteApplied}>
      <figure ref={plotRef} className="mx-auto w-full max-w-[1180px] px-1" data-testid="usage-trend-plot">
        <div data-testid="usage-trend-reading-field">
          <div
            className="grid h-[5.5rem] grid-rows-1 grid-cols-[minmax(15rem,0.82fr)_minmax(27rem,1.18fr)] items-center px-1 sm:px-3"
            aria-label={t("overview.summaryLabel")}
            data-testid="usage-trend-reading-header"
          >
            <UsageTrendReading value={primaryValue} exactValue={primaryExact} unit={metric === "cost" ? metricFormat.currency : isToday && !hourlySlots ? undefined : metricFormat.unit}
              averageLabel={summaryIsHourly ? t("overview.hourlyAverage") : t("overview.dailyAverage")} average={summaryAverage}
              peakLabel={summaryIsHourly ? t("overview.peakHour") : t("overview.peakDay")}
              peak={summaryPeak ? `${summaryPeakLabel} · ${summaryPeakValue}` : metric === "cost" && costSummary.costUsd == null ? "—" : t("overview.noActivityShort")}
              metric={metric} onMetricChange={setMetric} />
            <div className="min-w-0">
              {chartControls}
            </div>
          </div>

          <div className="relative" data-testid="usage-trend-chart-stage">
          {periodModelShares.length > 0 ? (
            <button
              ref={modelPaletteButtonRef}
              type="button"
              className={cn(
                "absolute right-5 top-[52px] z-30 grid size-11 place-items-center rounded-[12px] border border-border/60 bg-background/55 text-muted-foreground shadow-[0_8px_24px_-14px_rgba(0,0,0,0.9)] backdrop-blur-sm transition-[opacity,transform,background-color,border-color,color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[color:var(--wire-orange)]/45 active:scale-[0.84] hover:bg-background/80 hover:text-foreground hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--wire-orange)_14%,transparent),0_10px_28px_-14px_rgba(0,0,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                modelPaletteSourceHidden ? "pointer-events-none opacity-0" : "delay-150",
              )}
              onClick={() => openModelPalette(0)}
              aria-label={t("overview.modelColorsDescription")}
              title={t("overview.modelColors")}
              data-testid="usage-trend-model-colors-button"
            >
              <Palette className="size-[22px]" weight="regular" aria-hidden="true" />
            </button>
          ) : null}
          <div data-guide-target="activity-chart" data-testid="usage-trend-chart-target">
            {isToday ? (
              hourlySlots ? (
                <UsageTrendHourlyPulse label={label} metric={metric} slots={chartTodaySlots!} total={metric === "cost" ? summarizeCost(observedHours).costUsd ?? 0 : todayTotal} colorOrder={colorOrder} dayLabel={t("overview.rangeToday")} revealKey={sceneKey} chartWidth={chartWidth} chartHeight={chartHeight} activeModelName={highlightedModel} onInspectTimeScope={inspectPromptScope} />
              ) : (
                <div className="trend-mode-reveal mx-3 flex min-h-60 flex-col items-center justify-center border-y border-border/50 text-center" style={{ height: chartHeight }} data-testid="usage-trend-hourly-unavailable">
                  <p className="text-sm font-semibold text-foreground">{t("overview.hourlyUnavailableTitle")}</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{t("overview.hourlyUnavailableDescription")}</p>
                </div>
              )
            ) : selection.type === "single" ? (
              historicalHourly.status === "loading" ? (
                <HourlyState testId="usage-trend-historical-hourly-loading" title={t("overview.historicalHourlyLoading", { date: selectedDayLabel })} chartHeight={chartHeight} />
              ) : historicalHourly.status === "error" ? (
                <HourlyState
                  testId="usage-trend-historical-hourly-error"
                  title={t("overview.historicalHourlyErrorTitle")}
                  description={t("overview.historicalHourlyErrorDescription", { date: selectedDayLabel })}
                  chartHeight={chartHeight}
                  action={<button type="button" className="min-h-10 rounded-md border border-border px-3 text-xs font-semibold" onClick={() => setSelection({ type: "single", dateKey: selection.dateKey })}>{t("common.retry")}</button>}
                />
              ) : historicalSlots && loadedHistoricalPoints && loadedHistoricalPoints.length > 0 ? (
                <UsageTrendHourlyPulse label={label} metric={metric} slots={chartHistoricalSlots!} total={metric === "cost" ? summarizeCost(historicalSlots).costUsd ?? 0 : historicalDayTotal} colorOrder={colorOrder} dayLabel={selectedDayLabel} revealKey={sceneKey} chartWidth={chartWidth} chartHeight={chartHeight} activeModelName={highlightedModel} onInspectTimeScope={inspectPromptScope} />
              ) : historicalHourly.status === "success" ? (
                <HourlyState testId="usage-trend-historical-hourly-empty" title={t("overview.noActivityDay", { day: selectedDayLabel })} chartHeight={chartHeight} />
              ) : null
            ) : (
              <UsageTrendDailyChart label={label} metric={metric} allPoints={chartAllDaily} displayed={chartDaily} total={metric === "cost" ? costSummary.costUsd ?? 0 : dailyTotal} colorOrder={colorOrder} revealKey={sceneKey} chartWidth={chartWidth} chartHeight={chartHeight} activeModelName={highlightedModel} onInspectTimeScope={inspectPromptScope} />
            )}
          </div>

          {periodModelShares.length > 0 ? (
            <div data-guide-target="activity-models">
              <UsageTrendModelComposition
                key={sceneKey}
                metric={metric}
                shares={periodModelShares}
                colorOrder={colorOrder}
                revealKey={sceneKey}
                onActiveModelChange={setHighlightedModel}
                onEditModel={(name) => openModelPalette(Math.min(4, colorOrder.get(name) ?? 0))}
              />
            </div>
          ) : null}

          <ModelColorInspector
            open={modelColorInspectorOpen}
            onClose={closeModelPalette}
            onApply={() => setModelPaletteApplied(true)}
            activeSlotIndex={modelColorInspectorSlot}
            onActiveSlotIndexChange={setModelColorInspectorSlot}
            anchorRect={modelPaletteAnchorRect}
            testId="usage-trend-model-color-inspector"
          />
          </div>
        </div>
      </figure>
    </section>
  )
}

function HourlyState({
  testId,
  title,
  description,
  action,
  chartHeight,
}: {
  testId: string
  title: string
  description?: string
  action?: ReactNode
  chartHeight: number
}) {
  return (
    <div className="trend-mode-reveal mx-3 flex min-h-64 flex-col items-center justify-center border-y border-border/50 text-center" style={{ height: chartHeight }} data-testid={testId} data-chart-height={chartHeight}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
