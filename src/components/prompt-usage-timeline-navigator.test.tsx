import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TimelineNavigator } from "./prompt-usage-timeline-navigator"

const hour = 3_600_000
function setup(times: number[] = [], onRecordClick?: (at: number) => void) {
  const move = vi.fn(), dragging = vi.fn(), onPan = vi.fn()
  render(<TimelineNavigator start={0} end={24 * hour} span={6 * hour} viewStart={6 * hour} times={times} onRecordClick={onRecordClick} width={600} onPan={onPan} move={move} onDraggingChange={dragging} label="Position" />)
  const slider = screen.getByRole("slider")
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 240 } as DOMRect)
  slider.setPointerCapture = vi.fn()
  slider.releasePointerCapture = vi.fn()
  return { slider, move, dragging, onPan }
}
describe("TimelineNavigator", () => {
  it("pans without clicking using the dominant wheel axis and retains every incremental delta", () => {
    const onRecordClick = vi.fn()
    const { slider, onPan, move, dragging } = setup([8 * hour], onRecordClick)
    for (const [deltaX, deltaY] of [[0, 100], [-50, 10], [25, 0]]) {
      const event = new WheelEvent("wheel", { deltaX, deltaY, cancelable: true, bubbles: true })
      fireEvent(slider, event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(onPan.mock.calls).toEqual([[hour], [-hour / 2], [hour / 4]])
    expect(move).not.toHaveBeenCalled()
    expect(dragging).not.toHaveBeenCalled()
    expect(onRecordClick).not.toHaveBeenCalled()
  })
  it("normalizes line and page scrolling to the visible time span", () => {
    const { slider, onPan } = setup()
    fireEvent.wheel(slider, { deltaY: 3, deltaMode: 1 })
    expect(onPan).toHaveBeenLastCalledWith(48 * 6 * hour / 600)
    fireEvent.wheel(slider, { deltaX: -1, deltaMode: 2 })
    expect(onPan).toHaveBeenLastCalledWith(-6 * hour)
  })
  it("preserves pinch zoom and ignores wheel input while a pointer drag is active", () => {
    const { slider, onPan } = setup()
    const pinch = new WheelEvent("wheel", { deltaY: 100, ctrlKey: true, cancelable: true })
    fireEvent(slider, pinch)
    expect(pinch.defaultPrevented).toBe(false)
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 80 })
    fireEvent.wheel(slider, { deltaY: 100 })
    expect(onPan).not.toHaveBeenCalled()
    fireEvent.pointerCancel(slider, { pointerId: 1 })
    fireEvent.wheel(slider, { deltaY: 100 })
    expect(onPan).toHaveBeenCalledWith(hour)
  })
  it("centers track clicks and keeps the pointer grab offset for continuous dragging", () => {
    const { slider, move, dragging } = setup()
    fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 180 })
    expect(move).toHaveBeenLastCalledWith(15 * hour, true)
    fireEvent.pointerUp(slider, { pointerId: 1 })
    expect(dragging).toHaveBeenLastCalledWith(false)
    // Current window is 06:00–12:00: grab at 08:00, then move by 1.234 hours.
    fireEvent.pointerDown(slider, { button: 0, pointerId: 2, clientX: 80 })
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 92.34 })
    expect(move.mock.calls.at(-1)?.[0]).toBeCloseTo(7.234 * hour)
    expect(move.mock.calls.at(-1)?.[1]).toBe(false)
    fireEvent.pointerCancel(slider, { pointerId: 2 })
    const count = move.mock.calls.length
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 100 })
    expect(move).toHaveBeenCalledTimes(count)
  })
  it("offers hour steps and boundary keyboard navigation without arrow controls", () => {
    const { slider, move } = setup()
    fireEvent.keyDown(slider, { key: "ArrowRight" })
    expect(move).toHaveBeenLastCalledWith(7 * hour)
    fireEvent.keyDown(slider, { key: "Home" })
    expect(move).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: "End" })
    expect(move).toHaveBeenLastCalledWith(18 * hour)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})

  it("uses hourly ticks for a full local day and preserves both midnight labels in a narrow navigator", () => {
    const start = new Date(2026, 8, 8).getTime()
    render(<TimelineNavigator start={start} end={new Date(2026, 8, 9).getTime()} span={6 * hour} viewStart={start} times={[]} width={300} move={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Position" />)
    const ticks = document.querySelector(".prompt-session-navigation-dates")!
    expect(ticks.children).toHaveLength(25)
    expect(ticks.firstElementChild).toHaveTextContent("00:00")
    expect(ticks.lastElementChild).toHaveTextContent("24:00")
    expect(ticks).not.toHaveTextContent("2026/")
    expect([...ticks.children].filter(tick => tick.textContent).length).toBeLessThan(25)
  })
  it("uses only whole-hour ticks for a partial local day and calendar dates for multiple days", () => {
    const start = new Date(2026, 8, 8, 7, 15).getTime()
    const common = { span: 6 * hour, times: [], width: 600, move: vi.fn(), onPan: vi.fn(), onDraggingChange: vi.fn(), label: "Position" }
    const { rerender } = render(<TimelineNavigator {...common} start={start} end={new Date(2026, 8, 8, 20, 30).getTime()} viewStart={start} />)
    const ticks = document.querySelector(".prompt-session-navigation-dates")!
    expect(ticks.children).toHaveLength(13)
    expect(ticks.firstElementChild).toHaveTextContent("08:00")
    expect(ticks).not.toHaveTextContent("2026/")
    rerender(<TimelineNavigator {...common} start={new Date(2026, 8, 7).getTime()} end={new Date(2026, 8, 9).getTime()} viewStart={start} />)
    expect(ticks).toHaveTextContent("2026/9/7")
    expect(ticks).toHaveTextContent("2026/9/8")
  })

it("shows every hourly label including 01:00 and 23:00 when the navigator is wide enough", () => {
  const start = new Date(2026, 8, 8).getTime()
  render(<TimelineNavigator start={start} end={new Date(2026, 8, 9).getTime()} span={6 * hour} viewStart={start} times={[]} width={960} move={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Position" />)
  const ticks = document.querySelector(".prompt-session-navigation-dates")!
  expect([...ticks.children].map(tick => tick.textContent)).toEqual(Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, "0")}:00`))
})

it.each([300, 600, 800])("uses a uniform hourly interval at %ipx including both endpoints", width => {
  const start = new Date(2026, 8, 8).getTime()
  render(<TimelineNavigator start={start} end={new Date(2026, 8, 9).getTime()} span={6 * hour} viewStart={start} times={[]} width={width} move={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Position" />)
  const labels = [...document.querySelector(".prompt-session-navigation-dates")!.children].filter(tick => tick.textContent).map(tick => Number(tick.textContent!.split(":")[0]))
  expect(labels[0]).toBe(0)
  expect(labels[labels.length - 1]).toBe(24)
  const intervals = labels.slice(1).map((value, index) => value - labels[index])
  expect(new Set(intervals).size).toBe(1)
  expect(intervals[0] * width / 24).toBeGreaterThanOrEqual(32 + 8)
})

it("uses measured text width when a font needs more room", () => {
  const measure = vi.spyOn(HTMLSpanElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 44 } as DOMRect)
  try {
    const start = new Date(2026, 8, 8).getTime()
    render(<TimelineNavigator start={start} end={new Date(2026, 8, 9).getTime()} span={6 * hour} viewStart={start} times={[]} width={960} move={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Position" />)
    const labels = [...document.querySelector(".prompt-session-navigation-dates")!.children].filter(tick => tick.textContent)
    expect(labels).toHaveLength(13)
    expect(labels.map(tick => tick.textContent)).toEqual(Array.from({ length: 13 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`))
  } finally { measure.mockRestore() }
})


it("reports the nearest record only on release, including repeated clicks inside the selected window", () => {
  const onRecordClick = vi.fn()
  const { slider, move } = setup([8 * hour, 18 * hour, 19 * hour], onRecordClick)
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 184, clientY: 10 })
  expect(onRecordClick).not.toHaveBeenCalled()
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 184, clientY: 10 })
  expect(onRecordClick).toHaveBeenLastCalledWith(18 * hour)
  for (let pointerId = 2; pointerId <= 3; pointerId++) {
    fireEvent.pointerDown(slider, { button: 0, pointerId, clientX: 80, clientY: 10 })
    expect(move).toHaveBeenLastCalledWith(6 * hour, false)
    fireEvent.pointerUp(slider, { pointerId, clientX: 80, clientY: 10 })
  }
  expect(onRecordClick.mock.calls).toEqual([[18 * hour], [8 * hour], [8 * hour]])
})

it("keeps blank clicks and keyboard moves as navigation only", () => {
  const onRecordClick = vi.fn()
  const { slider, move } = setup([18 * hour], onRecordClick)
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 160, clientY: 10 })
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 160, clientY: 10 })
  expect(move).toHaveBeenLastCalledWith(13 * hour, true)
  fireEvent.keyDown(slider, { key: "ArrowRight" })
  expect(onRecordClick).not.toHaveBeenCalled()
})

it.each(["drag-return", "vertical-drag", "release-displacement", "cancel", "lost-capture"])("does not report a record after %s", action => {
  const onRecordClick = vi.fn()
  const { slider } = setup([18 * hour], onRecordClick)
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 180, clientY: 10 })
  if (action === "drag-return") {
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 185, clientY: 10 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 180, clientY: 10 })
  }
  if (action === "vertical-drag") fireEvent.pointerMove(slider, { pointerId: 1, clientX: 180, clientY: 15 })
  if (action === "cancel") fireEvent.pointerCancel(slider, { pointerId: 1 })
  if (action === "lost-capture") fireEvent.lostPointerCapture(slider, { pointerId: 1 })
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: action === "release-displacement" ? 185 : 180, clientY: 10 })
  expect(onRecordClick).not.toHaveBeenCalled()
})

it("accepts four pixels of click jitter and a record six pixels away", () => {
  const onRecordClick = vi.fn()
  const { slider } = setup([18 * hour], onRecordClick)
  fireEvent.pointerDown(slider, { button: 0, pointerId: 1, clientX: 182, clientY: 10 })
  fireEvent.pointerMove(slider, { pointerId: 1, clientX: 186, clientY: 10 })
  fireEvent.pointerUp(slider, { pointerId: 1, clientX: 186, clientY: 10 })
  expect(onRecordClick).toHaveBeenCalledWith(18 * hour)
})

describe("Navigator resizing", () => {
  it("keeps a true thin range and a separate grab control when the period is long", () => {
    const resize = vi.fn(), move = vi.fn(), zoom = vi.fn(), fit = vi.fn()
    render(<TimelineNavigator start={0} end={720 * hour} span={6 * hour} viewStart={12 * hour} times={[]} width={1200} move={move} resize={resize} zoom={zoom} fit={fit} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Time" resizeLabels={{ start: "Resize Start", end: "Resize End", pan: "Move Time" }} />)
    const slider = screen.getByRole("slider")
    expect(document.querySelector(".prompt-session-navigation-window")).toHaveStyle({ width: "0.8333333333333334%" })
    expect(screen.getByRole("button", { name: "Move Time" })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize Start" }), { key: "ArrowRight" })
    expect(resize).toHaveBeenCalledWith(13 * hour, 5 * hour)
    fireEvent.keyDown(screen.getByRole("button", { name: "Resize End" }), { key: "ArrowLeft" })
    expect(resize).toHaveBeenLastCalledWith(12 * hour, 5 * hour)
    fireEvent.keyDown(slider, { key: "+" }); expect(zoom).toHaveBeenCalledWith(.5)
    fireEvent.keyDown(slider, { key: "0" }); expect(fit).toHaveBeenCalledOnce()
  })
})

it("keeps the grip visible for wide ranges and keeps both boundary resize targets inside the rail", () => {
  const common = { start: 0, end: 24 * hour, span: 24 * hour, viewStart: 0, times: [], width: 1000, move: vi.fn(), resize: vi.fn(), zoom: vi.fn(), fit: vi.fn(), onPan: vi.fn(), onDraggingChange: vi.fn(), label: "Time", resizeLabels: { start: "Resize Start", end: "Resize End", pan: "Move Time" } }
  render(<TimelineNavigator {...common} />)
  expect(screen.getByRole("button", { name: "Move Time" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Resize Start" })).toHaveAttribute("data-boundary", "start")
  expect(screen.getByRole("button", { name: "Resize End" })).toHaveAttribute("data-boundary", "end")
  fireEvent.keyDown(screen.getByRole("button", { name: "Resize Start" }), { key: "ArrowRight" })
  expect(common.resize).toHaveBeenCalledWith(hour, 23 * hour)
})

it("keeps the duration and drag grooves in one clamped grip capsule", () => {
  render(<TimelineNavigator start={0} end={30 * 24 * hour} span={14 * 24 * hour} viewStart={0} times={[]} width={1000} move={vi.fn()} resize={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Time" spanLabel="14 Days" resizeLabels={{ start: "Resize Start", end: "Resize End", pan: "Move Time" }} />)
  const grip = screen.getByRole("button", { name: "Move Time" })
  const capsule = grip.querySelector(".prompt-navigation-capsule")!
  expect([...capsule.children].map(child => child.tagName)).toEqual(["I", "OUTPUT", "I"])
  expect(capsule.querySelectorAll("i")).toHaveLength(2)
  expect(capsule.querySelector("output")).toHaveTextContent("14 Days")
  expect(grip).toHaveAttribute("aria-description", "14 Days")
})

it.each([{ span: 300_000, label: "5 Minutes" }, { span: 30 * 24 * hour, label: "30 Days" }])("keeps one stroke either side of $label at both zoom bounds", ({ span, label }) => {
  render(<TimelineNavigator start={0} end={30 * 24 * hour} span={span} viewStart={0} times={[]} width={1000} move={vi.fn()} resize={vi.fn()} onPan={vi.fn()} onDraggingChange={vi.fn()} label="Time" spanLabel={label} resizeLabels={{ start: "Resize Start", end: "Resize End", pan: "Move Time" }} />)
  const grip = screen.getByRole("button", { name: "Move Time" })
  const capsule = grip.querySelector(".prompt-navigation-capsule")!
  expect([...capsule.children].map(child => child.tagName)).toEqual(["I", "OUTPUT", "I"])
  expect(capsule.children[0]).toHaveAttribute("data-side", "left")
  expect(capsule.children[1]).toHaveTextContent(label)
  expect(capsule.children[2]).toHaveAttribute("data-side", "right")
  expect(grip).toHaveAttribute("aria-description", label)
})

it.each(["start", "end"] as const)("resizes a tiny range from its %s target without moving the opposite edge", kind => {
  const resize = vi.fn(), dragging = vi.fn(), move = vi.fn()
  const start = 12 * hour, span = 300_000, duration = 720 * hour
  render(<TimelineNavigator start={0} end={duration} span={span} viewStart={start} times={[]} width={2400}
    move={move} resize={resize} onPan={vi.fn()} onDraggingChange={dragging} label="Time"
    resizeLabels={{ start: "Resize Start", end: "Resize End", pan: "Move Time" }} />)
  const slider = screen.getByRole("slider")
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({ left: 0, width: 2400 } as DOMRect)
  const target = screen.getByRole("button", { name: kind === "start" ? "Resize Start" : "Resize End" })
  target.setPointerCapture = vi.fn()
  target.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100 })
  expect(target).toHaveFocus()
  expect(dragging).toHaveBeenLastCalledWith(true)
  const direction = kind === "start" ? -1 : 1
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100 + direction })
  const delta = duration / 2400
  expect(resize).toHaveBeenLastCalledWith(kind === "start" ? start - delta : start, span + delta)
  expect(move).not.toHaveBeenCalled()
  fireEvent.pointerUp(target, { pointerId: 1 })
  expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
  expect(dragging).toHaveBeenLastCalledWith(false)
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 110 })
  expect(resize).toHaveBeenCalledOnce()
})
