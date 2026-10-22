import { useRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePromptPinDrag } from "./prompt-usage-pin-drag"

function Harness({ reorder, click }: { reorder: ReturnType<typeof vi.fn>; click: ReturnType<typeof vi.fn> }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = usePromptPinDrag(ref, ["a", "c"], reorder)
  return <div ref={ref}>{["a", "hidden", "c"].map((id) => <div key={id} className="prompt-project-pinned-session" data-pin-row-id={id}>
    <button {...drag.getDragHandlers(id)} onClick={click}>{id}</button>
  </div>)}</div>
}

describe("pin title dragging", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", MouseEvent)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.pinRowId === "c" ? 140 : this.dataset.pinRowId === "hidden" ? 70 : 0
      return { top, height: 70, bottom: top + 70, left: 0, right: 200, width: 200, x: 0, y: top, toJSON() {} }
    })
  })

  it("reorders only on release and suppresses navigation after dragging", () => {
    const reorder = vi.fn(), click = vi.fn()
    render(<Harness reorder={reorder} click={click} />)
    const button = screen.getByRole("button", { name: "a" })
    fireEvent.pointerDown(button, { button: 0, clientY: 35 })
    fireEvent.pointerMove(button, { clientY: 175 })
    expect(reorder).not.toHaveBeenCalled()
    fireEvent.pointerUp(button, { clientY: 175 })
    fireEvent.click(button)
    expect(reorder).toHaveBeenCalledWith("a", "c")
    expect(click).not.toHaveBeenCalled()
  })

  it("keeps a normal click and cancels an interrupted drag", () => {
    const reorder = vi.fn(), click = vi.fn()
    render(<Harness reorder={reorder} click={click} />)
    const button = screen.getByRole("button", { name: "a" })
    fireEvent.pointerDown(button, { button: 0, clientY: 35 })
    fireEvent.pointerMove(button, { clientY: 38 })
    fireEvent.pointerUp(button)
    fireEvent.click(button)
    expect(click).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(button, { button: 0, clientY: 35 })
    fireEvent.pointerMove(button, { clientY: 175 })
    fireEvent.pointerCancel(button)
    expect(reorder).not.toHaveBeenCalled()
    fireEvent.click(button, { detail: 0 })
    expect(click).toHaveBeenCalledTimes(2)
  })

  it("moves to a visible pinned neighbor with the keyboard and ignores unpinned rows", () => {
    const reorder = vi.fn()
    render(<Harness reorder={reorder} click={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "a" }), { altKey: true, key: "ArrowDown" })
    expect(reorder).toHaveBeenLastCalledWith("a", "c")
    fireEvent.keyDown(screen.getByRole("button", { name: "hidden" }), { altKey: true, key: "ArrowDown" })
    expect(reorder).toHaveBeenCalledTimes(1)
  })
})
