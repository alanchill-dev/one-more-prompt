import { Fragment, useMemo } from "react"
import { ArrowSquareOut, ArrowsClockwise, ChartBar, Hourglass, Pulse, WarningCircle } from "@phosphor-icons/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SkeletonLines } from "@/components/skeleton-lines"
import { UsageSparkline } from "@/components/usage-sparkline"
import { PluginError } from "@/components/plugin-error"
import { ProviderIconMask } from "@/components/provider-icon-mask"
import { OverviewQuotaSections } from "@/components/overview-quota-sections"
import { ResetCreditsDetail } from "@/components/reset-credits-detail"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useI18n } from "@/hooks/use-i18n"
import { useApiEquivalentEstimate } from "@/hooks/use-api-equivalent-estimate"
import type { TranslationKey } from "@/lib/i18n"
import { getAdaptiveBarColor } from "@/lib/color"
import { REFRESH_COOLDOWN_MS, type DisplayCurrency, type DisplayMode, type ResetTimerDisplayMode } from "@/lib/settings"
import type { ManifestLine, MetricLine, PluginLink } from "@/lib/plugin-types"
import { parseModelBreakdownValue } from "@/lib/model-breakdown-format"
import {
  modelBreakdownDetailLines,
  parseProviderPeriodTotal,
  type ModelCostBasis,
} from "@/lib/today-models"
import { groupLinesByType } from "@/lib/group-lines-by-type"
import { selectEscalatedLine } from "@/lib/metric-escalation"
import { clamp01, cn, formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"
import {
  formatResetAbsoluteLabel,
  formatResetRelativeLabel,
  formatResetTooltipText,
} from "@/lib/reset-tooltip"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

interface ProviderCardProps {
  name: string
  /** Hide the provider identity row when the parent page already establishes
   * the Codex context. The metric body and refresh state remain unchanged. */
  showHeader?: boolean
  plan?: string
  links?: PluginLink[]
  showSeparator?: boolean
  /** Card layout: logo + name + plan sit above a bordered body. Used on the
   * Overview page; the detail view keeps the flat separator layout. */
  asCard?: boolean
  iconUrl?: string
  pluginId?: string
  loading?: boolean
  error?: string | null
  lines?: MetricLine[]
  skeletonLines?: ManifestLine[]
  lastManualRefreshAt?: number | null
  lastUpdatedAt?: number | null
  onRetry?: () => void
  scopeFilter?: "overview" | "all"
  displayMode: DisplayMode
  resetTimerDisplayMode?: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
  onUsageValueToggle?: () => void
  /** Dedicated overview treatment for a provider's independent usage windows. */
  presentation?: "standard" | "quota-grid"
}

function isAccountSnapshotLine(line: MetricLine) {
  const label = line.label.toLocaleLowerCase()
  return label.includes("rate limit") || label.includes("credit")
}

type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string

const QUOTA_LABEL_KEYS: Record<string, TranslationKey> = {
  Status: "quota.link.status",
  "Usage Dashboard": "quota.link.usageDashboard",
  Session: "quota.metric.session",
  Weekly: "quota.metric.weekly",
  Spark: "quota.metric.spark",
  "Spark Weekly": "quota.metric.sparkWeekly",
  Reviews: "quota.metric.reviews",
  "Rate Limit Resets": "quota.metric.rateLimitResets",
  Credits: "quota.metric.credits",
  "Monthly Credit Limit": "quota.metric.monthlyCreditLimit",
  Today: "quota.metric.today",
  Yesterday: "quota.metric.yesterday",
  "Last 30 Days": "quota.metric.last30Days",
}

function localizeQuotaLabel(t: Translator, label: string): string {
  const key = QUOTA_LABEL_KEYS[label]
  return key ? t(key) : label
}

function localizeQuotaValue(t: Translator, label: string, value: string, formatAmount: (usd: number | null) => string | null, currency: DisplayCurrency): string {
  if (label === "Rate Limit Resets") {
    const available = value.match(/^(\d+) available$/)
    if (available) return t("quota.availableCount", { count: available[1]! })
  }
  if (label === "Credits") {
    const credits = value.match(/^(.*?)([\d,.]+) credits$/)
    if (credits) {
      const usd = credits[1]!.match(/^\$([\d,]+(?:\.\d+)?) · $/)
      const amount = usd ? formatAmount(Number(usd[1]!.replace(/,/g, ""))) : null
      const prefix = usd ? `${amount == null ? t("cost.exchangeUnavailable") : `${amount} ${currency}`} · ` : credits[1]
      return `${prefix}${t("quota.creditCount", { count: credits[2]! })}`
    }
  }
  return value
}

function formatQuotaCount(t: Translator, value: number, suffix: string): string {
  const count = formatCountNumber(value)
  return suffix.toLowerCase() === "credits" ? t("quota.creditCount", { count }) : `${count} ${suffix}`
}

function formatRelativeTime(diffMs: number, t: Translator): string {
  const seconds = Math.floor(Math.max(0, diffMs) / 1000)
  if (seconds < 60) return t("quota.relativeJustNow")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t("quota.relativeMinutesAgo", { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("quota.relativeHoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  return t("quota.relativeDaysAgo", { count: days })
}

export function ProviderCard({
  name,
  showHeader = true,
  plan,
  links = [],
  showSeparator = true,
  asCard = false,
  iconUrl,
  pluginId,
  loading = false,
  error = null,
  lines = [],
  skeletonLines = [],
  lastManualRefreshAt,
  lastUpdatedAt,
  onRetry,
  scopeFilter = "all",
  displayMode,
  resetTimerDisplayMode = "relative",
  onResetTimerDisplayModeToggle,
  onUsageValueToggle,
  presentation = "standard",
}: ProviderCardProps) {
  const t = useI18n()
  const { formatAmount, displayCurrency } = useApiEquivalentEstimate(null, "unknown", 2)
  const isDark = useDarkMode()
  const cooldownRemainingMs = useMemo(() => {
    if (!lastManualRefreshAt) return 0
    const remaining = REFRESH_COOLDOWN_MS - (Date.now() - lastManualRefreshAt)
    return remaining > 0 ? remaining : 0
  }, [lastManualRefreshAt])

  // Runtime-generated per-model lines (not declared in the manifest) get a
  // decluttered rendering: percent only, costs in a tooltip.
  const manifestLabels = useMemo(() => new Set(skeletonLines.map((line) => line.label)), [skeletonLines])

  // Overview scope shows only manifest lines marked "overview". Runtime lines
  // are matched by label so runtime-only lines (e.g. model breakdowns) stay
  // detail-only. The detail view (scopeFilter "all") shows every line.
  const isOverview = scopeFilter === "overview"
  const overviewLabels = useMemo(
    () => new Set(skeletonLines.filter((line) => line.scope === "overview").map((line) => line.label)),
    [skeletonLines],
  )
  const filteredSkeletonLines = isOverview
    ? skeletonLines.filter((line) => line.scope === "overview")
    : skeletonLines
  const filteredLines = isOverview ? lines.filter((line) => overviewLabels.has(line.label)) : lines

  // In overview scope, a metric that has crossed its escalation threshold takes
  // over the card: show only it, replacing the normal overview lines. The detail
  // view is left untouched.
  const escalatedLine = isOverview ? selectEscalatedLine(lines, skeletonLines) : undefined
  const displayLines = escalatedLine ? [escalatedLine] : filteredLines
  const quotaSnapshotLines = displayLines.filter((line) => line.type !== "progress")
  const quotaAccountLines = quotaSnapshotLines.filter(isAccountSnapshotLine)

  const hasResetCountdown = displayLines.some(
    (line) => line.type === "progress" && Boolean(line.resetsAt)
  )

  // Percent-only model rows (e.g. Codex) carry no per-model $, so their hover
  // breakdown is derived from the provider's own period totals × the model's %.
  const modelCostBasis = useMemo<ModelCostBasis>(
    () => ({
      today: parseProviderPeriodTotal(lines, "Today"),
      thirtyDay: parseProviderPeriodTotal(lines, "Last 30 Days"),
    }),
    [lines]
  )

  // "has ever loaded" — true if either we have a prior success timestamp,
  // or the parent is passing lines directly (tests + legacy state paths).
  const hasStaleData = lastUpdatedAt != null || filteredLines.length > 0
  const isRefreshingWithData = loading && hasStaleData

  const tickerIntervalMs = cooldownRemainingMs > 0 ? 1000 : 30_000

  const now = useNowTicker({
    enabled: cooldownRemainingMs > 0 || hasResetCountdown,
    intervalMs: tickerIntervalMs,
    stopAfterMs: cooldownRemainingMs > 0 && !hasResetCountdown ? cooldownRemainingMs : null,
  })

  const inCooldown = lastManualRefreshAt
    ? now - lastManualRefreshAt < REFRESH_COOLDOWN_MS
    : false

  const visibleLinks = useMemo(
    () =>
      links
        .map((link) => ({
          label: link.label.trim(),
          url: link.url.trim(),
        }))
        .filter(
          (link) =>
            link.label.length > 0 &&
            link.url.length > 0 &&
            (link.url.startsWith("https://") || link.url.startsWith("http://"))
        ),
    [links]
  )

  // Format remaining cooldown time as "Xm Ys"
  const formatRemainingTime = () => {
    if (!lastManualRefreshAt) return ""
    const remainingMs = REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt)
    if (remainingMs <= 0) return ""
    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes > 0) {
      return t("quota.availableInMinutes", { minutes, seconds })
    }
    return t("quota.availableInSeconds", { seconds })
  }

  const linksContent = visibleLinks.length > 0 ? (
    <div className={cn("flex flex-wrap gap-2", presentation !== "quota-grid" && "mb-4 -mt-0.5")} data-testid="provider-links">
      {visibleLinks.map((link) => (
        <a
          key={`${link.label}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="quota-resource-link group inline-flex h-10 max-w-full items-center gap-2 rounded-[9px] border border-border/70 bg-muted/15 px-3 text-[11px] font-semibold text-muted-foreground outline-none transition-[background-color,border-color,color,transform,box-shadow] duration-150 hover:border-foreground/20 hover:bg-muted/45 hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-resource-link={link.label}
          onClick={(event) => {
            event.preventDefault()
            openUrl(link.url).catch(console.error)
          }}
        >
          {link.label === "Status" ? <Pulse className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden="true" /> : null}
          {link.label === "Usage Dashboard" ? <ChartBar className="size-3.5 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" aria-hidden="true" /> : null}
          <span className="truncate">{localizeQuotaLabel(t, link.label)}</span>
          <ArrowSquareOut className="size-3 shrink-0 opacity-55 transition-[opacity,transform] group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-90" aria-hidden="true" />
        </a>
      ))}
    </div>
  ) : null

  return (
    <div id={presentation === "quota-grid" ? "guide-limits-root" : undefined}>
      <div className={asCard ? "pb-1 pt-2" : showHeader ? "py-3" : "pb-3"}>
        {showHeader && <div className="flex items-center justify-between mb-2">
          <div className="relative flex items-center">
            {asCard && iconUrl && (
              <ProviderIconMask
                iconUrl={iconUrl}
                pluginId={pluginId}
                sizePx={18}
                className="mr-1.5 text-muted-foreground"
                style={{ backgroundColor: "currentColor" }}
              />
            )}
            <h2 className="text-lg font-semibold" style={{ transform: "translateZ(0)" }}>{name}</h2>
            {onRetry && (
              loading ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-0.5 size-5 pointer-events-none opacity-50"
                  style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                  tabIndex={-1}
                >
                  <ArrowsClockwise className="h-3 w-3 animate-spin" />
                </Button>
              ) : inCooldown ? (
                <Tooltip>
                  <TooltipTrigger
                    className="ml-0.5"
                    render={(props) => (
                      <span {...props} className={cn("inline-flex items-center", props.className)}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="pointer-events-none opacity-50"
                          style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                          tabIndex={-1}
                        >
                          <Hourglass weight="duotone" className="h-3 w-3" />
                        </Button>
                      </span>
                    )}
                  />
                  <TooltipContent side="top">
                    {formatRemainingTime()}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    className="ml-0.5"
                    render={(props) => (
                      <Button
                        {...props}
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.retry")}
                        onClick={(e) => {
                          e.currentTarget.blur()
                          onRetry()
                        }}
                        className="ml-0.5 size-5 opacity-0 hover:opacity-100 focus-visible:opacity-100"
                        style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
                      >
                        <ArrowsClockwise className="h-3 w-3" />
                      </Button>
                    )}
                  />
                  {lastUpdatedAt != null && (
                    <TooltipContent side="top">
                      {t("common.updated", { time: formatRelativeTime(Date.now() - lastUpdatedAt, t) })}
                    </TooltipContent>
                  )}
                </Tooltip>
              )
            )}
          </div>
          {plan && (
            <Badge
              variant="outline"
              className="truncate min-w-0 max-w-[50%]"
              title={plan}
            >
              {plan}
            </Badge>
          )}
        </div>}
        <div data-testid="provider-card-body" className={asCard ? "rounded-xl border p-3" : undefined}>
        {presentation !== "quota-grid" ? linksContent : null}
        {error && !hasStaleData && <PluginError message={error} />}

        {error && hasStaleData && (
          <Tooltip>
            <TooltipTrigger
              render={(props) => (
                <div
                  {...props}
                  className="flex items-center gap-1.5 mb-2 text-xs text-destructive"
                >
                  <WarningCircle className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}
            />
            <TooltipContent side="top" className="max-w-xs break-words text-xs">
              {error}
            </TooltipContent>
          </Tooltip>
        )}

        {loading && !hasStaleData && !error && (
          <SkeletonLines lines={filteredSkeletonLines} />
        )}

        {hasStaleData && (
          presentation === "quota-grid" ? (
            <OverviewQuotaSections
              progressLines={displayLines.filter((line) => line.type === "progress")}
              accountLines={quotaAccountLines}
              links={linksContent}
              renderProgressLine={(line, li) => (
                <MetricLineRenderer
                  key={`${line.label}-progress-${li}`}
                  line={line}
                  formatAmount={formatAmount}
                  currency={displayCurrency}
                  isModelBreakdown={!manifestLabels.has(line.label)}
                  modelCostBasis={modelCostBasis}
                  displayMode={displayMode}
                  resetTimerDisplayMode={resetTimerDisplayMode}
                  onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
                  onUsageValueToggle={onUsageValueToggle}
                  now={now}
                  refreshing={isRefreshingWithData}
                  isDark={isDark}
                  presentation={presentation}
                />
              )}
              renderAccountLine={(line, li) => (
                <MetricLineRenderer
                  key={`${line.label}-account-${li}`}
                  line={line}
                  formatAmount={formatAmount}
                  currency={displayCurrency}
                  modelCostBasis={modelCostBasis}
                  displayMode={displayMode}
                  resetTimerDisplayMode={resetTimerDisplayMode}
                  onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
                  onUsageValueToggle={onUsageValueToggle}
                  now={now}
                  refreshing={isRefreshingWithData}
                  isDark={isDark}
                  presentation={presentation}
                  overviewGroup="account"
                />
              )}
            />
          ) : (
            <div className="space-y-4">
              {groupLinesByType(displayLines).map((group, gi) =>
                group.kind === "text" ? (
                  <div key={gi} className="space-y-1">
                    {/* Detail view: set the deeper stats (Today, 30d, models…) off
                        from the progress bars above. */}
                    {!isOverview && gi > 0 && <Separator className="mb-3" />}
                    {(() => {
                      const renderLine = (line: MetricLine, li: number) => (
                        <MetricLineRenderer
                          key={`${line.label}-${gi}-${li}`}
                          line={line}
                          formatAmount={formatAmount}
                          currency={displayCurrency}
                          isModelBreakdown={!manifestLabels.has(line.label)}
                          modelCostBasis={modelCostBasis}
                          displayMode={displayMode}
                          resetTimerDisplayMode={resetTimerDisplayMode}
                          onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
                          onUsageValueToggle={onUsageValueToggle}
                          now={now}
                          refreshing={isRefreshingWithData}
                          isDark={isDark}
                        />
                      )
                      if (isOverview) return group.lines.map(renderLine)
                      const detailLines = group.lines.filter((line) => manifestLabels.has(line.label))
                      const modelLines = group.lines.filter((line) => !manifestLabels.has(line.label))
                      return (
                        <>
                          {detailLines.map(renderLine)}
                          {modelLines.map(renderLine)}
                        </>
                      )
                    })()}
                  </div>
                ) : (
                  <Fragment key={gi}>
                    {group.lines.map((line, li) => (
                      <MetricLineRenderer
                        key={`${line.label}-${gi}-${li}`}
                        line={line}
                        formatAmount={formatAmount}
                        currency={displayCurrency}
                        isModelBreakdown={!manifestLabels.has(line.label)}
                        modelCostBasis={modelCostBasis}
                        displayMode={displayMode}
                        resetTimerDisplayMode={resetTimerDisplayMode}
                        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
                        onUsageValueToggle={onUsageValueToggle}
                        now={now}
                        refreshing={isRefreshingWithData}
                        isDark={isDark}
                      />
                    ))}
                  </Fragment>
                )
              )}
            </div>
          )
        )}

        </div>
      </div>
      {showSeparator && !asCard && <Separator />}
    </div>
  )
}

function MetricLineRenderer({
  line,
  formatAmount,
  currency,
  isModelBreakdown = false,
  modelCostBasis = { today: null, thirtyDay: null },
  displayMode,
  resetTimerDisplayMode,
  onResetTimerDisplayModeToggle,
  onUsageValueToggle,
  now,
  refreshing,
  isDark,
  presentation = "standard",
  overviewGroup,
}: {
  line: MetricLine
  formatAmount: (usd: number | null) => string | null
  currency: DisplayCurrency
  isModelBreakdown?: boolean
  modelCostBasis?: ModelCostBasis
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
  onUsageValueToggle?: () => void
  now: number
  refreshing?: boolean
  isDark: boolean
  presentation?: "standard" | "quota-grid"
  overviewGroup?: "account" | "activity" | "model"
}) {
  const t = useI18n()
  const language = useAppPreferencesStore((state) => state.language)
  const isQuotaConsole = presentation === "quota-grid"
  const isActivityGroup = isQuotaConsole && overviewGroup === "activity"

  if (line.type === "text") {
    const localizedValue = localizeQuotaValue(t, line.label, line.value, formatAmount, currency)
    // Per-model rows: percent only on the right; the cost breakdown moves
    // into a tooltip instead of a long truncated "· Today … · 7d …" string.
    const modelParsed = isModelBreakdown ? parseModelBreakdownValue(line.value) : null
    if (modelParsed) {
      const details = modelBreakdownDetailLines(modelParsed, modelCostBasis)
      const parsedPercent = Number.parseFloat(modelParsed.percent.replace("<", ""))
      const percentValue = Number.isFinite(parsedPercent) ? Math.max(0, Math.min(100, parsedPercent)) : 0
      const percentNode = details.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <span
                {...props}
                className={cn(isQuotaConsole ? "text-sm font-semibold text-foreground" : "text-xs text-muted-foreground", "tabular-nums")}
                style={line.color ? { color: line.color } : undefined}
              >
                {modelParsed.percent}
              </span>
            )}
          />
          <TooltipContent side="top" className="text-xs">
            {details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : (
        <span
          className={cn(isQuotaConsole ? "text-sm font-semibold text-foreground" : "text-xs text-muted-foreground", "tabular-nums")}
          style={line.color ? { color: line.color } : undefined}
        >
          {modelParsed.percent}
        </span>
      )

      return (
        <div className={cn(isQuotaConsole ? "min-h-9" : "flex h-[18px] items-center justify-between gap-2")} data-testid="model-breakdown-line">
          <div className={cn(isQuotaConsole && "flex items-baseline justify-between gap-4")}>
            <span className={cn(isQuotaConsole ? "text-[10px] font-semibold uppercase tracking-[0.14em]" : "text-xs", "min-w-0 truncate text-muted-foreground")} title={line.label}>
              {line.label}
            </span>
            {percentNode}
          </div>
          {isQuotaConsole ? (
            <div className="mt-1.5 h-[3px] w-full overflow-hidden bg-border/45" aria-hidden="true" data-testid="model-share-bar">
              <span className="block h-full bg-[var(--quota-fill)]" style={{ width: `${percentValue}%` }} />
            </div>
          ) : null}
        </div>
      )
    }

    return (
      <div>
        <div className={cn(isActivityGroup ? "grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4" : isQuotaConsole ? "flex min-h-12 flex-col items-start gap-1" : "flex h-[18px] items-center justify-between gap-2")}>
          <span className={cn(isActivityGroup ? "text-[11px] font-medium" : isQuotaConsole ? "text-[10px] font-semibold uppercase tracking-[0.14em]" : "text-xs", "min-w-0 truncate text-muted-foreground")} title={line.label}>
            {localizeQuotaLabel(t, line.label)}
          </span>
          {line.label === "Rate Limit Resets" ? (
            <ResetCreditsDetail
              line={line}
              value={localizedValue}
              className={isQuotaConsole || isActivityGroup ? "text-sm font-semibold text-foreground" : "text-xs text-muted-foreground"}
            />
          ) : (
            <span
              className={cn(
                isActivityGroup ? "max-w-full text-right text-sm font-semibold text-foreground" : isQuotaConsole ? "max-w-full text-left text-sm font-semibold text-foreground" : "max-w-[45%] text-right text-xs text-muted-foreground",
                "flex-shrink-0 truncate tabular-nums",
              )}
              style={line.color ? { color: line.color } : undefined}
              title={localizedValue}
            >
              {localizedValue}
            </span>
          )}
        </div>
        {line.subtitle && (
          <div className={cn("text-[10px] text-muted-foreground", isActivityGroup ? "mt-1 text-right" : isQuotaConsole ? "mt-1 text-left" : "-mt-0.5 text-right")}>{line.subtitle}</div>
        )}
      </div>
    )
  }

  if (line.type === "badge") {
    return (
      <div>
        <div className={cn(isQuotaConsole ? "flex min-h-12 flex-col items-start gap-1" : "flex h-[22px] items-center justify-between")}>
          <span className={cn(isQuotaConsole ? "text-[10px] font-semibold uppercase tracking-[0.14em]" : "text-sm", "flex-shrink-0 text-muted-foreground")}>{localizeQuotaLabel(t, line.label)}</span>
          <Badge
            variant="outline"
            className={cn("min-w-0 truncate", isQuotaConsole ? "max-w-full" : "max-w-[60%]")}
            style={
              line.color
                ? { color: line.color, borderColor: line.color }
                : undefined
            }
            title={line.text}
          >
            {line.text}
          </Badge>
        </div>
        {line.subtitle && (
          <div className={cn("text-xs text-muted-foreground", isQuotaConsole ? "mt-1 text-left" : "-mt-0.5 text-right")}>{line.subtitle}</div>
        )}
      </div>
    )
  }

  if (line.type === "barChart") {
    return (
      <UsageSparkline label={line.label} points={line.points} note={line.note ?? undefined} color={getAdaptiveBarColor(line.color, isDark)} />
    )
  }

  if (line.type === "progress") {
    if (line.used == null || line.limit == null) return null

    const shownAmount =
      displayMode === "used"
        ? line.used
        : Math.max(0, line.limit - line.used)
    const percent = Math.round(clamp01(shownAmount / line.limit) * 10000) / 100
    const shownValue =
      line.format.kind === "percent"
        ? `${Math.round(shownAmount)}%`
        : line.format.kind === "dollars"
          ? `$${formatFixedPrecisionNumber(shownAmount)}`
          : formatQuotaCount(t, shownAmount, line.format.suffix)
    const primaryText = displayMode === "left" ? t("quota.valueLeft", { value: shownValue }) : shownValue

    const resetLabel = line.resetsAt
      ? resetTimerDisplayMode === "absolute"
        ? formatResetAbsoluteLabel(now, line.resetsAt, { t, locale: language })
        : formatResetRelativeLabel(now, line.resetsAt, { t, locale: language })
      : null
    const resetTooltipText = line.resetsAt
      ? formatResetTooltipText({
          nowMs: now,
          resetsAtIso: line.resetsAt,
          visibleMode: resetTimerDisplayMode,
          t,
          locale: language,
        })
      : null

    const secondaryText =
      resetLabel ??
      (line.format.kind === "percent"
        ? t("quota.cap", { value: `${line.limit}%` })
        : line.format.kind === "dollars"
          ? t("quota.limit", { value: `$${formatFixedPrecisionNumber(line.limit)}` })
          : formatQuotaCount(t, line.limit, line.format.suffix))

    const limitText =
      line.format.kind === "percent"
        ? `${line.limit}%`
        : line.format.kind === "dollars"
          ? `$${formatFixedPrecisionNumber(line.limit)}`
          : formatQuotaCount(t, line.limit, line.format.suffix)

    const isQuotaCard = isQuotaConsole

    return (
      <div className={cn(isQuotaCard ? "border-t border-border/50 pt-3 first:border-t-0 first:pt-0" : undefined)}>
        <div className={cn("flex items-center gap-1.5", isQuotaCard ? "text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" : "mb-1.5 text-sm font-medium")}>
          {localizeQuotaLabel(t, line.label)}
        </div>
        {isQuotaCard && (
          <div className="mt-2 flex items-end justify-between gap-3">
            {onUsageValueToggle ? (
              <button
                type="button"
                data-usage-toggle
                onClick={onUsageValueToggle}
                className="text-left text-2xl font-semibold tracking-tight tabular-nums text-foreground transition-colors hover:text-[var(--page-accent)]"
              >
                {primaryText}
              </button>
            ) : (
              <output className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">{primaryText}</output>
            )}
            <span className="pb-0.5 text-[11px] tabular-nums text-muted-foreground">{limitText}</span>
          </div>
        )}
        <Progress
          className={cn(isQuotaCard && "mt-3 h-1.5")}
          value={percent}
          indicatorColor={isQuotaCard ? "var(--quota-fill)" : getAdaptiveBarColor(line.color, isDark)}
          refreshing={refreshing}
        />
        <div className={cn("flex items-center justify-between", isQuotaCard ? "mt-2" : "mt-1.5")}>
          {!isQuotaCard && (onUsageValueToggle ? (
            <button
              type="button"
              data-usage-toggle
              onClick={onUsageValueToggle}
              className="text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors"
            >
              {primaryText}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">
              {primaryText}
            </span>
          ))}
          {secondaryText && (
            resetTooltipText ? (
              <Tooltip>
                <TooltipTrigger
                  render={(props) =>
                    resetLabel && onResetTimerDisplayModeToggle ? (
                      <button
                        {...props}
                        type="button"
                        data-reset-toggle
                        onClick={onResetTimerDisplayModeToggle}
                        className="text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors"
                      >
                        {secondaryText}
                      </button>
                    ) : (
                      <span {...props} className="text-xs text-muted-foreground tabular-nums">
                        {secondaryText}
                      </span>
                    )
                  }
                />
                <TooltipContent side="top">{resetTooltipText}</TooltipContent>
              </Tooltip>
            ) : resetLabel && onResetTimerDisplayModeToggle ? (
              <button
                type="button"
                data-reset-toggle
                onClick={onResetTimerDisplayModeToggle}
                className="text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors"
              >
                {secondaryText}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {secondaryText}
              </span>
            )
          )}
        </div>

      </div>
    )
  }

  return null
}
