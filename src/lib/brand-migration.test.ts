import { beforeEach, describe, expect, it, vi } from "vitest"
import { readUiStorage } from "./brand-migration"

beforeEach(() => { window.localStorage.clear(); vi.restoreAllMocks() })

describe("User Interface Brand Migration", () => {
  it("preserves saved view, pins, unread state and panel size without deleting the source", () => {
    for (const suffix of ["active-view.v1", "prompt-usage-pins.v1", "prompt-usage-project-pins.v1", "prompt-usage-unread.v1", "panel-size.v1", "panel-size-layout.v2"]) {
      window.localStorage.setItem(`usagepal.ui.${suffix}`, `saved ${suffix}`)
    }
    expect(readUiStorage("one-more-prompt.ui.active-view.v1")).toBe("saved active-view.v1")
    for (const suffix of ["prompt-usage-pins.v1", "prompt-usage-project-pins.v1", "prompt-usage-unread.v1", "panel-size.v1", "panel-size-layout.v2"]) {
      expect(readUiStorage(`one-more-prompt.ui.${suffix}`)).toBe(`saved ${suffix}`)
      expect(window.localStorage.getItem(`usagepal.ui.${suffix}`)).toBe(`saved ${suffix}`)
    }
  })

  it("keeps newer state and never brings old state back after reset", () => {
    const key = "one-more-prompt.ui.prompt-usage-pins.v1"
    window.localStorage.setItem("usagepal.ui.prompt-usage-pins.v1", '["old"]')
    window.localStorage.setItem(key, '["new"]')
    expect(readUiStorage(key)).toBe('["new"]')
    window.localStorage.removeItem(key)
    expect(readUiStorage(key)).toBeNull()
  })

  it("does not mark migration complete after a storage failure and can retry", () => {
    window.localStorage.setItem("usagepal.ui.active-view.v1", "settings")
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disk full") })
    expect(() => readUiStorage("one-more-prompt.ui.active-view.v1")).toThrow("disk full")
    expect(window.localStorage.getItem("one-more-prompt.ui.brand-migration.v1")).toBeNull()
    setItem.mockRestore()
    expect(readUiStorage("one-more-prompt.ui.active-view.v1")).toBe("settings")
  })
})
