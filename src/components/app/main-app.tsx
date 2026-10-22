import { useCallback, useEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppShell } from "@/components/app/app-shell"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import { useProbe } from "@/hooks/app/use-probe"
import { usePaceNotifications } from "@/hooks/app/use-pace-notifications"
import { usePluginSettingsRefresh } from "@/hooks/app/use-plugin-settings-refresh"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { loadModelColorPreferences, saveAppLanguage, saveMenubarActivityRotationSpeed } from "@/lib/settings"
import type { AppLanguage } from "@/lib/i18n"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

const TRAY_PROBE_DEBOUNCE_MS = 500

export function MainApp() {
  const {
    activeView,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
    }))
  )

  const {
    pluginsMeta,
    setPluginsMeta,
    pluginSettings,
    setPluginSettings,
  } = useAppPluginStore(
    useShallow((state) => ({
      pluginsMeta: state.pluginsMeta,
      setPluginsMeta: state.setPluginsMeta,
      pluginSettings: state.pluginSettings,
      setPluginSettings: state.setPluginSettings,
    }))
  )

  const {
    autoUpdateInterval,
    setLanguage,
    setAutoUpdateInterval,
    themeMode,
    setThemeMode,
    displayMode,
    setDisplayMode,
    setDisplayCurrency,
    menubarIconStyle,
    setMenubarIconStyle,
    menubarActivityRotationSpeed,
    setMenubarActivityRotationSpeed,
    menubarMetric,
    setMenubarMetric,
    multiTrayProviderCount,
    setMultiTrayProviderCount,
    multiTrayDisplayMode,
    setMultiTrayDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setOverviewSpendStripEnabled,
    setGlobalShortcut,
    setStartOnLogin,
    setModelColors,
    setModelColorsHydrated,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setLanguage: state.setLanguage,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      setDisplayCurrency: state.setDisplayCurrency,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      menubarActivityRotationSpeed: state.menubarActivityRotationSpeed,
      setMenubarActivityRotationSpeed: state.setMenubarActivityRotationSpeed,
      menubarMetric: state.menubarMetric,
      setMenubarMetric: state.setMenubarMetric,
      multiTrayProviderCount: state.multiTrayProviderCount,
      setMultiTrayProviderCount: state.setMultiTrayProviderCount,
      multiTrayDisplayMode: state.multiTrayDisplayMode,
      setMultiTrayDisplayMode: state.setMultiTrayDisplayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setOverviewSpendStripEnabled: state.setOverviewSpendStripEnabled,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
      setModelColors: state.setModelColors,
      setModelColorsHydrated: state.setModelColorsHydrated,
    }))
  )

  useEffect(() => {
    let mounted = true
    void loadModelColorPreferences()
      .then((preferences) => {
        if (!mounted) return
        setModelColors(preferences)
      })
      .catch((error) => {
        console.error("Failed to load model color preferences:", error)
      })
      .finally(() => {
        if (mounted) setModelColorsHydrated(true)
      })
    return () => {
      mounted = false
    }
  }, [setModelColors, setModelColorsHydrated])

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {})
  const handleProbeResult = useCallback(() => {
    scheduleProbeTrayUpdateRef.current()
  }, [])

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    onProbeResult: handleProbeResult,
  })

  usePaceNotifications(pluginStates)

  const { scheduleTrayIconUpdate } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    menubarActivityRotationSpeed,
    menubarMetric,
    multiTrayProviderCount,
    multiTrayDisplayMode,
    activeView,
  })

  const handleMenubarActivityRotationSpeedChange = useCallback((speed: typeof menubarActivityRotationSpeed) => {
    setMenubarActivityRotationSpeed(speed)
    void saveMenubarActivityRotationSpeed(speed).catch((error) => {
      console.error("Failed to save menubar activity rotation speed:", error)
    })
  }, [setMenubarActivityRotationSpeed])

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS)
    }
  }, [scheduleTrayIconUpdate])

  usePluginSettingsRefresh({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
  })

  const { applyStartOnLogin } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setLanguage,
    setAutoUpdateInterval,
    setThemeMode,
    setDisplayMode,
    setDisplayCurrency,
    setMenubarIconStyle,
    setMenubarActivityRotationSpeed,
    setMenubarMetric,
    setMultiTrayProviderCount,
    setMultiTrayDisplayMode,
    setResetTimerDisplayMode,
    setOverviewSpendStripEnabled,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useSettingsTheme(themeMode)

  const handleLanguageChange = useCallback((value: AppLanguage) => {
    setLanguage(value)
    void saveAppLanguage(value).catch((error) => {
      console.error("Failed to save app language:", error)
    })
  }, [setLanguage])

  const {
    handleThemeModeChange,
    handleDisplayModeToggle,
    handleResetTimerDisplayModeToggle,
    handleMenubarIconStyleChange,
    handleMenubarMetricChange,
  } = useSettingsDisplayActions({
    menubarIconStyle,
    multiTrayProviderCount,
    setThemeMode,
    displayMode,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setMenubarIconStyle,
    setMenubarMetric,
    setMultiTrayProviderCount,
    setMultiTrayDisplayMode,
    setOverviewSpendStripEnabled,
    scheduleTrayIconUpdate,
  })

  const {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
  } = useSettingsSystemActions({
    pluginSettings,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setGlobalShortcut,
    setStartOnLogin,
    applyStartOnLogin,
  })

  const { displayPlugins } = useAppPluginViews({
    pluginSettings,
    pluginsMeta,
    pluginStates,
  })

  return (
    <AppShell
      onRefreshAll={handleRefreshAll}
      displayPlugins={displayPlugins}
      autoUpdateNextAt={autoUpdateNextAt}
      appContentProps={{
        onRetryPlugin: handleRetryPlugin,
        onAutoUpdateIntervalChange: handleAutoUpdateIntervalChange,
        onThemeModeChange: handleThemeModeChange,
        onUsageValueToggle: handleDisplayModeToggle,
        onResetTimerDisplayModeToggle: handleResetTimerDisplayModeToggle,
        onMenubarIconStyleChange: handleMenubarIconStyleChange,
        onMenubarActivityRotationSpeedChange: handleMenubarActivityRotationSpeedChange,
        onMenubarMetricChange: handleMenubarMetricChange,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
        onLanguageChange: handleLanguageChange,
      }}
    />
  )
}
