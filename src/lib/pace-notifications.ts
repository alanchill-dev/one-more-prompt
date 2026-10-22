import type { MetricLine } from "@/lib/plugin-types"

/**
 * Quota notifications. The firing rules stay
 * unit-testable, independent of the notification transport (Tauri) and the React refresh loop.
 *
 * A milestone fires once per reset window per metric, on a *worsening edge* — never at launch on an
 * already-bad quota, and never repeatedly while the quota sits in the same bucket.
 */

/** One of the quota milestones a user can be alerted about. */
export type PaceMilestone = "underTenPercent" | "sessionReset"

export const PACE_MILESTONES: PaceMilestone[] = [
  "underTenPercent",
  "sessionReset",
]

/** User-facing copy for each milestone: the Settings row, the notification title, and the tooltip. */
export const MILESTONE_META: Record<
  PaceMilestone,
  { label: string; title: string; body: string; tooltip: string }
> = {
  underTenPercent: {
    label: "Almost Out",
    title: "Almost Out",
    body: "Under 10% usage remaining for this window.",
    tooltip: "Alert when a limit drops below 10% remaining.",
  },
  sessionReset: {
    label: "Session Reset",
    title: "Session Reset",
    body: "Back to 0% used.",
    tooltip: "Alert when a session returns to 0% used.",
  },
}

/** Which per-milestone toggles are currently on. */
export type PaceToggles = {
  underTenPercent: boolean
  sessionReset: boolean
}

export const anyEnabled = (t: PaceToggles): boolean =>
  t.underTenPercent || t.sessionReset

/** Deduplication state for one metric, persisted across refresh passes. */
export type NotificationState = {
  /** Reset instant of the window the fired flags belong to; advancing it clears the fired set. */
  resetsAtMs: number | null
  /** Milestones already alerted in the current window. */
  firedMilestones: Set<PaceMilestone>
  /** Whether remaining was under 10% previously, so crossing under-10% is an edge. */
  wasUnderTenPercent: boolean
  /** Whether this metric previously had non-zero usage, so a reset to 0% is an edge. */
  wasAboveZeroUsed: boolean
  /** True once the first real observation is recorded as the baseline (no firing before then). */
  primed: boolean
}

export const initialNotificationState = (): NotificationState => ({
  resetsAtMs: null,
  firedMilestones: new Set(),
  wasUnderTenPercent: false,
  wasAboveZeroUsed: false,
  primed: false,
})

/** One metric's observed usage this pass. */
export type MetricObservation = {
  hasData: boolean
  /** Remaining share of the limit, 0..1. */
  remainingFraction: number
  /** Used share of the limit, 0..1. */
  usedFraction?: number
  resetsAtMs: number | null
  /** True for the provider's rolling session meter. */
  isSession?: boolean
}

export type PaceTransition = {
  fire: PaceMilestone[]
  newState: NotificationState
}

const clone = (state: NotificationState): NotificationState => ({
  resetsAtMs: state.resetsAtMs,
  firedMilestones: new Set(state.firedMilestones),
  wasUnderTenPercent: state.wasUnderTenPercent,
  wasAboveZeroUsed: state.wasAboveZeroUsed,
  primed: state.primed,
})

/**
 * Whether a milestone is a candidate to fire this pass (toggle on, not already fired this window).
 * Does NOT mark it fired — the caller commits the dedup mark only after delivery succeeds, so a
 * skipped/failed delivery doesn't consume the edge.
 */
function maybeFire(
  milestone: PaceMilestone,
  fire: PaceMilestone[],
  state: NotificationState,
  toggles: PaceToggles
): boolean {
  if (!toggles[milestone] || state.firedMilestones.has(milestone)) return false
  fire.push(milestone)
  return true
}

/**
 * Decide which milestones to fire for one metric this pass, and the state to persist. Rules mirror
 * the reference logic: a later reset clears dedup; under-10% fires when remaining crosses under 10%
 * and re-arms on recovery; missing data suppresses alerts without disturbing recorded signals; the first real
 * observation is recorded as a baseline without firing.
 */
export function transitions(
  obs: MetricObservation,
  previous: NotificationState,
  toggles: PaceToggles
): PaceTransition {
  const next = clone(previous)
  const { hasData, remainingFraction, resetsAtMs } = obs
  const usedFraction = obs.usedFraction ?? Math.min(1, Math.max(0, 1 - remainingFraction))

  // New window: reset dedup. A strictly later reset (or a reset appearing where there was none) starts
  // fresh; a nil-or-equal reset keeps the window.
  if (resetsAtMs != null && (previous.resetsAtMs == null || resetsAtMs > previous.resetsAtMs)) {
    next.firedMilestones = new Set()
    next.wasUnderTenPercent = false
    // Keep wasAboveZeroUsed: a session reset is detected by seeing a used session return to 0% in
    // the next window.
  }
  next.resetsAtMs = resetsAtMs ?? previous.resetsAtMs

  // No real data backing the tile: skip without disturbing recorded signals.
  if (!hasData) {
    return { fire: [], newState: next }
  }

  // First real observation: record it as the baseline without firing, so a quota already in a bad
  // state when the app opens doesn't spam alerts at launch.
  if (!next.primed) {
    next.primed = true
    next.wasUnderTenPercent = remainingFraction < 0.1
    next.wasAboveZeroUsed = usedFraction > 0
    next.firedMilestones = new Set()
    return { fire: [], newState: next }
  }

  const fire: PaceMilestone[] = []

  const resetToZero = obs.isSession === true && usedFraction === 0 && next.wasAboveZeroUsed
  if (resetToZero) {
    maybeFire("sessionReset", fire, next, toggles)
  }
  if (usedFraction > 0) {
    next.firedMilestones.delete("sessionReset")
  }
  next.wasAboveZeroUsed = usedFraction > 0

  // Preserve the existing suppression of alerts once a metric is effectively exhausted.
  // Record the exhausted state so the same crossing is not replayed later, then suppress all milestones.
  if (usedFraction >= 0.99) {
    next.wasUnderTenPercent = true
    return { fire: [], newState: next }
  }

  // Under-10%-remaining edge.
  const underNow = remainingFraction < 0.1
  const underCrossed = underNow && !next.wasUnderTenPercent
  let underFired = false
  if (underCrossed && maybeFire("underTenPercent", fire, next, toggles)) {
    underFired = true
  }
  if (!underNow) {
    next.firedMilestones.delete("underTenPercent")
  }
  if (!underCrossed || underFired) {
    next.wasUnderTenPercent = underNow
  }

  return { fire, newState: next }
}

/** Read actual usage and reset time from a progress meter. */
export function deriveObservation(line: MetricLine): MetricObservation | null {
  if (line.type !== "progress") return null

  const { used, limit } = line
  if (used == null || limit == null || !Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
    return { hasData: false, remainingFraction: 1, resetsAtMs: null }
  }

  const usedFraction = Math.min(1, Math.max(0, used / limit))
  const remainingFraction = Math.min(1, Math.max(0, (limit - used) / limit))
  const resetsAtMs = line.resetsAt ? Date.parse(line.resetsAt) : null

  return { hasData: true, remainingFraction, usedFraction, resetsAtMs: Number.isFinite(resetsAtMs) ? resetsAtMs : null }
}

/** Stable per-metric key so dedup state follows a metric across refreshes. */
export const metricKey = (providerId: string, label: string): string => `${providerId}:${label}`

/** A provider's rendered metrics, as fed to `evaluate`. */
export type ProviderMetrics = {
  providerId: string
  displayName: string
  lines: MetricLine[]
}

/** A milestone that should be delivered now, with the context needed to write the notification. */
export type FiredNotification = {
  key: string
  milestone: PaceMilestone
  providerId: string
  displayName: string
  metricLabel: string
}

/**
 * Evaluate every provider's metrics against the persisted dedup state. Returns the milestones to fire
 * now and the next state map. Fired candidates are NOT yet marked in the returned state — the caller
 * marks each one only after its notification is delivered, so a failed/blocked delivery re-fires next
 * pass. States for metrics not seen this pass are carried forward unchanged.
 */
export function evaluate(
  providers: ProviderMetrics[],
  states: Map<string, NotificationState>,
  toggles: PaceToggles
): { fired: FiredNotification[]; nextStates: Map<string, NotificationState> } {
  const nextStates = new Map(states)
  const fired: FiredNotification[] = []

  if (!anyEnabled(toggles)) return { fired, nextStates }

  for (const provider of providers) {
    for (const line of provider.lines) {
      const obs = deriveObservation(line)
      if (!obs) continue

      const key = metricKey(provider.providerId, line.label)
      const previous = nextStates.get(key) ?? initialNotificationState()
      const { fire, newState } = transitions({ ...obs, isSession: line.label === "Session" }, previous, toggles)
      nextStates.set(key, newState)

      for (const milestone of fire) {
        fired.push({
          key,
          milestone,
          providerId: provider.providerId,
          displayName: provider.displayName,
          metricLabel: line.label,
        })
      }
    }
  }

  return { fired, nextStates }
}
