import type { PromptUsageTurn } from "./prompt-usage"

export function promptDuration(turn: PromptUsageTurn, now: number): number | null {
  const start = Date.parse(turn.startedAt ?? "")
  const end = turn.isActive ? now : Date.parse(turn.completedAt ?? "")
  if (turn.interrupted || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return end - start
}

export function uniquePrompts(turns: PromptUsageTurn[]): PromptUsageTurn[] {
  return [...new Map(turns.map(turn => [turn.id, turn])).values()]
}

export function sumPromptDurations(turns: PromptUsageTurn[], now: number) {
  const unique = uniquePrompts(turns)
  let elapsed = 0
  let recorded = 0
  let running = 0
  for (const turn of unique) {
    const duration = promptDuration(turn, now)
    if (duration == null) continue
    elapsed += duration
    recorded++
    if (turn.isActive) running++
  }
  return { elapsed: recorded ? elapsed : null, recorded, total: unique.length, running }
}

export function formatExecutionTime(milliseconds: number, locale: string): string {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const units: [number, string][] = hours ? [[hours, "hour"], [minutes, "minute"]]
    : minutes ? [[minutes, "minute"], [seconds % 60, "second"]] : [[seconds, "second"]]
  return units.filter(([value]) => value > 0 || units.length === 1).map(([value, unit]) => (
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(value)
  )).join(" ")
}
