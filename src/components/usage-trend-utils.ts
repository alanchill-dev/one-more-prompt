import type { BarChartPoint, BarChartModelUsage } from "@/lib/plugin-types"
import type { PricingEstimationStatus } from "@/bindings"
import { combineEstimationStatus } from "@/lib/currency"
import { formatCountNumber } from "@/lib/utils"

export type TimedBarChartPoint = BarChartPoint & {
  value: number
  /** Preserve recorded activity when the plotted value is an API estimate. */
  tokenValue?: number
  startAt?: string | null
  date?: string | null
}

export type HourlySlot = TimedBarChartPoint & {
  start: Date
  end: Date
  current: boolean
  future: boolean
}

export type CostSummary = {
  costUsd: number | null
  estimationStatus: PricingEstimationStatus
}

export const MAX_CUSTOM_RANGE_DAYS = 365
export const DAILY_HISTORY_DAYS = MAX_CUSTOM_RANGE_DAYS + 1

export function isUsablePoint(point: BarChartPoint): point is TimedBarChartPoint {
  return point.value != null && Number.isFinite(point.value) && point.value >= 0
}

export function pointCostUsd(point: TimedBarChartPoint) {
  return point.costUsd != null && Number.isFinite(point.costUsd) && point.costUsd >= 0
    ? point.costUsd
    : null
}

export function summarizeCost(points: TimedBarChartPoint[]): CostSummary {
  const used = points.filter((point) => (point.tokenValue ?? point.value) > 0)
  if (used.length === 0) return { costUsd: 0, estimationStatus: "historical_rate" }
  const priced = used.filter((point) => pointCostUsd(point) != null)
  if (priced.length === 0) {
    return { costUsd: null, estimationStatus: "unknown" }
  }
  const estimationStatus = combineEstimationStatus(priced.map((point) => point.estimationStatus))
  return {
    costUsd: priced.reduce((sum, point) => sum + (pointCostUsd(point) ?? 0), 0),
    estimationStatus: priced.length < used.length || estimationStatus === "unknown"
      ? "partial_rate"
      : estimationStatus,
  }
}

export function makeSegmentedPath<T>(
  coordinates: T[],
  read: (coordinate: T) => { x: number; y: number | null },
) {
  let drawing = false
  return coordinates.map((coordinate) => {
    const { x, y } = read(coordinate)
    if (y == null) {
      drawing = false
      return ""
    }
    const command = drawing ? "L" : "M"
    drawing = true
    return `${command} ${x} ${y}`
  }).filter(Boolean).join(" ")
}

export function formatPointValue(point: TimedBarChartPoint, tokenUnit: string) {
  return point.valueLabel ?? `${formatCountNumber(point.value)} ${tokenUnit}`
}

export function formatAxisValue(value: number) {
  if (Math.abs(value) < 1_000) return formatCountNumber(value)
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function formatEditorialValue(value: number) {
  if (Math.abs(value) < 1_000_000) return formatCountNumber(value)
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)
}

const TOOLTIP_GAP_PX = 24
const TOOLTIP_MARGIN_PX = 12
const TOOLTIP_ESTIMATED_WIDTH_PX = 240
const TOOLTIP_ESTIMATED_HEIGHT_PX = 160

export function makeTooltipPlacement(x: number, y: number, chartWidth: number, chartHeight: number) {
  const horizontal = x - TOOLTIP_ESTIMATED_WIDTH_PX / 2 < TOOLTIP_MARGIN_PX
    ? "start"
    : x + TOOLTIP_ESTIMATED_WIDTH_PX / 2 > chartWidth - TOOLTIP_MARGIN_PX
      ? "end"
      : "center"
  const shouldFlipBelow = y - TOOLTIP_ESTIMATED_HEIGHT_PX - TOOLTIP_GAP_PX < TOOLTIP_MARGIN_PX
    && y + TOOLTIP_ESTIMATED_HEIGHT_PX + TOOLTIP_GAP_PX <= chartHeight - TOOLTIP_MARGIN_PX
  const vertical = shouldFlipBelow
    ? "below"
    : "above"
  const horizontalTransform = horizontal === "start" ? "0%" : horizontal === "end" ? "-100%" : "-50%"
  const verticalTransform = vertical === "below" ? `${TOOLTIP_GAP_PX}px` : `calc(-100% - ${TOOLTIP_GAP_PX}px)`

  return {
    horizontal,
    vertical,
    transform: `translate(${horizontalTransform}, ${verticalTransform})`,
  } as const
}

export function formatPercent(value: number, signed = false) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: signed ? "always" : "auto",
  }).format(value)
}

function niceStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(Number.EPSILON, value)))
  const normalized = value / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

export function makeYAxis(maximum: number) {
  const step = niceStep((maximum > 0 ? maximum : 1) / 4)
  const ceiling = Math.max(step, Math.ceil(maximum / step) * step)
  const ticks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step)
  return { ceiling, ticks }
}

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dateFromLocalKey(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) || localDateKey(date) !== key ? null : date
}

export function addLocalDays(date: Date, days: number) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  result.setDate(result.getDate() + days)
  return result
}

export function addCalendarMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

export function localTodayKey(now = new Date()) {
  return localDateKey(now)
}

export function selectableDateBounds(now = new Date()) {
  return {
    minimum: localDateKey(addLocalDays(now, -(MAX_CUSTOM_RANGE_DAYS - 1))),
    maximum: localDateKey(now),
  }
}

export function isSelectableDateKey(key: string, now = new Date()) {
  const { minimum, maximum } = selectableDateBounds(now)
  return dateFromLocalKey(key) !== null && key >= minimum && key <= maximum
}

/** Difference in local calendar days, independent of DST transitions. */
export function inclusiveCalendarDayCount(startKey: string, endKey: string) {
  const start = dateFromLocalKey(startKey)
  const end = dateFromLocalKey(endKey)
  if (!start || !end || startKey > endKey) return null
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endUtc - startUtc) / (24 * 60 * 60 * 1_000)) + 1
}

export function isValidCalendarRange(startKey: string, endKey: string, maximumDays = MAX_CUSTOM_RANGE_DAYS) {
  const length = inclusiveCalendarDayCount(startKey, endKey)
  return length !== null && length >= 1 && length <= maximumDays
}

export function findPointIndexByDate(points: TimedBarChartPoint[], key: string, now = new Date()) {
  return points.findIndex((point) => {
    const date = pointDate(point, now)
    return date ? localDateKey(date) === key : false
  })
}

export function makeCalendarLabelIndices(points: TimedBarChartPoint[], now = new Date()) {
  if (points.length === 0) return []
  const last = points.length - 1
  const indices = new Set<number>([0, last])
  if (points.length <= 60) {
    for (let index = 7; index < last; index += 7) indices.add(index)
  } else {
    points.forEach((point, index) => {
      const date = pointDate(point, now)
      if (date && date.getDate() === 1) indices.add(index)
    })
  }
  if (last > 1) {
    indices.delete(1)
    indices.delete(last - 1)
  }
  return [...indices].sort((a, b) => a - b)
}

export function makeCalendarDecorationIndices(points: TimedBarChartPoint[], now = new Date()) {
  if (points.length <= 60) return points.map((_, index) => index)
  const indices = new Set<number>([0, points.length - 1])
  points.forEach((point, index) => {
    const date = pointDate(point, now)
    if (date && date.getDay() === 1) indices.add(index)
  })
  return [...indices].sort((a, b) => a - b)
}

function fallbackLabelDate(label: string, now: Date) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(label.trim())
  if (!match) return null
  const month = Number(match[1]) - 1
  const day = Number(match[2])
  let candidate = new Date(now.getFullYear(), month, day)
  const futureTolerance = new Date(now)
  futureTolerance.setDate(futureTolerance.getDate() + 1)
  if (candidate > futureTolerance) candidate = new Date(now.getFullYear() - 1, month, day)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

export function pointDate(point: TimedBarChartPoint, now = new Date()) {
  const rawDate = point.date?.trim()
  if (rawDate) {
    const local = dateFromLocalKey(rawDate.slice(0, 10))
    if (local) return local
  }

  const rawStart = point.startAt?.trim()
  if (rawStart) {
    const dateOnly = dateFromLocalKey(rawStart)
    if (dateOnly) return dateOnly
    const parsed = new Date(rawStart)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return fallbackLabelDate(point.label, now)
}

export function formatDayLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatHourLabel(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:00`
}

function hourStart(date: Date) {
  const result = new Date(date)
  result.setMinutes(0, 0, 0)
  return result
}

function mergeHourlyPoint(current: TimedBarChartPoint | undefined, next: TimedBarChartPoint) {
  if (!current) return next
  const modelTotals = new Map<string, BarChartModelUsage[]>()
  for (const model of [...(current.modelUsage ?? []), ...(next.modelUsage ?? [])]) {
    if (!model.name.trim() || model.tokens == null || !Number.isFinite(model.tokens) || model.tokens <= 0) continue
    const rows = modelTotals.get(model.name) ?? []
    rows.push(model)
    modelTotals.set(model.name, rows)
  }
  const cost = summarizeCost([current, next])
  return {
    ...current,
    value: current.value + next.value,
    valueLabel: null,
    ...cost,
    modelUsage: [...modelTotals.entries()]
      .map(([name, rows]) => {
        const priced = rows.filter((model) => model.costUsd != null && Number.isFinite(model.costUsd) && model.costUsd >= 0)
        const status = combineEstimationStatus(priced.map((model) => model.estimationStatus))
        return {
          name,
          tokens: rows.reduce((sum, model) => sum + (model.tokens ?? 0), 0),
          costUsd: priced.length > 0 ? priced.reduce((sum, model) => sum + (model.costUsd ?? 0), 0) : null,
          estimationStatus: priced.length === 0 ? "unknown" as const
            : priced.length < rows.length || status === "unknown" ? "partial_rate" as const : status,
        }
      })
      .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name)),
  }
}

/** Build the selected local civil day in one-hour steps (23/24/25 over DST). */
export function makeHourlySlots(points: TimedBarChartPoint[], day: Date, now = new Date()): HourlySlot[] {
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)
  const pointByHour = new Map<number, TimedBarChartPoint>()
  const dayKey = localDateKey(day)
  const today = dayKey === localDateKey(now)

  for (const point of points) {
    const raw = point.startAt?.trim()
    if (!raw) continue
    const timestamp = new Date(raw)
    if (Number.isNaN(timestamp.getTime()) || localDateKey(timestamp) !== dayKey) continue
    const key = hourStart(timestamp).getTime()
    pointByHour.set(key, mergeHourlyPoint(pointByHour.get(key), point))
  }

  const slots: HourlySlot[] = []
  for (let startMs = startOfDay.getTime(); startMs < endOfDay.getTime(); startMs += 60 * 60 * 1_000) {
    const start = new Date(startMs)
    const end = new Date(Math.min(startMs + 60 * 60 * 1_000, endOfDay.getTime()))
    const source = pointByHour.get(startMs)
    slots.push({
      label: source?.label || formatHourLabel(start),
      value: source?.value ?? 0,
      valueLabel: source?.valueLabel ?? null,
      costUsd: source ? pointCostUsd(source) : 0,
      estimationStatus: source?.estimationStatus ?? "historical_rate",
      modelUsage: source?.modelUsage ?? [],
      startAt: source?.startAt ?? start.toISOString(),
      date: localDateKey(start),
      start,
      end,
      current: today && now >= start && now < end,
      future: today && start > now,
    })
  }
  return slots
}

/**
 * Build an exact calendar window. ccusage omits elapsed days with no events,
 * so those dates are truthful zeroes rather than missing observations.
 */
export function normalizeCalendarDays(points: TimedBarChartPoint[], dayCount: number, now = new Date()) {
  const byDate = new Map<string, TimedBarChartPoint>()
  for (const point of points) {
    const date = pointDate(point, now)
    if (!date) continue
    byDate.set(localDateKey(date), point)
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - (dayCount - 1))

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = localDateKey(date)
    const point = byDate.get(key)
    if (point) return { ...point, startAt: point.startAt ?? key, date: point.date ?? key }
    return {
      label: formatDayLabel(date),
      value: 0,
      valueLabel: null,
      costUsd: 0,
      estimationStatus: "historical_rate",
      modelUsage: [],
      startAt: key,
      date: key,
    } satisfies TimedBarChartPoint
  })
}
