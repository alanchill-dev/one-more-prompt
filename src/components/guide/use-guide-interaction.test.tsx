import { createPortal } from "react-dom"
import { fireEvent, render, renderHook, cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useGuideInteraction } from "./use-guide-interaction"
import { GUIDE_STEPS } from "./steps"

const step = (id: string) => {
  const index = GUIDE_STEPS.findIndex(entry => entry.id === id)
  if (index < 0) throw new Error(`Missing guide step: ${id}`)
  return index + 1
}
const bounds = () => new DOMRect(0, 0, 120, 30)
function workspace() {
  document.body.innerHTML = `<div class="guide-workspace"><button id="outside">Unrelated</button><div class="overview-screen"><button data-testid="usage-trend-model-colors-button">Palette</button></div><div class="prompt-session-navigation-map"><div class="prompt-session-navigation-window"></div></div><button class="prompt-navigation-handle-end">Resize</button><section class="guide-card"><button>Next</button></section></div>`
  document.querySelectorAll<HTMLElement>(".guide-workspace,.guide-workspace *").forEach(node => { node.getBoundingClientRect = bounds })
  return {
    card: { current: document.querySelector<HTMLElement>(".guide-card")! },
    dragging: { current: false },
    palette: document.querySelector<HTMLButtonElement>('[data-testid="usage-trend-model-colors-button"]')!,
  }
}
afterEach(() => { cleanup(); document.body.replaceChildren() })

describe("Guide input boundaries", () => {
  it("allows the taught palette trigger, its open portal and coach while blocking unrelated actions", () => {
    const { card, dragging, palette } = workspace()
    renderHook(() => useGuideInteraction(step("model-palette"), () => {}, card, dragging))
    const click = () => new MouseEvent("click", { bubbles: true, cancelable: true })
    expect(palette.dispatchEvent(click())).toBe(true)
    const portal = document.createElement("div")
    portal.dataset.testid = "usage-trend-model-color-inspector"
    portal.dataset.state = "open"
    portal.innerHTML = "<button>Apply Palette</button>"
    portal.getBoundingClientRect = bounds
    document.body.append(portal)
    expect(portal.querySelector("button")!.dispatchEvent(click())).toBe(true)
    expect(card.current.querySelector("button")!.dispatchEvent(click())).toBe(true)
    expect(document.querySelector("#outside")!.dispatchEvent(click())).toBe(false)
  })

  it("cannot pan a read-only timeline or bypass the zoom task with a wheel", () => {
    const { card, dragging } = workspace()
    const { rerender } = renderHook(({ id }) => useGuideInteraction(step(id), () => {}, card, dragging), { initialProps: { id: "timeline-intro" } })
    const map = document.querySelector(".prompt-session-navigation-map")!
    const wheel = () => new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 })
    expect(map.dispatchEvent(wheel())).toBe(false)
    rerender({ id: "pan" })
    expect(map.dispatchEvent(wheel())).toBe(true)
    rerender({ id: "zoom" })
    expect(map.dispatchEvent(wheel())).toBe(false)
  })

  it.each(["peak", "pan", "zoom"])("suppresses React hover and focus previews during %s, including pointermove after entering", id => {
    const { card, dragging } = workspace()
    const preview = vi.fn()
    const portal = document.createElement("div")
    document.body.append(portal)
    const surface = document.querySelector(".guide-workspace")!
    const { getByText } = render(<button onPointerMove={preview} onPointerEnter={preview} onMouseEnter={preview} onFocus={preview}>Other Prompt</button>, { container: surface, baseElement: document.body })
    render(<>{createPortal(<button onPointerMove={preview}>Portaled Preview</button>, portal)}</>)
    renderHook(() => useGuideInteraction(step(id), () => {}, card, dragging))
    const button = getByText("Other Prompt")
    fireEvent.pointerOver(button)
    fireEvent.pointerMove(button)
    fireEvent.mouseOver(button)
    fireEvent.focusIn(button)
    // A drag must not grant every unrelated element permission to open previews.
    dragging.current = true
    fireEvent.pointerMove(button)
    fireEvent.pointerMove(getByText("Portaled Preview"))
    expect(preview).not.toHaveBeenCalled()
  })

  it.each(["peak", "drill", "pan", "zoom"])("blocks React enter synthesized from leaving the coach toward a preview during %s", id => {
    const { card, dragging } = workspace()
    const preview = vi.fn()
    const surface = document.querySelector(".guide-workspace")!
    const { getByText } = render(<>
      <section className="guide-card"><button>Next Step</button></section>
      <button data-testid={id === "peak" || id === "drill" ? "usage-trend-slot-4" : undefined} className="prompt-session-event" onPointerEnter={() => preview()} onMouseEnter={() => preview()}>Preview Target</button>
    </>, { container: surface })
    card.current = getByText("Next Step").closest<HTMLElement>(".guide-card")!
    renderHook(() => useGuideInteraction(step(id), () => {}, card, dragging))
    const next = getByText("Next Step"), target = getByText("Preview Target")
    fireEvent.pointerOut(next, { relatedTarget: target })
    fireEvent.mouseOut(next, { relatedTarget: target })
    expect(preview).not.toHaveBeenCalled()
  })

  it("retains pointer capture movement on the map and resize handle", () => {
    const { card, dragging } = workspace()
    const move = vi.fn()
    const surface = document.querySelector(".guide-workspace")!
    const { getByText, rerender } = render(<div className="prompt-session-navigation-map" onPointerMove={move}>Map</div>, { container: surface })
    getByText("Map").getBoundingClientRect = bounds
    const hook = renderHook(({ id }) => useGuideInteraction(step(id), () => {}, card, dragging), { initialProps: { id: "pan" } })
    fireEvent.pointerDown(getByText("Map"), { button: 0 })
    fireEvent.pointerMove(getByText("Map"))
    expect(move).toHaveBeenCalledTimes(1)
    rerender(<button className="prompt-navigation-handle-end" onPointerMove={move}>Resize</button>)
    getByText("Resize").getBoundingClientRect = bounds
    hook.rerender({ id: "zoom" })
    fireEvent.pointerDown(getByText("Resize"), { button: 0 })
    fireEvent.pointerMove(getByText("Resize"))
    expect(move).toHaveBeenCalledTimes(2)
  })

  it("keeps palette controls in the guide keyboard cycle and permits panel scrolling", () => {
    const { card, dragging } = workspace()
    const portal = document.createElement("div")
    portal.dataset.testid = "usage-trend-model-color-inspector"
    portal.dataset.state = "open"
    portal.innerHTML = "<input aria-label='HEX'><button>Apply Palette</button>"
    portal.getBoundingClientRect = bounds
    document.body.append(portal)
    portal.querySelectorAll<HTMLElement>("*").forEach(node => { node.getBoundingClientRect = bounds })
    renderHook(() => useGuideInteraction(step("model-palette"), () => {}, card, dragging))
    const button = portal.querySelector("button")!
    const input = portal.querySelector("input")!
    input.focus()
    expect(document.activeElement).toBe(input)
    const wheel = new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true })
    const visited = new Set<Element>()
    for (let i = 0; i < 3; i++) {
      const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      expect(document.activeElement!.dispatchEvent(tab)).toBe(false)
      visited.add(document.activeElement!)
    }
    expect(visited).toEqual(new Set([input, button, card.current.querySelector("button")!]))
    expect(button.dispatchEvent(wheel)).toBe(true)
  })

  it("opens only the deliberate peak sidecar during drill and allows only its hierarchy action", () => {
    const { card, dragging } = workspace()
    const preview = vi.fn()
    const action = vi.fn()
    const surface = document.querySelector(".guide-workspace")!
    const { getByText } = render(<>
      <span data-guide-target="usage-trend-daily-peak-column" data-testid="usage-trend-daily-column-4" />
      <button data-testid="usage-trend-slot-4" onFocus={preview} onPointerEnter={preview} onPointerMove={preview}>Peak</button>
      <div data-testid="usage-trend-tooltip"><button onClick={action}><span data-destination="hierarchy" />Projects</button><button onClick={action}>Timeline</button></div>
    </>, { container: surface })
    surface.querySelectorAll<HTMLElement>("*").forEach(node => { node.getBoundingClientRect = bounds })
    renderHook(() => useGuideInteraction(step("drill"), () => {}, card, dragging))
    const peak = getByText("Peak")
    fireEvent.pointerOver(peak)
    fireEvent.pointerMove(peak)
    peak.focus()
    expect(preview).not.toHaveBeenCalled()
    fireEvent.focusIn(peak)
    expect(preview).toHaveBeenCalledTimes(1)
    fireEvent.click(getByText("Projects"))
    fireEvent.click(getByText("Timeline"))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("allows read-step inspector scrolling while blocking its unrelated controls", () => {
    const { card, dragging } = workspace()
    const surface = document.querySelector(".guide-workspace")!
    const { getByText } = render(<section id="prompt-usage-inspector"><button>Cost Details</button></section>, { container: surface })
    renderHook(() => useGuideInteraction(step("prompt-usage"), () => {}, card, dragging))
    const button = getByText("Cost Details")
    expect(button.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true }))).toBe(true)
    expect(button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(false)
    expect(button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))).toBe(false)
  })

  it("keeps hidden coach controls out of keyboard navigation", () => {
    const { card, dragging } = workspace()
    card.current.inert = true
    card.current.setAttribute("aria-hidden", "true")
    renderHook(() => useGuideInteraction(step("peak"), () => {}, card, dragging))
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    expect(document.dispatchEvent(tab)).toBe(false)
    expect(document.activeElement).not.toBe(card.current.querySelector("button"))
  })

  it("exits immediately on Escape without activating anything behind the guide", () => {
    const { card, dragging } = workspace()
    let exits = 0
    renderHook(() => useGuideInteraction(step("model-palette"), () => { exits++ }, card, dragging))
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    expect(document.dispatchEvent(event)).toBe(false)
    expect(exits).toBe(1)
  })
})
