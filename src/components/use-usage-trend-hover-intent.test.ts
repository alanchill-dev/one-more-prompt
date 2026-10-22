import { describe, expect, it } from "vitest"

import { getUsageTrendHoverBridgeGeometry } from "@/components/use-usage-trend-hover-intent"

describe("Usage Trend interactive hover bridge", () => {
  it("covers the full slot and right-side card height across their narrow gap", () => {
    expect(getUsageTrendHoverBridgeGeometry({
      activeX: 360, slotWidth: 24, slotTop: 20, slotBottom: 400,
      card: { left: 378, top: 80, width: 276, height: 266, side: "right" },
    })).toEqual({ left: 372, top: 20, width: 6, height: 380 })
  })

  it("mirrors the bridge and includes card edges beyond the slot height", () => {
    expect(getUsageTrendHoverBridgeGeometry({
      activeX: 420, slotWidth: 24, slotTop: 40, slotBottom: 300,
      card: { left: 126, top: 8, width: 276, height: 400, side: "left" },
    })).toEqual({ left: 402, top: 8, width: 6, height: 400 })
  })

  it("protects the diagonal browser regression point after leaving the source slot", () => {
    const bridge = getUsageTrendHoverBridgeGeometry({
      activeX: 445, slotWidth: 28.4, slotTop: 66, slotBottom: 550,
      card: { left: 463, top: 168, width: 276, height: 266.5, side: "right" },
    })!
    const point = { x: 460.195, y: 349.049 }
    expect(point.x).toBeGreaterThanOrEqual(bridge.left)
    expect(point.x).toBeLessThanOrEqual(bridge.left + bridge.width)
    expect(point.y).toBeGreaterThanOrEqual(bridge.top)
    expect(point.y).toBeLessThanOrEqual(bridge.top + bridge.height)
  })

  it.each(["left", "right"] as const)("does not cover an overlapping %s card or invent a reversed gap", (side) => {
    expect(getUsageTrendHoverBridgeGeometry({
      activeX: 360, slotWidth: 60, slotTop: 20, slotBottom: 400,
      card: { left: side === "right" ? 378 : 66, top: 80, width: 276, height: 266, side },
    })).toBeNull()
  })

  it("does not add a bridge when the slot and card already touch", () => {
    expect(getUsageTrendHoverBridgeGeometry({
      activeX: 360, slotWidth: 36, slotTop: 20, slotBottom: 400,
      card: { left: 378, top: 80, width: 276, height: 266, side: "right" },
    })).toBeNull()
  })
})
