import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { ApiEquivalentCell } from "./prompt-usage-cost-explanation"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

vi.mock("@/hooks/use-exchange-rates", () => ({ useExchangeRates: () => ({ rates: [
  { code: "USD", rate: 1, status: "base", date: null, source: "USD Base" },
] }) }))

beforeEach(() => useAppPreferencesStore.setState({ language: "en", displayCurrency: "USD" }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it("fits the whole inline amount to its available width and restores 13px after resizing or changing text", () => {
  let available = 300
  let smallFontExtra = 0
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = () => callback([], this as unknown as ResizeObserver) }
    observe() {}
    disconnect = disconnect
  })
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function () {
    return this.classList.contains("prompt-summary-api-container") ? Math.round(available) : 0
  })
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    if (this.classList.contains("prompt-summary-api-container")) return new DOMRect(0, 0, available, 26)
    if (!this.classList.contains("prompt-summary-api")) return originalRect.call(this)
    const font = Number.parseFloat(this.style.fontSize)
    return new DOMRect(0, 0, this.textContent!.length * 8 * font / 13 + (font < 13 ? smallFontExtra : 0), 26)
  })
  const estimate = { costUsd: 1234567890.12, estimationStatus: "current_rate" as const }
  const { rerender, unmount } = render(<ApiEquivalentCell estimate={estimate} testId="amount" inline />)
  const trigger = screen.getByTestId("amount")
  expect(trigger.style.fontSize).toBe("13px")
  const naturalWidth = trigger.textContent!.length * 8

  available = 80
  act(() => resize())
  expect(Number.parseFloat(trigger.style.fontSize)).toBeCloseTo(13 * (available - .5) / naturalWidth)
  expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(available)
  expect(trigger).toHaveTextContent(/^\(\$1,234,567,890.12\)$/)

  available = 120
  act(() => resize())
  expect(Number.parseFloat(trigger.style.fontSize)).toBeCloseTo(13 * (available - .5) / naturalWidth)
  available = 300
  act(() => resize())
  expect(trigger.style.fontSize).toBe("13px")

  available = 93.515625
  smallFontExtra = 4.5
  act(() => resize())
  expect(trigger.parentElement!.clientWidth).toBe(94)
  expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(available)
  expect(Number.parseFloat(trigger.style.fontSize)).toBeLessThan(13 * (available - .5) / naturalWidth)
  available = 300
  act(() => resize())
  expect(trigger.style.fontSize).toBe("13px")

  available = 80
  rerender(<ApiEquivalentCell estimate={{ ...estimate, costUsd: 1234567890123.45 }} testId="amount" inline />)
  expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(available)
  rerender(<ApiEquivalentCell estimate={{ ...estimate, costUsd: 12.5 }} testId="amount" inline />)
  expect(trigger.style.fontSize).toBe("13px")
  expect(trigger).toHaveTextContent(/^\(\$12.5\)$/)
  unmount()
  expect(disconnect).toHaveBeenCalled()
})
