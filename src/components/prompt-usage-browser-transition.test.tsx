import { act, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captureBrowserTransition, PromptUsageBrowserTransition } from "./prompt-usage-browser-transition"

const origin = new DOMRect(50, 60, 240, 180)
const target = new DOMRect(600, 80, 400, 700)
function sourceCard() {
  const card = document.createElement("div")
  card.innerHTML = '<strong id="source-title">Selected Prompt</strong><button>Open In Project Browser</button>'
  card.getBoundingClientRect = () => origin
  return card
}
function Harness({ done }: { done: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const source = useRef(captureBrowserTransition(sourceCard()))
  return <div ref={host}><div data-browser-destination><aside data-column="details"><h3 tabIndex={-1}>Destination Prompt</h3></aside></div><PromptUsageBrowserTransition source={source.current} host={host} onComplete={done} /></div>
}

const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate")
beforeEach(() => Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: vi.fn() }))
afterEach(() => {
  vi.restoreAllMocks()
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, "animate")
})

describe("Timeline To Project Browser transition", () => {
  it.each([false, true])("travels one persistent shell and reveals content late regardless of system motion preference (%s)", async reducedMotion => {
    const media = window.matchMedia
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({ ...media(query), matches: query.includes("prefers-reduced-motion") && reducedMotion }))
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return this.dataset.column === "details" ? target : new DOMRect(0, 0, 1200, 900) })
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    const cancel = vi.fn()
    const animate = vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({ finished, cancel } as unknown as Animation)
    const done = vi.fn()
    render(<Harness done={done} />)
    const shell = screen.getByTestId("prompt-browser-transition-shell")
    expect(shell).toHaveStyle({ left: "600px", top: "80px", width: "400px", height: "700px" })
    expect(animate.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ transform: `translate(-550px, -20px) scale(0.6, ${180 / 700})` })]))
    expect(animate.mock.calls[2][0]).toEqual([{ opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 }])
    expect(shell.querySelector("#source-title")).toBeNull()
    expect(done).not.toHaveBeenCalled()
    await act(async () => { finish(); await finished })
    expect(done).toHaveBeenCalledOnce()
    expect(screen.getByText("Destination Prompt")).toHaveFocus()
  })

  it("opens and focuses the reader immediately when Web Animations is unavailable", () => {
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: undefined })
    const done = vi.fn()
    render(<Harness done={done} />)
    expect(done).toHaveBeenCalledOnce()
    expect(screen.getByText("Destination Prompt")).toHaveFocus()
  })

  it("cancels all animation work on exit without completing stale navigation", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(target)
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    const cancel = vi.fn()
    vi.spyOn(HTMLElement.prototype, "animate").mockReturnValue({ finished, cancel } as unknown as Animation)
    const done = vi.fn()
    const view = render(<Harness done={done} />)
    view.unmount()
    expect(cancel).toHaveBeenCalledTimes(3)
    await act(async () => { finish(); await finished })
    expect(done).not.toHaveBeenCalled()
  })
})
