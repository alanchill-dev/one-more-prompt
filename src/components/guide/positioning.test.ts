import { describe, expect, it } from "vitest"
import { GUIDE_STEPS } from "./steps"
import { cardPosition, stabilizeCardPosition, type Rect } from "./positioning"

const step = (id: string) => GUIDE_STEPS.findIndex(s => s.id === id) + 1
const app = { width: 1280, height: 800 }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

describe("Target-anchored guide cards", () => {
  it.each(["pan", "zoom"])("keeps %s instructions in the label rail and the live plot uncovered", id => {
    const plot = { x: 232, y: 280, w: 1036, h: 508 }
    const position = cardPosition(step(id), app, 208, 330, { x: 800, y: 190, w: 40, h: 40 }, [plot])
    expect(overlaps({ ...position, w: 208, h: 330 }, plot)).toBe(false)
    expect(position.x + 208).toBeLessThan(plot.x)
    expect(position.placement.side).toBe("none")
  })
  it.each([
    { app: { width: 1280, height: 800 }, focus: { x: 720, y: 160, w: 548, h: 628 }, w: 330, h: 350 },
    { app: { width: 980, height: 640 }, focus: { x: 600, y: 160, w: 368, h: 468 }, w: 330, h: 350 },
    { app: { width: 900, height: 640 }, focus: { x: 600, y: 160, w: 288, h: 468 }, w: 256, h: 380 },
  ])("places the Project intro inside the empty right column without an arrow in $app.width px", ({ app, focus, w, h }) => {
    const position = cardPosition(step("project-intro"), app, w, h, focus, [
      { x: 12, y: 160, w: 260, h: focus.h },
      { x: 278, y: 160, w: focus.x - 284, h: focus.h },
    ])
    expect(position.x).toBeGreaterThanOrEqual(focus.x + 16)
    expect(position.x + w).toBeLessThanOrEqual(focus.x + focus.w - 16)
    expect(position.y).toBeGreaterThanOrEqual(focus.y + 16)
    expect(position.y + h).toBeLessThanOrEqual(focus.y + focus.h - 16)
    expect(position.placement).toEqual({ side: "none", offset: 0 })
  })

  it("keeps the chart intro in its blank left plot area instead of covering the range controls", () => {
    const focus = { x: 26, y: 204, w: 1188, h: 574 }
    const position = cardPosition(1, { width: 1240, height: 875 }, 330, 325, focus)
    expect(position).toEqual({ x: 42, y: 220, placement: { side: "none", offset: 0 } })
    expect(position.y).toBeGreaterThan(focus.y)
    expect(position.x + 330).toBeLessThan(1105)
  })

  it.each(["month", "pan", "zoom"])("puts step %s directly below the control with a 16px gap", id => {
    const focus = { x: 670, y: 180, w: 40, h: 36 }
    const position = cardPosition(step(id), app, 330, 210, focus)
    expect(position.y).toBe(focus.y + focus.h + 16)
    expect(position.x + 165).toBe(focus.x + focus.w / 2)
    expect(position.placement).toEqual({ side: "top", offset: 165 })
  })

  it("puts the Session card next to its row instead of the far workspace corner", () => {
    const focus = { x: 10, y: 280, w: 280, h: 64 }
    const position = cardPosition(step("session"), app, 330, 210, focus)
    expect(position.x).toBe(306)
    expect(position.y + 105).toBe(312)
    expect(position.placement).toEqual({ side: "left", offset: 105 })
  })

  it("flips above a low target before overlapping it", () => {
    const focus = { x: 670, y: 660, w: 40, h: 36 }
    const position = cardPosition(step("zoom"), app, 330, 210, focus)
    expect(position.y).toBe(434)
    expect(position.placement.side).toBe("bottom")
    expect(overlaps({ ...position, w: 330, h: 210 }, focus)).toBe(false)
  })

  it("keeps both the peak and its required sidecar and bridge uncovered", () => {
    const focus = { x: 700, y: 250, w: 20, h: 270 }
    const sidecar = { x: 335, y: 200, w: 330, h: 330 }
    const bridge = { x: 665, y: 250, w: 35, h: 270 }
    const position = cardPosition(step("peak"), app, 330, 200, focus, [sidecar, bridge])
    for (const protectedRegion of [focus, sidecar, bridge]) {
      expect(overlaps({ ...position, w: 330, h: 200 }, protectedRegion)).toBe(false)
    }
    expect(position.x).toBe(focus.x + focus.w + 16)
    expect(position.placement.side).toBe("left")
  })

  it("moves beside a real right-edge sidecar when every peak-adjacent position is blocked", () => {
    const focus = { x: 1105, y: 285, w: 32, h: 454 }
    const sidecar = { x: 827, y: 213, w: 285, h: 365 }
    const bridge = { x: 1100, y: 285, w: 10, h: 293 }
    const position = cardPosition(step("peak"), { width: 1240, height: 875 }, 330, 185, focus, [sidecar, bridge])
    for (const protectedRegion of [focus, sidecar, bridge]) {
      expect(overlaps({ ...position, w: 330, h: 185 }, protectedRegion)).toBe(false)
    }
    expect(position.x).toBe(sidecar.x - 330 - 16)
    expect(position.placement.side).toBe("none")
  })

  it.each([[980, 480], [1280, 800], [1440, 1000]])("keeps all guide positions within a %s×%s app", (width, height) => {
    for (let step = 1; step <= GUIDE_STEPS.length; step++) {
      const focus = { x: width * .55, y: height * .4, w: 65, h: 36 }
      const position = cardPosition(step, { width, height }, 330, 240, focus)
      expect(position.x).toBeGreaterThanOrEqual(12)
      expect(position.y).toBeGreaterThanOrEqual(90)
      expect(position.x + 330).toBeLessThanOrEqual(width - 12)
      expect(position.y + 240).toBeLessThanOrEqual(height - 12)
      expect(overlaps({ ...position, w: 330, h: 240 }, focus)).toBe(false)
    }
  })

  it("keeps the card still while a handle is held and reanchors after release", () => {
    const before = cardPosition(step("zoom"), app, 330, 210, { x: 850, y: 180, w: 36, h: 44 })
    const moved = cardPosition(step("zoom"), app, 330, 210, { x: 650, y: 180, w: 36, h: 44 })
    expect(stabilizeCardPosition(moved, before, true)).toBe(before)
    expect(stabilizeCardPosition(moved, before, false)).toBe(moved)
  })

  it("places the four-area legend below the marked lane on a short desktop window", () => {
    const focus = { x: 230, y: 326, w: 1032, h: 81 }
    const obstacles = [{ x: 2, y: 94, w: 1276, h: 68 }, { x: 10, y: 186, w: 1260, h: 40 }, { x: 30, y: 335, w: 187, h: 64 }]
    const position = cardPosition(step("timeline-intro"), { width: 1280, height: 720 }, 760, 275, focus, obstacles)
    expect(position.y).toBe(423)
    for (const region of [focus, ...obstacles]) expect(overlaps({ ...position, w: 760, h: 275 }, region)).toBe(false)
  })
})
