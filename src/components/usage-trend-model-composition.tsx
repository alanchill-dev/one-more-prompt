import { useState } from "react"
import type { BarChartPoint } from "@/lib/plugin-types"
import { useI18n } from "@/hooks/use-i18n"
import { formatEditorialValue } from "@/components/usage-trend-utils"
import { canonicalModelName } from "@/lib/model-colors"
import { formatCountNumber } from "@/lib/utils"
import { useTrendMetric, type TrendMetric } from "@/components/usage-trend-metric"

export type ModelShare = { name: string; tokens: number; share: number; costUsd?: number | null }

const MAX_VISIBLE_MODEL_SERIES = 5
const RANK_MODEL_COLORS = [
  "var(--trend-model-rank-1)",
  "var(--trend-model-rank-2)",
  "var(--trend-model-rank-3)",
  "var(--trend-model-rank-4)",
  "var(--trend-model-rank-5)",
] as const
const RANK_MODEL_SURFACES = [
  "var(--trend-model-surface-rank-1)",
  "var(--trend-model-surface-rank-2)",
  "var(--trend-model-surface-rank-3)",
  "var(--trend-model-surface-rank-4)",
  "var(--trend-model-surface-rank-5)",
] as const

export function modelOrderIndex(name: string, order: Map<string, number>) {
  return order.get(canonicalModelName(name)) ?? order.get(name) ?? Number.MAX_SAFE_INTEGER
}

function orderedModelNames(order: Map<string, number>) {
  return [...order.entries()]
    .sort(([, left], [, right]) => left - right)
    .map(([name]) => canonicalModelName(name))
}

function visibleModelNames(order: Map<string, number>) {
  return new Set([...new Set(orderedModelNames(order))].slice(0, MAX_VISIBLE_MODEL_SERIES))
}

export function isVisibleModel(name: string, order: Map<string, number>) {
  return visibleModelNames(order).has(canonicalModelName(name))
}

export function modelNamesMatch(left: string, right: string) {
  return canonicalModelName(left) === canonicalModelName(right)
}

function aggregateModelUsage(points: BarChartPoint[]) {
  const totals = new Map<string, { tokens: number; costUsd: number | null }>()
  for (const point of points) {
    for (const model of point.modelUsage ?? []) {
      const name = canonicalModelName(model.name)
      if (!name || model.tokens == null || !Number.isFinite(model.tokens) || model.tokens <= 0) continue
      const total = totals.get(name) ?? { tokens: 0, costUsd: null }
      total.tokens += model.tokens
      if (model.costUsd != null && Number.isFinite(model.costUsd) && model.costUsd >= 0) {
        total.costUsd = (total.costUsd ?? 0) + model.costUsd
      }
      totals.set(name, total)
    }
  }
  return [...totals.entries()]
    .map(([name, usage]) => ({ name, ...usage }))
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
}

export function makeModelColorOrder(points: BarChartPoint[]) {
  return new Map(aggregateModelUsage(points).map((model, index) => [model.name, index]))
}

export function makeModelShares(points: BarChartPoint[], metric: TrendMetric = "tokens"): ModelShare[] {
  const models = aggregateModelUsage(points)
  const total = models.reduce((sum, model) => sum + (metric === "cost" ? model.costUsd ?? 0 : model.tokens), 0)
  if (total <= 0) return []
  return metric === "cost"
    ? models.filter((model) => model.costUsd != null && model.costUsd > 0)
      .map((model) => ({ ...model, share: (model.costUsd ?? 0) / total }))
    : models.map(({ name, tokens }) => ({ name, tokens, share: tokens / total }))
}

function rankColorIndex(name: string, order: Map<string, number>) {
  const index = modelOrderIndex(name, order)
  return Math.min(RANK_MODEL_COLORS.length - 1, Math.max(0, index))
}

export function modelColor(name: string, order: Map<string, number>) {
  return RANK_MODEL_COLORS[rankColorIndex(name, order)]
}

export function modelSurfaceColor(name: string, order: Map<string, number>) {
  return RANK_MODEL_SURFACES[rankColorIndex(name, order)]
}

function formatPercent(value: number) {
  if (value > 0 && value < 0.001) return "<0.1%"
  return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value)
}

function compactShares(shares: ModelShare[], otherLabel: string, colorOrder: Map<string, number>, metric: TrendMetric): ModelShare[] {
  const visible = shares
    .filter((model) => isVisibleModel(model.name, colorOrder))
    .sort((left, right) => modelOrderIndex(left.name, colorOrder) - modelOrderIndex(right.name, colorOrder))
  const rest = shares.filter((model) => !isVisibleModel(model.name, colorOrder))
  if (rest.length === 0) return visible
  return [
    ...visible,
    {
      name: otherLabel,
      tokens: rest.reduce((sum, model) => sum + model.tokens, 0),
      share: rest.reduce((sum, model) => sum + model.share, 0),
      ...(metric === "cost" ? { costUsd: rest.reduce((sum, model) => sum + (model.costUsd ?? 0), 0) } : {}),
    },
  ]
}

const SMALL_MODEL_SHARE = 0.03

function modelGeometry(models: ModelShare[]) {
  const total = models.reduce((sum, model) => sum + model.share, 0)
  let cumulative = 0
  return models.map((model) => {
    const share = model.share / total
    const start = cumulative
    cumulative += share
    return { share, center: start + share / 2 }
  })
}

export function UsageTrendModelComposition({
  shares,
  colorOrder,
  revealKey,
  onActiveModelChange,
  onEditModel,
  metric = "tokens",
}: {
  shares: ModelShare[]
  colorOrder: Map<string, number>
  revealKey: string
  onActiveModelChange?: (name: string | null) => void
  onEditModel?: (name: string) => void
  metric?: TrendMetric
}) {
  const t = useI18n()
  const { formatAmount } = useTrendMetric(metric)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  if (shares.length === 0) return null
  const otherLabel = t("overview.otherModels")
  const compact = compactShares(shares, otherLabel, colorOrder, metric)
  const geometry = modelGeometry(compact)
  const showDetails = hovered || focused
  const accessibleAmount = (model: ModelShare) => metric === "cost"
    ? formatAmount(model.costUsd ?? null)
    : `${formatCountNumber(model.tokens)} ${t("overview.tokenUnit")}`
  const visibleAmount = (model: ModelShare) => metric === "cost"
    ? formatAmount(model.costUsd ?? null)
    : `${formatEditorialValue(model.tokens)} ${t("overview.tokenUnit")}`

  function activateModel(index: number, name: string, interaction: "hover" | "focus") {
    setActiveIndex(index)
    if (interaction === "hover") setHovered(true)
    else setFocused(true)
    onActiveModelChange?.(name)
  }

  function releaseModel(interaction: "hover" | "focus") {
    if (interaction === "hover") {
      setHovered(false)
      if (!focused) onActiveModelChange?.(null)
    } else {
      setFocused(false)
      if (!hovered) onActiveModelChange?.(null)
    }
  }

  return (
    <section
      className="mt-3 px-1 sm:px-3"
      aria-label={t("overview.modelMix")}
      data-testid="usage-trend-model-composition"
      data-reveal-key={revealKey}
      data-interacting={showDetails}
    >
      <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground" data-testid="usage-trend-model-composition-title">
          {t("overview.modelMix")}
        </p>
      </div>
      <div className="relative h-16" data-testid="usage-trend-model-band-stage">
        {compact.map((model, index) => {
          const { center } = geometry[index]
          const small = geometry[index].share < SMALL_MODEL_SHARE
          const active = showDetails && index === activeIndex
          return (
            <span
              key={model.name}
              className={`absolute top-6 z-20 ${small && center > 0.82 ? "-translate-x-full" : small && center < 0.18 ? "" : "-translate-x-1/2"}`}
              style={{ left: `${center * 100}%` }}
            >
              {!small ? (
                <button
                  type="button"
                  className="trend-model-direct-label trend-model-row-reveal flex min-h-9 max-w-36 flex-col items-center justify-start whitespace-nowrap border-0 bg-transparent px-1.5 pt-1 text-[10px] font-semibold leading-none text-[color:var(--trend-foreground)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-active={active}
                  data-testid={`usage-trend-model-label-${index}`}
                  onPointerEnter={() => activateModel(index, model.name, "hover")}
                  onPointerLeave={() => releaseModel("hover")}
                  onFocus={() => activateModel(index, model.name, "focus")}
                  onBlur={() => releaseModel("focus")}
                  onClick={() => model.name !== otherLabel && onEditModel?.(model.name)}
                  style={{ animationDelay: `${1580 + index * 65}ms` }}
                  aria-label={`${index + 1}. ${model.name}, ${accessibleAmount(model)}, ${formatPercent(model.share)}`}
                >
                  <span>{model.name}</span>
                  {active ? (
                    <span role="tooltip" className="trend-model-row-reveal mt-1 block text-[8px] font-semibold tabular-nums text-muted-foreground" data-testid={`usage-trend-model-token-${index}`}>
                      {visibleAmount(model)}
                    </span>
                  ) : null}
                </button>
              ) : null}
              {small && active ? (
                <span
                  role="tooltip"
                  className="trend-model-mini-card pointer-events-none block whitespace-nowrap border border-[color:var(--trend-grid)] bg-[var(--background)] px-2.5 py-2 text-left"
                  data-testid="usage-trend-model-mini-card"
                >
                  <strong className="block text-[10px] font-semibold text-[color:var(--trend-foreground)]">{model.name} · {formatPercent(model.share)}</strong>
                  <span className="mt-0.5 block text-[8px] font-semibold tabular-nums text-muted-foreground">{visibleAmount(model)}</span>
                </span>
              ) : null}
            </span>
          )
        })}
        {compact.map((model, index) => geometry[index].share >= SMALL_MODEL_SHARE || showDetails && index === activeIndex ? (
          <span
            key={model.name}
            className="trend-model-label-leader pointer-events-none absolute top-[18px] h-1.5 w-px bg-[var(--trend-grid)]"
            data-active={showDetails && index === activeIndex}
            style={{ left: `${geometry[index].center * 100}%`, animationDelay: `${1500 + index * 55}ms` }}
            aria-hidden="true"
          />
        ) : null)}
        <div className="trend-model-band absolute inset-x-0 top-0 flex h-[18px]" data-testid="usage-trend-model-band">
          {compact.map((model, index) => {
            const active = showDetails && index === activeIndex
            return (
            <button
              key={model.name}
              type="button"
              className="trend-model-band-segment trend-model-segment-reveal relative flex min-w-0 items-center justify-center overflow-visible border-0 p-0 outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
              data-active={showDetails && index === activeIndex}
              data-small={geometry[index].share < SMALL_MODEL_SHARE}
              data-testid={`usage-trend-model-segment-${index}`}
              onPointerEnter={() => activateModel(index, model.name, "hover")}
              onPointerLeave={() => releaseModel("hover")}
              onFocus={() => activateModel(index, model.name, "focus")}
              onBlur={() => releaseModel("focus")}
              onClick={() => onEditModel?.(model.name)}
              style={{
                width: `${geometry[index].share * 100}%`,
                backgroundColor: model.name === otherLabel
                  ? "var(--trend-model-other)"
                  : active
                    ? modelColor(model.name, colorOrder)
                    : modelSurfaceColor(model.name, colorOrder),
                animationDelay: `${1320 + index * 95}ms`,
              }}
              aria-label={`${index + 1}. ${model.name}, ${accessibleAmount(model)}, ${formatPercent(model.share)}`}
            >
              {geometry[index].share >= SMALL_MODEL_SHARE ? (
                <span className="trend-model-band-percent relative z-10 text-[9px] font-semibold tabular-nums" data-compact={geometry[index].share < 0.08} aria-hidden="true">
                  {formatPercent(model.share)}
                </span>
              ) : null}
            </button>
            )
          })}
        </div>
      </div>
      <ol className="sr-only" data-testid="usage-trend-model-ranking">
        {compact.map((model, index) => (
          <li key={model.name}>{index + 1}. {model.name}, {accessibleAmount(model)}, {formatPercent(model.share)}</li>
        ))}
      </ol>
    </section>
  )
}

export function DailyModelComposition({
  shares,
  colorOrder,
  showLabel = true,
  metric = "tokens",
}: {
  shares: ModelShare[]
  colorOrder: Map<string, number>
  showLabel?: boolean
  metric?: TrendMetric
}) {
  const t = useI18n()
  const { formatAmount } = useTrendMetric(metric)
  if (shares.length === 0) return null

  return (
    <div className="mt-2 border-t border-[color:var(--trend-grid)] pt-2" data-testid="usage-trend-daily-models">
      {showLabel ? (
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("overview.dailyModelMix")}
        </p>
      ) : null}
      <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-[10px]">
        {shares.map((model) => (
          <div key={model.name} className="contents">
            <dt className="flex min-w-0 items-center gap-1.5">
              <span className="size-1.5 shrink-0" style={{ backgroundColor: modelColor(model.name, colorOrder) }} aria-hidden="true" />
              <span className="truncate">{model.name}</span>
            </dt>
            <dd className="text-right tabular-nums text-muted-foreground">{metric === "cost" ? formatAmount(model.costUsd ?? null) : formatCountNumber(model.tokens)}</dd>
            <dd className="text-right font-semibold tabular-nums">{formatPercent(model.share)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
