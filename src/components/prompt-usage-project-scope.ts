import type { PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { DEFAULT_PROMPT_USAGE_TIME_SCOPE, localDateKeyFromTimestamp, usageTimeScopeContains, type UsageTimeScope } from "@/lib/time-scope"
import { mergeCostLines } from "@/lib/prompt-usage-cost"
import { combineEstimationStatus } from "@/lib/currency"

export function scopeForSession(session?: PromptUsageSession, turnId?: string, current = DEFAULT_PROMPT_USAGE_TIME_SCOPE): UsageTimeScope {
  const requested = session?.turns.find(turn => turn.id === turnId)
  const latest = requested ?? session?.turns.reduce<PromptUsageTurn | undefined>((latest, turn) => (
    Number.isFinite(Date.parse(turn.startedAt ?? "")) && (!latest || Date.parse(turn.startedAt!) > Date.parse(latest.startedAt!)) ? turn : latest
  ), undefined)
  const dateKey = localDateKeyFromTimestamp(latest?.startedAt)
  return dateKey && (Boolean(turnId) || !usageTimeScopeContains(current, latest?.startedAt)) ? { type: "day", dateKey } : current
}

export function scopeProjects(projects: PromptUsageProject[], scope: UsageTimeScope, selected: string[], now = new Date(), pinnedSessionIds: string[] = [], pinnedProjectIds: string[] = []): PromptUsageProject[] {
  const pins = new Set(pinnedSessionIds)
  return projects.flatMap(project => {
    if (selected.length && !selected.includes(project.id)) return []
    const sessions = project.sessions.flatMap(session => {
      const turns = session.turns.filter(turn => usageTimeScopeContains(scope, turn.startedAt, now))
      if (!turns.length && !pins.has(session.id)) return []
      if (turns.length === session.turns.length) return [session]
      const updatedAt = turns.reduce<string | null>((latest, turn) => !latest || Date.parse(turn.startedAt ?? "") > Date.parse(latest) ? turn.startedAt : latest, null)
      const priced = turns.filter(turn => turn.costUsd != null)
      const status = combineEstimationStatus(priced.map(turn => turn.estimationStatus))
      const cost = {
        costUsd: priced.length ? priced.reduce((sum, turn) => sum + turn.costUsd!, 0) : null,
        estimationStatus: !priced.length ? "unknown" as const : priced.length < turns.length || status === "unknown" ? "partial_rate" as const : status,
      }
      const fees = turns.map(turn => turn.costBreakdown)
      const costBreakdown = fees.every(fee => fee != null) ? fees.reduce((sum, fee) => ({
        inputUsd: sum.inputUsd + fee!.inputUsd,
        cacheReadUsd: sum.cacheReadUsd + fee!.cacheReadUsd,
        cacheWriteUsd: sum.cacheWriteUsd + fee!.cacheWriteUsd,
        outputUsd: sum.outputUsd + fee!.outputUsd,
      }), { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }) : null
      return [{ ...session, turns, promptCount: turns.length, isActive: turns.some(turn => turn.isActive), updatedAt, ...cost, costBreakdown, costLines: mergeCostLines(turns) }]
    })
    if (!sessions.length && !pinnedProjectIds.includes(project.id)) return []
    if (sessions.length === project.sessions.length && sessions.every((session, index) => session === project.sessions[index])) return [project]
    return [{ ...project, sessions, sessionCount: sessions.length, promptCount: sessions.reduce((sum, session) => sum + session.promptCount, 0), isActive: sessions.some(session => session.isActive), updatedAt: sessions.reduce<string | null>((latest, session) => !latest || Date.parse(session.updatedAt ?? "") > Date.parse(latest) ? session.updatedAt : latest, null) }]
  })
}
