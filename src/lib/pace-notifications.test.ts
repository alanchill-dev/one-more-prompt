import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import {
  deriveObservation,
  evaluate,
  initialNotificationState,
  metricKey,
  transitions,
  type MetricObservation,
  type NotificationState,
  type PaceToggles,
} from "@/lib/pace-notifications"

const ALL_ON: PaceToggles = {
  underTenPercent: true,
  sessionReset: true,
}

const obs = (
  hasData: boolean,
  remainingFraction: number,
  resetsAtMs: number | null = 1000
): MetricObservation => ({ hasData, remainingFraction, resetsAtMs })

// Run a sequence of observations through transitions, returning the fired milestones per step.
function run(steps: MetricObservation[], toggles: PaceToggles = ALL_ON) {
  let state = initialNotificationState()
  const fires: string[][] = []
  for (const step of steps) {
    const { fire, newState } = transitions(step, state, toggles)
    // Commit dedup marks as the orchestrator would after successful delivery.
    for (const m of fire) newState.firedMilestones.add(m)
    state = newState
    fires.push(fire)
  }
  return { fires, state }
}

describe("deriveObservation", () => {
  const NOW = 1_000_000
  const PERIOD = 100_000
  const progress = (used: number, extra: Partial<MetricLine> = {}): MetricLine => ({
    type: "progress",
    label: "Weekly",
    used,
    limit: 100,
    format: { kind: "percent" },
    resetsAt: new Date(NOW + PERIOD / 2).toISOString(),
    periodDurationMs: PERIOD,
    ...extra,
  })

  it("returns null for non-progress lines", () => {
    expect(deriveObservation({ type: "text", label: "Balance", value: "$1" })).toBeNull()
  })

  it("reports noData when the meter has no positive limit", () => {
    const line: MetricLine = { type: "progress", label: "X", used: 0, limit: 0, format: { kind: "percent" } }
    expect(deriveObservation(line)?.hasData).toBe(false)
  })

  it("uses actual remaining quota regardless of elapsed time", () => {
    expect(deriveObservation(progress(60))).toMatchObject({ hasData: true, remainingFraction: 0.4 })
    expect(deriveObservation(progress(100))).toMatchObject({ hasData: true, remainingFraction: 0 })
    expect(deriveObservation(progress(30, { resetsAt: undefined, periodDurationMs: undefined })))
      .toMatchObject({ hasData: true, remainingFraction: 0.7, resetsAtMs: null })
  })

})

describe("transitions", () => {
  it("primes the first observation without firing", () => {
    const { fires } = run([obs(true, 0.5)])
    expect(fires[0]).toEqual([])
  })

  it("fires Almost Out when remaining crosses under 10%, and re-arms on recovery", () => {
    const { fires } = run([
      obs(true, 0.5),
      obs(true, 0.05), // crosses under 10%
      obs(true, 0.05), // still under — no re-fire
      obs(true, 0.5), // recovers, re-arms
      obs(true, 0.08), // crosses again
    ])
    expect(fires[1]).toEqual(["underTenPercent"])
    expect(fires[2]).toEqual([])
    expect(fires[4]).toEqual(["underTenPercent"])
  })

  it("suppresses all milestones when usage is 99% or higher", () => {
    const { fires } = run([
      obs(true, 0.5),
      obs(true, 0.01),
    ])
    expect(fires[1]).toEqual([])
  })

  it("re-fires in a new reset window without re-priming", () => {
    const { fires } = run([obs(true, 0.5), obs(true, 0.05), obs(true, 0.05, 2000)])
    expect(fires).toEqual([[], ["underTenPercent"], ["underTenPercent"]])
  })

  it("missing data preserves the actual threshold crossing", () => {
    const { fires } = run([obs(true, 0.5), obs(false, 1), obs(true, 0.05)])
    expect(fires).toEqual([[], [], ["underTenPercent"]])
  })

  it("does not consume a disabled threshold edge", () => {
    const off = { ...ALL_ON, underTenPercent: false }
    const first = transitions(obs(true, 0.5), initialNotificationState(), off)
    const second = transitions(obs(true, 0.05), first.newState, off)
    expect(second.fire).toEqual([])
    expect(transitions(obs(true, 0.05), second.newState, ALL_ON).fire).toEqual(["underTenPercent"])
  })

})

describe("evaluate", () => {
  const providersAt = (used: number) => [
    {
      providerId: "claude",
      displayName: "Claude",
      lines: [
        { type: "progress", label: "Weekly", used, limit: 100, format: { kind: "percent" } } as MetricLine,
      ],
    },
  ]

  it("fires nothing when all toggles are off", () => {
    const { fired } = evaluate(
      providersAt(95),
      new Map(),
      { underTenPercent: false, sessionReset: false }
    )
    expect(fired).toEqual([])
  })

  it("primes on first pass then fires Almost Out when the metric drops under 10%", () => {
    const first = evaluate(providersAt(50), new Map(), ALL_ON) // remaining 0.5 → primes
    expect(first.fired).toEqual([])
    const second = evaluate(providersAt(95), first.nextStates, ALL_ON) // remaining 0.05 → crosses
    expect(second.fired).toHaveLength(1)
    expect(second.fired[0]).toMatchObject({
      key: metricKey("claude", "Weekly"),
      milestone: "underTenPercent",
      displayName: "Claude",
      metricLabel: "Weekly",
    })
  })

  it("fires Session Reset only when Session returns to 0% after usage", () => {
    const providersAt = (used: number) => [
      {
        providerId: "claude",
        displayName: "Claude",
        lines: [
          { type: "progress", label: "Session", used, limit: 100, format: { kind: "percent" } } as MetricLine,
        ],
      },
    ]

    const first = evaluate(providersAt(0), new Map(), ALL_ON)
    expect(first.fired).toEqual([])

    const second = evaluate(providersAt(20), first.nextStates, ALL_ON)
    expect(second.fired).toEqual([])

    const third = evaluate(providersAt(0), second.nextStates, ALL_ON)
    expect(third.fired).toHaveLength(1)
    expect(third.fired[0]).toMatchObject({
      key: metricKey("claude", "Session"),
      milestone: "sessionReset",
      displayName: "Claude",
      metricLabel: "Session",
    })

    const fourth = evaluate(providersAt(0), third.nextStates, ALL_ON)
    expect(fourth.fired).toEqual([])
  })

  it("fires Session Reset when a used session rolls into a new 0% window", () => {
    const providersAt = (used: number, resetsAt: number) => [
      {
        providerId: "claude",
        displayName: "Claude",
        lines: [
          {
            type: "progress",
            label: "Session",
            used,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: new Date(resetsAt).toISOString(),
          } as MetricLine,
        ],
      },
    ]

    const first = evaluate(providersAt(20, 1000), new Map(), ALL_ON)
    expect(first.fired).toEqual([])

    const second = evaluate(providersAt(0, 2000), first.nextStates, ALL_ON)
    expect(second.fired).toHaveLength(1)
    expect(second.fired[0]).toMatchObject({
      milestone: "sessionReset",
      metricLabel: "Session",
    })
  })

  it("carries forward state for metrics not seen this pass", () => {
    const seeded = new Map<string, NotificationState>([["other:X", initialNotificationState()]])
    const { nextStates } = evaluate(providersAt(50), seeded, ALL_ON)
    expect(nextStates.has("other:X")).toBe(true)
  })
})
