import { createRef } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getGuideCopy } from "@/lib/guide-demo/copy"
import { GUIDE_STEPS } from "./steps"
import { Coach } from "./coach"
import { useGuideLayout } from "./use-guide-layout"

vi.mock("./use-guide-layout", () => ({ useGuideLayout: vi.fn() }))
vi.mock("./use-guide-interaction", () => ({ useGuideInteraction: vi.fn() }))

const step = (id: string) => GUIDE_STEPS.findIndex(s => s.id === id) + 1
const copy = getGuideCopy("zh-TW")
const rect = { x: 100, y: 120, w: 60, h: 35 }
const layout = {
  app: new DOMRect(0, 0, 1280, 800), focus: rect, extras: [], highlights: [rect],
  x: 70, y: 171, w: 330, pins: [], placement: { side: "top" as const, offset: 60 },
}
function ready(step: number, changes: Partial<ReturnType<typeof useGuideLayout>> = {}) {
  vi.mocked(useGuideLayout).mockReturnValue({
    shown: step, layout, active: true, failed: false, retry: vi.fn(),
    card: createRef<HTMLElement>(), hole: createRef<SVGRectElement>(), outline: createRef<SVGRectElement>(),
    dragging: { current: false }, ...changes,
  })
}
function show(step: number, complete: number[] = [], onExit = vi.fn()) {
  const onStep = vi.fn()
  render(<Coach step={step} reset="relative" complete={complete} copy={copy} onComplete={vi.fn()} onStep={onStep} onExit={onExit} />)
  return onStep
}

beforeEach(() => ready(4))
afterEach(cleanup)

describe("Compact guide coach", () => {
  it("keeps a solid 68 percent shade while the first target is pending", () => {
    ready(4, { layout: null, active: false })
    show(4)
    expect(screen.getByTestId("guide-shade")).toHaveAttribute("opacity", ".68")
    expect(document.querySelectorAll('#guide-hole rect[fill="black"]')).toHaveLength(0)
    expect(document.querySelectorAll(".guide-focus")).toHaveLength(0)
    expect(screen.getByTestId("guide-next")).toBeDisabled()
  })

  it("does not leave stale bright areas during a step transition", () => {
    ready(4, { active: false })
    show(4)
    expect(screen.getByTestId("guide-shade")).toBeInTheDocument()
    expect(document.querySelectorAll('#guide-hole rect[fill="black"]')).toHaveLength(0)
    expect(screen.getByTestId("guide-card")).toHaveAttribute("aria-hidden", "true")
  })

  it("keeps the palette coach available while waiting for Apply", () => {
    ready(step("model-palette"))
    show(step("model-palette"))
    expect(screen.getByTestId("guide-card")).not.toHaveAttribute("inert")
    expect(screen.getByTestId("guide-card")).toHaveAttribute("aria-hidden", "false")
    expect(screen.getByTestId("guide-next")).toBeDisabled()
    expect(screen.getByTestId("interactive-guide").parentElement).toBe(document.body)
    expect(document.querySelectorAll('#guide-hole rect[fill="black"]')).toHaveLength(1)
  })

  it("shows one stage line and omits repeated reading instructions", () => {
    ready(1)
    const onStep = show(1)
    expect(screen.getByText(copy.stages[0])).toBeInTheDocument()
    expect(screen.queryByText(copy.stages[1])).not.toBeInTheDocument()
    expect(screen.queryByText(copy.stages[2])).not.toBeInTheDocument()
    expect(document.querySelector(".guide-stage")).toHaveTextContent("1 / 7")
    expect(document.querySelector(".guide-progress,.guide-step-line,.guide-task")).toBeNull()
    expect(screen.getByRole("heading", { name: copy.steps[0].title })).toBeInTheDocument()
    expect(screen.getByTestId("guide-next")).toBeEnabled()
    expect(screen.getByTestId("guide-next")).toHaveAccessibleName(copy.chrome.continue)
    expect(screen.queryByTestId("guide-next-check")).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId("guide-next"))
    expect(onStep).toHaveBeenCalledWith(2)
  })

  it("keeps the actual operation gate and an accessible completion status", () => {
    const onStep = show(4)
    fireEvent.click(screen.getByTestId("guide-next"))
    expect(onStep).not.toHaveBeenCalled()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
    expect(screen.queryByTestId("guide-next-check")).not.toBeInTheDocument()
    cleanup()
    ready(4)
    const completedStep = show(4, [4])
    expect(screen.getByRole("status")).toHaveTextContent(copy.chrome.completedTask)
    expect(screen.getByRole("status")).toHaveClass("sr-only")
    expect(document.querySelector(".guide-completed")).toBeNull()
    expect(screen.getByTestId("guide-next-check").closest("button")).toBe(screen.getByTestId("guide-next"))
    expect(screen.getByTestId("guide-next")).toHaveAccessibleName(copy.chrome.next)
    expect(screen.getByTestId("guide-next")).toHaveAccessibleDescription(copy.chrome.completedTask)
    expect(screen.getByTestId("guide-next")).toBeEnabled()
    fireEvent.click(screen.getByTestId("guide-next"))
    expect(completedStep).toHaveBeenCalledWith(5)
  })

  it("offers a direct text action to skip the guide", () => {
    const onExit = vi.fn()
    const onStep = show(4, [], onExit)
    fireEvent.click(screen.getByRole("button", { name: copy.chrome.skip }))
    expect(onExit).toHaveBeenCalledOnce()
    expect(onStep).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: copy.chrome.exit })).not.toBeInTheDocument()
  })

  it("puts the completion check inside the final action", () => {
    ready(step("event"))
    const onStep = show(step("event"), [step("event")])
    const finish = screen.getByRole("button", { name: copy.chrome.finish })
    expect(finish).toBeEnabled()
    expect(screen.getByTestId("guide-next-check").closest("button")).toBe(finish)
    fireEvent.click(finish)
    expect(onStep).toHaveBeenCalledWith(GUIDE_STEPS.length + 1)
  })

  it("keeps keyboard alternatives visible before and after the drag is complete", () => {
    ready(step("pan"))
    show(step("pan"))
    expect(screen.getByText(copy.chrome.panKeyboard)).toBeInTheDocument()
    cleanup()
    ready(step("zoom"))
    show(step("zoom"), [step("zoom")])
    expect(screen.getByText(copy.chrome.zoomKeyboard)).toBeInTheDocument()
  })

  it("highlights four precise timeline areas and ties its notch to the target", () => {
    const highlights = Array.from({ length: 4 }, (_, i) => ({ ...rect, y: 120 + i * 70 }))
    ready(step("timeline-intro"), { layout: { ...layout, highlights, extras: highlights.slice(1) } })
    show(step("timeline-intro"))
    expect(document.querySelectorAll('#guide-hole rect[fill="black"]')).toHaveLength(4)
    expect(document.querySelectorAll(".guide-focus")).toHaveLength(4)
    expect(screen.getByTestId("guide-card")).toHaveClass("notch-top")
    expect(screen.getByTestId("guide-card").style.getPropertyValue("--notch")).toBe("60px")
  })

  it("retains the final event legends while waiting for the actual selection", () => {
    ready(step("event"))
    show(step("event"))
    for (const [name, description] of copy.steps[step("event") - 1].points!) {
      expect(screen.getByText(name)).toBeInTheDocument()
      expect(screen.getByText(description)).toBeInTheDocument()
    }
    expect(screen.getByTestId("guide-next")).toBeDisabled()
  })

  it("keeps a failed target recoverable without unlocking the next step", () => {
    const retry = vi.fn()
    ready(4, { failed: true, retry })
    show(4, [4])
    expect(screen.getByRole("alert")).toHaveTextContent(copy.chrome.failure)
    expect(screen.getByTestId("guide-next")).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: copy.chrome.retry }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
