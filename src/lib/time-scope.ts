export type UsageTimeScope =
  | { type: "today" }
  | { type: "lastDays"; days: 7 | 14 | 30 }
  | { type: "day"; dateKey: string }
  | { type: "hour"; dateKey: string; hour: number }
  | { type: "window"; dateKey: string; startMinute: number; endMinute: number }
  | { type: "range"; startKey: string; endKey: string }
  | { type: "interval"; startAt: number; endAt: number }

export const DEFAULT_PROMPT_USAGE_TIME_SCOPE: UsageTimeScope = { type: "lastDays", days: 30 }

export function localDateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function localDateKeyFromTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : localDateKeyFromDate(date)
}

export function usageTimeScopeKey(scope: UsageTimeScope): string {
  switch (scope.type) {
    case "today": return "today"
    case "lastDays": return `last:${scope.days}`
    case "day": return `day:${scope.dateKey}`
    case "hour": return `hour:${scope.dateKey}:${scope.hour}`
    case "window": return `window:${scope.dateKey}:${scope.startMinute}:${scope.endMinute}`
    case "range": return `range:${scope.startKey}:${scope.endKey}`
    case "interval": return `interval:${scope.startAt}:${scope.endAt}`
  }
}

export function usageTimeScopeContains(
  scope: UsageTimeScope,
  startedAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!startedAt) return false
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return false
  if (scope.type === "interval") return date.getTime() >= scope.startAt && date.getTime() < scope.endAt
  const key = localDateKeyFromDate(date)

  if (scope.type === "today") return key === localDateKeyFromDate(now)
  if (scope.type === "day") return key === scope.dateKey
  if (scope.type === "hour") return key === scope.dateKey && date.getHours() === scope.hour
  if (scope.type === "window") {
    const minute = date.getHours() * 60 + date.getMinutes()
    return key === scope.dateKey && minute >= scope.startMinute && minute < scope.endMinute
  }
  if (scope.type === "range") return key >= scope.startKey && key <= scope.endKey

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - (scope.days - 1))
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime()
}

export function normalizeUsageTimeScope(scope: UsageTimeScope): UsageTimeScope {
  if (scope.type === "interval") {
    const startAt = Math.trunc(Math.min(scope.startAt, scope.endAt))
    const endAt = Math.max(startAt + 1, Math.trunc(Math.max(scope.startAt, scope.endAt)))
    return { ...scope, startAt, endAt }
  }
  if (scope.type === "window") {
    const startMinute = Math.min(1439, Math.max(0, Math.trunc(Math.min(scope.startMinute, scope.endMinute))))
    const endMinute = Math.min(1440, Math.max(startMinute + 1, Math.trunc(Math.max(scope.startMinute, scope.endMinute))))
    return { ...scope, startMinute, endMinute }
  }
  if (scope.type === "hour") {
    return { ...scope, hour: Math.min(23, Math.max(0, Math.trunc(scope.hour))) }
  }
  if (scope.type === "range" && scope.startKey > scope.endKey) {
    return { type: "range", startKey: scope.endKey, endKey: scope.startKey }
  }
  return scope
}
