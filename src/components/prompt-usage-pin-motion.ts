import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

/** Animate the existing rows from their visible positions into the new pin order. */
export function usePromptPinMotion(scrollRef: RefObject<HTMLElement | null>, orderKey: string, onSettled: () => void) {
  const before = useRef<Map<string, DOMRect> | null>(null)
  const animations = useRef<Animation[]>([])
  const focused = useRef<HTMLElement | null>(null)
  const focusedPin = useRef<string | null>(null)
  const revision = useRef(0)
  const settled = useRef(onSettled)
  settled.current = onSettled
  const [moving, setMoving] = useState(false)

  function reorder(change: () => void, revealTop: boolean) {
    const scroll = scrollRef.current
    focused.current = document.activeElement instanceof HTMLElement && scroll?.contains(document.activeElement) ? document.activeElement : null
    focusedPin.current = focused.current?.dataset.pinId ?? null
    before.current = new Map([...scroll?.querySelectorAll<HTMLElement>("[data-pin-row-id]") ?? []]
      .map(row => [row.dataset.pinRowId!, row.getBoundingClientRect()]))
    revision.current++
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    if (scroll && revealTop) scroll.scrollTop = 0
    setMoving(true)
    change()
  }

  useLayoutEffect(() => {
    const previous = before.current
    before.current = null
    if (!previous) {
      if (animations.current.length) {
        revision.current++
        animations.current.forEach(animation => animation.cancel())
        animations.current = []
        setMoving(false)
        settled.current()
      }
      return
    }
    const scroll = scrollRef.current
    if (focused.current?.isConnected) focused.current.focus({ preventScroll: true })
    else if (focusedPin.current) {
      const pin = [...scroll?.querySelectorAll<HTMLElement>("[data-pin-id]") ?? []]
        .find(button => button.dataset.pinId === focusedPin.current)
      ;(pin ?? scroll)?.focus({ preventScroll: true })
    }
    focused.current = null
    focusedPin.current = null
    const currentRevision = revision.current
    const viewport = scroll?.getBoundingClientRect()
    const next: Animation[] = []
    for (const row of scroll?.querySelectorAll<HTMLElement>("[data-pin-row-id]") ?? []) {
      const old = previous.get(row.dataset.pinRowId!)
      const rect = row.getBoundingClientRect()
      if (!old || !viewport || !row.animate) continue
      const visible = (old.bottom > viewport.top && old.top < viewport.bottom) || (rect.bottom > viewport.top && rect.top < viewport.bottom)
      const delta = old.top - rect.top
      if (!visible || Math.abs(delta) < 1) continue
      next.push(row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
        duration: 320, easing: "cubic-bezier(.2,.7,.2,1)",
      }))
    }
    animations.current = next
    const finish = () => {
      if (revision.current !== currentRevision) return
      animations.current = []
      setMoving(false)
      settled.current()
    }
    if (next.length) void Promise.all(next.map(animation => animation.finished.catch(() => {}))).then(finish)
    else finish()
  }, [orderKey, scrollRef])

  useEffect(() => () => {
    revision.current++
    animations.current.forEach(animation => animation.cancel())
  }, [])
  return { reorder, moving }
}
