import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { TimelineScrollbar } from "./prompt-usage-timeline-scrollbar"

it("uses the same camera extent and reaches both boundaries by keyboard and dragging", () => {
  const move = vi.fn()
  render(<TimelineScrollbar controls="rows" start={0} end={1000} span={200} viewStart={400} move={move} label="Time" valueText="Current Range" />)
  const scroll = screen.getByRole("scrollbar")
  expect(scroll).toHaveAttribute("aria-controls", "rows")
  expect(scroll).toHaveAttribute("aria-valuemax", "800")
  expect(scroll.firstElementChild).toHaveStyle({ width: "max(44px, 20%)", left: "50%", transform: "translateX(-50%)" })
  fireEvent.keyDown(scroll, { key: "End" }); expect(move).toHaveBeenLastCalledWith(800)
  fireEvent.keyDown(scroll, { key: "Home" }); expect(move).toHaveBeenLastCalledWith(0)
  scroll.getBoundingClientRect = () => new DOMRect(0, 0, 500, 20)
  scroll.firstElementChild!.getBoundingClientRect = () => new DOMRect(200, 0, 100, 20)
  scroll.setPointerCapture = vi.fn(); scroll.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(scroll, { clientX: 250, button: 0, pointerId: 1 })
  fireEvent.pointerMove(scroll, { clientX: 450, pointerId: 1 })
  expect(move).toHaveBeenLastCalledWith(800, false)
})
it("shows the full range and disables movement at Fit", () => {
  const move = vi.fn()
  render(<TimelineScrollbar controls="rows" start={0} end={1000} span={1000} viewStart={0} move={move} label="Time" valueText="Full Range" />)
  const scroll = screen.getByRole("scrollbar")
  expect(scroll).toHaveAttribute("aria-disabled", "true")
  expect(scroll.firstElementChild).toHaveStyle({ width: "max(44px, 100%)" })
  fireEvent.pointerDown(scroll, { clientX: 250, button: 0, pointerId: 1 })
  expect(move).not.toHaveBeenCalled()
})
