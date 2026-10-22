import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useProbeAutoUpdate } from "@/hooks/app/use-probe-auto-update"

describe("useProbeAutoUpdate (display-only countdown)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("keeps the countdown cleared when plugin settings are missing", () => {
    const { result } = renderHook(() =>
      useProbeAutoUpdate({ pluginSettings: null, autoUpdateInterval: 15 })
    )

    expect(result.current.autoUpdateNextAt).toBeNull()

    act(() => {
      result.current.resetAutoUpdateSchedule()
    })

    expect(result.current.autoUpdateNextAt).toBeNull()
  })

  it("seeds the countdown on mount when enabled plugins are present", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000)

    const { result } = renderHook(() =>
      useProbeAutoUpdate({
        pluginSettings: { order: ["codex"], disabled: [] },
        autoUpdateInterval: 15,
      })
    )

    expect(result.current.autoUpdateNextAt).toBe(910_000)
    nowSpy.mockRestore()
  })

  it("re-seeds the countdown on resetAutoUpdateSchedule", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(10_000)

    const { result } = renderHook(() =>
      useProbeAutoUpdate({
        pluginSettings: { order: ["codex"], disabled: [] },
        autoUpdateInterval: 15,
      })
    )

    nowSpy.mockReturnValue(50_000)
    act(() => {
      result.current.resetAutoUpdateSchedule()
    })

    expect(result.current.autoUpdateNextAt).toBe(50_000 + 15 * 60_000)
    nowSpy.mockRestore()
  })

  it("keeps automatic updates scheduled despite legacy disabled Codex settings", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000)
    const { result } = renderHook(() =>
      useProbeAutoUpdate({
        pluginSettings: { order: ["codex"], disabled: ["codex"] },
        autoUpdateInterval: 15,
      })
    )

    expect(result.current.autoUpdateNextAt).toBe(910_000)
  })
})
