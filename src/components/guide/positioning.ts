import { GUIDE_STEPS } from "./steps"

export type Rect = { x: number; y: number; w: number; h: number }
export type CardPlacement = { side: "top" | "bottom" | "left" | "right" | "none"; offset: number }
export type CardPosition = { x: number; y: number; placement: CardPlacement }
type Direction = "top" | "bottom" | "left" | "right"

const GAP = 16
const MARGIN = 12
const preferred: Record<string, Direction> = {
  "chart-intro": "bottom", "quota-intro": "top", "model-palette": "left",
  month: "bottom", "api-estimate": "bottom", peak: "left", drill: "bottom",
  "project-intro": "bottom", session: "right", summary: "bottom", prompt: "right",
  "prompt-original": "left", "prompt-timing": "left", "prompt-usage": "left", "prompt-agents": "left",
  "timeline-entry": "bottom", "timeline-intro": "bottom", pan: "bottom", zoom: "bottom", event: "left",
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value))
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

/** Keep the card beside its target; flip only when an edge or required detail blocks that side. */
export function cardPosition(
  step: number, app: Pick<DOMRect, "width" | "height">, w: number, h: number,
  focus: Rect, obstacles: Rect[] = [],
): CardPosition {
  const id = GUIDE_STEPS[step - 1]?.id
  if ((id === "pan" || id === "zoom") && obstacles.length) {
    return { x: MARGIN, y: clamp(obstacles[0].y + MARGIN, 90, app.height - h - MARGIN), placement: { side: "none", offset: 0 } }
  }
  if (id === "project-intro" && focus.w >= w + GAP * 2 && focus.h >= h + GAP * 2) {
    return {
      x: focus.x + (focus.w - w) / 2,
      y: focus.y + (focus.h - h) / 2,
      placement: { side: "none", offset: 0 },
    }
  }
  // The chart intro uses its empty left plot margin without covering the range controls above it.
  if (id === "chart-intro" && focus.w > w * 2) {
    return {
      x: clamp(focus.x + GAP, MARGIN, app.width - w - MARGIN),
      y: clamp(focus.y + GAP, 90, app.height - h - MARGIN),
      placement: { side: "none", offset: 0 },
    }
  }
  const first = preferred[id] ?? "bottom"
  const opposite: Record<Direction, Direction> = { top: "bottom", bottom: "top", left: "right", right: "left" }
  const directions = [...new Set([first, opposite[first], "right", "left", "bottom", "top"])] as Direction[]
  const blocked = [focus, ...obstacles]
  const candidates = blocked.flatMap((anchor, anchorRank) => directions.flatMap((direction, rank) => {
    const horizontal = direction === "top" || direction === "bottom"
    const center = horizontal ? anchor.x + anchor.w / 2 - w / 2 : anchor.y + anchor.h / 2 - h / 2
    const alignments = horizontal ? [center, anchor.x, anchor.x + anchor.w - w] : [center, anchor.y, anchor.y + anchor.h - h]
    return alignments.map((alignment, alignmentRank) => {
      const x = clamp(horizontal ? alignment : direction === "left" ? anchor.x - w - GAP : anchor.x + anchor.w + GAP, MARGIN, app.width - w - MARGIN)
      const y = clamp(horizontal ? direction === "top" ? anchor.y - h - GAP : anchor.y + anchor.h + GAP : alignment, 90, app.height - h - MARGIN)
      const rect = { x, y, w, h }
      const obstruction = blocked.reduce((area, obstacle) => area + overlap(rect, obstacle), 0)
      const distance = Math.hypot(Math.max(0, focus.x - x - w, x - focus.x - focus.w), Math.max(0, focus.y - y - h, y - focus.y - focus.h))
      return { x, y, direction, obstruction, anchorRank, score: obstruction * 1000 + anchorRank * 1000 + rank * 100 + alignmentRank + distance / 100 }
    })
  }))
  const best = candidates.sort((a, b) => Number(a.obstruction > 0) - Number(b.obstruction > 0) || a.score - b.score)[0]
  const side = best.obstruction > 0 || best.anchorRank > 0 ? "none" : opposite[best.direction]
  const horizontal = side === "top" || side === "bottom"
  const offset = clamp(horizontal ? focus.x + focus.w / 2 - best.x : focus.y + focus.h / 2 - best.y, 20, (horizontal ? w : h) - 20)
  return { x: best.x, y: best.y, placement: { side, offset } }
}

export function stabilizeCardPosition(next: CardPosition, previous: CardPosition | null, dragging: boolean) {
  return dragging && previous ? previous : next
}
