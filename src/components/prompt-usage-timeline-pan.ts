import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"

/** Dragging moves the camera while retaining the selected data period. */
export function useTimelinePan(start: number, end: number, onPan: (delta: number) => void, disabled = false) {
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ pointer: number; x: number; y: number; left: number; width: number; element: HTMLDivElement; moved: boolean; lastX: number } | null>(null)
  const suppressClick = useRef(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = () => {
    const current = gesture.current
    gesture.current = null
    setDragging(false)
    if (current?.element.hasPointerCapture?.(current.pointer)) current.element.releasePointerCapture(current.pointer)
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel() }
    }
    document.addEventListener("keydown", escape)
    window.addEventListener("blur", cancel)
    return () => {
      document.removeEventListener("keydown", escape)
      window.removeEventListener("blur", cancel)
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])
  useEffect(() => { if (disabled) cancel() }, [disabled])
  const handlers = {
    onPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
      if (disabled || event.button !== 0 || event.isPrimary === false || (event.target as Element).closest(".prompt-session-preview-region, .prompt-session-ticks button")) return
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width) return
      if (resetTimer.current) clearTimeout(resetTimer.current)
      suppressClick.current = false
      gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, width: rect.width, element: event.currentTarget, moved: false, lastX: event.clientX }
    },
    onPointerMoveCapture(event: ReactPointerEvent<HTMLDivElement>) {
      const current = gesture.current
      if (!current || current.pointer !== event.pointerId) return
      if (event.buttons === 0) { cancel(); return }
      const dx = Math.abs(event.clientX - current.x), dy = Math.abs(event.clientY - current.y)
      if (!current.moved) {
        if (dy > 8 && dy > dx) { cancel(); return }
        if (dx < 6) return
        current.moved = true
        suppressClick.current = true
        current.element.setPointerCapture?.(event.pointerId)
        setDragging(true)
      }
      event.preventDefault(); event.stopPropagation()
      onPan((current.lastX - event.clientX) / current.width * (end - start))
      current.lastX = event.clientX
    },
    onPointerUpCapture(event: ReactPointerEvent<HTMLDivElement>) {
      const current = gesture.current
      if (!current || current.pointer !== event.pointerId) return
      const moved = current.moved
      if (moved) { event.preventDefault(); event.stopPropagation() }
      cancel()
      // Browser dispatches the synthetic click after pointerup. Clear after that event, not before it.
      resetTimer.current = setTimeout(() => { suppressClick.current = false }, 0)
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
    },
  }
  return { handlers, dragging, cancel }
}
