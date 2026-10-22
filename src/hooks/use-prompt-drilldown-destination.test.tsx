import { useRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePromptDrilldownDestination } from "./use-prompt-drilldown-destination"
import { useAppUiStore, type PromptUsageViewMode } from "@/stores/app-ui-store"

const rect = { left: 10, top: 20, width: 100, height: 40 }
function arrive(destination: PromptUsageViewMode, ready = true) {
  act(() => useAppUiStore.getState().setPromptUsageDrilldownTransition({
    destination, phase: "arriving", sourceCardRect: rect, sourceActionRect: rect,
    destinationSurfaceRect: ready ? rect : null, destinationFilterRect: ready ? rect : null,
  }))
}
function finish() { act(() => useAppUiStore.getState().setPromptUsageDrilldownTransition(null)) }
function Destination({ mode, active = true }: { mode: PromptUsageViewMode; active?: boolean }) {
  const surface = useRef<HTMLDivElement>(null)
  const filter = useRef<HTMLDivElement>(null)
  usePromptDrilldownDestination(mode, active, surface, filter)
  return <div ref={surface}><div ref={filter} data-testid={mode}><button>Range</button></div></div>
}

describe("drilldown range landing", () => {
  beforeEach(() => { useAppUiStore.getState().resetState(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it.each(["hierarchy", "timeline"] as const)("emphasizes only the %s destination after handoff, then clears", destination => {
    render(<><Destination mode="hierarchy" /><Destination mode="timeline" /></>)
    arrive(destination)
    const filter = screen.getByTestId(destination)
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    expect(filter).toHaveAttribute("data-drilldown-filter", "target")
    finish()
    expect(filter).not.toHaveAttribute("data-drilldown-filter")
    expect(filter).toHaveAttribute("data-drilldown-range", "landing")
    expect(screen.getByTestId(destination === "hierarchy" ? "timeline" : "hierarchy")).not.toHaveAttribute("data-drilldown-range")
    act(() => vi.advanceTimersByTime(2999))
    expect(filter).toHaveAttribute("data-drilldown-range", "landing")
    act(() => vi.advanceTimersByTime(1))
    expect(filter).not.toHaveAttribute("data-drilldown-range")
  })

  it("does not rerender an inactive destination for transition updates", () => {
    const painted = vi.fn()
    function Inactive() {
      painted()
      const surface = useRef<HTMLDivElement>(null)
      const filter = useRef<HTMLDivElement>(null)
      usePromptDrilldownDestination("timeline", false, surface, filter)
      return <div ref={surface}><div ref={filter} /></div>
    }
    render(<Inactive />)
    const initial = painted.mock.calls.length
    arrive("timeline")
    finish()
    expect(painted).toHaveBeenCalledTimes(initial)
  })

  it("does not emphasize an unmeasured transition or inactive destination", () => {
    const view = render(<Destination mode="timeline" />)
    arrive("timeline", false)
    finish()
    expect(screen.getByTestId("timeline")).not.toHaveAttribute("data-drilldown-range")
    view.rerender(<Destination mode="timeline" active={false} />)
    arrive("timeline")
    finish()
    expect(screen.getByTestId("timeline")).not.toHaveAttribute("data-drilldown-range")
  })

  it("dismisses on interaction, restarts on a later handoff and cleans up when hidden", () => {
    const view = render(<Destination mode="timeline" />)
    const filter = screen.getByTestId("timeline")
    arrive("timeline"); finish()
    fireEvent.pointerDown(filter.firstElementChild!)
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    arrive("timeline"); finish()
    expect(filter).toHaveAttribute("data-drilldown-range", "landing")
    fireEvent.keyDown(filter.firstElementChild!, { key: "Enter" })
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    arrive("timeline"); finish()
    arrive("hierarchy")
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    arrive("timeline"); finish()
    view.rerender(<Destination mode="timeline" active={false} />)
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(<Destination mode="timeline" />)
    arrive("timeline"); finish()
    view.unmount()
    expect(filter).not.toHaveAttribute("data-drilldown-range")
    expect(vi.getTimerCount()).toBe(0)
  })
})
