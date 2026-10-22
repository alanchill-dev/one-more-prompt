import { useCallback } from "react"
import { saveModelColorPreferences } from "@/lib/settings"
import type { ModelColorPreferences } from "@/lib/model-colors"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

type PreferencesUpdater = ModelColorPreferences | ((current: ModelColorPreferences) => ModelColorPreferences)

export function useModelColorPreferences() {
  const preferences = useAppPreferencesStore((state) => state.modelColors)
  const hydrated = useAppPreferencesStore((state) => state.modelColorsHydrated)
  const setPreferences = useAppPreferencesStore((state) => state.setModelColors)

  const previewPreferences = useCallback((updater: PreferencesUpdater) => {
    const current = useAppPreferencesStore.getState().modelColors
    const next = typeof updater === "function" ? updater(current) : updater
    if (next !== current) setPreferences(next)
    return next
  }, [setPreferences])

  const commitPreferences = useCallback((updater?: PreferencesUpdater) => {
    const current = useAppPreferencesStore.getState().modelColors
    const next = updater === undefined
      ? current
      : typeof updater === "function"
        ? updater(current)
        : updater
    if (next !== current) setPreferences(next)
    void Promise.resolve(saveModelColorPreferences(next)).catch((error) => {
      console.error("Failed to save model color preferences:", error)
    })
    return next
  }, [setPreferences])

  return { preferences, hydrated, previewPreferences, commitPreferences }
}
