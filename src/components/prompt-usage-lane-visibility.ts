import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"

type Visibility = { above: string[]; below: string[] }
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index])

function visibleBounds(scroll: HTMLDivElement) {
  const rect = scroll.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const axis = scroll.querySelector(".prompt-session-axis")?.getBoundingClientRect()
  const top = Math.max(rect.top, axis && axis.height > 0 ? axis.bottom : rect.top)
  let unpinnedTop = top
  for (const row of scroll.querySelectorAll<HTMLElement>('[data-session-id][data-pinned="true"]')) {
    const pinned = row.getBoundingClientRect()
    if (pinned.width > 0 && pinned.height > 0) unpinnedTop = Math.max(unpinnedTop, pinned.bottom)
  }
  return top < rect.bottom ? { top, unpinnedTop, bottom: rect.bottom } : null
}

function laneCenter(row: HTMLElement) {
  const rect = row.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const baseline = row.querySelector(".prompt-session-baseline")?.getBoundingClientRect()
  return baseline && baseline.width > 0 && baseline.height > 0
    ? baseline.top + baseline.height / 2
    : rect.top + rect.height / 2
}

export function useTimelineLaneVisibility(scrollRef: RefObject<HTMLDivElement | null>, activeSessionIds: string[]) {
  const activeKey = JSON.stringify([...new Set(activeSessionIds)])
  const activeIds = useMemo(() => new Set<string>(JSON.parse(activeKey)), [activeKey])
  const [visibility, setVisibility] = useState<Visibility>({ above: [], below: [] })
  const revealing = useRef(false)

  const measure = useCallback(() => {
    const next: Visibility = { above: [], below: [] }
    const scroll = scrollRef.current
    const bounds = scroll && visibleBounds(scroll)
    if (scroll && bounds) {
      const seen = new Set<string>()
      for (const row of scroll.querySelectorAll<HTMLElement>("[data-session-id]")) {
        const id = row.dataset.sessionId!
        if (!activeIds.has(id) || seen.has(id)) continue
        seen.add(id)
        const center = laneCenter(row)
        if (center === null) continue
        const top = row.dataset.pinned === "true" ? bounds.top : bounds.unpinnedTop
        if (center < top) next.above.push(id)
        else if (center > bounds.bottom) next.below.push(id)
      }
    }
    setVisibility(previous => sameIds(previous.above, next.above) && sameIds(previous.below, next.below) ? previous : next)
  }, [scrollRef, activeIds])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    let frame = 0
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure() })
    }
    const endReveal = () => { revealing.current = false }
    scroll.addEventListener("scroll", schedule, { passive: true })
    scroll.addEventListener("scrollend", endReveal)
    window.addEventListener("resize", schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(scroll)
    const axis = scroll.querySelector(".prompt-session-axis")
    if (axis) observer.observe(axis)
    for (const row of scroll.querySelectorAll<HTMLElement>("[data-session-id]")) {
      if (activeIds.has(row.dataset.sessionId!) || row.dataset.pinned === "true") observer.observe(row)
    }
    measure()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      scroll.removeEventListener("scroll", schedule)
      scroll.removeEventListener("scrollend", endReveal)
      window.removeEventListener("resize", schedule)
    }
  }, [scrollRef, activeIds, measure])

  const revealSession = useCallback((id: string) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const bounds = visibleBounds(scroll)
    const row = [...scroll.querySelectorAll<HTMLElement>("[data-session-id]")].find(element => element.dataset.sessionId === id)
    if (!bounds || !row) return
    const center = laneCenter(row)
    const top = row.dataset.pinned === "true" ? bounds.top : bounds.unpinnedTop
    if (center === null || center >= top && center <= bounds.bottom) return
    const rect = row.getBoundingClientRect()
    const offset = center < top ? rect.top - top : rect.bottom - bounds.bottom
    revealing.current = true
    scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + offset), behavior: "smooth" })
  }, [scrollRef])

  const cancelReveal = useCallback(() => {
    const scroll = scrollRef.current
    if (!revealing.current || !scroll) return
    revealing.current = false
    scroll.scrollTo({ top: scroll.scrollTop, behavior: "instant" })
  }, [scrollRef])

  return { ...visibility, revealSession, cancelReveal, refresh: measure }
}
