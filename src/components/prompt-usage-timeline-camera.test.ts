import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CAMERA_SPAN, useTimelineCamera, timelineTicks } from "./prompt-usage-timeline-camera"

const hour = 3_600_000
afterEach(() => vi.restoreAllMocks())

describe("timeline activity camera", () => {
  it("accumulates small direct wheel deltas through empty periods without scheduling easing", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList)
    const { result } = renderHook(() => useTimelineCamera(0, 48 * hour, [hour, 40 * hour]))
    act(() => result.current.move(8 * hour, false))
    const raf = vi.spyOn(window, "requestAnimationFrame")
    act(() => { result.current.advance(1234); result.current.advance(5678) })
    expect(result.current.start).toBe(8 * hour + 6912)
    expect(result.current.moving).toBe(false)
    expect(raf).not.toHaveBeenCalled()
    act(() => result.current.advance(-6912))
    expect(result.current.start).toBe(8 * hour)
    raf.mockRestore()
  })
  it("clamps direct drag movement at both scope boundaries without animation", () => {
    const { result } = renderHook(() => useTimelineCamera(0, 24 * hour, [hour]))
    act(() => result.current.move(-2 * hour, false))
    expect(result.current.start).toBe(0)
    act(() => result.current.move(22 * hour, false))
    expect(result.current.start).toBe(18 * hour)
    expect(result.current.moving).toBe(false)
  })
  it("preserves viewport on live updates and resets for a new selected scope", () => {
    const { result, rerender } = renderHook(({ end, times }) => useTimelineCamera(0, end, times), { initialProps: { end: 48 * hour, times: [hour] } })
    expect(result.current.span).toBe(CAMERA_SPAN)
    act(() => result.current.move(20 * hour, false))
    rerender({ end: 48 * hour, times: [hour, 30 * hour] })
    expect(result.current.start).toBe(20 * hour)
    rerender({ end: 4 * hour, times: [hour] })
    expect(result.current.start).toBe(0)
    expect(result.current.end).toBe(4 * hour)
  })
  it.each([false, true])("uses the full frame clock without moving backward regardless of system motion preference (%s)", reducedMotion => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reducedMotion } as MediaQueryList)
    const frames: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.push(callback); return frames.length })
    try {
      const { result } = renderHook(() => useTimelineCamera(0, 48 * hour, [hour]))
      const initial = result.current.start
      act(() => result.current.move(20 * hour))
      act(() => frames.shift()!(1))
      expect(result.current.start).toBe(initial)
      act(() => frames.shift()!(161))
      expect(result.current.start).toBeGreaterThan(initial)
      expect(result.current.start).toBeLessThan(20 * hour)
      act(() => frames.shift()!(321))
      expect(result.current.start).toBe(20 * hour)
      expect(result.current.moving).toBe(false)
    } finally { raf.mockRestore() }
  })
  it("keeps the hourly viewport bounded even when no prompts match", () => {
    const { result } = renderHook(() => useTimelineCamera(0, 48 * hour, []))
    expect(result.current.start).toBe(0)
    expect(result.current.end).toBe(CAMERA_SPAN)
  })
  it("zooms around the pointer, clamps resized edges and fits the existing data extent", () => {
    const { result } = renderHook(() => useTimelineCamera(0, 48 * hour, [hour]))
    act(() => result.current.move(12 * hour, false))
    act(() => result.current.zoom(.5, .25))
    expect(result.current.span).toBe(3 * hour)
    expect(result.current.start).toBe(12.75 * hour)
    act(() => result.current.resize(50 * hour, 1))
    expect(result.current.span).toBe(5 * 60_000)
    expect(result.current.end).toBe(48 * hour)
    act(() => result.current.fit())
    expect(result.current.start).toBe(0)
    expect(result.current.end).toBe(48 * hour)
    act(() => result.current.zoom(.5))
    expect(result.current.span).toBe(24 * hour)
    expect(result.current.start).toBe(12 * hour)
  })
  it("uses minute ticks for close detail and bounded day ticks for long periods", () => {
    expect(timelineTicks(0, 5 * 60_000)).toEqual([0, 60_000, 120_000, 180_000, 240_000, 300_000])
    expect(timelineTicks(0, 48 * hour).length).toBeLessThanOrEqual(9)
    expect(timelineTicks(0, 30 * 24 * hour).length).toBeLessThanOrEqual(9)
  })

  it("resets a changed period with the default span after fitting the old scope", () => {
    const { result, rerender } = renderHook(({ end }) => useTimelineCamera(0, end, [20 * hour]), { initialProps: { end: 48 * hour } })
    act(() => result.current.fit())
    expect(result.current.span).toBe(48 * hour)
    rerender({ end: 36 * hour })
    expect(result.current.span).toBe(CAMERA_SPAN)
    expect(result.current.start).toBe(19.5 * hour)
    expect(result.current.target.current).toBe(19.5 * hour)
  })

})
