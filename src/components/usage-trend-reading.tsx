import { UsageTrendAnimatedValue } from "@/components/usage-trend-animated-value"
import type { TrendMetric } from "@/components/usage-trend-metric"
import { useI18n } from "@/hooks/use-i18n"
import { cn } from "@/lib/utils"

export function UsageTrendReading({ value, exactValue, unit, averageLabel, average, peakLabel, peak, metric, onMetricChange }: {
  value: string; exactValue?: string; unit?: string
  averageLabel: string; average: string; peakLabel: string; peak: string
  metric: TrendMetric; onMetricChange: (metric: TrendMetric) => void
}) {
  const t = useI18n()
  return (
    <div className="min-w-0 pr-4" data-testid="usage-trend-primary-reading">
      <div role="group" aria-label={t("overview.metricLabel")} className="flex h-6 w-fit items-center gap-6">
        {(["tokens", "cost"] as const).map((option) => (
          <button type="button" key={option} aria-pressed={metric === option} onClick={() => onMetricChange(option)}
            className={cn("relative min-h-[38px] px-1.5 pb-0.5 text-[14px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", metric === option ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            data-testid={`usage-trend-metric-${option}`} data-guide-target={option === "cost" ? "usage-trend-api-metric" : undefined}>
            {option === "tokens" ? t("overview.tokenUnit") : t("cost.apiEquivalent")}
            <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-2 border-b-2 transition-colors duration-200", metric === option ? "border-[var(--wire-orange)]" : "border-transparent")} />
          </button>
        ))}
      </div>
      <div className="trend-reading-value-reveal mt-2 flex min-w-0 items-baseline gap-2.5" style={{ animationDelay: "150ms" }} data-testid="usage-trend-primary-value-stack">
        <output className="shrink-0 overflow-visible whitespace-nowrap text-[clamp(2.5rem,4.4vw,3.35rem)] font-semibold leading-none tracking-[-0.064em] tabular-nums text-foreground [text-box:trim-start_cap]"
          style={{ lineHeight: 1 }} title={exactValue} aria-live="polite" data-testid="usage-trend-primary-token-row">
          <UsageTrendAnimatedValue value={value} magnitudeSpacing animateInitial />
        </output>
        <span className="min-w-0 shrink truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--trend-hero)]">{unit}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2 truncate text-[10px] text-muted-foreground" data-testid="usage-trend-summary-line">
        <span className="shrink-0">{averageLabel} <strong className="font-semibold tabular-nums text-foreground">{average}</strong></span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate">{peakLabel} <strong className="font-semibold tabular-nums text-foreground">{peak}</strong></span>
      </div>
    </div>
  )
}
