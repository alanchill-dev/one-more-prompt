import type { PromptUsageViewMode } from "@/stores/app-ui-store"
import { useId, useState } from "react"
import { makeModelShares } from "@/components/usage-trend-model-composition"
import { getUsageTrendDetailCardLayout, UsageTrendDetailCard, type UsageTrendDrilldownGeometry } from "@/components/usage-trend-detail-card"
import { UsageTrendStackedColumns, type StackedColumnCoordinate } from "@/components/usage-trend-stacked-columns"
import { getUsageTrendHoverBridgeGeometry, useUsageTrendHoverIntent } from "@/components/use-usage-trend-hover-intent"
import {
  formatPercent,
  pointCostUsd,
  makeCalendarDecorationIndices,
  makeCalendarLabelIndices,
  makeYAxis,
  type TimedBarChartPoint,
} from "@/components/usage-trend-utils"
import { useI18n } from "@/hooks/use-i18n"
import { localDateKeyFromTimestamp, type UsageTimeScope } from "@/lib/time-scope"
import { trendTokenValue, useTrendMetric, type TrendMetric } from "@/components/usage-trend-metric"

type Coordinate = StackedColumnCoordinate & { point: TimedBarChartPoint }

const DEFAULT_CHART_WIDTH = 800
const DEFAULT_CHART_HEIGHT = 288

function makePlot(chartWidth: number, chartHeight: number) {
  return { left: 66, right: Math.max(67, chartWidth - 34), top: 30, bottom: Math.max(31, chartHeight - 36) }
}

function makeCoordinates(points: TimedBarChartPoint[], maximum: number, plot: ReturnType<typeof makePlot>): Coordinate[] {
  const width = plot.right - plot.left
  const height = plot.bottom - plot.top
  const step = width / Math.max(1, points.length)
  return points.map((point, index) => ({
    point,
    x: plot.left + step * (index + 0.5),
    y: plot.bottom - (point.value / maximum) * height,
  }))
}

export function UsageTrendDailyChart({
  label,
  allPoints,
  displayed,
  total,
  colorOrder,
  revealKey,
  activeModelName = null,
  chartWidth = DEFAULT_CHART_WIDTH,
  chartHeight = DEFAULT_CHART_HEIGHT,
  onInspectTimeScope,
  metric = "tokens",
}: {
  label: string
  allPoints: TimedBarChartPoint[]
  displayed: TimedBarChartPoint[]
  total: number
  colorOrder: Map<string, number>
  revealKey: string
  activeModelName?: string | null
  chartWidth?: number
  chartHeight?: number
  onInspectTimeScope?: (scope: UsageTimeScope, geometry: UsageTrendDrilldownGeometry, destination: PromptUsageViewMode) => void
  metric?: TrendMetric
}) {
  const t = useI18n()
  const { formatAmount, formatAxis, formatPoint } = useTrendMetric(metric)
  const plot = makePlot(chartWidth, chartHeight)
  const chartId = useId().replace(/:/g, "")

  const formatValue = formatPoint
  const maximumValue = Math.max(0, ...displayed.map((point) => point.value))
  const { ceiling: yMaximum, ticks: yTicks } = makeYAxis(maximumValue)
  const coordinates = makeCoordinates(displayed, yMaximum, plot)
  const interactiveIndices = displayed.flatMap((point, index) => trendTokenValue(point) > 0 ? [index] : [])
  const hover = useUsageTrendHoverIntent({
    interactiveIndices,
    initialIndex: Math.max(0, displayed.length - 1),
    resetKey: `${revealKey}:${displayed.length}:${displayed[0]?.startAt ?? displayed[0]?.label ?? ""}:${displayed[displayed.length - 1]?.startAt ?? displayed[displayed.length - 1]?.label ?? ""}`,
  })
  const {
    activeIndex,
    tooltipIndex,
    pointRefs,
    cancelHide,
    scheduleHide,
    activate,
    handleSlotPointerEnter,
    handleSlotMouseEnter,
    handleSlotFocus,
    handleSlotBlur,
    handlePointKeyDown,
  } = hover
  const interactionStep = (plot.right - plot.left) / Math.max(1, displayed.length)
  const peakIndex = maximumValue > 0
    ? displayed.reduce((best, point, index) => point.value > displayed[best].value ? index : best, 0)
    : -1
  const peakCoordinate = peakIndex >= 0 ? coordinates[peakIndex] : null
  const xLabelIndices = makeCalendarLabelIndices(displayed)
  const displayedStartIndex = displayed.length > 0
    ? Math.max(0, allPoints.findIndex((point) => (point.startAt ?? point.label) === (displayed[0].startAt ?? displayed[0].label)))
    : 0
  const active = displayed[activeIndex]
  const tooltipCoordinate = tooltipIndex == null ? null : coordinates[tooltipIndex]
  const tooltipCardLayout = tooltipCoordinate
    ? getUsageTrendDetailCardLayout({ x: tooltipCoordinate.x, y: tooltipCoordinate.y, chartWidth, chartHeight })
    : null
  const [detailCardHeight, setDetailCardHeight] = useState<number | null>(null)
  const hoverBridge = tooltipCoordinate && tooltipCardLayout
    ? getUsageTrendHoverBridgeGeometry({
        activeX: tooltipCoordinate.x,
        slotWidth: interactionStep,
        slotTop: plot.top,
        slotBottom: plot.bottom,
        card: { ...tooltipCardLayout, height: detailCardHeight ?? tooltipCardLayout.height },
      })
    : null
  const sourceIndex = tooltipIndex == null ? null : displayedStartIndex + tooltipIndex
  const previous = sourceIndex != null && sourceIndex > 0 ? allPoints[sourceIndex - 1] : null
  const displayedAverage = displayed.length > 0 ? total / displayed.length : null
  const comparable = (point: TimedBarChartPoint) => metric === "tokens" || pointCostUsd(point) != null
    && (point.estimationStatus === "current_rate" || point.estimationStatus === "historical_rate")
  const completeRange = displayed.every((point) => trendTokenValue(point) <= 0 || comparable(point))
  const dayChange = tooltipCoordinate && comparable(tooltipCoordinate.point) && previous && comparable(previous) && previous.value > 0
    ? tooltipCoordinate.point.value / previous.value - 1
    : null
  const averageChange = tooltipCoordinate && comparable(tooltipCoordinate.point) && completeRange && displayedAverage != null && displayedAverage > 0
    ? tooltipCoordinate.point.value / displayedAverage - 1
    : null
  const modelShares = tooltipCoordinate ? makeModelShares([tooltipCoordinate.point], metric) : []
  const decorationIndices = new Set(makeCalendarDecorationIndices(displayed))
  const stackedCoordinates = coordinates.map(({ x, y }) => ({ x, y }))


  return (
    <div className="trend-mode-reveal" data-testid="usage-trend-daily-chart">
      <div
        className="relative mt-3 min-h-64 w-full select-none"
        style={{ height: chartHeight }}
        data-chart-width={chartWidth}
        data-chart-height={chartHeight}
        onPointerLeave={scheduleHide}
      >
        <svg key={revealKey} data-reveal-key={revealKey} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="absolute inset-0 size-full overflow-visible" role="img" aria-label={t("overview.chartAria", { label, days: displayed.length })}>
          <g className="trend-furniture-reveal" data-testid="usage-trend-furniture">
            <g data-testid="usage-trend-y-axis">
              {yTicks.map((tick, tickIndex) => {
                const y = plot.bottom - (tick / yMaximum) * (plot.bottom - plot.top)
                return (
                  <g key={tick}>
                    <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--trend-grid)" strokeOpacity={tick === 0 ? "0.82" : "0.36"} strokeWidth="0.7" vectorEffect="non-scaling-stroke" className="trend-gridline-calibrate" style={{ animationDelay: `${100 + tickIndex * 75}ms` }} />
                    <text x={plot.left - 10} y={y + 3} textAnchor="end" className="trend-axis-label-reveal fill-[var(--trend-foreground)] text-[8px] font-semibold tabular-nums" opacity="0.58" style={{ animationDelay: `${180 + tickIndex * 75}ms` }}>{formatAxis(tick)}</text>
                  </g>
                )
              })}
            </g>
            <g data-testid="usage-trend-calendar-floor">
              {coordinates.map(({ point, x }, index) => decorationIndices.has(index) ? (
                <line key={`${point.startAt ?? point.label}-floor-${index}`} x1={x} x2={x} y1={plot.bottom} y2={plot.bottom - (index % 7 === 0 ? 8 : 5)} stroke="var(--trend-data-secondary)" strokeOpacity={index % 7 === 0 ? "0.74" : "0.45"} strokeWidth="0.7" vectorEffect="non-scaling-stroke" className="trend-floor-tick-calibrate" style={{ animationDelay: `${360 + Math.round((index / Math.max(1, displayed.length - 1)) * 600)}ms` }} />
              ) : null)}
            </g>
          </g>

          <UsageTrendStackedColumns points={displayed} coordinates={stackedCoordinates} plot={plot} chartWidth={chartWidth} colorOrder={colorOrder} peakIndex={peakIndex} activeIndex={tooltipIndex} activeModelName={activeModelName} idPrefix="usage-trend-daily" otherLabel={t("overview.otherModels")} unattributedLabel={t("overview.unattributedModel")} metric={metric} />

          {peakCoordinate ? (
            <text data-testid="usage-trend-peak-label" x={Math.max(plot.left + 22, Math.min(plot.right - 22, peakCoordinate.x))} y={Math.max(12, peakCoordinate.y - 10)} textAnchor="middle" className="trend-hero-lock text-[9px] font-extrabold tabular-nums" fill="var(--trend-hero)" style={{ paintOrder: "stroke", stroke: "var(--trend-halo)", strokeWidth: 3, animationDelay: "980ms" }}>{formatValue(peakCoordinate.point)}</text>
          ) : null}

          {tooltipCoordinate ? (
            <line data-testid="usage-trend-active-point" x1={tooltipCoordinate.x} x2={tooltipCoordinate.x} y1={plot.top} y2={plot.bottom} stroke="var(--trend-data-secondary)" strokeOpacity="0.52" strokeWidth="0.7" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
          ) : null}

          {xLabelIndices.map((index, labelIndex) => {
            const coordinate = coordinates[index]
            return coordinate ? <text key={`${coordinate.point.startAt ?? coordinate.point.label}-${labelIndex}`} x={coordinate.x} y={plot.bottom + 22} textAnchor={labelIndex === 0 ? "start" : labelIndex === xLabelIndices.length - 1 ? "end" : "middle"} className="trend-axis-label-reveal fill-[var(--trend-foreground)] text-[8px] font-semibold tabular-nums" opacity="0.62" style={{ animationDelay: `${980 + labelIndex * 80}ms` }}>{coordinate.point.label}</text> : null
          })}
        </svg>

        <div className="absolute inset-0" role="group" aria-label={t("overview.dailyReadout")} data-testid="usage-trend-scrubber">
          {coordinates.map((coordinate, index) => {
            const style = {
              left: `${((plot.left + interactionStep * index) / chartWidth) * 100}%`,
              top: `${(plot.top / chartHeight) * 100}%`,
              width: `${(interactionStep / chartWidth) * 100}%`,
              height: `${((plot.bottom - plot.top) / chartHeight) * 100}%`,
            }
            if (!interactiveIndices.includes(index)) return (
              <div
                key={`${coordinate.point.startAt ?? coordinate.point.label}-${index}`}
                className="absolute"
                data-testid={`usage-trend-slot-${index}`}
                style={style}
                onPointerEnter={(event) => handleSlotPointerEnter(event, index)}
                onMouseEnter={() => handleSlotMouseEnter(index)}
                onClick={() => activate(index)}
                aria-hidden="true"
              />
            )
            return (
              <button
                key={`${coordinate.point.startAt ?? coordinate.point.label}-${index}`}
                ref={(element) => { pointRefs.current[index] = element }}
                type="button"
                tabIndex={index === activeIndex ? 0 : -1}
                onPointerEnter={(event) => handleSlotPointerEnter(event, index)}
                onMouseEnter={() => handleSlotMouseEnter(index)}
                onFocus={() => handleSlotFocus(index)}
                onBlur={handleSlotBlur}
                onClick={() => activate(index)}
                onKeyDown={(event) => handlePointKeyDown(event, index)}
                className="absolute border-0 bg-transparent p-0 outline-none [touch-action:manipulation] focus-visible:bg-foreground/[0.025] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
                data-testid={`usage-trend-slot-${index}`}
                style={style}
                aria-label={t("overview.pointAria", { date: coordinate.point.label, value: formatValue(coordinate.point), index: index + 1, total: displayed.length })}
                aria-controls={tooltipIndex === index ? `${chartId}-tooltip` : undefined}
              />
            )
          })}
        </div>

        {hoverBridge ? (
          <div
            className="absolute z-[15] bg-transparent"
            data-testid="usage-trend-hover-bridge"
            style={{
              left: `${(hoverBridge.left / chartWidth) * 100}%`,
              top: `${(hoverBridge.top / chartHeight) * 100}%`,
              width: `${(hoverBridge.width / chartWidth) * 100}%`,
              height: `${(hoverBridge.height / chartHeight) * 100}%`,
            }}
            onPointerEnter={cancelHide}
            aria-hidden="true"
          />
        ) : null}

        {tooltipCoordinate ? (
          <UsageTrendDetailCard
            id={`${chartId}-tooltip`}
            testId="usage-trend-tooltip"
            x={tooltipCoordinate.x}
            y={tooltipCoordinate.y}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            eyebrow={tooltipCoordinate.point.label}
            total={formatAmount(metric === "cost" ? pointCostUsd(tooltipCoordinate.point) : tooltipCoordinate.point.value)}
            metric={metric}
            estimationStatus={tooltipCoordinate.point.estimationStatus}
            shares={modelShares}
            colorOrder={colorOrder}
            metrics={[
              ...(dayChange != null ? [{ label: t("overview.vsPreviousDay"), value: formatPercent(dayChange, true) }] : []),
              ...(averageChange != null ? [{ label: t("overview.vsRangeAverage", { days: displayed.length }), value: formatPercent(averageChange, true) }] : []),
            ]}
            actionLabel={t("overview.viewDayPrompts")}
            onHeightChange={setDetailCardHeight}
            onPointerEnter={cancelHide}
            onFocusCapture={cancelHide}
            onBlurCapture={scheduleHide}
            onAction={(geometry, destination) => {
              const dateKey = tooltipCoordinate.point.date ?? localDateKeyFromTimestamp(tooltipCoordinate.point.startAt)
              if (dateKey) onInspectTimeScope?.({ type: "day", dateKey }, geometry, destination)
            }}
          />
        ) : null}
      </div>

      <figcaption className="sr-only"><output aria-live="polite">{active ? t("overview.activeReadout", { date: active.label, value: formatValue(active) }) : ""}</output></figcaption>
      <div className="sr-only"><table aria-label={t("overview.dataTable")}><thead><tr><th>{t("overview.date")}</th><th>{t("overview.usage")}</th></tr></thead><tbody>{displayed.map((point) => <tr key={point.startAt ?? point.label}><td>{point.label}</td><td>{formatValue(point)}</td></tr>)}</tbody></table></div>
    </div>
  )
}
