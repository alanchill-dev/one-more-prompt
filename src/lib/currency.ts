import type { ExchangeRate, PricingEstimationStatus } from "@/bindings"
import type { DisplayCurrency } from "@/lib/settings"

export const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  USD: "USD (US$)",
  TWD: "TWD (NT$)",
  EUR: "EUR (€)",
  JPY: "JPY (¥)",
  GBP: "GBP (£)",
  CNY: "CNY (CN¥)",
  KRW: "KRW (₩)",
}

const CURRENCY_SYMBOLS: Record<DisplayCurrency, string> = {
  USD: "$", TWD: "NT$", EUR: "€", JPY: "¥", GBP: "£", CNY: "CN¥", KRW: "₩",
}

export function exchangeRateFor(
  rates: ExchangeRate[],
  currency: DisplayCurrency,
): ExchangeRate | null {
  return rates.find((rate) => rate.code === currency) ?? null
}

export function convertUsd(
  usd: number | null | undefined,
  rate: ExchangeRate | null,
): number | null {
  if (usd == null || !Number.isFinite(usd) || usd < 0 || rate?.rate == null) return null
  if (!Number.isFinite(rate.rate) || rate.rate <= 0) return null
  return usd * rate.rate
}

function currencyFractionDigits(value: number, currency: DisplayCurrency) {
  if (value === 0) return currency === "JPY" || currency === "KRW" ? 0 : 2
  const absolute = Math.abs(value)
  if (absolute >= 100) return currency === "JPY" || currency === "KRW" ? 0 : 2
  if (absolute >= 1) return 2
  if (absolute >= 0.01) return 4
  return 6
}

export function formatCurrency(
  value: number,
  currency: DisplayCurrency,
  locale?: string,
  maximumFractionDigits?: number,
) {
  const precision = maximumFractionDigits ?? currencyFractionDigits(value, currency)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: value === 0 && maximumFractionDigits == null ? precision : 0,
    maximumFractionDigits: precision,
  }).formatToParts(value).map((part) => part.type === "currency" ? CURRENCY_SYMBOLS[currency] : part.value).join("")
}

export function formatUsdEstimate(
  usd: number | null | undefined,
  currency: DisplayCurrency,
  rate: ExchangeRate | null,
  locale?: string,
  maximumFractionDigits?: number,
) {
  const converted = convertUsd(usd, rate)
  return converted == null ? null : formatCurrency(converted, currency, locale, maximumFractionDigits)
}

export function combineEstimationStatus(
  statuses: Array<PricingEstimationStatus | null | undefined>,
): PricingEstimationStatus {
  if (statuses.some((status) => status === "unknown" || status == null)) return "unknown"
  if (statuses.some((status) => status === "partial_rate")) return "partial_rate"
  if (statuses.some((status) => status === "current_rate")) return "current_rate"
  return "historical_rate"
}
