import { act, renderHook } from "@testing-library/react"
import type { KeyboardEvent, PointerEvent } from "react"
import { describe, expect, it, vi } from "vitest"

import { useUsageTrendHoverIntent } from "@/components/use-usage-trend-hover-intent"

function pointer(pointerType = "mouse") {
  return { pointerType } as PointerEvent<HTMLButtonElement>
}

function setup() {
  const hook = renderHook(() => useUsageTrendHoverIntent({
    interactiveIndices: [0, 1, 2, 3], initialIndex: 0, resetKey: "test",
  }))
  act(() => hook.result.current.handleSlotPointerEnter(pointer(), 1))
  return hook
}

describe("Usage Trend hover activation", () => {
  it("preserves the selected card through same-slot focus and click activation", () => {
    const { result } = setup()
    act(() => result.current.handleSlotFocus(1))
    expect(result.current.tooltipIndex).toBe(1)
    act(() => result.current.activate(1))
    expect(result.current.tooltipIndex).toBe(1)
  })

  it("retargets immediately on entering a neighboring slot", () => {
    const { result } = setup()
    act(() => result.current.handleSlotPointerEnter(pointer(), 2))
    expect(result.current.tooltipIndex).toBe(2)
    expect(result.current.activeIndex).toBe(2)
  })

  it("ignores touch hover and retains mouse compatibility activation", () => {
    const { result } = setup()
    act(() => result.current.handleSlotPointerEnter(pointer("touch"), 2))
    expect(result.current.tooltipIndex).toBe(1)
    act(() => result.current.handleSlotMouseEnter(2))
    expect(result.current.tooltipIndex).toBe(2)
  })

  it("keeps keyboard navigation and boundary clamping", () => {
    const { result } = setup()
    const key = { key: "ArrowRight", preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLButtonElement>
    act(() => result.current.handlePointKeyDown(key, 1))
    expect(result.current.tooltipIndex).toBe(2)
    act(() => result.current.handlePointKeyDown(key, 3))
    expect(result.current.tooltipIndex).toBe(3)
  })

  it("keeps the card open when bridge entry cancels dismissal", () => {
    vi.useFakeTimers()
    try {
      const { result } = setup()
      act(() => result.current.scheduleHide())
      act(() => result.current.cancelHide())
      act(() => vi.advanceTimersByTime(200))
      expect(result.current.tooltipIndex).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("dismisses on empty slots and refuses click or focus activation for them", () => {
    const { result } = renderHook(() => useUsageTrendHoverIntent({
      interactiveIndices: [1, 3], initialIndex: 3, resetKey: "sparse",
    }))
    act(() => result.current.activate(1))
    expect(result.current.tooltipIndex).toBe(1)
    act(() => result.current.handleSlotPointerEnter(pointer(), 2))
    expect(result.current.tooltipIndex).toBeNull()
    act(() => result.current.handleSlotFocus(2))
    act(() => result.current.activate(2))
    expect(result.current.tooltipIndex).toBeNull()
    expect(result.current.activeIndex).toBe(1)
  })

  it("skips empty slots with arrow keys and Home/End", () => {
    const { result } = renderHook(() => useUsageTrendHoverIntent({
      interactiveIndices: [1, 3], initialIndex: 4, resetKey: "sparse",
    }))
    expect(result.current.activeIndex).toBe(3)
    const key = (value: string) => ({ key: value, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLButtonElement>)
    act(() => result.current.handlePointKeyDown(key("Home"), 3))
    expect(result.current.tooltipIndex).toBe(1)
    act(() => result.current.handlePointKeyDown(key("ArrowRight"), 1))
    expect(result.current.tooltipIndex).toBe(3)
    act(() => result.current.handlePointKeyDown(key("ArrowLeft"), 3))
    expect(result.current.tooltipIndex).toBe(1)
    act(() => result.current.handlePointKeyDown(key("End"), 1))
    expect(result.current.tooltipIndex).toBe(3)
  })

  it("clears details when an active slot loses its data during refresh", () => {
    const { result, rerender } = renderHook(({ indices }) => useUsageTrendHoverIntent({
      interactiveIndices: indices, initialIndex: 3, resetKey: "sparse",
    }), { initialProps: { indices: [1, 3] } })
    act(() => result.current.activate(3))
    expect(result.current.tooltipIndex).toBe(3)
    rerender({ indices: [1] })
    expect(result.current.tooltipIndex).toBeNull()
    expect(result.current.activeIndex).toBe(1)
    rerender({ indices: [] })
    expect(result.current.activeIndex).toBe(-1)
    act(() => result.current.activate(0))
    expect(result.current.tooltipIndex).toBeNull()
  })
})
