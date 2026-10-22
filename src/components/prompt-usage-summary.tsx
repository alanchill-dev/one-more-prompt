import { useI18n } from "@/hooks/use-i18n"
import { combineEstimationStatus } from "@/lib/currency"
import { mergeCostLines } from "@/lib/prompt-usage-cost"
import { formatExecutionTime, sumPromptDurations, uniquePrompts } from "@/lib/prompt-usage-duration"
import { formatShareTokens } from "@/lib/today-models"
import type { PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import type { SessionQuotaState } from "@/hooks/use-session-quota"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { SessionQuotaHelp, SessionQuotaMetric } from "./session-quota"
import { TimeSummaryDetail } from "./prompt-summary-detail-content"
import { PromptSummaryValueDetail } from "./prompt-summary-value-detail"
import { PromptUsageTimeHelp } from "./prompt-usage-time-help"
import { ApiEquivalentCell } from "./prompt-usage-cost-explanation"

type SummaryRow = {
  kind: "project" | "session"
  name: string
  turns: PromptUsageTurn[]
  session?: PromptUsageSession
  project?: PromptUsageProject
  duration: ReturnType<typeof sumPromptDurations>
}

function SummaryValues({ row, sessionQuota }: { row: SummaryRow; sessionQuota?: SessionQuotaState }) {
  const t = useI18n()
  const { kind, turns, session, project, duration } = row
  const priced = turns.filter(turn => turn.costUsd != null)
  const status = combineEstimationStatus(priced.map(turn => turn.estimationStatus))
  const cost = session ?? {
    costUsd: priced.length ? priced.reduce((sum, turn) => sum + turn.costUsd!, 0) : null,
    estimationStatus: !priced.length ? "unknown" as const : priced.length < turns.length ? "partial_rate" as const : status,
    costLines: mergeCostLines(turns),
  }
  const incompleteTime = duration.recorded < duration.total || duration.running > 0
  const timeValue = duration.elapsed == null ? t("promptUsage.timeNotRecorded")
    : `${incompleteTime ? ">" : ""}${formatExecutionTime(duration.elapsed, t("settings.currency.locale"))}`
  const timeCoverage = t("promptUsage.timeCoverage", { recorded: duration.recorded, total: duration.total })
  return <section data-scope={kind} data-layout="project-container" data-testid={`prompt-usage-${kind}-summary`} className="prompt-summary-section" aria-label={t(kind === "project" ? "promptUsage.projectSummary" : "promptUsage.sessionSummary")}>
    <header className="prompt-summary-context" data-scope={kind} data-testid={`${kind}-title-row`}>
      <span className="prompt-summary-scope" data-summary-field="scope">{t(kind === "project" ? "promptUsage.projectSummary" : "promptUsage.sessionSummary")}</span>
      <h3 className="prompt-summary-name" data-summary-field="name">{row.name}</h3>
      <span className="prompt-summary-count" data-summary-field="count">{t(turns.length === 1 ? "promptUsage.promptCount" : "promptUsage.promptsCount", { count: turns.length })}</span>
    </header>
    <div className="prompt-summary-groups">
      <div className="prompt-summary-token-group" data-summary-field="tokens" role="group" aria-label={t("promptUsage.totalTokens")}>
        <span className="prompt-summary-label">{t("overview.tokenUnit")}</span>
        <div className="prompt-summary-token-line"><span className="prompt-summary-primary prompt-summary-token" data-testid={`prompt-usage-${kind}-token-total`}>{formatShareTokens(turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0))}</span>
          <ApiEquivalentCell estimate={cost} testId={`prompt-usage-${kind}-cost`} inline />
        </div>
      </div>
      <div data-summary-field="time" role="group" aria-label={t("promptUsage.summaryTime")}>
        <div className="prompt-summary-label prompt-summary-heading-label"><span>{t("promptUsage.summaryTime")}</span><PromptUsageTimeHelp /></div>
        <div className="prompt-summary-metric">
          <PromptSummaryValueDetail label={`${t("promptUsage.summaryTime")}: ${timeValue}. ${timeCoverage}`} testId="duration-coverage"
            content={<TimeSummaryDetail recorded={duration.recorded} total={duration.total} scope={kind} />}>
            <span className={`prompt-summary-primary${duration.elapsed == null ? " is-empty" : " prompt-summary-time"}`} data-testid="total-execution-time">{timeValue}</span>
          </PromptSummaryValueDetail>
        </div>
      </div>
      <div data-summary-field="quota" role="group" aria-label={t("promptUsage.summaryWeekly")}>
        <div className="prompt-summary-label prompt-summary-heading-label"><span>{t("promptUsage.summaryWeekly")}</span><SessionQuotaHelp state={sessionQuota} /></div>
        <SessionQuotaMetric state={sessionQuota} id={session?.id ?? project?.id ?? ""} sessions={project?.sessions} />
      </div>
    </div>
  </section>
}

export function PromptUsageSummary({ session, project, sessionQuota, active = true }: {
  session?: PromptUsageSession; project?: PromptUsageProject; sessionQuota?: SessionQuotaState; active?: boolean
}) {
  const t = useI18n()
  const scopes = [
    ...(project ? [{ kind: "project" as const, name: project.name, turns: uniquePrompts(project.sessions.flatMap(session => session.turns)), project }] : []),
    ...(session ? [{ kind: "session" as const, name: session.title, turns: uniquePrompts(session.turns), session }] : []),
  ]
  const now = useNowTicker({ enabled: active && scopes.some(scope => scope.turns.some(turn => turn.isActive)) })
  const rows: SummaryRow[] = scopes.map(scope => ({ ...scope, duration: sumPromptDurations(scope.turns, now) }))
  return <div className="prompt-usage-summary" lang={t("settings.currency.locale")} data-testid="prompt-usage-summary-matrix" data-has-project={!!project} aria-label={t("promptUsage.overallTotals")}>
    <div className="prompt-summary-container">
      {rows.map(row => <SummaryValues key={row.kind} row={row} sessionQuota={sessionQuota} />)}
    </div>
  </div>
}
