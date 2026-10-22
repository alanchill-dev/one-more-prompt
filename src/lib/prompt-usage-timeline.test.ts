import { describe, expect, it } from "vitest"
import { timelineBounds } from "./prompt-usage-timeline"

describe("timelineBounds", () => {
  it("uses the whole selected local day even with no events", () => {
    const now = new Date(2026, 8, 7, 13, 30)
    expect(timelineBounds({ type: "today" }, now)).toEqual({ start: new Date(2026, 8, 7).getTime(), end: new Date(2026, 8, 8).getTime() })
  })
  it("keeps the hour and window axes consistent with their filter boundaries", () => {
    const expected = { start: new Date(2026, 8, 7, 9).getTime(), end: new Date(2026, 8, 7, 10).getTime() }
    expect(timelineBounds({ type: "hour", dateKey: "2026-09-07", hour: 9 })).toEqual(expected)
    expect(timelineBounds({ type: "window", dateKey: "2026-09-07", startMinute: 540, endMinute: 600 })).toEqual(expected)
  })
  it("includes the complete last calendar day of a multi-day range", () => {
    expect(timelineBounds({ type: "range", startKey: "2026-09-01", endKey: "2026-09-07" })).toEqual({ start: new Date(2026, 8, 1).getTime(), end: new Date(2026, 8, 8).getTime() })
  })
})


it("preserves exact interval endpoints across daylight-saving transitions", () => {
  for (const [start, end] of [
    ["2026-03-08T01:30:00.123-05:00", "2026-03-08T03:30:00.456-04:00"],
    ["2026-11-01T01:30:00.123-04:00", "2026-11-01T01:30:00.456-05:00"],
  ]) {
    const startAt = Date.parse(start)
    const endAt = Date.parse(end)
    expect(timelineBounds({ type: "interval", startAt, endAt })).toEqual({ start: startAt, end: endAt })
    expect(endAt - startAt).toBe(3600333)
  }
})
