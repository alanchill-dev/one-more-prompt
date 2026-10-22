import type { PromptUsageViewMode } from "@/stores/app-ui-store"
import { useId, useState } from "react"
import { makeModelShares } from "@/components/usage-trend-model-composition"
import { getUsageTrendDetailCardLayout, UsageTrendDetailCard, type UsageTrendDrilldownGeometry } from "@/components/usage-trend-detail-card"
import { UsageTrendStackedColumns, type StackedColumnCoordinate } from "@/components/usage-trend-stacked-columns"
import { getUsageTrendHoverBridgeGeometry, useUsageTrendHoverIntent } from "@/components/use-usage-trend-hover-intent"
import {
  formatHourLabel,
  formatPercent,
  pointCostUsd,
  makeYAxis,
  type HourlySlot,
} from "@/components/usage-trend-utils"
import { useI18n } from "@/hooks/use-i18n"
import { localDateKeyFromDate, type UsageTimeScope } from "@/lib/time-scope"
import { trendTokenValue, useTrendMetric, type TrendMetric } from "@/components/usage-trend-metric"

type Coordinate = StackedColumnCoordinate & { slot: HourlySlot }

const DEFAULT_CHART_WIDTH = 800
const DEFAULT_CHART_HEIGHT = 288

function makePlot(chartWidth: number, chartHeight: number) {
  return { left: 66, right: Math.max(67, chartWidth - 34), top: 30, bottom: Math.max(31, chartHeight - 36) }
}

function hourRange(slot: HourlySlot) {
  const start = slot.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const end = new Date(slot.end.getTime() - 1).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return `${start} - ${end}`
}

export function UsageTrendHourlyPulse({
  label,
  slots,
  total,
  colorOrder,
  dayLabel,
  revealKey,
  activeModelName = null,
  chartWidth = DEFAULT_CHART_WIDTH,
  chartHeight = DEFAULT_CHART_HEIGHT,
  onInspectTimeScope,
  metric = "tokens",
}: {
  label: string
  slots: HourlySlot[]
  total: number
  colorOrder: Map<string, number>
  dayLabel: string
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
  const currentIndex = slots.findIndex((slot) => slot.current)
  const lastObservedIndex = slots.reduce((last, slot, index) => slot.future ? last : index, -1)
  const interactionLimit = currentIndex >= 0 ? currentIndex : lastObservedIndex
  const chartId = useId().replace(/:/g, "")

  const observed = slots.filter((slot) => !slot.future)
  const maximumValue = Math.max(0, ...observed.map((slot) => slot.value))
  const { ceiling: yMaximum, ticks: yTicks } = makeYAxis(maximumValue)
  const step = (plot.right - plot.left) / Math.max(1, slots.length)
  const coordinates: Coordinate[] = slots.map((slot, index) => ({
    slot,
    x: plot.left + step * (index + 0.5),
    y: plot.bottom - (slot.value / yMaximum) * (plot.bottom - plot.top),
  }))
  const interactiveIndices = slots.flatMap((slot, index) => index <= interactionLimit && !slot.future && trendTokenValue(slot) > 0 ? [index] : [])
  const hover = useUsageTrendHoverIntent({
    interactiveIndices,
    initialIndex: Math.max(0, interactionLimit),
    resetKey: `${revealKey}:${slots.length}:${interactionLimit}:${slots[0]?.startAt ?? ""}:${slots[slots.length - 1]?.startAt ?? ""}`,
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
  const interactionStep = step
  const peakIndex = maximumValue > 0
    ? slots.reduce((best, slot, index) => !slot.future && slot.value > (best < 0 ? -1 : slots[best].value) ? index : best, -1)
    : -1
  const heroIndex = currentIndex >= 0 ? currentIndex : peakIndex
  const peakCoordinate = peakIndex >= 0 ? coordinates[peakIndex] : null
  const active = slots[activeIndex]
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
  const previous = tooltipIndex != null && tooltipIndex > 0 ? slots[tooltipIndex - 1] : null
  const comparable = (point: HourlySlot) => metric === "tokens" || pointCostUsd(point) != null
    && (point.estimationStatus === "current_rate" || point.estimationStatus === "historical_rate")
  const completeDay = observed.every((slot) => trendTokenValue(slot) <= 0 || comparable(slot))
  const hourChange = tooltipCoordinate && comparable(tooltipCoordinate.slot) && previous && comparable(previous) && previous.value > 0
    ? tooltipCoordinate.slot.value / previous.value - 1
    : null
  const dayShare = metric === "cost" && (!tooltipCoordinate || !comparable(tooltipCoordinate.slot) || !completeDay)
    ? null : tooltipCoordinate && total > 0 ? tooltipCoordinate.slot.value / total : 0
  const modelShares = tooltipCoordinate ? makeModelShares([tooltipCoordinate.slot], metric) : []
  const hasActivity = observed.some((slot) => trendTokenValue(slot) > 0)
  const stackedCoordinates = coordinates.map(({ x, y }) => ({ x, y }))


  function primaryValue(coordinate: Coordinate) {
    return formatPoint(coordinate.slot)
  }


  return (
    <div className="trend-mode-reveal" data-testid="usage-trend-hourly-pulse">
      <div
        className="relative mt-3 min-h-64 w-full select-none"
        style={{ height: chartHeight }}
        data-testid="usage-trend-hourly-activity-strip"
        data-chart-width={chartWidth}
        data-chart-height={chartHeight}
        onPointerLeave={scheduleHide}
      >
        <svg key={revealKey} data-reveal-key={revealKey} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="absolute inset-0 size-full overflow-visible" role="img" aria-label={t("overview.hourlyChartAria", { label, day: dayLabel })}>
          <g className="trend-furniture-reveal" data-testid="usage-trend-hourly-furniture">
            <g data-testid="usage-trend-hourly-y-axis">
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
          </g>

          <UsageTrendStackedColumns points={slots} coordinates={stackedCoordinates} plot={plot} chartWidth={chartWidth} colorOrder={colorOrder} peakIndex={heroIndex} activeIndex={tooltipIndex} activeModelName={activeModelName} idPrefix="usage-trend-hourly" otherLabel={t("overview.otherModels")} unattributedLabel={t("overview.unattributedModel")} metric={metric} />

          {tooltipCoordinate ? (
            <line data-testid="usage-trend-hourly-active" x1={tooltipCoordinate.x} x2={tooltipCoordinate.x} y1={plot.top} y2={plot.bottom} stroke="var(--trend-data-secondary)" strokeOpacity="0.5" strokeWidth="0.7" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
          ) : null}

          {peakCoordinate ? (
            <text data-testid="usage-trend-hourly-peak-label" x={peakCoordinate.x} y={Math.max(12, peakCoordinate.y - 10)} textAnchor="middle" className="trend-hero-lock text-[9px] font-extrabold tabular-nums" fill={heroIndex === peakIndex ? "var(--trend-hero)" : "var(--trend-foreground)"} style={{ paintOrder: "stroke", stroke: "var(--trend-halo)", strokeWidth: 3, animationDelay: "980ms" }}>{primaryValue(peakCoordinate)}</text>
          ) : null}

          {[0, 4, 8, 12, 16, 20].map((hour) => {
            const index = slots.findIndex((slot) => slot.start.getHours() === hour)
            const coordinate = coordinates[index]
            return coordinate ? <text key={hour} x={coordinate.x - step / 2} y={plot.bottom + 22} textAnchor="start" className="trend-axis-label-reveal fill-[var(--trend-foreground)] text-[8px] font-semibold tabular-nums" opacity="0.58" style={{ animationDelay: `${880 + (hour / 4) * 90}ms` }}>{String(hour).padStart(2, "0")}</text> : null
          })}
          <text x={plot.right} y={plot.bottom + 22} textAnchor="end" className="trend-axis-label-reveal fill-[var(--trend-foreground)] text-[8px] font-semibold tabular-nums" opacity="0.58" style={{ animationDelay: "1300ms" }}>24</text>

          {!hasActivity ? (
            <text x={(plot.left + plot.right) / 2} y={(plot.top + plot.bottom) / 2} textAnchor="middle" className="fill-[var(--trend-data-secondary)] text-[10px] font-semibold uppercase tracking-[0.14em]">{t("overview.noActivityDay", { day: dayLabel })}</text>
          ) : null}
        </svg>

        <div className="absolute inset-0" role="group" aria-label={t("overview.hourlyReadout")} data-testid="usage-trend-hourly-scrubber">
          {coordinates.slice(0, interactionLimit + 1).map((coordinate, index) => {
            const style = {
              left: `${((plot.left + interactionStep * index) / chartWidth) * 100}%`,
              top: `${(plot.top / chartHeight) * 100}%`,
              width: `${(interactionStep / chartWidth) * 100}%`,
              height: `${((plot.bottom - plot.top) / chartHeight) * 100}%`,
            }
            if (!interactiveIndices.includes(index)) return (
              <div
                key={`${coordinate.slot.startAt}-${index}`}
                className="absolute"
                data-testid={`usage-trend-hour-slot-${index}`}
                style={style}
                onPointerEnter={(event) => handleSlotPointerEnter(event, index)}
                onMouseEnter={() => handleSlotMouseEnter(index)}
                onClick={() => activate(index)}
                aria-hidden="true"
              />
            )
            return (
              <button
                key={`${coordinate.slot.startAt}-${index}`}
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
                data-testid={`usage-trend-hour-slot-${index}`}
                style={style}
                aria-label={t("overview.hourPointAria", { day: dayLabel, hour: hourRange(coordinate.slot), value: primaryValue(coordinate), index: index + 1, total: interactionLimit + 1 })}
                aria-controls={tooltipIndex === index ? `${chartId}-tooltip` : undefined}
              />
            )
          })}
        </div>

        {hoverBridge ? (
          <div
            className="absolute z-[15] bg-transparent"
            data-testid="usage-trend-hourly-hover-bridge"
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
            testId="usage-trend-hourly-tooltip"
            x={tooltipCoordinate.x}
            y={tooltipCoordinate.y}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            eyebrow={`${dayLabel} · ${hourRange(tooltipCoordinate.slot)}`}
            total={formatAmount(metric === "cost" ? pointCostUsd(tooltipCoordinate.slot) : tooltipCoordinate.slot.value)}
            metric={metric}
            estimationStatus={tooltipCoordinate.slot.estimationStatus}
            shares={modelShares}
            colorOrder={colorOrder}
            metrics={[
              ...(tooltipCoordinate.slot.current ? [{ label: t("overview.hourStatus"), value: t("overview.inProgress") }] : []),
              ...(hourChange != null ? [{ label: t("overview.vsPreviousHour"), value: formatPercent(hourChange, true) }] : []),
              ...(dayShare != null ? [{ label: t("overview.dayShare"), value: formatPercent(dayShare) }] : []),
            ]}
            actionLabel={t("overview.viewHourPrompts")}
            onHeightChange={setDetailCardHeight}
            onPointerEnter={cancelHide}
            onFocusCapture={cancelHide}
            onBlurCapture={scheduleHide}
            onAction={(geometry, destination) => onInspectTimeScope?.({
              type: "hour",
              dateKey: localDateKeyFromDate(tooltipCoordinate.slot.start),
              hour: tooltipCoordinate.slot.start.getHours(),
            }, geometry, destination)}
          />
        ) : null}
      </div>

      <figcaption className="sr-only"><output aria-live="polite">{active ? t("overview.hourActiveReadout", { hour: hourRange(active), value: formatPoint(active) }) : ""}</output></figcaption>
      <div className="sr-only"><table aria-label={t("overview.hourlyDataTable")}><thead><tr><th>{t("overview.hour")}</th><th>{t("overview.usage")}</th></tr></thead><tbody>{observed.map((slot) => <tr key={slot.startAt}><td>{formatHourLabel(slot.start)}</td><td>{formatPoint(slot)}</td></tr>)}</tbody></table></div>
    </div>
  )
}
