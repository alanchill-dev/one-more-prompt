import type { PricingEstimationStatus } from "@/bindings"
import { useExchangeRates } from "@/hooks/use-exchange-rates"
import { useI18n } from "@/hooks/use-i18n"
import { exchangeRateFor, formatUsdEstimate } from "@/lib/currency"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

export function useApiEquivalentEstimate(
  costUsd: number | null,
  estimationStatus: PricingEstimationStatus,
  maximumFractionDigits?: number,
) {
  const t = useI18n()
  const displayCurrency = useAppPreferencesStore((state) => state.displayCurrency)
  const exchangeRates = useExchangeRates()
  const rate = exchangeRateFor(exchangeRates.rates, displayCurrency)
  const formatAmount = (value: number | null) => formatUsdEstimate(value, displayCurrency, rate, t("settings.currency.locale"), maximumFractionDigits)
  const amount = formatAmount(costUsd)
  const basis = estimationStatus === "historical_rate"
    ? t("cost.historicalRateEstimate")
    : estimationStatus === "current_rate"
      ? t("cost.currentRateEstimate")
      : estimationStatus === "partial_rate"
        ? t("cost.partialRateEstimate")
        : t("cost.notIncluded")

  return {
    amount: amount == null ? costUsd == null ? "—" : t("cost.exchangeUnavailable") : `${amount} ${displayCurrency}`,
    basis,
    formatAmount,
    displayCurrency,
  }
}
