import { useRef, useState, type RefObject, type PointerEvent, type MouseEvent, type KeyboardEvent } from "react"

/** Spread handlers on pinned identity buttons; row geometry comes from the existing lane elements. */
export function usePromptPinDrag(
  scrollRef: RefObject<HTMLElement | null>,
  pinnedIds: string[],
  onReorder: (id: string, targetId: string) => void,
  onDragStart?: () => void,
) {
  const gesture = useRef<{ id: string; pointerId: number; y: number; active: boolean; target: string } | null>(null)
  const suppressClick = useRef(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDraggingId(null)
    setTargetId(null)
    if (current.active) {
      suppressClick.current = !cancelled
      event.preventDefault()
      event.stopPropagation()
      if (!cancelled && current.id !== current.target) onReorder(current.id, current.target)
    }
  }

  function getDragHandlers(id: string) {
    return {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        suppressClick.current = false
        if (event.button !== 0 || !pinnedIds.includes(id)) return
        gesture.current = { id, pointerId: event.pointerId, y: event.clientY, active: false, target: id }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.stopPropagation()
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const current = gesture.current
        if (!current || current.pointerId !== event.pointerId) return
        if (!current.active && Math.abs(event.clientY - current.y) < 5) return
        if (!current.active) {
          current.active = true
          setDraggingId(current.id)
          onDragStart?.()
        }
        event.preventDefault()
        event.stopPropagation()
        let distance = Infinity
        for (const row of scrollRef.current?.querySelectorAll<HTMLElement>("[data-pin-row-id]") ?? []) {
          const rowId = row.dataset.pinRowId!
          if (!pinnedIds.includes(rowId)) continue
          const rect = row.getBoundingClientRect()
          const nextDistance = Math.abs(event.clientY - (rect.top + rect.height / 2))
          if (nextDistance < distance) {
            distance = nextDistance
            current.target = rowId
          }
        }
        setTargetId(current.target)
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event, false),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onClickCapture(event: MouseEvent<HTMLButtonElement>) {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
        event.preventDefault()
        event.stopPropagation()
        const index = pinnedIds.indexOf(id)
        const target = pinnedIds[index + (event.key === "ArrowUp" ? -1 : 1)]
        if (index >= 0 && target) {
          onDragStart?.()
          onReorder(id, target)
        }
      },
    }
  }
  return { getDragHandlers, draggingId, targetId }
}
