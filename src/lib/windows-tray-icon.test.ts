import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeSquareWindowsTraySvg } from "@/lib/windows-tray-icon"

const measureText = (text: string) => ({
  actualBoundingBoxLeft: 2,
  actualBoundingBoxRight: text.length * 56 - 4,
  actualBoundingBoxAscent: 72,
  actualBoundingBoxDescent: 1,
})

beforeEach(() => {
  const context = {
    font: "",
    measureText(text: string) {
      const scale = Number(this.font.match(/([\d.]+)px/)?.[1] ?? 100) / 100
      return Object.fromEntries(Object.entries(measureText(text)).map(([key, value]) => [key, value * scale]))
    },
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.restoreAllMocks())

describe("makeSquareWindowsTraySvg", () => {
  for (const style of ["provider", "dual", "multi"] as const) {
    for (const sizePx of [16, 20, 24, 32, 48]) {
      it.each(["0%", "9%", "43%", "88%", "100%"])(`fits natural ${style} numerals for %s inside ${sizePx}px`, (percentText) => {
        const svg = makeSquareWindowsTraySvg({ sizePx, style, percentText, baseSvg: "<svg />" })
        const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
        const texts = Array.from(element.querySelectorAll("text"))
        const digits = percentText.slice(0, -1)
        expect(texts.map((text) => text.textContent)).toEqual([digits])
        expect(element.getAttribute("viewBox")).toBe(`0 0 ${sizePx} ${sizePx}`)
        expect(element.querySelector("[transform], [stroke], [textLength], [lengthAdjust], image, tspan")).toBeNull()
        for (const text of texts) {
          expect(text.getAttribute("font-family")).toBe("'Segoe UI',sans-serif")
          expect(text.getAttribute("font-weight")).toBe("700")
        }
        const ink = texts.map((text) => {
          const scale = Number(text.getAttribute("font-size")) / 100
          const x = Number(text.getAttribute("x"))
          const y = Number(text.getAttribute("y"))
          const metrics = measureText(text.textContent!)
          return {
            left: x - metrics.actualBoundingBoxLeft * scale,
            right: x + metrics.actualBoundingBoxRight * scale,
            top: y - metrics.actualBoundingBoxAscent * scale,
            bottom: y + metrics.actualBoundingBoxDescent * scale,
          }
        })
        const left = Math.min(...ink.map((bounds) => bounds.left))
        const right = Math.max(...ink.map((bounds) => bounds.right))
        const top = Math.min(...ink.map((bounds) => bounds.top))
        const bottom = Math.max(...ink.map((bounds) => bounds.bottom))
        expect(left).toBeGreaterThanOrEqual(1.45)
        expect(right).toBeLessThanOrEqual(sizePx - 1.45)
        expect(top).toBeGreaterThanOrEqual(1.45)
        expect(bottom).toBeLessThanOrEqual(sizePx - 1.45)
        expect(Math.max(right - left, bottom - top)).toBeGreaterThanOrEqual(sizePx - 3.6)
      })
    }
    it.each([undefined, "--%"])("preserves the provider glyph when quota is unavailable for " + style, (percentText) => {
      const svg = makeSquareWindowsTraySvg({ sizePx: 16, style, percentText, baseSvg: '<svg><image href="codex-icon" /></svg>' })
      const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
      expect(element.querySelector("image")?.getAttribute("href")).toBe("codex-icon")
      expect(element.querySelector("text")).toBeNull()
    })
  }
  it.each([false, true])("uses taskbar-aware brand orange without an outline (dark: %s)", (isDark) => {
    const svg = makeSquareWindowsTraySvg({ sizePx: 32, style: "provider", percentText: "43%", baseSvg: "<svg />", isDark })
    const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
    expect(Array.from(element.querySelectorAll("text"), (text) => text.getAttribute("fill"))).toEqual([
      isDark ? "#ff744d" : "#b73717",
    ])
    expect(svg).not.toContain("stroke=")
  })
  it("reports a missing drawing context instead of inventing a layout", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null)
    expect(() => makeSquareWindowsTraySvg({ sizePx: 16, style: "provider", percentText: "43%", baseSvg: "<svg />" })).toThrow("Canvas 2D context missing")
  })

  it("keeps the bars artwork white with its existing black outline", () => {
    const svg = makeSquareWindowsTraySvg({
      sizePx: 18, style: "bars", percentText: "35%",
      baseSvg: '<svg><rect fill="black" width="6" height="12" /></svg>',
    })
    const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement

    expect(element.querySelector("rect")?.getAttribute("fill")).toBe("white")
    expect(element.querySelector("g")?.getAttribute("stroke")).toBe("black")
    expect(element.querySelector("text")).toBeNull()
  })

  it("keeps the donut artwork white with its existing black outline", () => {
    const svg = makeSquareWindowsTraySvg({
      sizePx: 18, style: "donut", percentText: "35%",
      baseSvg: '<svg><circle stroke="black" stroke-width="2" /></svg>',
    })
    const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement
    const circles = element.querySelectorAll("circle")

    expect(circles[0]?.getAttribute("stroke")).toBe("black")
    expect(circles[0]?.getAttribute("stroke-width")).toBe("3.2")
    expect(circles[1]?.getAttribute("stroke")).toBe("white")
    expect(circles[1]?.getAttribute("stroke-width")).toBe("2")
    expect(element.querySelector("text")).toBeNull()
  })
})
