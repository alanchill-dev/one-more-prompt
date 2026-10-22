import { invoke } from "@tauri-apps/api/core"
import { CodexEmptyState, isCodexSignInRequired } from "@/components/codex-empty-state"
import { ProviderCard } from "@/components/provider-card"
import { UsageTrendExplorer } from "@/components/usage-trend-explorer"
import { getPromptUsageLines } from "@/lib/prompt-usage-summary"
import { useI18n } from "@/hooks/use-i18n"
import type { BarChartPoint, MetricLine, PluginDisplayState } from "@/lib/plugin-types"
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings"

interface OverviewPageProps {
  plugin: PluginDisplayState | null
  onRetryPlugin?: (pluginId: string) => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
  onUsageValueToggle?: () => void
  chartNow?: Date
  modelPaletteGuideActive?: boolean
}

type TrendLine = Extract<MetricLine, { type: "barChart" }> & {
  granularity?: "daily" | "hourly" | null
}

function loadCodexHistoricalHourly(dateKey: string) {
  return invoke<BarChartPoint[]>("query_codex_hourly_usage", { dateKey })
}

export function OverviewPage({
  plugin,
  onRetryPlugin,
  displayMode,
  resetTimerDisplayMode,
  onResetTimerDisplayModeToggle,
  onUsageValueToggle,
  chartNow,
  modelPaletteGuideActive,
}: OverviewPageProps) {
  const t = useI18n()
  const allLines = plugin?.data?.lines ?? []
  const usageLines = plugin?.meta.id === "codex"
    ? getPromptUsageLines(allLines)
    : allLines
  const trendLines = usageLines.filter((line): line is TrendLine => line.type === "barChart")
  const trendLine = trendLines.find((line) => line.granularity !== "hourly")
  const hourlyTrendLine = trendLines.find((line) => line.granularity === "hourly")
  const providerLines = usageLines.filter((line) => line.type !== "barChart")
  const showEmptyState = !plugin || ((!plugin.loading || plugin.data != null) && (!plugin.error || isCodexSignInRequired(plugin.error)) && !trendLine && providerLines.length === 0)

  return (
    <div className={showEmptyState ? "flex h-full min-h-0 flex-col" : "min-h-full pb-6"} data-testid="overview-page">
      <h1 className="sr-only">{t("overview.title")}</h1>

      {showEmptyState ? (
        <CodexEmptyState
          onCheckForRecords={onRetryPlugin ? () => onRetryPlugin("codex") : undefined}
          checking={Boolean(plugin?.loading)}
        />
      ) : (
        <div>
          {trendLine ? (
            <div id="overview-local-activity" tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
              <UsageTrendExplorer
                label={trendLine.label}
                points={trendLine.points}
                hourlyPoints={hourlyTrendLine?.points}
                loadHistoricalHourly={loadCodexHistoricalHourly}
                chartNow={chartNow}
                modelPaletteGuideActive={modelPaletteGuideActive}
              />
            </div>
          ) : null}
          <section
            id="overview-usage-field"
            aria-label={t("overview.usageLabel")}
            tabIndex={-1}
            className="mx-2 border-t border-border/60 px-1 pb-3 pt-8 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:mx-4 sm:px-0"
            data-testid="overview-usage-field"
          >
            <ProviderCard
              name={plugin.meta.name}
              showHeader={false}
              plan={plugin.data?.plan ?? undefined}
              links={plugin.meta.links}
              showSeparator={false}
              loading={plugin.loading}
              error={plugin.error}
              lines={providerLines}
              skeletonLines={plugin.meta.lines}
              lastManualRefreshAt={plugin.lastManualRefreshAt}
              lastUpdatedAt={plugin.lastUpdatedAt}
              onRetry={onRetryPlugin ? () => onRetryPlugin(plugin.meta.id) : undefined}
              scopeFilter="all"
              displayMode={displayMode}
              resetTimerDisplayMode={resetTimerDisplayMode}
              onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
              onUsageValueToggle={onUsageValueToggle}
              presentation="quota-grid"
            />
          </section>
        </div>
      )}
    </div>
  )
}
