import type { TimedBarChartPoint } from "@/components/usage-trend-utils"
import {
  isVisibleModel,
  modelColor,
  modelSurfaceColor,
  modelNamesMatch,
  modelOrderIndex,
} from "@/components/usage-trend-model-composition"
import { canonicalModelName } from "@/lib/model-colors"
import { trendTokenValue, type TrendMetric } from "@/components/usage-trend-metric"
import { pointCostUsd } from "@/components/usage-trend-utils"

export type StackedColumnCoordinate = { x: number; y: number }
export type StackedColumnPlot = { left: number; right: number; top: number; bottom: number }

type Segment = {
  key: string
  kind: "model" | "other" | "unattributed"
  name: string
  tokens: number
  amount: number
  fill: string
  accent: string
}

const OTHER_COLOR = "var(--trend-model-other)"
const UNATTRIBUTED_COLOR = "var(--trend-data-secondary)"
const COLUMN_GAP_RATIO = 0.42
const MAX_COLUMN_WIDTH = 42

export function getStackedColumnWidth(
  coordinates: readonly StackedColumnCoordinate[],
  plot: StackedColumnPlot,
  chartWidth: number,
) {
  const steps = coordinates
    .slice(1)
    .map((coordinate, index) => Math.abs(coordinate.x - coordinates[index].x))
    .filter((step) => step > 0)
  const plotWidth = Math.max(1, Math.min(chartWidth, plot.right) - plot.left)
  const bucketWidth = steps.length > 0 ? Math.min(...steps) : plotWidth
  return Math.max(1, Math.min(MAX_COLUMN_WIDTH, bucketWidth * (1 - COLUMN_GAP_RATIO)))
}

function makeSegments(
  point: TimedBarChartPoint,
  colorOrder: Map<string, number>,
  otherLabel: string,
  unattributedLabel: string,
  metric: TrendMetric,
): Segment[] {
  const totals = new Map<string, { tokens: number; amount: number }>()
  for (const model of point.modelUsage ?? []) {
    const name = canonicalModelName(model.name)
    const tokens = model.tokens
    if (!name || tokens == null || !Number.isFinite(tokens) || tokens <= 0) continue
    const total = totals.get(name) ?? { tokens: 0, amount: 0 }
    total.tokens += tokens
    total.amount += metric === "cost"
      ? model.costUsd != null && Number.isFinite(model.costUsd) && model.costUsd >= 0 ? model.costUsd : 0
      : tokens
    totals.set(name, total)
  }

  const models = [...totals.entries()]
  const fixed = models
    .filter(([name, usage]) => isVisibleModel(name, colorOrder) && usage.amount > 0)
    .sort(([left], [right]) => modelOrderIndex(left, colorOrder) - modelOrderIndex(right, colorOrder) || left.localeCompare(right))
    .map(([name, usage]) => ({
      key: `model:${name}`,
      kind: "model" as const,
      name,
      ...usage,
      fill: modelSurfaceColor(name, colorOrder),
      accent: modelColor(name, colorOrder),
    }))
  const other = models
    .filter(([name]) => !isVisibleModel(name, colorOrder))
    .reduce((total, [, usage]) => ({ tokens: total.tokens + usage.tokens, amount: total.amount + usage.amount }), { tokens: 0, amount: 0 })
  const modelTotal = models.reduce((sum, [, usage]) => sum + usage.amount, 0)
  const unattributedAmount = metric === "cost" && pointCostUsd(point) == null
    ? 0 : Math.max(0, point.value - modelTotal)
  const unattributedTokens = Math.max(0, trendTokenValue(point) - models.reduce((sum, [, usage]) => sum + usage.tokens, 0))

  return [
    ...fixed,
    ...(other.amount > 0 ? [{ key: "other", kind: "other" as const, name: otherLabel, ...other, fill: OTHER_COLOR, accent: OTHER_COLOR }] : []),
    ...(unattributedAmount > 0 ? [{ key: "unattributed", kind: "unattributed" as const, name: unattributedLabel, tokens: unattributedTokens, amount: unattributedAmount, fill: UNATTRIBUTED_COLOR, accent: UNATTRIBUTED_COLOR }] : []),
  ]
}

function roundedTopPath(x: number, y: number, width: number, height: number) {
  const radius = Math.min(3, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `V ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `H ${x + width - radius}`,
    `Q ${x + width} ${y} ${x + width} ${y + radius}`,
    `V ${y + height}`,
    "Z",
  ].join(" ")
}

export function UsageTrendStackedColumns({
  points,
  coordinates,
  plot,
  chartWidth,
  colorOrder,
  peakIndex,
  activeIndex,
  activeModelName = null,
  idPrefix,
  otherLabel = "Other",
  unattributedLabel = "Unattributed",
  metric = "tokens",
}: {
  points: readonly TimedBarChartPoint[]
  coordinates: readonly StackedColumnCoordinate[]
  plot: StackedColumnPlot
  chartWidth: number
  colorOrder: Map<string, number>
  peakIndex: number
  activeIndex: number | null
  activeModelName?: string | null
  idPrefix: string
  otherLabel?: string
  unattributedLabel?: string
  metric?: TrendMetric
}) {
  const columnWidth = getStackedColumnWidth(coordinates, plot, chartWidth)

  return (
    <g data-testid={`${idPrefix}-stacked-columns`} data-column-width={columnWidth} data-model-highlight={activeModelName != null || undefined}>
      {points.map((point, index) => {
        const coordinate = coordinates[index]
        if (!coordinate || !Number.isFinite(point.value) || point.value <= 0) return null
        const top = Math.max(plot.top, Math.min(plot.bottom, coordinate.y))
        const totalHeight = plot.bottom - top
        if (totalHeight <= 0) return null
        const x = Math.max(plot.left, Math.min(plot.right - columnWidth, coordinate.x - columnWidth / 2))
        const centerX = x + columnWidth / 2
        const segments = makeSegments(point, colorOrder, otherLabel, unattributedLabel, metric)
        const segmentTotal = segments.reduce((sum, segment) => sum + segment.amount, 0)
        let bottom = plot.bottom
        const separatorYs: number[] = []

        const rendered = segments.map((segment, segmentIndex) => {
          const height = segmentTotal > 0 ? totalHeight * (segment.amount / segmentTotal) : 0
          if (height <= 0) return null
          const y = bottom - height
          bottom = y
          const topSegment = segmentIndex === segments.length - 1
          if (!topSegment) separatorYs.push(y)
          const highlighted = activeModelName != null && modelNamesMatch(segment.name, activeModelName)
          const sharedProps = {
            className: "trend-model-column-segment",
            fill: highlighted ? segment.accent : segment.fill,
            "data-model-highlighted": highlighted || undefined,
            "data-segment-kind": segment.kind,
            "data-model": segment.name,
            "data-tokens": segment.tokens,
            "data-cost-usd": metric === "cost" ? segment.amount : undefined,
            "data-y": y,
            "data-height": height,
            "data-testid": `${idPrefix}-column-${index}-segment-${segmentIndex}`,
          }
          return topSegment ? (
            <path key={segment.key} {...sharedProps} d={roundedTopPath(x, y, columnWidth, height)} />
          ) : (
            <rect key={segment.key} {...sharedProps} x={x} y={y} width={columnWidth} height={height} />
          )
        })

        return (
          <g
            key={point.startAt ?? `${point.label}-${index}`}
            className="trend-stacked-column-reveal"
            style={{ animationDelay: `${260 + Math.round((index / Math.max(1, points.length - 1)) * 620)}ms` }}
            data-testid={`${idPrefix}-column-${index}`}
            data-guide-target={index === peakIndex ? `${idPrefix}-peak-column` : undefined}
            data-active={index === activeIndex || undefined}
            data-tokens={trendTokenValue(point)}
            data-cost-usd={metric === "cost" ? pointCostUsd(point) : undefined}
            data-model-overflow={Math.max(0, segmentTotal - point.value) || undefined}
          >
            {rendered}
            {separatorYs.map((separatorY, separatorIndex) => (
              <line
                key={`separator:${separatorIndex}`}
                x1={x}
                x2={x + columnWidth}
                y1={separatorY}
                y2={separatorY}
                stroke="var(--background)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                data-testid={`${idPrefix}-column-${index}-separator-${separatorIndex}`}
              />
            ))}
            {index === activeIndex ? (
              <path
                d={roundedTopPath(x - 1, top - 1, columnWidth + 2, totalHeight + 1)}
                fill="none"
                stroke="var(--trend-foreground)"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
                data-testid={`${idPrefix}-active-outline`}
              />
            ) : null}
            {index === peakIndex ? (
              <line
                x1={centerX - Math.min(5, columnWidth / 3)}
                x2={centerX + Math.min(5, columnWidth / 3)}
                y1={top - 3}
                y2={top - 3}
                stroke="var(--trend-hero)"
                strokeWidth="1.8"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                data-testid={`${idPrefix}-peak-marker`}
              />
            ) : null}
          </g>
        )
      })}
    </g>
  )
}
