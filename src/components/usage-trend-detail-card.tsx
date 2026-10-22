import "./usage-trend-detail-card.css"
import { useLayoutEffect, useRef, type PointerEvent } from "react"
import { ArrowUpRight, Clock, FolderSimple } from "@phosphor-icons/react"
import { formatEditorialValue } from "@/components/usage-trend-utils"
import { modelColor, type ModelShare } from "@/components/usage-trend-model-composition"
import { useI18n } from "@/hooks/use-i18n"
import type { PromptUsageViewMode } from "@/stores/app-ui-store"
import type { SharedElementRect } from "@/components/shared-element-morph"
import type { PricingEstimationStatus } from "@/bindings"
import { useTrendMetric, type TrendMetric } from "@/components/usage-trend-metric"

export type UsageTrendDetailMetric = { label: string; value: string }
export type UsageTrendDrilldownGeometry = { cardRect: SharedElementRect; actionRect: SharedElementRect }

type UsageTrendDetailCardProps = {
  id: string
  x: number
  y: number
  chartWidth: number
  chartHeight: number
  eyebrow: string
  total: string
  metric?: TrendMetric
  estimationStatus?: PricingEstimationStatus | null
  shares: ModelShare[]
  colorOrder: Map<string, number>
  metrics: UsageTrendDetailMetric[]
  actionLabel: string
  onAction: (geometry: UsageTrendDrilldownGeometry, destination: PromptUsageViewMode) => void
  onHeightChange?: (height: number) => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  onFocusCapture?: () => void
  onBlurCapture?: () => void
  testId: string
}

export const USAGE_TREND_DETAIL_CARD_WIDTH = 276
export const USAGE_TREND_DETAIL_CARD_HEIGHT = 410
export const USAGE_TREND_DETAIL_CARD_GAP = 18

export type UsageTrendDetailCardLayout = {
  left: number
  top: number
  width: number
  height: number
  side: "left" | "right"
}

export function getUsageTrendDetailCardLayout({
  x,
  y,
  chartWidth,
  chartHeight,
}: {
  x: number
  y: number
  chartWidth: number
  chartHeight: number
}): UsageTrendDetailCardLayout {
  const placeRight = x + USAGE_TREND_DETAIL_CARD_GAP + USAGE_TREND_DETAIL_CARD_WIDTH <= chartWidth - 8
  const left = placeRight
    ? x + USAGE_TREND_DETAIL_CARD_GAP
    : Math.max(8, x - USAGE_TREND_DETAIL_CARD_GAP - USAGE_TREND_DETAIL_CARD_WIDTH)
  const top = Math.max(
    8,
    Math.min(chartHeight - USAGE_TREND_DETAIL_CARD_HEIGHT - 8, y - USAGE_TREND_DETAIL_CARD_HEIGHT * 0.42),
  )
  return {
    left,
    top,
    width: USAGE_TREND_DETAIL_CARD_WIDTH,
    height: USAGE_TREND_DETAIL_CARD_HEIGHT,
    side: placeRight ? "right" : "left",
  }
}

function percent(value: number): string {
  if (value > 0 && value < 0.001) return "<0.1%"
  return new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value)
}

export function TrendWorkspaceContent({ destination }: { destination: PromptUsageViewMode }) {
  const t = useI18n()
  const isProject = destination === "hierarchy"
  const Icon = isProject ? FolderSimple : Clock
  return (
    <span className="trend-workspace-content" data-destination={destination}>
      <span className="trend-workspace-heading">
        <Icon className="trend-detail-action-icon" weight="duotone" aria-hidden="true" />
        <span className="trend-detail-action-label">{t(isProject ? "promptUsage.viewHierarchy" : "promptUsage.viewTimeline")}</span>
        <ArrowUpRight className="trend-detail-action-arrow" weight="bold" aria-hidden="true" />
      </span>
      <span className={`trend-workspace-scene ${isProject ? "trend-workspace-project" : "trend-workspace-timeline"}`} aria-hidden="true">
        <span className="trend-workspace-depth">
          {[0, 1, 2].map((index) => (
            <span key={index} className={isProject ? "trend-workspace-column" : "trend-workspace-event"}>
              <i /><i /><i />
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

function trackWorkspacePointer(event: PointerEvent<HTMLButtonElement>) {
  if (event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
  const button = event.currentTarget
  button.dataset.workspaceHover = "true"
  const rect = button.getBoundingClientRect()
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  button.style.setProperty("--workspace-x", `${x * 100}%`)
  button.style.setProperty("--workspace-y", `${y * 100}%`)
  button.style.setProperty("--workspace-dx", `${(x - 0.5) * 6}px`)
  button.style.setProperty("--workspace-dy", `${(y - 0.5) * 6}px`)
}

export function UsageTrendDetailCard({
  id,
  x,
  y,
  chartWidth,
  chartHeight,
  eyebrow,
  total,
  metric = "tokens",
  estimationStatus,
  shares,
  colorOrder,
  metrics,
  actionLabel,
  onAction,
  onHeightChange,
  onPointerEnter,
  onPointerLeave,
  onFocusCapture,
  onBlurCapture,
  testId,
}: UsageTrendDetailCardProps) {
  const t = useI18n()
  const { formatAmount, unit } = useTrendMetric(metric)
  const layout = getUsageTrendDetailCardLayout({ x, y, chartWidth, chartHeight })
  const visibleShares = shares.slice(0, 5)
  const cardRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || !onHeightChange) return
    const measure = () => {
      if (card.offsetHeight > 0) onHeightChange(card.offsetHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    return () => observer.disconnect()
  }, [onHeightChange])

  return (
    <aside
      ref={cardRef}
      id={id}
      role="dialog"
      aria-label={`${eyebrow} · ${total}`}
      data-testid={testId}
      data-trend-detail-card="true"
      data-side={layout.side}
      className="trend-detail-card pointer-events-auto absolute z-20 w-[276px] overflow-hidden rounded-[16px] border border-border/70 bg-popover/95 text-popover-foreground shadow-[0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl"
      style={{ left: layout.left, top: layout.top }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <div className="px-4 pb-3 pt-3.5">
        <span className="block text-[10px] font-medium text-muted-foreground">{eyebrow}</span>
        <div className="mt-0.5 flex items-end justify-between gap-3">
          <strong className="text-[24px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-foreground">{total}</strong>
          <span className="pb-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--trend-hero)]">{unit}</span>
        </div>
        {metric === "cost" && (estimationStatus === "partial_rate" || estimationStatus === "unknown" || estimationStatus == null) ? (
          <p className="mt-2 text-[9px] text-muted-foreground">{t(estimationStatus === "partial_rate" ? "cost.partialRateEstimate" : "cost.notIncluded")}</p>
        ) : null}

        {visibleShares.length > 0 ? (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
              {visibleShares.map((share) => (
                <span key={share.name} style={{ width: `${share.share * 100}%`, backgroundColor: modelColor(share.name, colorOrder) }} />
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {visibleShares.map((share) => (
                <div key={share.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[10px]">
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: modelColor(share.name, colorOrder) }} aria-hidden="true" />
                    <span className="truncate">{share.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{metric === "cost" ? formatAmount(share.costUsd ?? null) : formatEditorialValue(share.tokens)}</span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{percent(share.share)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {metrics.length > 0 ? (
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-border/50 pt-2.5 text-[9px]">
            {metrics.map((metric) => (
              <div key={metric.label} className="contents">
                <dt className="truncate text-muted-foreground">{metric.label}</dt>
                <dd className="text-right font-semibold tabular-nums text-foreground">{metric.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="mx-3 mb-3">
        <p className="mb-2 px-1 text-[9px] font-medium text-muted-foreground">{actionLabel}</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { destination: "hierarchy", label: t("overview.openInProjects") },
            { destination: "timeline", label: t("overview.openInTimeline") },
          ] as const).map(({ destination, label }) => (
            <button
              key={destination}
              type="button"
              aria-label={label}
              className="trend-detail-action"
              onPointerEnter={trackWorkspacePointer}
              onPointerMove={trackWorkspacePointer}
              onPointerLeave={(event) => {
                delete event.currentTarget.dataset.workspaceHover
                for (const property of ["--workspace-x", "--workspace-y", "--workspace-dx", "--workspace-dy"]) {
                  event.currentTarget.style.removeProperty(property)
                }
              }}
              onClick={(event) => {
                const actionRect = event.currentTarget.getBoundingClientRect()
                const cardRect = event.currentTarget.closest("aside")?.getBoundingClientRect() ?? actionRect
                onAction({
                  actionRect: { left: actionRect.left, top: actionRect.top, width: actionRect.width, height: actionRect.height },
                  cardRect: { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: cardRect.height },
                }, destination)
              }}
            >
              <TrendWorkspaceContent destination={destination} />
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
