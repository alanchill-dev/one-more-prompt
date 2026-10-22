import type { TimelineItem } from "@/lib/prompt-usage-timeline"

export type EventGroup = {
  items: TimelineItem[]; position: number; start: number; end: number; at: number
  tokens: number; mixedModels: boolean; markerWidth: number
}

function countWidth(count: number): number {
  const digits = String(count).length
  return count === 1 ? 6 : Math.max(20, (digits + Math.floor((digits - 1) / 3)) * 6 + 12)
}

/** Resolve collisions across the entire filtered period, independently of the camera's position. */
export function groupTimelineItems(items: TimelineItem[], start: number, end: number, span: number, width: number): EventGroup[] {
  const seen = new Set<string>()
  const sorted = [...items].sort((a, b) => a.startedAt - b.startedAt || a.turn.id.localeCompare(b.turn.id))
    .filter(item => {
      if (item.startedAt < start || item.startedAt >= end || seen.has(item.turn.id)) return false
      seen.add(item.turn.id); return true
    })
  const scale = Math.max(1, width) / Math.max(1, span)
  const stack: { first: number; last: number; width: number }[] = []
  for (let index = 0; index < sorted.length; index++) {
    let group = { first: index, last: index, width: 6 }
    while (stack.length) {
      const previous = stack[stack.length - 1]
      const left = (sorted[group.first].startedAt - start) * scale - (group.first === group.last ? 3 : group.width)
      const right = (sorted[previous.last].startedAt - start) * scale + (previous.first === previous.last ? 3 : previous.width)
      if (left >= right + 2) break
      stack.pop()
      group = { first: previous.first, last: index,
        width: countWidth(index - previous.first + 1) }
    }
    stack.push(group)
  }
  return stack.map(group => {
    const entries = sorted.slice(group.first, group.last + 1)
    const first = entries[0].startedAt, last = entries[entries.length - 1].startedAt
    return { items: entries, start: first, end: last, at: (first + last) / 2, position: 0,
      tokens: entries.reduce((sum, item) => sum + item.turn.tokens.totalTokens, 0),
      mixedModels: new Set(entries.map(item => item.model?.canonicalName ?? null)).size > 1,
      markerWidth: entries.length === 1 ? 2 : group.width }
  })
}

export function visibleEventGroups(groups: EventGroup[], start: number, end: number): EventGroup[] {
  return groups.filter(group => group.items.length === 1 ? group.at >= start && group.at < end : group.end >= start && group.start < end)
    .map(group => ({ ...group, position: (group.at - start) / Math.max(1, end - start) }))
}
