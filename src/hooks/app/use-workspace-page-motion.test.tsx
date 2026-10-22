import { render } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useWorkspacePageMotion } from "./use-workspace-page-motion"

function Harness({ pageKey = "home", skip = false }: { pageKey?: string; skip?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useWorkspacePageMotion(pageKey, ref, skip)
  return <div ref={ref} data-testid="content">{pageKey}</div>
}

const cancel = vi.fn()
const animate = vi.fn(() => ({ cancel }))
const addEventListener = vi.fn()
const removeEventListener = vi.fn()
let reducedMotion = false
const originalAnimate = Element.prototype.animate

beforeEach(() => {
  reducedMotion = true
  vi.clearAllMocks()
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: animate })
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    get matches() { return reducedMotion }, media: query,
    addEventListener, removeEventListener,
  }) as unknown as MediaQueryList)
})
afterEach(() => {
  Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: originalAnimate })
  vi.restoreAllMocks()
})

describe("workspace page motion", () => {
  it("does not animate initial mounting or ordinary data rerenders", () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness />)
    expect(animate).not.toHaveBeenCalled()
  })

  it("uses opacity only, without transforms, routing delays, or remounting the content surface", () => {
    const { rerender, getByTestId } = render(<Harness />)
    const surface = getByTestId("content")
    rerender(<Harness pageKey="prompt-usage:hierarchy" />)
    expect(getByTestId("content")).toBe(surface)
    expect(surface).toHaveTextContent("prompt-usage:hierarchy")
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: .72 }, { opacity: 1 }], {
      duration: 240, easing: "cubic-bezier(.22, 1, .36, 1)",
    })
  })

  it("cancels old transitions during rapid switches and on unmount", () => {
    const { rerender, unmount } = render(<Harness />)
    rerender(<Harness pageKey="prompt-usage:hierarchy" />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledTimes(2)
    unmount()
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(addEventListener).not.toHaveBeenCalled()
    expect(removeEventListener).not.toHaveBeenCalled()
  })

  it("leaves chart-to-timeline drill-down in sole control and does not replay when it finishes", () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness skip />)
    rerender(<Harness pageKey="prompt-usage:timeline" skip />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    expect(animate).not.toHaveBeenCalled()
  })

  it("cancels navigation motion when a drill-down starts", () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    rerender(<Harness pageKey="prompt-usage:timeline" skip />)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it("keeps full motion when the system requests reduced motion", () => {
    const { rerender } = render(<Harness />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    expect(animate).toHaveBeenCalledOnce()
    expect(window.matchMedia).not.toHaveBeenCalled()
  })

  it("does not subscribe to system motion changes or cancel active navigation for them", () => {
    reducedMotion = false
    const { rerender } = render(<Harness />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    reducedMotion = true
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    expect(cancel).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
    expect(window.matchMedia).not.toHaveBeenCalled()
  })

  it("keeps navigation functional in a renderer without Web Animations", () => {
    Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: undefined })
    const { rerender, getByTestId } = render(<Harness />)
    rerender(<Harness pageKey="prompt-usage:timeline" />)
    expect(getByTestId("content")).toHaveTextContent("prompt-usage:timeline")
    expect(animate).not.toHaveBeenCalled()
  })
})
