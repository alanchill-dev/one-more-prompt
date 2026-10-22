import { formatPromptDate } from "@/lib/prompt-usage-display"
import { dominantPromptUsageModel, type PromptUsageDominantModel, type PromptUsageProject, type PromptUsageSession, type PromptUsageTurn } from "@/lib/prompt-usage"
import { localDateKeyFromTimestamp, type UsageTimeScope } from "@/lib/time-scope"

export type TimelineItem = {
  project: PromptUsageProject
  session: PromptUsageSession
  turn: PromptUsageTurn
  startedAt: number
  dateKey: string
  model: PromptUsageDominantModel | null
}

export function flattenTimeline(projects: PromptUsageProject[]): TimelineItem[] {
  return projects.flatMap((project) => project.sessions.flatMap((session) => session.turns.flatMap((turn) => {
    const dateKey = localDateKeyFromTimestamp(turn.startedAt)
    if (!dateKey) return []
    return [{ project, session, turn, dateKey, startedAt: new Date(turn.startedAt!).getTime(), model: dominantPromptUsageModel(turn) }]
  }))).sort((a, b) => a.startedAt - b.startedAt || a.turn.id.localeCompare(b.turn.id))
}

function dayStart(key: string): Date {
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

// Calendar boundaries use local dates, so DST days need not contain exactly 24 hours.
export function timelineBounds(scope: UsageTimeScope, now = new Date()): { start: number; end: number } {
  if (scope.type === "interval") return { start: scope.startAt, end: scope.endAt }
  let start: Date
  let end: Date
  if (scope.type === "today" || scope.type === "lastDays") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    if (scope.type === "lastDays") start.setDate(start.getDate() - scope.days + 1)
  } else if (scope.type === "range") {
    start = dayStart(scope.startKey)
    end = dayStart(scope.endKey)
    end.setDate(end.getDate() + 1)
  } else {
    start = dayStart(scope.dateKey)
    end = dayStart(scope.dateKey)
    if (scope.type === "hour") {
      start.setHours(scope.hour)
      end.setHours(scope.hour + 1)
    } else if (scope.type === "window") {
      start.setMinutes(scope.startMinute)
      end.setMinutes(scope.endMinute)
    } else end.setDate(end.getDate() + 1)
  }
  return { start: start.getTime(), end: end.getTime() }
}

export function formatTimelineDate(dateKey: string): string {
  return formatPromptDate(dateKey)
}
