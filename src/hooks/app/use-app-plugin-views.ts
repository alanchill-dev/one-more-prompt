import { useMemo } from "react"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import type { PluginState } from "@/hooks/app/types"

export type DisplayPluginState = { meta: PluginMeta } & PluginState

type UseAppPluginViewsArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

export function useAppPluginViews({
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: UseAppPluginViewsArgs) {
  const displayPlugins = useMemo<DisplayPluginState[]>(() => {
    if (!pluginSettings) return []
    const meta = pluginsMeta.find((plugin) => plugin.id === "codex")
    if (!meta) return []
    const state = pluginStates.codex ?? {
      data: null,
      loading: false,
      error: null,
      lastManualRefreshAt: null,
      lastUpdatedAt: null,
    }
    return [{ meta, ...state }]
  }, [pluginSettings, pluginStates, pluginsMeta])

  return {
    displayPlugins,
  }
}
