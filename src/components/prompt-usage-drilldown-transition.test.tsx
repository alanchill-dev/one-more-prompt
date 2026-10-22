import { useRef } from "react"
import { usePromptDrilldownDestination } from "@/hooks/use-prompt-drilldown-destination"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PromptUsageDrilldownTransitionLayer } from "@/components/prompt-usage-drilldown-transition"
import { useAppUiStore } from "@/stores/app-ui-store"

const sourceCardRect = { left: 410, top: 120, width: 276, height: 266 }
const sourceActionRect = { left: 422, top: 318, width: 252, height: 58 }
const animationCss = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8")

describe("PromptUsageDrilldownTransitionLayer", () => {
  beforeEach(() => useAppUiStore.getState().resetState())

  it("carries the same exact hour label as the destination time filter", () => {
    useAppUiStore.getState().setPromptUsageDrilldownTransition({
      destination: "timeline", scope: { type: "hour", dateKey: "2026-09-07", hour: 14 },
      sourceCardRect, sourceActionRect, destinationSurfaceRect: null, destinationFilterRect: null, phase: "departing",
    })
    render(<PromptUsageDrilldownTransitionLayer />)
    expect(screen.getByTestId("prompt-usage-drilldown-layer")).toHaveTextContent("2026/9/7 · 14:00–14:59")
  })

  it.each(["hierarchy", "timeline"] as const)("carries the %s workspace graphic into the persistent shell", (destination) => {
    useAppUiStore.getState().setPromptUsageDrilldownTransition({
      destination, sourceCardRect, sourceActionRect,
      destinationSurfaceRect: null, destinationFilterRect: null, phase: "departing",
    })
    render(<PromptUsageDrilldownTransitionLayer />)
    const shell = screen.getByTestId("prompt-usage-drilldown-action-shell")
    expect(shell.querySelector(".trend-workspace-content")).not.toBeNull()
    expect(shell.querySelector(".trend-workspace-content")).toHaveAttribute("data-destination", destination)
  })

  it("keeps the same persistent shells from source lift through destination FLIP", () => {
    render(
      <div className="app-panel-surface">
        <PromptUsageDrilldownTransitionLayer />
      </div>,
    )

    act(() => useAppUiStore.getState().setPromptUsageDrilldownTransition({
      sourceCardRect,
      sourceActionRect,
      destinationSurfaceRect: null,
      destinationFilterRect: null,
      phase: "departing",
    }))

    const cardShell = screen.getByTestId("prompt-usage-drilldown-card-shell")
    const actionShell = screen.getByTestId("prompt-usage-drilldown-action-shell")
    const layer = screen.getByTestId("prompt-usage-drilldown-layer")

    expect(layer).toHaveAttribute("data-phase", "departing")
    expect(layer).toHaveAttribute("data-ready", "false")
    expect(cardShell).toHaveStyle({ left: "410px", top: "120px", width: "276px", height: "266px" })

    act(() => useAppUiStore.getState().setPromptUsageDrilldownTransition({
      sourceCardRect,
      sourceActionRect,
      destinationSurfaceRect: { left: 24, top: 120, width: 1180, height: 640 },
      destinationFilterRect: { left: 24, top: 120, width: 150, height: 40 },
      phase: "arriving",
    }))

    expect(screen.getByTestId("prompt-usage-drilldown-layer")).toHaveAttribute("data-phase", "arriving")
    expect(screen.getByTestId("prompt-usage-drilldown-layer")).toHaveAttribute("data-ready", "true")
    expect(screen.getByTestId("prompt-usage-drilldown-card-shell")).toBe(cardShell)
    expect(screen.getByTestId("prompt-usage-drilldown-action-shell")).toBe(actionShell)
    expect(cardShell).toHaveStyle({ left: "24px", top: "120px", width: "1180px", height: "640px" })
    expect(cardShell.style.getPropertyValue("--prompt-drilldown-flip-x")).not.toBe("")
    expect(cardShell.style.getPropertyValue("--prompt-drilldown-flip-scale-x")).not.toBe("")
  })

  it("measures only the requested visible destination", async () => {
    const readRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid?.startsWith("timeline")) throw new Error("Hidden Timeline measured")
      return { left: 10, top: 20, width: 400, height: 300, x: 10, y: 20, right: 410, bottom: 320, toJSON: () => ({}) }
    })
    function Destination({ mode, active }: { mode: "hierarchy" | "timeline"; active: boolean }) {
      const surface = useRef<HTMLDivElement>(null)
      const filter = useRef<HTMLDivElement>(null)
      usePromptDrilldownDestination(mode, active, surface, filter)
      return <div ref={surface} data-testid={`${mode}-surface`}><div ref={filter} data-testid={`${mode}-filter`} /></div>
    }
    try {
      useAppUiStore.getState().setPromptUsageDrilldownTransition({ sourceCardRect, sourceActionRect, destination: "hierarchy", phase: "arriving", destinationSurfaceRect: null, destinationFilterRect: null })
      render(<><Destination mode="timeline" active={false} /><Destination mode="hierarchy" active /></>)
      await waitFor(() => expect(useAppUiStore.getState().promptUsageDrilldownTransition?.destinationSurfaceRect).toEqual({ left: 10, top: 20, width: 400, height: 300 }))
      expect(readRect).toHaveBeenCalledTimes(2)
    } finally { readRect.mockRestore() }
  })

  it("releases the overlay when an empty or loading target has no measurable filter", () => {
    vi.useFakeTimers()
    try {
      useAppUiStore.getState().setPromptUsageDrilldownTransition({ sourceCardRect, sourceActionRect, destination: "hierarchy", phase: "arriving", destinationSurfaceRect: null, destinationFilterRect: null })
      render(<PromptUsageDrilldownTransitionLayer />)
      expect(screen.getByTestId("prompt-usage-drilldown-layer")).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1500))
      expect(useAppUiStore.getState().promptUsageDrilldownTransition).toBeNull()
      expect(screen.queryByTestId("prompt-usage-drilldown-layer")).not.toBeInTheDocument()
    } finally { vi.useRealTimers() }
  })

  it("keeps the full handoff until animation ends even with system reduced motion", () => {
    vi.useFakeTimers()
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList)
    try {
      useAppUiStore.getState().setPromptUsageDrilldownTransition({ sourceCardRect, sourceActionRect, phase: "arriving",
        destinationSurfaceRect: { left: 24, top: 120, width: 1180, height: 640 },
        destinationFilterRect: { left: 24, top: 120, width: 150, height: 40 } })
      render(<PromptUsageDrilldownTransitionLayer />)
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.getByTestId("prompt-usage-drilldown-layer")).toHaveAttribute("data-ready", "true")
      // jsdom exposes WebKit animation styles without AnimationEvent.
      fireEvent(screen.getByTestId("prompt-usage-drilldown-card-shell"), new Event("webkitAnimationEnd", { bubbles: true }))
      expect(useAppUiStore.getState().promptUsageDrilldownTransition).toBeNull()
    } finally { vi.useRealTimers() }
  })

  it("clears the fallback timer on unmount without completing stale navigation", () => {
    vi.useFakeTimers()
    try {
      useAppUiStore.getState().setPromptUsageDrilldownTransition({ sourceCardRect, sourceActionRect, phase: "arriving", destinationSurfaceRect: null, destinationFilterRect: null })
      const { unmount } = render(<PromptUsageDrilldownTransitionLayer />)
      unmount()
      act(() => vi.advanceTimersByTime(1500))
      expect(useAppUiStore.getState().promptUsageDrilldownTransition).not.toBeNull()
    } finally { vi.useRealTimers() }
  })

  it("keeps the cross-page motion transform-first instead of animating layout geometry", () => {
    const match = animationCss.match(/@keyframes prompt-drilldown-card-flip\s*\{([\s\S]*?)\n\}/)
    expect(match?.[1]).toContain("transform:")
    expect(match?.[1]).not.toMatch(/\b(left|top|width|height):/)
    expect(animationCss).not.toContain("@keyframes prompt-drilldown-card-open")
    expect(animationCss).not.toContain("@keyframes prompt-timeline-materialize")
  })
})
