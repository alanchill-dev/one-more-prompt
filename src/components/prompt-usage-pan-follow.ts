import { useCallback, useLayoutEffect, useRef, type RefObject } from "react"

export function useTimelinePanFollow(
  scrollRef: RefObject<HTMLDivElement | null>,
  viewStart: number,
  viewEnd: number,
  activeSessionIds: string[],
  disabled: boolean,
) {
  const armed = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const moving = useRef(false)
  const activeIds = useRef(activeSessionIds)
  activeIds.current = activeSessionIds

  const cancelFollow = useCallback(() => {
    armed.current = false
    clearTimeout(timer.current)
    timer.current = undefined
    const scroll = scrollRef.current
    if (moving.current && scroll) scroll.scrollTo({ top: scroll.scrollTop, behavior: "instant" })
    moving.current = false
  }, [scrollRef])

  const requestFollow = useCallback(() => {
    cancelFollow()
    armed.current = !disabled
    if (!disabled) timer.current = setTimeout(() => { armed.current = false; timer.current = undefined }, 120)
  }, [cancelFollow, disabled])

  useLayoutEffect(() => {
    if (disabled) { cancelFollow(); return }
    if (!armed.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      armed.current = false
      timer.current = undefined
      const scroll = scrollRef.current
      const id = activeIds.current[0]
      if (!scroll || !id) return
      const rows = [...scroll.querySelectorAll<HTMLElement>("[data-session-id]")]
      const row = rows.find(candidate => candidate.dataset.sessionId === id)
      if (!row) return
      const viewport = scroll.getBoundingClientRect()
      const rect = row.getBoundingClientRect()
      const axis = scroll.querySelector(".prompt-session-axis")?.getBoundingClientRect()
      const axisBottom = Math.max(viewport.top, axis?.bottom ?? viewport.top)
      if (row.dataset.pinned === "true" && rect.top >= axisBottom && rect.bottom <= viewport.bottom) return
      const top = row.dataset.pinned === "true" ? axisBottom : Math.max(axisBottom,
        ...rows.filter(candidate => candidate.dataset.pinned === "true").map(candidate => candidate.getBoundingClientRect().bottom))
      if (top >= viewport.bottom) return
      const target = Math.max(0, scroll.scrollTop + rect.top - top)
      if (Math.abs(target - scroll.scrollTop) < 1) return
      moving.current = true
      scroll.scrollTo({ top: target, behavior: "smooth" })
    }, 120)
    return () => clearTimeout(timer.current)
  }, [viewStart, viewEnd, disabled, scrollRef, cancelFollow])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const finish = () => { moving.current = false }
    scroll?.addEventListener("scrollend", finish)
    return () => { cancelFollow(); scroll?.removeEventListener("scrollend", finish) }
  }, [scrollRef, cancelFollow])

  return { requestFollow, cancelFollow }
}
