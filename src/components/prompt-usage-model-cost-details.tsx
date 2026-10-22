import { WarningCircle } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import type { PromptUsageCostEstimate } from "@/lib/prompt-usage"
import type { PromptUsageCostLine } from "@/lib/prompt-usage-cost"
import type { DisplayCurrency } from "@/lib/settings"

const categories = [
  ["input", "cost.explainInput"], ["cacheRead", "cost.explainCache"],
  ["cacheWrite", "cost.explainWrite"], ["output", "cost.explainOutput"],
] as const
const issueKeys = {
  missing_price: "cost.lineMissingPrice", missing_cache_write_price: "cost.lineMissingWrite",
  missing_cache_read_price: "cost.lineMissingRead",
  incomplete_cache_write_usage: "cost.lineIncompleteWrite", excluded_internal_model: "cost.lineExcluded",
} as const

function displayNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

function ModelCalculation({ line, formatAmount }: { line: PromptUsageCostLine; formatAmount: (value: number | null) => string | null }) {
  const t = useI18n()
  const locale = t("settings.currency.locale")
  const number = (value: number) => displayNumber(value, locale)
  const money = (value: number) => formatAmount(value) ?? t("cost.exchangeUnavailable")
  const excluded = line.issues.includes("excluded_internal_model")
  return <section className="cost-model-calculation" data-cost-model={line.model}>
    <h3><span>{line.model}</span><strong>{line.costUsd == null || excluded ? t("cost.lineNotIncluded") : money(line.costUsd)}</strong></h3>
    {!excluded && line.costUsd != null && line.costUsd > 0 && <div className="cost-model-composition" aria-hidden="true">
      {categories.map(([key]) => <span key={key} data-category={key} style={{ width: `${line.fees[`${key}Usd`] / line.costUsd! * 100}%` }} />)}
    </div>}
    {!excluded && <dl>
      {categories.filter(([key]) => line.tokens[key] > 0).map(([key, label]) => <div className="cost-model-category" key={key}>
        <dt><span><i className="cost-model-category-key" data-category={key} aria-hidden="true" />{t(label)}</span><p className="cost-model-operands">
          {number(line.tokens[key])} <span>÷ {number(1_000_000)} × </span>{line.rates[key] == null ? "—" : money(line.rates[key]!)}
        </p></dt>
        <dd>{line.rates[key] == null ? t("cost.lineNotIncluded") : `= ${money(line.fees[`${key}Usd`])}`}</dd>
      </div>)}
    </dl>}
    {line.issues.map(issue => <p className="cost-model-issue" key={issue}><WarningCircle size={16} aria-hidden="true" />{t(issueKeys[issue])}</p>)}
    {line.observedAt && <p className="cost-model-observed">{t("cost.lineObserved", { date: new Date(line.observedAt).toLocaleDateString(locale) })}</p>}
  </section>
}

export function PromptUsageModelCostDetails({ estimate, formatAmount, currency }: {
  estimate: PromptUsageCostEstimate; formatAmount: (value: number | null) => string | null; currency: DisplayCurrency
}) {
  const t = useI18n()
  const lines = estimate.costLines
  const total = formatAmount(estimate.costUsd)
  if (!lines?.length) return <p className="cost-explanation-incomplete">{t("cost.lineUnavailable")}</p>
  return <div className="cost-model-details">
    <div className="cost-model-guide">
      <strong>{t("cost.linesTitle")}</strong>
      <p>{t("cost.lineUnits", { currency })}</p>
    </div>
    {lines.map((line, index) => <ModelCalculation line={line} formatAmount={formatAmount} key={`${line.model}-${index}`} />)}
    {estimate.costUsd != null && <div className="cost-model-sum">
      <span>{t("cost.lineSum")}</span>
      <div className="cost-explanation-total-reading">
        <strong>{total ?? t("cost.exchangeUnavailable")}</strong>
        {total != null && <span className="cost-explanation-currency"> {currency}</span>}
      </div>
    </div>}
    <p className="cost-explanation-reference">{t("cost.lineRatesNote")}<br />{t("cost.lineRounding")}</p>
  </div>
}
