import { useApiEquivalentEstimate } from "@/hooks/use-api-equivalent-estimate"
import { useI18n } from "@/hooks/use-i18n"
import { formatCountNumber } from "@/lib/utils"
import { formatAxisValue, formatEditorialValue, formatPointValue, pointCostUsd, type TimedBarChartPoint } from "@/components/usage-trend-utils"

export type TrendMetric = "tokens" | "cost"

export function trendTokenValue(point: TimedBarChartPoint) {
  return point.tokenValue ?? point.value
}

/** Geometry uses known USD amounts; unknown prices remain explicit in every readout. */
export function projectTrendPoints<T extends TimedBarChartPoint>(points: T[], metric: TrendMetric): T[] {
  return metric === "tokens" ? points : points.map((point) => ({
    ...point,
    tokenValue: trendTokenValue(point),
    value: pointCostUsd(point) ?? 0,
    valueLabel: null,
  }))
}

export function useTrendMetric(metric: TrendMetric) {
  const t = useI18n()
  const estimate = useApiEquivalentEstimate(null, "unknown")
  const formatAmount = (value: number | null) => value == null
    ? "—"
    : metric === "cost"
      ? estimate.formatAmount(value) ?? t("cost.exchangeUnavailable")
      : formatEditorialValue(value)
  return {
    currency: estimate.displayCurrency,
    formatAmount,
    formatExact: (value: number | null) => metric === "cost" ? formatAmount(value) : value == null ? "—" : formatCountNumber(value),
    formatAxis: (value: number) => metric === "cost" ? formatAmount(value) : formatAxisValue(value),
    formatPoint: (point: TimedBarChartPoint) => metric === "cost" ? formatAmount(pointCostUsd(point)) : formatPointValue(point, t("overview.tokenUnit")),
    unit: metric === "cost" ? t("cost.apiEquivalent") : t("overview.tokenUnit"),
  }
}
