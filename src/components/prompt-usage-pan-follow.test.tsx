import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTimelinePanFollow } from "./prompt-usage-pan-follow"

const rect = (top: number, bottom: number) => ({ top, bottom, height: bottom - top, width: 600 } as DOMRect)
let scroll: HTMLDivElement
let scrollTo: ReturnType<typeof vi.fn>
let scrollRef: { current: HTMLDivElement }
const row = (id: string, top: number, pinned = false) => {
  const element = document.createElement("div")
  element.dataset.sessionId = id
  if (pinned) element.dataset.pinned = "true"
  element.getBoundingClientRect = () => rect(top, top + 70)
  scroll.append(element)
  return element
}
const mount = (ids = ["a", "b"]) => renderHook(
  ({ start, active, disabled }) => useTimelinePanFollow(scrollRef, start, start + 100, active, disabled),
  { initialProps: { start: 0, active: ids, disabled: false } },
)
const settle = () => act(() => { vi.advanceTimersByTime(120) })

beforeEach(() => {
  vi.useFakeTimers()
  scroll = document.createElement("div")
  scroll.getBoundingClientRect = () => rect(0, 500)
  scroll.scrollTop = 100
  scrollTo = vi.fn()
  scroll.scrollTo = scrollTo
  const axis = document.createElement("div")
  axis.className = "prompt-session-axis"
  axis.getBoundingClientRect = () => rect(0, 60)
  scroll.append(axis)
  scrollRef = { current: scroll }
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("horizontal pan vertical follow", () => {
  it("does not move on mount or unrequested range/data updates", () => {
    row("a", 700)
    const hook = mount()
    settle()
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("expires a request when a clamped camera never changes its range", () => {
    row("a", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    settle()
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("aligns the first active session in display order beneath the axis", () => {
    row("a", 700); row("b", 770)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a", "b"], disabled: false })
    settle()
    expect(scrollTo).toHaveBeenCalledWith({ top: 740, behavior: "smooth" })
  })

  it("leaves the Y position unchanged when the first active session is pinned and visible", () => {
    row("a", 60, true); row("b", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a", "b"], disabled: false })
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("accounts for pinned rows when aligning an unpinned active session", () => {
    row("pin", 60, true); row("a", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    settle()
    expect(scrollTo).toHaveBeenCalledWith({ top: 670, behavior: "smooth" })
  })

  it("leaves an empty time range alone", () => {
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: [], disabled: false })
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("manual cancellation prevents pending movement and stops ongoing smooth movement", () => {
    row("a", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    act(() => hook.result.current.cancelFollow())
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 200, active: ["a"], disabled: false })
    settle()
    act(() => hook.result.current.cancelFollow())
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: "instant" })
  })

  it("waits for a pan burst to settle without resetting for equal active IDs", () => {
    row("a", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    act(() => vi.advanceTimersByTime(80))
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 200, active: ["a"], disabled: false })
    act(() => vi.advanceTimersByTime(80))
    hook.rerender({ start: 200, active: ["a"], disabled: false })
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(40))
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("keeps smooth motion and cancellation with system reduced motion while clamping to the scroll origin", () => {
    row("a", -100)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    settle()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
    act(() => hook.result.current.cancelFollow())
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: "instant" })
  })

  it("cancels when disabled while waiting", () => {
    row("a", 700)
    const hook = mount()
    act(() => hook.result.current.requestFollow())
    hook.rerender({ start: 100, active: ["a"], disabled: false })
    hook.rerender({ start: 100, active: ["a"], disabled: true })
    settle()
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
