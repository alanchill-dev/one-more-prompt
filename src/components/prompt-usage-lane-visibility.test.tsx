import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTimelineLaneVisibility } from "./prompt-usage-lane-visibility"

let scroll: HTMLDivElement
let scrollTo: ReturnType<typeof vi.fn>
let resize: ResizeObserverCallback
let disconnect: ReturnType<typeof vi.fn>
let invalidLayout = false
const ids = ["a", "b", "c", "d", "e", "f"]
beforeEach(() => {
  vi.useFakeTimers()
  invalidLayout = false
  disconnect = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  scroll = document.createElement("div")
  scroll.className = "prompt-session-lanes-scroll"
  scroll.innerHTML = '<div class="prompt-session-axis"></div>' + ids.map(id => `<div data-session-id="${id}"><span class="prompt-session-baseline"></span></div>`).join("")
  document.body.appendChild(scroll)
  scroll.scrollTop = 140
  scroll.scrollLeft = 23
  scrollTo = vi.fn()
  scroll.scrollTo = scrollTo
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (invalidLayout) return new DOMRect()
    if (this === scroll) return new DOMRect(0, 100, 400, 250)
    if (this.classList.contains("prompt-session-axis")) return new DOMRect(0, 100, 400, 40)
    const row = this.closest<HTMLElement>("[data-session-id]")
    if (!row) return new DOMRect()
    const naturalTop = 140 + ids.indexOf(row.dataset.sessionId!) * 70 - scroll.scrollTop
    const pinnedIndex = [...scroll.querySelectorAll('[data-pinned="true"]')].indexOf(row)
    const top = pinnedIndex >= 0 ? Math.max(naturalTop, 140 + pinnedIndex * 70) : naturalTop
    return this === row ? new DOMRect(0, top, 400, 70) : new DOMRect(100, top + 35, 300, 1)
  })
})
afterEach(() => { cleanup(); scroll.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const flushScroll = () => act(() => { scroll.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(20) })
const setup = (active = ids) => {
  const ref = { current: scroll }
  return renderHook(({ sessions }) => useTimelineLaneVisibility(ref, sessions), { initialProps: { sessions: active } })
}

describe("Timeline offscreen session visibility", () => {
  it("keeps stacked pinned rows visible and counts ordinary rows covered by them", () => {
    for (const id of ["a", "b"]) scroll.querySelector<HTMLElement>(`[data-session-id="${id}"]`)!.dataset.pinned = "true"
    const { result } = setup()
    expect(result.current.above).toEqual(["c", "d"])
    expect(result.current.below).toEqual(["f"])
    act(() => { result.current.revealSession("a"); result.current.revealSession("b") })
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => result.current.revealSession("d"))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 70, behavior: "smooth" })
    scroll.scrollTop = 70
    flushScroll()
    expect(result.current.above).toEqual(["c"])
  })

  it("accounts for pinned rows outside the active time window and refreshes after unpinning", () => {
    const pinned = scroll.querySelector<HTMLElement>('[data-session-id="a"]')!
    pinned.dataset.pinned = "true"
    const { result } = setup(["c"])
    expect(result.current.above).toEqual(["c"])
    pinned.dataset.pinned = "false"
    act(() => result.current.refresh())
    expect(result.current.above).toEqual([])
  })

  it("counts each active Session once against the viewport below the sticky axis", () => {
    const { result } = setup(["a", "b", "c", "e", "f", "f", "missing"])
    expect(result.current.above).toEqual(["a", "b"])
    expect(result.current.below).toEqual(["f"])
    expect(scrollTo).not.toHaveBeenCalled()
    const previous = result.current
    flushScroll()
    expect(result.current).toBe(previous)
  })

  it("updates on scrolling, resizing and active changes without automatically revealing rows", () => {
    const { result, rerender } = setup()
    act(() => { scroll.scrollTop = 70 })
    flushScroll()
    expect(result.current.above).toEqual(["a"])
    expect(result.current.below).toEqual(["e", "f"])
    rerender({ sessions: ["f"] })
    expect(result.current.above).toEqual([])
    expect(result.current.below).toEqual(["f"])
    invalidLayout = true
    act(() => { resize([], {} as ResizeObserver); vi.advanceTimersByTime(20) })
    expect(result.current.below).toEqual([])
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("does not rerender for identical measurements or report counts before layout", () => {
    invalidLayout = true
    const { result } = setup()
    expect(result.current.above).toEqual([])
    expect(result.current.below).toEqual([])
    const before = result.current
    flushScroll()
    expect(result.current).toBe(before)
  })

  it("smoothly reveals an offscreen row without changing horizontal scroll or focus", () => {
    const button = document.createElement("button")
    scroll.appendChild(button)
    button.focus()
    const { result } = setup()
    act(() => result.current.revealSession("f"))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 210, behavior: "smooth" })
    expect(scroll.scrollLeft).toBe(23)
    expect(button).toHaveFocus()
  })

  it("keeps smooth reveal and cancellation with system reduced motion, leaving visible or missing rows alone", () => {
    const media = window.matchMedia
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media(query), matches: true }))
    const { result } = setup(["c", "f"])
    act(() => { result.current.revealSession("c"); result.current.revealSession("missing") })
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => result.current.revealSession("f"))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 210, behavior: "smooth" })
    act(() => result.current.cancelReveal())
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 140, behavior: "instant" })
  })

  it("explicitly reveals a DOM row outside the current time window without counting or automatically scrolling it", () => {
    const { result } = setup(["c"])
    expect(result.current.above).toEqual([])
    expect(result.current.below).toEqual([])
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => result.current.revealSession("f"))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 210, behavior: "smooth" })
    expect(result.current.below).toEqual([])
  })

  it("cancels only an in-progress programmatic scroll at its current position", () => {
    const { result } = setup()
    act(() => result.current.cancelReveal())
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => { result.current.revealSession("f"); scroll.scrollTop = 163; result.current.cancelReveal(); result.current.cancelReveal() })
    expect(scrollTo.mock.calls).toEqual([[{ top: 210, behavior: "smooth" }], [{ top: 163, behavior: "instant" }]])
    act(() => { result.current.revealSession("a"); scroll.dispatchEvent(new Event("scrollend")); result.current.cancelReveal() })
    expect(scrollTo).toHaveBeenCalledTimes(3)
  })

  it("disconnects observation and cancels queued measurements on unmount", () => {
    const { unmount } = setup()
    act(() => scroll.dispatchEvent(new Event("scroll")))
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    act(() => { scroll.dispatchEvent(new Event("scroll")); vi.advanceTimersByTime(30) })
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
