import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"

function createPluginMeta(id: string, name: string): PluginMeta {
  return {
    id,
    name,
    iconUrl: `/${id}.svg`,
    brandColor: "#000000",
    lines: [],
    primaryCandidates: [],
    detected: true,
  }
}

const settings: PluginSettings = {
  order: ["cursor", "codex"],
  disabled: ["codex"],
}

describe("useAppPluginViews", () => {
  it("waits for settings hydration before exposing Codex", () => {
    const { result } = renderHook(() => useAppPluginViews({
      pluginSettings: null,
      pluginsMeta: [createPluginMeta("codex", "Codex")],
      pluginStates: {},
    }))

    expect(result.current.displayPlugins).toEqual([])
  })

  it("exposes only Codex and ignores a stale disabled-provider setting", () => {
    const { result } = renderHook(() => useAppPluginViews({
      pluginSettings: settings,
      pluginsMeta: [createPluginMeta("cursor", "Cursor"), createPluginMeta("codex", "Codex")],
      pluginStates: {},
    }))

    expect(result.current.displayPlugins).toHaveLength(1)
    expect(result.current.displayPlugins[0]?.meta.id).toBe("codex")
    expect(result.current.displayPlugins[0]?.loading).toBe(false)
  })

  it("preserves the current Codex probe state", () => {
    const { result } = renderHook(() => useAppPluginViews({
      pluginSettings: settings,
      pluginsMeta: [createPluginMeta("codex", "Codex")],
      pluginStates: {
        codex: {
          data: null,
          loading: true,
          error: "Refreshing",
          lastManualRefreshAt: 10,
          lastUpdatedAt: 20,
        },
      },
    }))

    expect(result.current.displayPlugins[0]).toEqual(expect.objectContaining({
      loading: true,
      error: "Refreshing",
      lastUpdatedAt: 20,
    }))
  })
})
