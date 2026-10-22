import { Clock } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"

export function QuotaSummaryDetail({ value, valueLabel, scope, recorded, total, resolved, loading, error }: {
  value: number | null; valueLabel: string; scope: "project" | "session"; recorded: number; total: number
  resolved: boolean; loading: boolean; error: boolean
}) {
  const t = useI18n()
  const missing = total - recorded
  const maximum = value == null ? 100 : Math.max(100, Math.ceil(value / 100) * 100)
  const known = resolved && value != null
  const title = t(scope === "project" ? "summaryDetail.quotaProjectTitle" : "summaryDetail.quotaSessionTitle")
  return <>
    <h3 className="prompt-summary-detail-title prompt-summary-quota-title">{title}</h3>
    {known ? <div className="prompt-summary-quota-chart" role="img" aria-label={t("summaryDetail.quotaBarDescription", { value: valueLabel, maximum })}>
        <div className="prompt-summary-quota-track">
          <span className="prompt-summary-quota-fill" style={{ width: `${value / maximum * 100}%` }} />
          {maximum > 100 && <span className="prompt-summary-quota-reference" style={{ left: `${100 / maximum * 100}%` }} />}
          <strong className="prompt-summary-quota-number">{valueLabel}</strong>
        </div>
        <div className="prompt-summary-quota-axis"><span>0%</span><span>{maximum === 100 ? t("summaryDetail.quotaWeeklyReference") : `${maximum}%`}</span></div>
        {maximum > 100 && <span className="prompt-summary-quota-reference-label" style={{ left: `clamp(7rem, ${100 / maximum * 100}%, calc(100% - 7rem))` }}>{t("summaryDetail.quotaWeeklyReference")}</span>}
      </div> : <p className="prompt-summary-detail-intro">{t(loading ? "sessionQuota.loading" : error ? "sessionQuota.errorDetail" : "summaryDetail.quotaUnknownIntro")}</p>}
    {scope === "project" && resolved && <section className="prompt-summary-quota-records" data-testid="session-quota-coverage"
      aria-label={t("summaryDetail.quotaProjectCounts", { recorded, total, missing })}>
      {total > 0 && <div className="prompt-summary-quota-markers" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => <span key={index} data-recorded={index < recorded} />)}
      </div>}
      <p>{t("summaryDetail.quotaIncludedCount", { recorded })}<span aria-hidden="true"> · </span>{t("summaryDetail.quotaMissingCount", { missing })}</p>
    </section>}

  </>
}

export function TimeSummaryDetail({ recorded, total, scope }: { recorded: number; total: number; scope: "project" | "session" }) {
  const t = useI18n()
  const missing = total - recorded
  const visualLabel = t("summaryDetail.timeVisualLabel", { recorded, total, missing })
  return <div role="group" data-testid="duration-coverage" aria-label={t("promptUsage.timeCoverage", { recorded, total })}>
    <h3 className="prompt-summary-detail-title"><Clock aria-hidden="true" />{t("summaryDetail.timeTitle", { recorded })}</h3>
    <p className="prompt-summary-detail-intro">{t("summaryDetail.timeIntro", { scope: t(scope === "project" ? "promptUsage.projectSummary" : "promptUsage.sessionSummary"), total })}</p>
    {total > 0 && (total <= 60
      ? <div className="prompt-summary-detail-dots" role="img" aria-label={visualLabel}>
        {Array.from({ length: total }, (_, index) => <span key={index} className="prompt-summary-detail-dot" data-recorded={index < recorded} aria-hidden="true" />)}
      </div>
      : <div className="prompt-summary-detail-bar" role="img" aria-label={visualLabel}>
        <span className="prompt-summary-detail-bar-recorded" style={{ width: `${recorded / total * 100}%` }} aria-hidden="true" />
      </div>)}
    {total > 0 && <div className="prompt-summary-detail-legend">
      <span><i aria-hidden="true" />{t("summaryDetail.timeIncluded", { recorded })}</span>
      <span><i data-missing aria-hidden="true" />{t("summaryDetail.timeExcluded", { missing })}</span>
    </div>}
    <p className="prompt-summary-detail-foot">{t(total === 0 ? "summaryDetail.timeEmpty" : missing ? "summaryDetail.timeMissingFoot" : "summaryDetail.timeAllRecorded")}
      {total > 0 && <> {t("summaryDetail.timeParallel")}</>}
    </p>
  </div>
}
