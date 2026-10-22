import { useI18n } from "@/hooks/use-i18n"
import type { SessionQuotaState } from "@/hooks/use-session-quota"
import type { PromptUsageSession } from "@/lib/prompt-usage"
import { QuotaSummaryDetail } from "./prompt-summary-detail-content"
import { PromptSummaryValueDetail } from "./prompt-summary-value-detail"
import { PromptUsageHelpDialog } from "./prompt-usage-help-dialog"
import "./session-quota.css"
import "./session-quota-explanation.css"

export function formatSessionQuota(value: number): string {
  if (value > 0 && value < 0.01) return "<0.01%"
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}%`
}

export function sessionQuotaValue(state: SessionQuotaState | undefined, id: string): number | null {
  const row = state?.response?.entries.find(entry => entry.threadId === id)
  return row?.status === "available" || row?.status === "partial" ? row.weeklyPercent : null
}

function quotaRoots(sessions: PromptUsageSession[]) {
  const unique = [...new Map(sessions.map(session => [session.id, session])).values()]
  return unique.filter(session => !unique.some(parent => parent.id !== session.id && parent.descendantThreadIds?.includes(session.id)))
}

export function projectQuotaValue(state: SessionQuotaState | undefined, sessions: PromptUsageSession[]) {
  const roots = quotaRoots(sessions)
  const included = new Set<string>()
  let value = 0
  let recorded = 0
  let partial = false
  for (const session of roots) {
    const ids = [session.id, ...session.descendantThreadIds ?? []]
    if (ids.some(id => included.has(id))) continue
    const percent = sessionQuotaValue(state, session.id)
    if (percent == null) continue
    ids.forEach(id => included.add(id))
    value += percent
    recorded++
    if (state?.response?.entries.find(entry => entry.threadId === session.id)?.status === "partial") partial = true
  }
  return { value: recorded ? value : null, partial: partial || recorded < roots.length || roots.length === 0, recorded, total: roots.length }
}

export function SessionQuotaMetric({ state, id, sessions }: { state?: SessionQuotaState; id: string; sessions?: PromptUsageSession[] }) {
  const t = useI18n()
  const aggregate = sessions ? projectQuotaValue(state, sessions) : null
  const value = aggregate ? aggregate.value : sessionQuotaValue(state, id)
  const loading = state?.loading ?? false
  const error = state?.error ?? false
  const resolved = state?.response != null && !loading && !error
  const recorded = aggregate?.recorded ?? (value != null ? 1 : 0)
  const total = aggregate?.total ?? 1
  const coverage = sessions && resolved ? t("summaryDetail.quotaProjectCounts", { recorded, total, missing: total - recorded }) : null
  const valueLabel = value == null ? t(loading ? "sessionQuota.loading" : error ? "sessionQuota.error" : "sessionQuota.unavailable") : formatSessionQuota(value)
  const label = `${t(sessions ? "summaryDetail.quotaProjectTitle" : "summaryDetail.quotaSessionTitle")}: ${valueLabel}${coverage ? `. ${coverage}` : ""}`
  return <div className="session-quota-table-cell prompt-summary-metric" data-testid="session-quota-metric" aria-label={label}>
    <div className="session-quota-value-row">
      <PromptSummaryValueDetail label={label} testId="session-quota-coverage" content={<QuotaSummaryDetail value={value} valueLabel={valueLabel}
        scope={sessions ? "project" : "session"} recorded={recorded} total={total}
        resolved={resolved} loading={loading} error={error} />}>
        <span className={`session-quota-value prompt-summary-primary ${value == null ? "is-empty" : ""}`} data-testid="session-quota-value">{valueLabel}
          {loading && value == null && <span className="session-quota-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>}
        </span>
      </PromptSummaryValueDetail>
    </div>
  </div>
}

export function SessionQuotaHelp({ state }: { state?: SessionQuotaState }) {
  const t = useI18n()
  const dataAsOf = state?.response?.dataAsOf
  return <PromptUsageHelpDialog title={t("sessionQuota.explainTitle")} closeLabel={t("sessionQuota.close")}
    testId="session-quota-help" panelClassName="session-quota-explanation">
          <p className="session-quota-explanation-intro">{t("sessionQuota.meaning")}</p>
          <figure className="session-quota-explanation-figure">
            <div className="session-quota-figure-label"><span>{t("sessionQuota.referenceLabel")}</span><strong>100%</strong></div>
            <svg viewBox="0 0 400 16" aria-hidden="true" focusable="false"><rect className="quota-reference-track" x="1" y="1" width="398" height="14" rx="3" /><path className="quota-reference-divisions" d="M100 2v12 M200 2v12 M300 2v12" /></svg>
            <div className="session-quota-figure-label"><span>{t("sessionQuota.exampleLabel")}</span><strong className="quota-example-number">25%</strong></div>
            <svg viewBox="0 0 400 16" aria-hidden="true" focusable="false"><path className="quota-reference-axis" d="M1 8h398" /><rect className="quota-example-bar" x="1" y="1" width="99.5" height="14" rx="3" /></svg>
            <figcaption>{t("sessionQuota.benchmark")}</figcaption>
          </figure>
          <div className="session-quota-session-example">
            <span>{t("sessionQuota.exampleSessionA")}<strong>13%</strong></span>
            <span>{t("sessionQuota.exampleSessionB")}<strong>12%</strong></span>
            <span>{t("sessionQuota.exampleSessionC")}<strong>{t("sessionQuota.exampleMissing")}</strong></span>
          </div>
          <p className="session-quota-example-count">{t("sessionQuota.exampleCoverage")}</p>
          <ul><li>{t("sessionQuota.scope")}</li><li>{t("sessionQuota.planChange")}</li></ul>
          <p className="session-quota-example-note">{t("sessionQuota.exampleNote")}</p>
          {(state?.loading || state?.error) && <p className="session-quota-explanation-status">{t(state.loading ? "sessionQuota.loading" : "sessionQuota.errorDetail")}</p>}
          <footer>{t("sessionQuota.source")}{dataAsOf && <div>{t("sessionQuota.asOf", { time: new Date(dataAsOf).toLocaleString(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) })}</div>}</footer>
  </PromptUsageHelpDialog>
}
