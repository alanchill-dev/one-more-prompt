import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  arePluginSettingsEqualMock,
  disableAutostartMock,
  enableAutostartMock,
  getEnabledPluginIdsMock,
  invokeMock,
  isAutostartEnabledMock,
  isTauriMock,
  loadAutoUpdateIntervalMock,
  loadAppLanguageMock,
  loadDisplayModeMock,
  loadDisplayCurrencyMock,
  loadGlobalShortcutMock,
  loadMenubarActivityRotationSpeedMock,
  loadMenubarIconStyleMock,
  loadMenubarMetricMock,
  loadMultiTrayDisplayModeMock,
  loadMultiTrayProviderCountMock,
  loadOverviewSpendStripEnabledMock,
  loadPluginSettingsMock,
  loadResetTimerDisplayModeMock,
  loadStartOnLoginMock,
  loadThemeModeMock,
  migrateLegacyTraySettingsMock,
  normalizePluginSettingsMock,
  savePluginSettingsMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  isAutostartEnabledMock: vi.fn(),
  enableAutostartMock: vi.fn(),
  disableAutostartMock: vi.fn(),
  arePluginSettingsEqualMock: vi.fn(),
  getEnabledPluginIdsMock: vi.fn(),
  loadAutoUpdateIntervalMock: vi.fn(),
  loadAppLanguageMock: vi.fn(),
  loadDisplayModeMock: vi.fn(),
  loadDisplayCurrencyMock: vi.fn(),
  loadGlobalShortcutMock: vi.fn(),
  loadMenubarActivityRotationSpeedMock: vi.fn(),
  loadMenubarIconStyleMock: vi.fn(),
  loadMenubarMetricMock: vi.fn(),
  loadMultiTrayDisplayModeMock: vi.fn(),
  loadMultiTrayProviderCountMock: vi.fn(),
  loadOverviewSpendStripEnabledMock: vi.fn(),
  loadPluginSettingsMock: vi.fn(),
  loadResetTimerDisplayModeMock: vi.fn(),
  loadStartOnLoginMock: vi.fn(),
  loadThemeModeMock: vi.fn(),
  migrateLegacyTraySettingsMock: vi.fn(),
  normalizePluginSettingsMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: disableAutostartMock,
  enable: enableAutostartMock,
  isEnabled: isAutostartEnabledMock,
}))

vi.mock("@/lib/settings", () => ({
  arePluginSettingsEqual: arePluginSettingsEqualMock,
  DEFAULT_AUTO_UPDATE_INTERVAL: 15,
  DEFAULT_APP_LANGUAGE: "en",
  DEFAULT_DISPLAY_MODE: "left",
  DEFAULT_DISPLAY_CURRENCY: "USD",
  DEFAULT_GLOBAL_SHORTCUT: null,
  DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED: "standard",
  DEFAULT_MENUBAR_ICON_STYLE: "provider",
  DEFAULT_MENUBAR_METRIC: "default",
  DEFAULT_MULTI_TRAY_DISPLAY_MODE: "percent",
  DEFAULT_MULTI_TRAY_PROVIDER_COUNT: 3,
  DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED: true,
  DEFAULT_RESET_TIMER_DISPLAY_MODE: "relative",
  DEFAULT_START_ON_LOGIN: false,
  DEFAULT_THEME_MODE: "system",
  getEnabledPluginIds: getEnabledPluginIdsMock,
  loadAutoUpdateInterval: loadAutoUpdateIntervalMock,
  loadAppLanguage: loadAppLanguageMock,
  loadDisplayMode: loadDisplayModeMock,
  loadDisplayCurrency: loadDisplayCurrencyMock,
  loadGlobalShortcut: loadGlobalShortcutMock,
  loadMenubarActivityRotationSpeed: loadMenubarActivityRotationSpeedMock,
  loadMenubarIconStyle: loadMenubarIconStyleMock,
  loadMenubarMetric: loadMenubarMetricMock,
  loadMultiTrayDisplayMode: loadMultiTrayDisplayModeMock,
  loadMultiTrayProviderCount: loadMultiTrayProviderCountMock,
  loadOverviewSpendStripEnabled: loadOverviewSpendStripEnabledMock,
  loadPluginSettings: loadPluginSettingsMock,
  loadResetTimerDisplayMode: loadResetTimerDisplayModeMock,
  loadStartOnLogin: loadStartOnLoginMock,
  loadThemeMode: loadThemeModeMock,
  migrateLegacyTraySettings: migrateLegacyTraySettingsMock,
  normalizePluginSettings: normalizePluginSettingsMock,
  savePluginSettings: savePluginSettingsMock,
}))

import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"

function createArgs() {
  return {
    setPluginSettings: vi.fn(),
    setPluginsMeta: vi.fn(),
    setLanguage: vi.fn(),
    setAutoUpdateInterval: vi.fn(),
    setThemeMode: vi.fn(),
    setDisplayMode: vi.fn(),
    setDisplayCurrency: vi.fn(),
    setResetTimerDisplayMode: vi.fn(),
    setGlobalShortcut: vi.fn(),
    setStartOnLogin: vi.fn(),
    setMenubarIconStyle: vi.fn(),
    setMenubarActivityRotationSpeed: vi.fn(),
    setMenubarMetric: vi.fn(),
    setMultiTrayProviderCount: vi.fn(),
    setMultiTrayDisplayMode: vi.fn(),
    setOverviewSpendStripEnabled: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe("useSettingsBootstrap", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    invokeMock.mockReset()
    isTauriMock.mockReset()
    isAutostartEnabledMock.mockReset()
    enableAutostartMock.mockReset()
    disableAutostartMock.mockReset()
    arePluginSettingsEqualMock.mockReset()
    getEnabledPluginIdsMock.mockReset()
    loadAutoUpdateIntervalMock.mockReset()
    loadAppLanguageMock.mockReset()
    loadDisplayModeMock.mockReset()
    loadDisplayCurrencyMock.mockReset()
    loadGlobalShortcutMock.mockReset()
    loadMenubarActivityRotationSpeedMock.mockReset()
    loadMenubarIconStyleMock.mockReset()
    loadMenubarMetricMock.mockReset()
    loadMultiTrayDisplayModeMock.mockReset()
    loadMultiTrayProviderCountMock.mockReset()
    loadOverviewSpendStripEnabledMock.mockReset()
    loadPluginSettingsMock.mockReset()
    loadResetTimerDisplayModeMock.mockReset()
    loadStartOnLoginMock.mockReset()
    loadThemeModeMock.mockReset()
    migrateLegacyTraySettingsMock.mockReset()
    normalizePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockReset()

    isTauriMock.mockReturnValue(true)
    isAutostartEnabledMock.mockResolvedValue(true)
    invokeMock.mockResolvedValue([
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [], detected: true,
      },
    ])
    loadPluginSettingsMock.mockResolvedValue({ order: ["codex"], disabled: [] })
    normalizePluginSettingsMock.mockImplementation((stored) => stored)
    arePluginSettingsEqualMock.mockReturnValue(true)
    loadAutoUpdateIntervalMock.mockResolvedValue(15)
    loadAppLanguageMock.mockResolvedValue("en")
    loadThemeModeMock.mockResolvedValue("dark")
    loadDisplayModeMock.mockResolvedValue("used")
    loadDisplayCurrencyMock.mockResolvedValue("USD")
    loadResetTimerDisplayModeMock.mockResolvedValue("relative")
    loadGlobalShortcutMock.mockResolvedValue("CommandOrControl+Shift+O")
    loadMenubarActivityRotationSpeedMock.mockResolvedValue("standard")
    loadMenubarIconStyleMock.mockResolvedValue("provider")
    loadMenubarMetricMock.mockResolvedValue("default")
    loadMultiTrayDisplayModeMock.mockResolvedValue("percent")
    loadMultiTrayProviderCountMock.mockResolvedValue(3)
    loadOverviewSpendStripEnabledMock.mockResolvedValue(true)
    loadStartOnLoginMock.mockResolvedValue(true)
    migrateLegacyTraySettingsMock.mockResolvedValue(undefined)
    savePluginSettingsMock.mockResolvedValue(undefined)
    getEnabledPluginIdsMock.mockReturnValue(["codex"])
  })

  it("disables autostart when applyStartOnLogin receives false", async () => {
    vi.stubEnv("DEV", false) // production build: autostart reconciliation is active
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(disableAutostartMock).toHaveBeenCalledTimes(1)
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("falls back to default reset timer mode when loading fails", async () => {
    const resetModeError = new Error("reset timer mode unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadResetTimerDisplayModeMock.mockRejectedValueOnce(resetModeError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load reset timer display mode:",
        resetModeError
      )
      expect(args.setResetTimerDisplayMode).toHaveBeenCalledWith("relative")
    })

    errorSpy.mockRestore()
  })

  it("applies the stored menubar metric", async () => {
    loadMenubarMetricMock.mockResolvedValueOnce("weekly")
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setMenubarMetric).toHaveBeenCalledWith("weekly")
    })
  })

  it("applies the stored menubar activity rotation speed", async () => {
    loadMenubarActivityRotationSpeedMock.mockResolvedValueOnce("fast")
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setMenubarActivityRotationSpeed).toHaveBeenCalledWith("fast")
    })
  })

  it("restores the persisted app language", async () => {
    loadAppLanguageMock.mockResolvedValueOnce("zh-TW")
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setLanguage).toHaveBeenCalledWith("zh-TW")
    })
  })

  it("applies the stored multi tray provider count", async () => {
    loadMultiTrayProviderCountMock.mockResolvedValueOnce(4)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setMultiTrayProviderCount).toHaveBeenCalledWith(4)
    })
  })

  it("applies the stored multi tray display mode", async () => {
    loadMultiTrayDisplayModeMock.mockResolvedValueOnce("bars")
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setMultiTrayDisplayMode).toHaveBeenCalledWith("bars")
    })
  })

  it("falls back to default multi tray provider count when loading fails", async () => {
    const countError = new Error("multi tray provider count unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadMultiTrayProviderCountMock.mockRejectedValueOnce(countError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load multi tray provider count:",
        countError,
      )
      expect(args.setMultiTrayProviderCount).toHaveBeenCalledWith(3)
    })

    errorSpy.mockRestore()
  })

  it("falls back to default menubar metric when loading fails", async () => {
    const metricError = new Error("menubar metric unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadMenubarMetricMock.mockRejectedValueOnce(metricError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Failed to load menubar metric:", metricError)
      expect(args.setMenubarMetric).toHaveBeenCalledWith("default")
    })

    errorSpy.mockRestore()
  })

  it("removes unknown legacy providers and saves the Codex-only result", async () => {
    const args = createArgs()
    const storedSettings = { order: ["legacy-provider", "codex"], disabled: [] }
    const normalizedSettings = { order: ["codex"], disabled: [] }
    const availablePlugins = [
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [], detected: true,
      },
    ]

    invokeMock.mockResolvedValueOnce(availablePlugins)
    loadPluginSettingsMock.mockResolvedValueOnce(storedSettings)
    normalizePluginSettingsMock.mockReturnValueOnce(normalizedSettings)
    arePluginSettingsEqualMock.mockReturnValueOnce(false)
    getEnabledPluginIdsMock.mockReturnValueOnce(["codex"])

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(normalizePluginSettingsMock).toHaveBeenCalledWith(
        storedSettings,
        availablePlugins
      )
      expect(savePluginSettingsMock).toHaveBeenCalledWith(normalizedSettings)
      expect(args.setPluginSettings).toHaveBeenCalledWith(normalizedSettings)
      expect(args.startBatch).toHaveBeenCalledWith(["codex"])
    })
  })
})
