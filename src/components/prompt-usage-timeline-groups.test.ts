import { describe, expect, it } from "vitest"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { groupTimelineItems, visibleEventGroups } from "./prompt-usage-timeline-groups"
const MINUTE = 60_000, DAY = 86_400_000
function item(id: string, at: number, tokens = 10, model: string | null = "gpt-a"): TimelineItem {
  return { startedAt: at, turn: { id, tokens: { totalTokens: tokens } }, model: model ? { canonicalName: model, name: model, totalTokens: tokens } : null } as TimelineItem
}
const ids = (groups: ReturnType<typeof groupTimelineItems>) => groups.flatMap(group => group.items.map(item => item.turn.id))

describe("period-wide Timeline collision grouping", () => {
  it("retains unique in-scope IDs and deterministic chronological order with unordered/equal timestamps", () => {
    const source = [item("c", 20), item("b", 10), item("a", 10), item("b", 10), item("outside", 100)]
    const groups = groupTimelineItems(source, 0, 100, 100, 1)
    expect(ids(groups)).toEqual(["a", "b", "c"])
    expect(groups[0].tokens).toBe(30)
    expect(source[0].turn.id).toBe("c")
  })
  it("keeps singleton timestamps exact at every zoom without a day boundary style switch", () => {
    for (const span of [5 * MINUTE, DAY - 1, DAY, 14 * DAY]) {
      expect(groupTimelineItems([item("one", 7)], 0, 30 * DAY, span, 1000)[0])
        .toMatchObject({ at: 7, start: 7, end: 7, markerWidth: 2 })
    }
  })
  it("preserves sparse eight-pixel singles and groups only an initial screen collision", () => {
    expect(groupTimelineItems([item("a", 10), item("b", 18), item("c", 26)], 0, 100, 100, 100)).toHaveLength(3)
    const groups = groupTimelineItems([item("a", 10), item("b", 17)], 0, 100, 100, 100)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ at: 13.5, start: 10, end: 17, markerWidth: 20 })
  })
  it("separates seconds when pixels resolve them and regroups with zoom or plot width", () => {
    const source = [item("a", 1000), item("b", 2000)]
    expect(groupTimelineItems(source, 0, DAY, 5 * MINUTE, 3000)).toHaveLength(2)
    expect(groupTimelineItems(source, 0, DAY, 5 * MINUTE, 1000)).toHaveLength(1)
    expect(groupTimelineItems(source, 0, DAY, DAY, 3000)).toHaveLength(1)
  })
  it("coalesces backwards after badge growth and reserves temporal-tail clearance for edge clamps", () => {
    const source = [item("previous", 10), item("first", 30), item("second", 31), item("tail", 54), item("separate", 100)]
    const groups = groupTimelineItems(source, 0, 150, 150, 150)
    expect(groups.map(group => ids([group]))).toEqual([["previous", "first", "second", "tail"], ["separate"]])
    const clipped = visibleEventGroups(groups, 40, 110)
    expect(ids(clipped)).toEqual(ids(groups))
    expect(clipped[0].items).toBe(groups[0].items)
    expect(groups[1].start - groups[0].end).toBeGreaterThan(groups[0].markerWidth + 5)
  })
  it("keeps full membership, timestamps, and Token totals across camera boundaries", () => {
    const groups = groupTimelineItems([item("one", 10, 20), item("two", 14, 30), item("next", 80, 90)], 0, 120, 120, 120)
    const left = visibleEventGroups(groups, 0, 12), right = visibleEventGroups(groups, 12, 90)
    expect(ids(left)).toEqual(["one", "two"])
    expect(ids(right)).toEqual(["one", "two", "next"])
    expect(left[0].tokens).toBe(50); expect(right[0].tokens).toBe(50)
    expect(left[0].items).toBe(right[0].items)
    expect(visibleEventGroups(groups, 15, 120).map(group => group.start)).toEqual([80])
  })
  it("retains dense 1500 and 5000 record fixtures with exact totals and bounded marker counts", () => {
    for (const count of [1500, 5000]) {
      const span = 14 * DAY
      const source = Array.from({ length: count }, (_, i) => item(String(i), i * span / count, i + 1))
      const groups = groupTimelineItems(source, 0, span, span, 1000)
      expect(new Set(ids(groups)).size).toBe(count)
      expect(groups.reduce((sum, group) => sum + group.tokens, 0)).toBe(count * (count + 1) / 2)
      expect(groups.length).toBeLessThanOrEqual(125)
      expect(groups.every(group => group.items.length === 1 || group.markerWidth >= 20)).toBe(true)
    }
  })
  it("keeps model identity truthful for homogeneous, mixed and unknown clusters", () => {
    const group = (models: (string | null)[]) => groupTimelineItems(models.map((model, index) => item(String(index), index, 10, model)), 0, 100, 100, 100)[0]
    expect(group(["a", "a"]).mixedModels).toBe(false)
    expect(group(["a", "b"]).mixedModels).toBe(true)
    expect(group([null, null]).mixedModels).toBe(false)
    expect(group(["a", null]).mixedModels).toBe(true)
  })
  it("preserves actual chronology across local midnight and daylight-saving transitions", () => {
    const first = new Date(2026, 10, 1), next = new Date(2026, 10, 2)
    const source = [item("before", first.getTime() + 1), item("after", next.getTime() + 1)]
    const groups = groupTimelineItems(source, first.getTime(), next.getTime() + DAY, DAY, 1000)
    expect(groups.map(group => group.at)).toEqual(source.map(item => item.startedAt))
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === "America/New_York") expect(groups[1].at - groups[0].at).toBe(25 * 3_600_000)
  })
})
