import { describe, expect, it } from "vitest"
import {
  dateFromLocalKey,
  inclusiveCalendarDayCount,
  isSelectableDateKey,
  isValidCalendarRange,
  makeCalendarDecorationIndices,
  makeCalendarLabelIndices,
  makeHourlySlots,
  normalizeCalendarDays,
  selectableDateBounds,
  summarizeCost,
  type TimedBarChartPoint,
} from "@/components/usage-trend-utils"

function point(overrides: Partial<TimedBarChartPoint>): TimedBarChartPoint {
  return {
    label: "",
    value: 0,
    valueLabel: null,
    modelUsage: [],
    ...overrides,
  }
}

describe("usage trend calendar normalization", () => {
  it("fills elapsed missing calendar days with zeroes", () => {
    const now = new Date(2026, 7, 22, 18, 0, 0)
    const normalized = normalizeCalendarDays([
      point({ label: "8/20", startAt: "2026-08-20", value: 40 }),
      point({ label: "8/22", startAt: "2026-08-22", value: 80 }),
    ], 4, now)

    expect(normalized.map((item) => [item.label, item.value])).toEqual([
      ["8/19", 0],
      ["8/20", 40],
      ["8/21", 0],
      ["8/22", 80],
    ])
  })

  it("uses local calendar arithmetic for leap days and year boundaries", () => {
    expect(dateFromLocalKey("2024-02-29")).not.toBeNull()
    expect(dateFromLocalKey("2025-02-29")).toBeNull()
    expect(inclusiveCalendarDayCount("2024-02-28", "2024-03-01")).toBe(3)
    expect(inclusiveCalendarDayCount("2025-12-31", "2026-01-01")).toBe(2)
  })

  it("keeps the selectable window at 365 days plus one hidden comparison day", () => {
    const now = new Date(2026, 7, 22, 18, 0, 0)
    const bounds = selectableDateBounds(now)
    expect(bounds.minimum).toBe("2025-08-23")
    expect(bounds.maximum).toBe("2026-08-22")
    expect(inclusiveCalendarDayCount(bounds.minimum, bounds.maximum)).toBe(365)
    expect(isSelectableDateKey(bounds.minimum, now)).toBe(true)
    expect(isSelectableDateKey("2025-08-22", now)).toBe(false)
    expect(isValidCalendarRange(bounds.minimum, bounds.maximum)).toBe(true)
    expect(isValidCalendarRange("2025-08-22", bounds.maximum)).toBe(false)
  })

  it("reduces long-range decoration while retaining readable calendar labels", () => {
    const now = new Date(2026, 7, 22, 18, 0, 0)
    const points = normalizeCalendarDays([], 366, now)
    expect(makeCalendarDecorationIndices(points).length).toBeLessThan(points.length)
    expect(makeCalendarLabelIndices(points).length).toBeLessThanOrEqual(14)
    expect(makeCalendarLabelIndices(points)[0]).toBe(0)
    expect(makeCalendarLabelIndices(points).at(-1)).toBe(365)
  })

  it("keeps weekly labels away from the final daily label", () => {
    const now = new Date(2026, 7, 24, 18, 0, 0)
    const points = normalizeCalendarDays([], 30, now)

    expect(makeCalendarLabelIndices(points, now)).toEqual([0, 7, 14, 21, 29])
  })
})

describe("usage trend hourly normalization", () => {
  it("keeps future hours unobserved and fills elapsed empty hours", () => {
    const now = new Date(2026, 7, 22, 10, 25, 0)
    const activeStart = new Date(2026, 7, 22, 10, 0, 0)
    const slots = makeHourlySlots([
      point({
        label: "10:00",
        startAt: activeStart.toISOString(),
        value: 120,
        modelUsage: [{ name: "GPT-5.6 Sol", tokens: 120 }],
      }),
    ], now, now)

    expect(slots).toHaveLength(24)
    expect(slots[9]).toMatchObject({ value: 0, current: false, future: false })
    expect(slots[10]).toMatchObject({ value: 120, current: true, future: false })
    expect(slots[11]).toMatchObject({ value: 0, current: false, future: true })
    expect(slots.filter((slot) => !slot.future).reduce((sum, slot) => sum + slot.value, 0)).toBe(120)
  })

  it("merges duplicate events in the same hour without losing model totals", () => {
    const now = new Date(2026, 7, 22, 16, 30, 0)
    const startAt = new Date(2026, 7, 22, 14, 0, 0).toISOString()
    const slots = makeHourlySlots([
      point({ startAt, value: 80, modelUsage: [{ name: "GPT-5.6 Sol", tokens: 80 }] }),
      point({ startAt, value: 20, modelUsage: [{ name: "GPT-5.6 Luna", tokens: 20 }] }),
    ], now, now)

    expect(slots[14].value).toBe(100)
    expect(slots[14].modelUsage).toEqual([
      { name: "GPT-5.6 Sol", tokens: 80, costUsd: null, estimationStatus: "unknown" },
      { name: "GPT-5.6 Luna", tokens: 20, costUsd: null, estimationStatus: "unknown" },
    ])
  })

  it("keeps every hour of a historical civil day available for scrubbing", () => {
    const day = new Date(2026, 7, 4, 12, 0, 0)
    const now = new Date(2026, 7, 22, 18, 0, 0)
    const startAt = new Date(2026, 7, 4, 23, 0, 0).toISOString()
    const slots = makeHourlySlots([point({ startAt, value: 40 })], day, now)

    expect(slots).toHaveLength(24)
    expect(slots.every((slot) => !slot.current && !slot.future)).toBe(true)
    expect(slots[23].value).toBe(40)
  })
})

describe("usage trend cost summaries", () => {
  it("keeps the priced portion when a range also contains unpriced usage", () => {
    const summary = summarizeCost([
      point({ value: 100, costUsd: 1.25, estimationStatus: "current_rate" }),
      point({ value: 10, costUsd: null, estimationStatus: "unknown" }),
    ])

    expect(summary).toEqual({ costUsd: 1.25, estimationStatus: "partial_rate" })
  })

  it("does not turn wholly unpriced usage into a zero estimate", () => {
    const summary = summarizeCost([
      point({ value: 10, costUsd: null, estimationStatus: "unknown" }),
    ])

    expect(summary).toEqual({ costUsd: null, estimationStatus: "unknown" })
  })
})
