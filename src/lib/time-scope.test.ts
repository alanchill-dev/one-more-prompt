import { describe, expect, it } from "vitest"
import { DEFAULT_PROMPT_USAGE_TIME_SCOPE, normalizeUsageTimeScope, usageTimeScopeContains, usageTimeScopeKey } from "@/lib/time-scope"

describe("UsageTimeScope", () => {
  const now = new Date(2026, 8, 5, 12)

  it("defaults both Prompt Usage views to 30 days", () => {
    expect(DEFAULT_PROMPT_USAGE_TIME_SCOPE).toEqual({ type: "lastDays", days: 30 })
  })

  it.each([7, 14, 30] as const)("includes newly received prompts and exact calendar boundaries in %i Days", (days) => {
    const scope = { type: "lastDays", days } as const
    // Exercise both daylight-saving change dates in local time.
    for (const frozenNow of [new Date(2026, 2, 8, 12), new Date(2026, 10, 1, 12)]) {
      const year = frozenNow.getFullYear(), month = frozenNow.getMonth(), day = frozenNow.getDate()
      const contains = (date: Date) => usageTimeScopeContains(scope, date.toISOString(), frozenNow)
      expect(contains(new Date(year, month, day, 12, 0, 5))).toBe(true)
      expect(contains(new Date(year, month, day - days + 1))).toBe(true)
      expect(contains(new Date(year, month, day - days, 23, 59, 59, 999))).toBe(false)
      expect(contains(new Date(year, month, day, 23, 59, 59, 999))).toBe(true)
      expect(contains(new Date(year, month, day + 1))).toBe(false)
    }
  })

  it("matches a specific local calendar day", () => {
    expect(usageTimeScopeContains({ type: "day", dateKey: "2026-09-04" }, new Date(2026, 8, 4, 23, 59).toISOString(), now)).toBe(true)
    expect(usageTimeScopeContains({ type: "day", dateKey: "2026-09-04" }, new Date(2026, 8, 5, 0, 1).toISOString(), now)).toBe(false)
  })

  it("matches a specific local hour", () => {
    expect(usageTimeScopeContains({ type: "hour", dateKey: "2026-09-04", hour: 14 }, new Date(2026, 8, 4, 14, 32).toISOString(), now)).toBe(true)
    expect(usageTimeScopeContains({ type: "hour", dateKey: "2026-09-04", hour: 14 }, new Date(2026, 8, 4, 15).toISOString(), now)).toBe(false)
  })

  it("matches inclusive date ranges", () => {
    const scope = { type: "range", startKey: "2026-09-01", endKey: "2026-09-04" } as const
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 1).toISOString(), now)).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 4, 23, 59).toISOString(), now)).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 5).toISOString(), now)).toBe(false)
  })

  it("normalizes reversed ranges and invalid hours", () => {
    expect(normalizeUsageTimeScope({ type: "range", startKey: "2026-09-05", endKey: "2026-09-01" })).toEqual({ type: "range", startKey: "2026-09-01", endKey: "2026-09-05" })
    expect(normalizeUsageTimeScope({ type: "hour", dateKey: "2026-09-04", hour: 99 })).toEqual({ type: "hour", dateKey: "2026-09-04", hour: 23 })
  })

  it("matches local minute windows with an inclusive start and exclusive end", () => {
    const scope = { type: "window", dateKey: "2026-09-04", startMinute: 540, endMinute: 720 } as const
    const at = (hour: number, minute: number, second = 0) => new Date(2026, 8, 4, hour, minute, second).toISOString()
    expect(usageTimeScopeContains(scope, at(8, 59, 59))).toBe(false)
    expect(usageTimeScopeContains(scope, at(9, 0))).toBe(true)
    expect(usageTimeScopeContains(scope, at(11, 59, 59))).toBe(true)
    expect(usageTimeScopeContains(scope, at(12, 0))).toBe(false)
    expect(usageTimeScopeKey(scope)).toBe("window:2026-09-04:540:720")
  })

  it("includes midnight and 23:59 while excluding the next local day", () => {
    const scope = { type: "window", dateKey: "2026-09-04", startMinute: 0, endMinute: 1440 } as const
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 4).toISOString())).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 4, 23, 59, 59).toISOString())).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(2026, 8, 5).toISOString())).toBe(false)
  })

  it("normalizes minute windows to ordered nonempty same-day bounds", () => {
    const scope = { type: "window", dateKey: "2026-09-04", startMinute: 720, endMinute: 540 } as const
    expect(normalizeUsageTimeScope(scope)).toEqual({ ...scope, startMinute: 540, endMinute: 720 })
    expect(normalizeUsageTimeScope({ ...scope, startMinute: -10, endMinute: 1500 })).toEqual({ ...scope, startMinute: 0, endMinute: 1440 })
    expect(normalizeUsageTimeScope({ ...scope, startMinute: 1440, endMinute: 1440 })).toEqual({ ...scope, startMinute: 1439, endMinute: 1440 })
  })
})


describe("Exact Timeline Intervals", () => {
  it("retains millisecond identity and uses half-open timestamp membership across days", () => {
    const startAt = Date.parse("2026-09-04T23:59:30.123+08:00")
    const endAt = Date.parse("2026-09-05T00:30:15.456+08:00")
    const scope = { type: "interval" as const, startAt, endAt }
    expect(usageTimeScopeKey(scope)).toBe(`interval:${startAt}:${endAt}`)
    expect(usageTimeScopeContains(scope, new Date(startAt - 1).toISOString())).toBe(false)
    expect(usageTimeScopeContains(scope, new Date(startAt).toISOString())).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(endAt - 1).toISOString())).toBe(true)
    expect(usageTimeScopeContains(scope, new Date(endAt).toISOString())).toBe(false)
  })
  it("orders dragged endpoints and retains a minimum one-millisecond interval", () => {
    expect(normalizeUsageTimeScope({ type: "interval", startAt: 2000.5, endAt: 1000.2 })).toEqual({ type: "interval", startAt: 1000, endAt: 2000 })
    expect(normalizeUsageTimeScope({ type: "interval", startAt: 1000, endAt: 1000 })).toEqual({ type: "interval", startAt: 1000, endAt: 1001 })
  })
})
