import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useRef, useState } from "react"
import { usePromptPinMotion } from "./prompt-usage-pin-motion"

function rectangle(top: number, height = 60) {
  return { top, bottom: top + height, left: 0, right: 400, width: 400, height, x: 0, y: top, toJSON: () => ({}) } as DOMRect
}

describe("usePromptPinMotion", () => {
  let scroll: HTMLDivElement
  let pending: { finish: () => void; cancel: ReturnType<typeof vi.fn> }[]
  let animate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    pending = []
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })))
    scroll = document.createElement("div")
    scroll.getBoundingClientRect = () => rectangle(0, 400)
    document.body.append(scroll)
    animate = vi.fn(() => {
      let finish!: () => void
      const finished = new Promise<void>(resolve => { finish = resolve })
      const cancel = vi.fn()
      pending.push({ finish, cancel })
      return { finished, cancel } as unknown as Animation
    })
    for (const id of ["a", "b", "c"]) {
      const row = document.createElement("div")
      row.className = "prompt-project-pinned-session"
      row.dataset.pinRowId = id
      row.getBoundingClientRect = () => rectangle([...scroll.children].indexOf(row) * 60)
      row.animate = animate
      scroll.append(row)
    }
  })

  afterEach(() => {
    scroll.remove()
    vi.unstubAllGlobals()
  })

  function setup() {
    const settled = vi.fn()
    const hook = renderHook(() => {
      const ref = useRef(scroll)
      const [orderKey, setOrderKey] = useState("initial")
      const motion = usePromptPinMotion(ref, orderKey, settled)
      return {
        ...motion,
        move: (ids: string[], key: string, revealTop = true) => motion.reorder(() => {
          const rows = [...scroll.children] as HTMLElement[]
          ids.forEach(id => scroll.append(rows.find(row => row.dataset.pinRowId === id)!))
          setOrderKey(key)
        }, revealTop),
      }
    })
    return { ...hook, settled }
  }

  it("animates the reordered DOM rows and settles only when every row finishes", async () => {
    const { result, settled } = setup()
    scroll.scrollTop = 100
    act(() => result.current.move(["c", "a", "b"], "pin-c"))
    expect([...scroll.children].map(row => (row as HTMLElement).dataset.pinRowId)).toEqual(["c", "a", "b"])
    expect(scroll.scrollTop).toBe(0)
    expect(result.current.moving).toBe(true)
    expect(animate).toHaveBeenCalledTimes(3)
    expect(animate.mock.calls[0][0]).toEqual([{ transform: "translateY(120px)" }, { transform: "translateY(0)" }])
    await act(async () => { pending[0].finish() })
    expect(result.current.moving).toBe(true)
    await act(async () => { pending.slice(1).forEach(animation => animation.finish()) })
    expect(result.current.moving).toBe(false)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it("keeps full pin animation when the system requests reduced motion", async () => {
    const { result, settled } = setup()
    act(() => result.current.move(["c", "a", "b"], "pin-c"))
    expect(animate).toHaveBeenCalledTimes(3)
    expect(result.current.moving).toBe(true)
    expect(settled).not.toHaveBeenCalled()
    await act(async () => { pending.forEach(animation => animation.finish()) })
    expect(result.current.moving).toBe(false)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it("cancels pin animation on unmount without reporting stale settlement", async () => {
    const { result, settled, unmount } = setup()
    act(() => result.current.move(["c", "a", "b"], "pin-c"))
    unmount()
    pending.forEach(animation => expect(animation.cancel).toHaveBeenCalledOnce())
    await act(async () => { pending.forEach(animation => animation.finish()) })
    expect(settled).not.toHaveBeenCalled()
  })

  it("cancels previous animations and ignores their completion after a second toggle", async () => {
    const { result, settled } = setup()
    act(() => result.current.move(["c", "a", "b"], "pin-c"))
    const previous = [...pending]
    act(() => result.current.move(["b", "c", "a"], "pin-b"))
    previous.forEach(animation => expect(animation.cancel).toHaveBeenCalledTimes(1))
    await act(async () => { previous.forEach(animation => animation.finish()) })
    expect(result.current.moving).toBe(true)
    expect(settled).not.toHaveBeenCalled()
    await act(async () => { pending.slice(previous.length).forEach(animation => animation.finish()) })
    expect(result.current.moving).toBe(false)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it("settles when pinning the first row without changing its position", () => {
    const { result, settled } = setup()
    act(() => result.current.move(["a", "b", "c"], "pin-a"))
    expect(animate).not.toHaveBeenCalled()
    expect(result.current.moving).toBe(false)
    expect(settled).toHaveBeenCalledTimes(1)
  })
})
