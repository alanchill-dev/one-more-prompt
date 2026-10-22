import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_DISPLAY_CURRENCY,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_MENUBAR_METRIC,
  DEFAULT_MULTI_TRAY_DISPLAY_MODE,
  DEFAULT_MULTI_TRAY_PROVIDER_COUNT,
  DEFAULT_ONBOARDING_COMPLETED,
  DEFAULT_OVERVIEW_GRAPH_GROUP_BY,
  DEFAULT_OVERVIEW_GRAPH_STYLE,
  DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED,
  DEFAULT_OVERVIEW_STRIP_METRIC,
  DEFAULT_PACE_NOTIFICATION_SETTINGS,
  DEFAULT_PLUGIN_SETTINGS,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  arePluginSettingsEqual,
  getEnabledPluginIds,
  loadAutoUpdateInterval,
  loadAppLanguage,
  loadDisplayMode,
  loadDisplayCurrency,
  loadGlobalShortcut,
  loadMenubarActivityRotationSpeed,
  loadMenubarIconStyle,
  loadMenubarMetric,
  loadModelColorPreferences,
  loadMultiTrayDisplayMode,
  loadMultiTrayProviderCount,
  loadOnboardingCompleted,
  loadOnboardingGuidePending,
  loadOnboardingGuideRequired,
  loadOverviewGraphGroupBy,
  loadOverviewGraphStyle,
  loadOverviewSpendStripEnabled,
  loadOverviewStripMetric,
  loadPaceNotificationSettings,
  loadPluginSettings,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  cycleMultiTrayProviderCount,
  dismissOnboardingGuide,
  migrateLegacyTraySettings,
  loadThemeMode,
  normalizePluginSettings,
  resetOnboardingCompleted,
  saveAutoUpdateInterval,
  saveAppLanguage,
  saveDisplayMode,
  saveDisplayCurrency,
  saveGlobalShortcut,
  saveMenubarActivityRotationSpeed,
  saveMenubarIconStyle,
  saveMenubarMetric,
  saveModelColorPreferences,
  saveMultiTrayDisplayMode,
  saveMultiTrayProviderCount,
  saveOnboardingCompleted,
  saveOverviewGraphGroupBy,
  saveOverviewSpendStripEnabled,
  saveOverviewStripMetric,
  saveOverviewGraphStyle,
  savePaceNotificationSettings,
  savePluginSettings,
  saveResetTimerDisplayMode,
  saveStartOnLogin,
  saveThemeMode,
} from "@/lib/settings"
import { DEFAULT_MODEL_COLOR_PREFERENCES } from "@/lib/model-colors"
import type { PluginMeta } from "@/lib/plugin-types"

const storeState = new Map<string, unknown>()
const storeDeleteMock = vi.fn()
const storeSaveMock = vi.fn()

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get<T>(key: string): Promise<T | null> {
      if (!storeState.has(key)) return undefined as T | null
      return storeState.get(key) as T | null
    }
    async set<T>(key: string, value: T): Promise<void> {
      storeState.set(key, value)
    }
    async delete(key: string): Promise<void> {
      storeDeleteMock(key)
      storeState.delete(key)
    }
    async save(): Promise<void> {
      storeSaveMock()
    }
  },
}))

describe("settings", () => {
  beforeEach(() => {
    storeState.clear()
    storeDeleteMock.mockReset()
    storeSaveMock.mockReset()
  })

  it("loads defaults when no settings stored", async () => {
    await expect(loadPluginSettings()).resolves.toEqual(DEFAULT_PLUGIN_SETTINGS)
  })

  it("sanitizes stored settings", async () => {
    storeState.set("plugins", { order: ["a"], disabled: "nope" })
    await expect(loadPluginSettings()).resolves.toEqual({
      order: ["a"],
      disabled: [],
    })
  })

  it("saves settings", async () => {
    const settings = { order: ["a"], disabled: ["b"] }
    await savePluginSettings(settings)
    await expect(loadPluginSettings()).resolves.toEqual(settings)
  })

  it("persists and sanitizes the ordered model palette and migrates legacy model colors", async () => {
    await expect(loadModelColorPreferences()).resolves.toEqual(DEFAULT_MODEL_COLOR_PREFERENCES)

    await saveModelColorPreferences({
      slots: [
        { base: "#f1ebd5" },
        ...DEFAULT_MODEL_COLOR_PREFERENCES.slots.slice(1),
      ],
    })
    await expect(loadModelColorPreferences()).resolves.toEqual({
      slots: [
        { base: "#F1EBD5" },
        ...DEFAULT_MODEL_COLOR_PREFERENCES.slots.slice(1),
      ],
    })

    storeState.delete("modelPalette")
    storeState.set("modelColors", {
      overrides: { gpt56sol: { base: "#123456" } },
    })
    const migrated = await loadModelColorPreferences()
    expect(migrated.slots[0].base).toBe("#123456")
    expect(migrated).not.toHaveProperty("knownModels")
  })

  it("persists and validates the application language", async () => {
    await expect(loadAppLanguage()).resolves.toBe("en")

    await saveAppLanguage("zh-TW")
    await expect(loadAppLanguage()).resolves.toBe("zh-TW")

    storeState.set("appLanguage", "fr")
    await expect(loadAppLanguage()).resolves.toBe("fr")

    storeState.set("appLanguage", "not-a-language")
    await expect(loadAppLanguage()).resolves.toBe("en")
  })

  it("normalizes order + disabled against known plugins", () => {
    const plugins: PluginMeta[] = [
      { id: "a", name: "A", iconUrl: "", lines: [] },
      { id: "b", name: "B", iconUrl: "", lines: [] },
    ]
    const normalized = normalizePluginSettings(
      { order: ["b", "b", "c"], disabled: ["c", "a"] },
      plugins
    )
    expect(normalized).toEqual({ order: ["b", "a"], disabled: ["a"] })
  })

  it("auto-disables new undetected plugins, enables detected ones", () => {
    const plugins: PluginMeta[] = [
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [], detected: true },
      { id: "example-a", name: "Example A", iconUrl: "", lines: [], primaryCandidates: [], detected: false },
      { id: "example-b", name: "Example B", iconUrl: "", lines: [], primaryCandidates: [], detected: false },
    ]
    const result = normalizePluginSettings({ order: [], disabled: [] }, plugins)
    expect(result.order).toEqual(["codex", "example-a", "example-b"])
    expect(result.disabled).toEqual(["example-a", "example-b"])
  })

  it("enables Codex before sign-in so later automatic checks can discover it", () => {
    const plugins = [{ id: "codex", name: "Codex", iconUrl: "", lines: [], detected: false }]
    const result = normalizePluginSettings({ order: [], disabled: [] }, plugins)
    expect(result).toEqual({ order: ["codex"], disabled: [] })
    expect(getEnabledPluginIds(result)).toEqual(["codex"])
  })

  it("repairs and saves legacy disabled Codex settings on startup", async () => {
    storeState.set("plugins", { order: ["codex"], disabled: ["codex"] })
    const plugins = [{ id: "codex", name: "Codex", iconUrl: "", lines: [], detected: true }]
    const result = normalizePluginSettings(await loadPluginSettings(), plugins)
    await savePluginSettings(result)
    expect(await loadPluginSettings()).toEqual({ order: ["codex"], disabled: [] })
    expect(getEnabledPluginIds(result)).toEqual(["codex"])
  })

  it("compares settings equality", () => {
    const a = { order: ["a"], disabled: [] }
    const b = { order: ["a"], disabled: [] }
    const c = { order: ["b"], disabled: [] }
    expect(arePluginSettingsEqual(a, b)).toBe(true)
    expect(arePluginSettingsEqual(a, c)).toBe(false)
  })

  it("returns enabled plugin ids", () => {
    expect(getEnabledPluginIds({ order: ["a", "b"], disabled: ["b"] })).toEqual(["a"])
    expect(getEnabledPluginIds({ order: ["codex"], disabled: ["codex"] })).toEqual(["codex"])
  })

  it("loads default auto-update interval when missing", async () => {
    await expect(loadAutoUpdateInterval()).resolves.toBe(DEFAULT_AUTO_UPDATE_INTERVAL)
  })

  it("loads stored auto-update interval", async () => {
    storeState.set("autoUpdateInterval", 30)
    await expect(loadAutoUpdateInterval()).resolves.toBe(30)
  })

  it("saves auto-update interval", async () => {
    await saveAutoUpdateInterval(5)
    await expect(loadAutoUpdateInterval()).resolves.toBe(5)
  })

  it("loads default theme mode when missing", async () => {
    await expect(loadThemeMode()).resolves.toBe(DEFAULT_THEME_MODE)
  })

  it("loads stored theme mode", async () => {
    storeState.set("themeMode", "dark")
    await expect(loadThemeMode()).resolves.toBe("dark")
  })

  it("saves theme mode", async () => {
    await saveThemeMode("light")
    await expect(loadThemeMode()).resolves.toBe("light")
  })

  it("falls back to default for invalid theme mode", async () => {
    storeState.set("themeMode", "invalid")
    await expect(loadThemeMode()).resolves.toBe(DEFAULT_THEME_MODE)
  })

  it("loads default display mode when missing", async () => {
    await expect(loadDisplayMode()).resolves.toBe(DEFAULT_DISPLAY_MODE)
  })

  it("loads stored display mode", async () => {
    storeState.set("displayMode", "left")
    await expect(loadDisplayMode()).resolves.toBe("left")
  })

  it("saves display mode", async () => {
    await saveDisplayMode("left")
    await expect(loadDisplayMode()).resolves.toBe("left")
  })

  it("falls back to default for invalid display mode", async () => {
    storeState.set("displayMode", "invalid")
    await expect(loadDisplayMode()).resolves.toBe(DEFAULT_DISPLAY_MODE)
  })

  it("persists a supported display currency and rejects unknown values", async () => {
    await expect(loadDisplayCurrency()).resolves.toBe(DEFAULT_DISPLAY_CURRENCY)

    await saveDisplayCurrency("TWD")
    await expect(loadDisplayCurrency()).resolves.toBe("TWD")

    storeState.set("displayCurrency", "CAD")
    await expect(loadDisplayCurrency()).resolves.toBe(DEFAULT_DISPLAY_CURRENCY)
  })

  it("loads default reset timer display mode when missing", async () => {
    await expect(loadResetTimerDisplayMode()).resolves.toBe(DEFAULT_RESET_TIMER_DISPLAY_MODE)
  })

  it("loads stored reset timer display mode", async () => {
    storeState.set("resetTimerDisplayMode", "absolute")
    await expect(loadResetTimerDisplayMode()).resolves.toBe("absolute")
  })

  it("saves reset timer display mode", async () => {
    await saveResetTimerDisplayMode("relative")
    await expect(loadResetTimerDisplayMode()).resolves.toBe("relative")
  })

  it("falls back to default for invalid reset timer display mode", async () => {
    storeState.set("resetTimerDisplayMode", "invalid")
    await expect(loadResetTimerDisplayMode()).resolves.toBe(DEFAULT_RESET_TIMER_DISPLAY_MODE)
  })

  it("migrates and removes legacy tray settings keys", async () => {
    storeState.set("trayIconStyle", "provider")
    storeState.set("trayShowPercentage", false)

    await migrateLegacyTraySettings()

    expect(storeState.has("trayIconStyle")).toBe(false)
    expect(storeState.has("trayShowPercentage")).toBe(false)
  })

  it("migrates legacy trayIconStyle=bars to menubarIconStyle=bars when new key not set", async () => {
    storeState.set("trayIconStyle", "bars")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("bars")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("does not overwrite menubarIconStyle when already set during legacy migration", async () => {
    storeState.set("trayIconStyle", "bars")
    storeState.set("menubarIconStyle", "provider")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("provider")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("migrates legacy trayIconStyle=circle to menubarIconStyle=donut when new key not set", async () => {
    storeState.set("trayIconStyle", "circle")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("donut")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("does not set menubarIconStyle when legacy trayIconStyle is non-bars", async () => {
    storeState.set("trayIconStyle", "provider")

    await migrateLegacyTraySettings()

    expect(storeState.has("menubarIconStyle")).toBe(false)
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("loads default menubar icon style when missing", async () => {
    await expect(loadMenubarIconStyle()).resolves.toBe(DEFAULT_MENUBAR_ICON_STYLE)
  })

  it("loads stored menubar icon style", async () => {
    storeState.set("menubarIconStyle", "bars")
    await expect(loadMenubarIconStyle()).resolves.toBe("bars")
  })

  it("saves menubar icon style", async () => {
    await saveMenubarIconStyle("bars")
    await expect(loadMenubarIconStyle()).resolves.toBe("bars")
  })

  it("loads stored menubar donut icon style", async () => {
    storeState.set("menubarIconStyle", "donut")
    await expect(loadMenubarIconStyle()).resolves.toBe("donut")
  })

  it("saves menubar donut icon style", async () => {
    await saveMenubarIconStyle("donut")
    await expect(loadMenubarIconStyle()).resolves.toBe("donut")
  })

  it("accepts multi menubar icon style", async () => {
    await saveMenubarIconStyle("multi")
    expect(await loadMenubarIconStyle()).toBe("multi")
  })

  it("loads the default menubar activity rotation speed when missing", async () => {
    await expect(loadMenubarActivityRotationSpeed()).resolves.toBe(
      DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED,
    )
  })

  it("round-trips the menubar activity rotation speed", async () => {
    await saveMenubarActivityRotationSpeed("fast")
    await expect(loadMenubarActivityRotationSpeed()).resolves.toBe("fast")
  })

  it("falls back to the default menubar activity rotation speed when invalid", async () => {
    storeState.set("menubarActivityRotationSpeed", "instant")
    await expect(loadMenubarActivityRotationSpeed()).resolves.toBe(
      DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED,
    )
  })

  it("loads default multi tray provider count when missing", async () => {
    await expect(loadMultiTrayProviderCount()).resolves.toBe(DEFAULT_MULTI_TRAY_PROVIDER_COUNT)
  })

  it("loads stored multi tray provider count", async () => {
    storeState.set("multiTrayProviderCount", 4)
    await expect(loadMultiTrayProviderCount()).resolves.toBe(4)
  })

  it("saves multi tray provider count", async () => {
    await saveMultiTrayProviderCount(2)
    await expect(loadMultiTrayProviderCount()).resolves.toBe(2)
  })

  it("falls back to default for invalid multi tray provider count", async () => {
    storeState.set("multiTrayProviderCount", 5)
    await expect(loadMultiTrayProviderCount()).resolves.toBe(DEFAULT_MULTI_TRAY_PROVIDER_COUNT)
  })

  it("cycles multi tray provider count 2 to 3 to 4 to 2", () => {
    expect(cycleMultiTrayProviderCount(2)).toBe(3)
    expect(cycleMultiTrayProviderCount(3)).toBe(4)
    expect(cycleMultiTrayProviderCount(4)).toBe(2)
  })

  it("loads default multi tray display mode when missing", async () => {
    await expect(loadMultiTrayDisplayMode()).resolves.toBe(DEFAULT_MULTI_TRAY_DISPLAY_MODE)
  })

  it("loads stored multi tray display mode", async () => {
    storeState.set("multiTrayDisplayMode", "bars")
    await expect(loadMultiTrayDisplayMode()).resolves.toBe("bars")
  })

  it("saves multi tray display mode", async () => {
    await saveMultiTrayDisplayMode("bars")
    await expect(loadMultiTrayDisplayMode()).resolves.toBe("bars")
  })

  it("falls back to default for invalid multi tray display mode", async () => {
    storeState.set("multiTrayDisplayMode", "invalid")
    await expect(loadMultiTrayDisplayMode()).resolves.toBe(DEFAULT_MULTI_TRAY_DISPLAY_MODE)
  })

  it("falls back to default for invalid menubar icon style", async () => {
    storeState.set("menubarIconStyle", "invalid")
    await expect(loadMenubarIconStyle()).resolves.toBe(DEFAULT_MENUBAR_ICON_STYLE)
  })

  it("loads default menubar metric when missing", async () => {
    await expect(loadMenubarMetric()).resolves.toBe(DEFAULT_MENUBAR_METRIC)
  })

  it("loads stored menubar metric", async () => {
    storeState.set("menubarMetric", "weekly")
    await expect(loadMenubarMetric()).resolves.toBe("weekly")
  })

  it("saves menubar metric", async () => {
    await saveMenubarMetric("weekly")
    await expect(loadMenubarMetric()).resolves.toBe("weekly")
  })

  it("falls back to default for invalid menubar metric", async () => {
    storeState.set("menubarMetric", "invalid")
    await expect(loadMenubarMetric()).resolves.toBe(DEFAULT_MENUBAR_METRIC)
  })

  it("loads default overview graph style when missing", async () => {
    await expect(loadOverviewGraphStyle()).resolves.toBe(DEFAULT_OVERVIEW_GRAPH_STYLE);
  });

  it("loads stored overview graph style and migrates compact/detailed", async () => {
    storeState.set("overviewGraphStyle", "detailed");
    await expect(loadOverviewGraphStyle()).resolves.toBe("donut");

    storeState.set("overviewGraphStyle", "compact");
    await expect(loadOverviewGraphStyle()).resolves.toBe("bar");
  });

  it("saves overview graph style", async () => {
    await saveOverviewGraphStyle("donut");
    await expect(loadOverviewGraphStyle()).resolves.toBe("donut");
  });

  it("falls back to default for invalid overview graph style", async () => {
    storeState.set("overviewGraphStyle", "pie");
    await expect(loadOverviewGraphStyle()).resolves.toBe(DEFAULT_OVERVIEW_GRAPH_STYLE);
  });

  it("loads default overview strip metric when missing", async () => {
    await expect(loadOverviewStripMetric()).resolves.toBe(DEFAULT_OVERVIEW_STRIP_METRIC);
  });

  it("saves overview strip metric", async () => {
    await saveOverviewStripMetric("usage");
    await expect(loadOverviewStripMetric()).resolves.toBe("usage");
  });

  it("falls back to default for invalid overview strip metric", async () => {
    storeState.set("overviewStripMetric", "mtok");
    await expect(loadOverviewStripMetric()).resolves.toBe(DEFAULT_OVERVIEW_STRIP_METRIC);
  });

  it("loads default overview graph group by when missing", async () => {
    await expect(loadOverviewGraphGroupBy()).resolves.toBe(DEFAULT_OVERVIEW_GRAPH_GROUP_BY);
  });

  it("loads stored overview graph group by", async () => {
    storeState.set("overviewGraphGroupBy", "provider");
    await expect(loadOverviewGraphGroupBy()).resolves.toBe("provider");
  });

  it("saves overview graph group by", async () => {
    await saveOverviewGraphGroupBy("provider");
    await expect(loadOverviewGraphGroupBy()).resolves.toBe("provider");
  });

  it("falls back to default for invalid overview graph group by", async () => {
    storeState.set("overviewGraphGroupBy", "team");
    await expect(loadOverviewGraphGroupBy()).resolves.toBe(DEFAULT_OVERVIEW_GRAPH_GROUP_BY);
  });

  it("loads default overview spend strip enabled when missing", async () => {
    await expect(loadOverviewSpendStripEnabled()).resolves.toBe(DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED);
  });

  it("loads stored overview spend strip enabled", async () => {
    storeState.set("overviewSpendStripEnabled", false);
    await expect(loadOverviewSpendStripEnabled()).resolves.toBe(false);
  });

  it("saves overview spend strip enabled", async () => {
    await saveOverviewSpendStripEnabled(false);
    await expect(loadOverviewSpendStripEnabled()).resolves.toBe(false);
  });

  it("falls back to default for invalid overview spend strip enabled", async () => {
    storeState.set("overviewSpendStripEnabled", "invalid");
    await expect(loadOverviewSpendStripEnabled()).resolves.toBe(DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED);
  });

  it("loads default pace notification settings when missing", async () => {
    await expect(loadPaceNotificationSettings()).resolves.toEqual(DEFAULT_PACE_NOTIFICATION_SETTINGS)
  })

  it("discards retired prediction toggles and defaults missing session reset to off", async () => {
    storeState.set("paceNotifications", {
      healthyToClose: true,
      closeToRunningOut: true,
      underTenPercent: true,
    })

    await expect(loadPaceNotificationSettings()).resolves.toEqual({
      underTenPercent: true,
      sessionReset: false,
    })
  })

  it("saves pace notification settings with session reset", async () => {
    const settings = {
      underTenPercent: false,
      sessionReset: true,
    }

    await savePaceNotificationSettings(settings)

    await expect(loadPaceNotificationSettings()).resolves.toEqual(settings)
  })

  it("skips legacy tray migration when keys are absent", async () => {
    await expect(migrateLegacyTraySettings()).resolves.toBeUndefined()
    expect(storeState.has("trayIconStyle")).toBe(false)
    expect(storeState.has("trayShowPercentage")).toBe(false)
    expect(storeDeleteMock).not.toHaveBeenCalled()
    expect(storeSaveMock).not.toHaveBeenCalled()
  })

  it("migrates when only one legacy tray key is present", async () => {
    storeState.set("trayShowPercentage", true)

    await migrateLegacyTraySettings()

    expect(storeState.has("trayShowPercentage")).toBe(false)
    expect(storeDeleteMock).toHaveBeenCalledWith("trayShowPercentage")
    expect(storeSaveMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to nulling legacy keys if delete is unavailable", async () => {
    const { LazyStore } = await import("@tauri-apps/plugin-store")
    const prototype = LazyStore.prototype as { delete?: (key: string) => Promise<void> }
    const originalDelete = prototype.delete

    // Simulate older store implementation with no delete() method.
    prototype.delete = undefined
    storeState.set("trayIconStyle", "provider")

    try {
      await migrateLegacyTraySettings()
    } finally {
      prototype.delete = originalDelete
    }

    expect(storeDeleteMock).not.toHaveBeenCalled()
    expect(storeState.get("trayIconStyle")).toBeNull()
    expect(storeSaveMock).toHaveBeenCalledTimes(1)
  })

  it("loads default global shortcut when missing", async () => {
    await expect(loadGlobalShortcut()).resolves.toBe(DEFAULT_GLOBAL_SHORTCUT)
  })

  it("loads stored global shortcut values", async () => {
    storeState.set("globalShortcut", "CommandOrControl+Shift+O")
    await expect(loadGlobalShortcut()).resolves.toBe("CommandOrControl+Shift+O")

    storeState.set("globalShortcut", null)
    await expect(loadGlobalShortcut()).resolves.toBe(null)
  })

  it("falls back to default for invalid global shortcut values", async () => {
    storeState.set("globalShortcut", 1234)
    await expect(loadGlobalShortcut()).resolves.toBe(DEFAULT_GLOBAL_SHORTCUT)
  })

  it("saves global shortcut values", async () => {
    await saveGlobalShortcut("CommandOrControl+Shift+O")
    await expect(loadGlobalShortcut()).resolves.toBe("CommandOrControl+Shift+O")
  })

  it("loads default start on login when missing", async () => {
    await expect(loadStartOnLogin()).resolves.toBe(DEFAULT_START_ON_LOGIN)
  })

  it("loads stored start on login value", async () => {
    storeState.set("startOnLogin", true)
    await expect(loadStartOnLogin()).resolves.toBe(true)
  })

  it("saves start on login value", async () => {
    await saveStartOnLogin(true)
    await expect(loadStartOnLogin()).resolves.toBe(true)
  })

  it("falls back to default for invalid start on login value", async () => {
    storeState.set("startOnLogin", "invalid")
    await expect(loadStartOnLogin()).resolves.toBe(DEFAULT_START_ON_LOGIN)
  })

  it("loads onboarding as incomplete when missing", async () => {
    await expect(loadOnboardingCompleted()).resolves.toBe(DEFAULT_ONBOARDING_COMPLETED)
  })

  it("loads stored onboarding completion", async () => {
    storeState.set("onboardingCompleted", true)
    await expect(loadOnboardingCompleted()).resolves.toBe(true)
  })

  it("falls back to incomplete for invalid onboarding completion", async () => {
    storeState.set("onboardingCompleted", "yes")
    await expect(loadOnboardingCompleted()).resolves.toBe(false)
  })

  it("saves onboarding completion with a timestamp", async () => {
    await saveOnboardingCompleted(true)

    await expect(loadOnboardingCompleted()).resolves.toBe(true)
    expect(typeof storeState.get("onboardingCompletedAt")).toBe("number")
    expect(storeSaveMock).toHaveBeenCalled()
  })

  it("resets onboarding completion for QA", async () => {
    storeState.set("onboardingCompleted", true)
    storeState.set("onboardingCompletedAt", 1_783_419_024_000)

    await resetOnboardingCompleted()

    await expect(loadOnboardingCompleted()).resolves.toBe(false)
    expect(storeDeleteMock).toHaveBeenCalledWith("onboardingCompleted")
    expect(storeDeleteMock).toHaveBeenCalledWith("onboardingCompletedAt")
  })

  it("loads the contextual guide as not pending when missing", async () => {
    await expect(loadOnboardingGuidePending()).resolves.toBe(false)
  })

  it("loads a required guide only for the persisted boolean", async () => {
    await expect(loadOnboardingGuideRequired()).resolves.toBe(false)
    storeState.set("onboardingGuideRequired", "true")
    await expect(loadOnboardingGuideRequired()).resolves.toBe(false)
    storeState.set("onboardingGuideRequired", true)
    await expect(loadOnboardingGuideRequired()).resolves.toBe(true)
  })

  it("finishes the contextual guide with a definitive Finish timestamp", async () => {
    storeState.set("onboardingGuidePending", true)
    storeState.set("onboardingGuideRequired", true)

    await dismissOnboardingGuide(true)

    await expect(loadOnboardingGuidePending()).resolves.toBe(false)
    await expect(loadOnboardingGuideRequired()).resolves.toBe(false)
    expect(typeof storeState.get("onboardingGuideCompletedAt")).toBe("number")
    expect(storeState.get("onboardingGuideFinishedAt")).toBe(storeState.get("onboardingGuideCompletedAt"))
    expect(storeSaveMock).toHaveBeenCalled()
  })

  it("does not count Skip as a finished guide", async () => {
    storeState.set("onboardingGuidePending", true)
    storeState.set("onboardingGuideCompletedAt", 1234)

    await dismissOnboardingGuide(false)

    await expect(loadOnboardingGuidePending()).resolves.toBe(false)
    expect(storeState.get("onboardingGuideFinishedAt")).toBeUndefined()
    expect(storeState.get("onboardingGuideCompletedAt")).toBe(1234)
  })

  it("preserves actual first-guide Finish proof when a later replay is skipped", async () => {
    await dismissOnboardingGuide(true)
    const finishedAt = storeState.get("onboardingGuideFinishedAt")
    storeState.set("onboardingGuidePending", true)

    await dismissOnboardingGuide(false)

    await expect(loadOnboardingGuidePending()).resolves.toBe(false)
    await expect(loadOnboardingGuideRequired()).resolves.toBe(false)
    expect(storeState.get("onboardingGuideFinishedAt")).toBe(finishedAt)
    expect(storeState.get("onboardingGuideCompletedAt")).toBe(finishedAt)
  })

})
