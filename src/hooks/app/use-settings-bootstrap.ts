import { useCallback, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { syncAutostart } from "@/lib/autostart"
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from "@/lib/i18n"
import type { PluginMeta } from "@/lib/plugin-types"
import {
  arePluginSettingsEqual,
  DEFAULT_AUTO_UPDATE_INTERVAL,
    DEFAULT_DISPLAY_MODE,
    DEFAULT_DISPLAY_CURRENCY,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED,
  DEFAULT_MENUBAR_METRIC,
  DEFAULT_MULTI_TRAY_DISPLAY_MODE,
  DEFAULT_MULTI_TRAY_PROVIDER_COUNT,
  DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  getEnabledPluginIds,
  loadAutoUpdateInterval,
  loadAppLanguage,
    loadDisplayMode,
    loadDisplayCurrency,
  loadGlobalShortcut,
  loadMenubarIconStyle,
  loadMenubarActivityRotationSpeed,
  loadMenubarMetric,
  loadMultiTrayDisplayMode,
  loadMultiTrayProviderCount,
  loadOverviewSpendStripEnabled,
  migrateLegacyTraySettings,
  loadPluginSettings,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  loadThemeMode,
  normalizePluginSettings,
  savePluginSettings,
  type AutoUpdateIntervalMinutes,
    type DisplayMode,
    type DisplayCurrency,
  type GlobalShortcut,
  type MenubarIconStyle,
  type MenubarActivityRotationSpeed,
  type MenubarMetric,
  type MultiTrayDisplayMode,
  type MultiTrayProviderCount,
  type PluginSettings,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"

type UseSettingsBootstrapArgs = {
  setPluginSettings: (value: PluginSettings | null) => void
  setPluginsMeta: (value: PluginMeta[]) => void
  setLanguage: (value: AppLanguage) => void
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setDisplayCurrency: (value: DisplayCurrency) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setMenubarActivityRotationSpeed: (value: MenubarActivityRotationSpeed) => void
  setMenubarMetric: (value: MenubarMetric) => void
  setMultiTrayProviderCount: (value: MultiTrayProviderCount) => void
  setMultiTrayDisplayMode: (value: MultiTrayDisplayMode) => void
  setOverviewSpendStripEnabled: (value: boolean) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

export function useSettingsBootstrap({
  setPluginSettings,
  setPluginsMeta,
  setLanguage,
  setAutoUpdateInterval,
  setThemeMode,
  setDisplayMode,
  setDisplayCurrency,
  setResetTimerDisplayMode,
  setGlobalShortcut,
  setStartOnLogin,
  setMenubarIconStyle,
  setMenubarActivityRotationSpeed,
  setMenubarMetric,
  setMultiTrayProviderCount,
  setMultiTrayDisplayMode,
  setOverviewSpendStripEnabled,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
}: UseSettingsBootstrapArgs) {
  const applyStartOnLogin = useCallback((value: boolean) => syncAutostart(value), [])

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const availablePlugins = await invoke<PluginMeta[]>("list_plugins")
        if (!isMounted) return
        setPluginsMeta(availablePlugins)

        const storedSettings = await loadPluginSettings()
        const normalized = normalizePluginSettings(storedSettings, availablePlugins)
        if (!arePluginSettingsEqual(storedSettings, normalized)) {
          await savePluginSettings(normalized)
        }

        let storedInterval = DEFAULT_AUTO_UPDATE_INTERVAL
        try {
          storedInterval = await loadAutoUpdateInterval()
        } catch (error) {
          console.error("Failed to load auto-update interval:", error)
        }

        let storedLanguage = DEFAULT_APP_LANGUAGE
        try {
          storedLanguage = await loadAppLanguage()
        } catch (error) {
          console.error("Failed to load app language:", error)
        }

        let storedThemeMode = DEFAULT_THEME_MODE
        try {
          storedThemeMode = await loadThemeMode()
        } catch (error) {
          console.error("Failed to load theme mode:", error)
        }

        let storedDisplayMode = DEFAULT_DISPLAY_MODE
        try {
          storedDisplayMode = await loadDisplayMode()
        } catch (error) {
          console.error("Failed to load display mode:", error)
        }

        let storedDisplayCurrency = DEFAULT_DISPLAY_CURRENCY
        try {
          storedDisplayCurrency = await loadDisplayCurrency()
        } catch (error) {
          console.error("Failed to load display currency:", error)
        }

        let storedResetTimerDisplayMode = DEFAULT_RESET_TIMER_DISPLAY_MODE
        try {
          storedResetTimerDisplayMode = await loadResetTimerDisplayMode()
        } catch (error) {
          console.error("Failed to load reset timer display mode:", error)
        }

        let storedGlobalShortcut = DEFAULT_GLOBAL_SHORTCUT
        try {
          storedGlobalShortcut = await loadGlobalShortcut()
        } catch (error) {
          console.error("Failed to load global shortcut:", error)
        }

        let storedStartOnLogin = DEFAULT_START_ON_LOGIN
        try {
          storedStartOnLogin = await loadStartOnLogin()
        } catch (error) {
          console.error("Failed to load start on login:", error)
        }

        try {
          await applyStartOnLogin(storedStartOnLogin)
        } catch (error) {
          console.error("Failed to apply start on login setting:", error)
        }
        try {
          await migrateLegacyTraySettings()
        } catch (error) {
          console.error("Failed to migrate legacy tray settings:", error)
        }

        let storedMenubarIconStyle = DEFAULT_MENUBAR_ICON_STYLE
        try {
          storedMenubarIconStyle = await loadMenubarIconStyle()
        } catch (error) {
          console.error("Failed to load menubar icon style:", error)
        }

        let storedMenubarMetric = DEFAULT_MENUBAR_METRIC
        try {
          storedMenubarMetric = await loadMenubarMetric()
        } catch (error) {
          console.error("Failed to load menubar metric:", error)
        }

        let storedMenubarActivityRotationSpeed = DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED
        try {
          storedMenubarActivityRotationSpeed = await loadMenubarActivityRotationSpeed()
        } catch (error) {
          console.error("Failed to load menubar activity rotation speed:", error)
        }

        let storedMultiTrayProviderCount = DEFAULT_MULTI_TRAY_PROVIDER_COUNT
        try {
          storedMultiTrayProviderCount = await loadMultiTrayProviderCount()
        } catch (error) {
          console.error("Failed to load multi tray provider count:", error)
        }

        let storedMultiTrayDisplayMode = DEFAULT_MULTI_TRAY_DISPLAY_MODE
        try {
          storedMultiTrayDisplayMode = await loadMultiTrayDisplayMode()
        } catch (error) {
          console.error("Failed to load multi tray display mode:", error)
        }

        let storedOverviewSpendStripEnabled = DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED
        try {
          storedOverviewSpendStripEnabled = await loadOverviewSpendStripEnabled()
        } catch (error) {
          console.error("Failed to load overview spend strip setting:", error)
        }

        if (isMounted) {
          setPluginSettings(normalized)
          setLanguage(storedLanguage)
          setAutoUpdateInterval(storedInterval)
          setThemeMode(storedThemeMode)
          setDisplayMode(storedDisplayMode)
          setDisplayCurrency(storedDisplayCurrency)
          setResetTimerDisplayMode(storedResetTimerDisplayMode)
          setGlobalShortcut(storedGlobalShortcut)
          setStartOnLogin(storedStartOnLogin)
          setMenubarIconStyle(storedMenubarIconStyle)
          setMenubarActivityRotationSpeed(storedMenubarActivityRotationSpeed)
          setMenubarMetric(storedMenubarMetric)
          setMultiTrayProviderCount(storedMultiTrayProviderCount)
          setMultiTrayDisplayMode(storedMultiTrayDisplayMode)
          setOverviewSpendStripEnabled(storedOverviewSpendStripEnabled)

          const enabledIds = getEnabledPluginIds(normalized)
          setLoadingForPlugins(enabledIds)
          try {
            await startBatch(enabledIds)
          } catch (error) {
            console.error("Failed to start probe batch:", error)
            if (isMounted) {
              setErrorForPlugins(enabledIds, "Failed to start probe")
            }
          }
        }
      } catch (e) {
        console.error("Failed to load plugin settings:", e)
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [
    applyStartOnLogin,
    setAutoUpdateInterval,
    setDisplayMode,
    setDisplayCurrency,
    setErrorForPlugins,
    setGlobalShortcut,
    setLoadingForPlugins,
    setLanguage,
    setMenubarIconStyle,
    setMenubarActivityRotationSpeed,
    setMenubarMetric,
    setMultiTrayProviderCount,
    setMultiTrayDisplayMode,
    setOverviewSpendStripEnabled,
    migrateLegacyTraySettings,
    setPluginSettings,
    setPluginsMeta,
    setResetTimerDisplayMode,
    setStartOnLogin,
    setThemeMode,
    startBatch,
  ])

  return {
    applyStartOnLogin,
  }
}
