import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useTimelinePan } from "./prompt-usage-timeline-pan"

function Harness({ pan, click }: { pan: (delta: number) => void; click: () => void }) {
  const gesture = useTimelinePan(1000, 101000, pan)
  return <div data-testid="track" {...gesture.handlers}><button onClick={click}>Event</button></div>
}
function setup() {
  const pan = vi.fn(), click = vi.fn()
  render(<Harness pan={pan} click={click} />)
  const track = screen.getByTestId("track")
  track.getBoundingClientRect = () => new DOMRect(100, 0, 1000, 70)
  track.setPointerCapture = vi.fn()
  track.hasPointerCapture = vi.fn().mockReturnValue(false)
  return { track, pan, click }
}
const point = (clientX: number, clientY = 35) => ({ clientX, clientY, pointerId: 1, button: 0, buttons: 1, isPrimary: true })

describe("Timeline time panning", () => {
  it("pans by the incremental horizontal distance and suppresses the synthetic event click", () => {
    const { track, pan, click } = setup()
    fireEvent.pointerDown(track, point(900))
    fireEvent.pointerMove(track, point(300))
    fireEvent.pointerMove(track, point(400))
    fireEvent.pointerUp(track, point(400))
    fireEvent.click(screen.getByRole("button", { name: "Event" }))
    expect(pan.mock.calls).toEqual([[60000], [-10000]])
    expect(click).not.toHaveBeenCalled()
  })
  it("preserves clicks and native vertical movement", () => {
    const { track, pan, click } = setup()
    fireEvent.pointerDown(track, point(400))
    fireEvent.pointerMove(track, point(402))
    fireEvent.pointerUp(track, point(402))
    fireEvent.click(screen.getByRole("button", { name: "Event" }))
    expect(click).toHaveBeenCalledOnce()
    fireEvent.pointerDown(track, point(400))
    fireEvent.pointerMove(track, point(403, 60))
    fireEvent.pointerUp(track, point(403, 60))
    expect(pan).not.toHaveBeenCalled()
  })
  it("stops after Escape or pointer cancellation", () => {
    const { track, pan } = setup()
    fireEvent.pointerDown(track, point(300))
    fireEvent.pointerMove(track, point(400))
    fireEvent.keyDown(document, { key: "Escape" })
    fireEvent.pointerMove(track, point(500))
    expect(pan).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(track, point(300))
    fireEvent.pointerCancel(track, point(300))
    fireEvent.pointerMove(track, point(500))
    expect(pan).toHaveBeenCalledTimes(1)
  })
})
