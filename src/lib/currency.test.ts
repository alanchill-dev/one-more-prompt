import { describe, expect, it } from "vitest"
import type { ExchangeRate } from "@/bindings"
import {
  combineEstimationStatus,
  convertUsd,
  exchangeRateFor,
  formatCurrency,
  formatUsdEstimate,
} from "@/lib/currency"

const rates: ExchangeRate[] = [
  { code: "USD", rate: 1, date: null, source: "USD Base", status: "base" },
  { code: "TWD", rate: 32, date: "2026-08-31", source: "Frankfurter", status: "fresh" },
]

describe("currency helpers", () => {
  it("converts canonical USD only when a usable rate exists", () => {
    expect(convertUsd(2, rates[1])).toBe(64)
    expect(convertUsd(null, rates[1])).toBeNull()
    expect(convertUsd(2, null)).toBeNull()
  })

  it("keeps unknown currencies unavailable instead of formatting zero", () => {
    expect(exchangeRateFor(rates, "TWD")).toEqual(rates[1])
    expect(exchangeRateFor(rates, "EUR")).toBeNull()
    expect(formatUsdEstimate(2, "TWD", rates[1], "zh-TW")).toContain("64")
    expect(formatUsdEstimate(2, "EUR", null, "zh-TW")).toBeNull()
  })

  it("uses the least certain status across combined estimates", () => {
    expect(combineEstimationStatus(["historical_rate", "historical_rate"])).toBe("historical_rate")
    expect(combineEstimationStatus(["historical_rate", "current_rate"])).toBe("current_rate")
    expect(combineEstimationStatus(["current_rate", "partial_rate"])).toBe("partial_rate")
    expect(combineEstimationStatus(["current_rate", "unknown"])).toBe("unknown")
  })

  it.each(["en-US", "zh-TW", "ja-JP", "de-DE"])("disambiguates currency symbols in %s without changing the amount", locale => {
    for (const [currency, symbol] of [["TWD", "NT$"], ["CNY", "CN¥"], ["EUR", "€"], ["JPY", "¥"], ["GBP", "£"], ["KRW", "₩"], ["USD", "$"]] as const) {
      const formatted = formatCurrency(64, currency, locale)
      expect(formatted).toContain(symbol)
      expect(formatted).toContain("64")
    }
  })

  it("rounds only the converted display amount while preserving tiny chart values", () => {
    expect(formatUsdEstimate(2.345678, "TWD", rates[1], "en-US", 2)).toBe("NT$75.06")
    expect(formatCurrency(0.0008, "USD", "en-US")).toBe("$0.0008")
    expect(formatCurrency(0, "USD", "en-US")).toBe("$0.00")
  })
})
