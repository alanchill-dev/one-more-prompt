import { describe, expect, it } from "vitest"
import {
  DEFAULT_MODEL_COLOR_PREFERENCES,
  canonicalModelName,
  hexToOklch,
  makeModelColorCssVariables,
  modelIdentityKey,
  oklchToHex,
  resetPaletteSlot,
  sanitizeModelColorPreferences,
  setPaletteSlotBaseColor,
} from "@/lib/model-colors"

describe("model palette", () => {
  it("canonicalizes model spelling variants without attaching a color identity", () => {
    expect(canonicalModelName("gpt-5.6-sol")).toBe("GPT-5.6 Sol")
    expect(canonicalModelName("GPT 5.6 Luna")).toBe("GPT-5.6 Luna")
    expect(modelIdentityKey("gpt_5.5")).toBe("gpt55")
  })

  it("round-trips sRGB colors through OKLCH closely", () => {
    const original = "#F1EBD5"
    expect(oklchToHex(hexToOklch(original))).toBe(original)
  })

  it("stores one base color per palette slot", () => {
    const customized = setPaletteSlotBaseColor(DEFAULT_MODEL_COLOR_PREFERENCES, 1, "#E58C7E")
    expect(customized.slots[1]).toEqual({ base: "#E58C7E" })
    expect(resetPaletteSlot(customized, 1).slots[1]).toEqual(DEFAULT_MODEL_COLOR_PREFERENCES.slots[1])
  })

  it("emits five ordered rank variables independent of model names", () => {
    const variables = makeModelColorCssVariables(DEFAULT_MODEL_COLOR_PREFERENCES, "dark")
    expect(Object.keys(variables)).toHaveLength(10)
    expect(variables["--trend-model-surface-rank-1"]).toMatch(/^#[0-9A-F]{6}$/)
    expect(variables["--trend-model-rank-5"]).toMatch(/^#[0-9A-F]{6}$/)
    expect(variables["--trend-model-sol"]).toBeUndefined()
  })

  it("sanitizes the new schema and migrates legacy fixed-model overrides by slot", () => {
    expect(sanitizeModelColorPreferences({
      slots: [
        { base: "f1ebd5", dark: "not-a-color" },
        { base: "#123456" },
      ],
    })).toEqual({
      slots: [
        { base: "#F1EBD5" },
        { base: "#123456" },
        DEFAULT_MODEL_COLOR_PREFERENCES.slots[2],
        DEFAULT_MODEL_COLOR_PREFERENCES.slots[3],
        DEFAULT_MODEL_COLOR_PREFERENCES.slots[4],
      ],
    })

    const migrated = sanitizeModelColorPreferences({
      overrides: {
        gpt56sol: { base: "#111111" },
        gpt56luna: { base: "#222222" },
      },
    })
    expect(migrated.slots[0].base).toBe("#111111")
    expect(migrated.slots[1].base).toBe("#222222")
    expect(migrated).not.toHaveProperty("knownModels")
  })
})
