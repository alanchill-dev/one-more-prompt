import { create } from "zustand"
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from "@/lib/i18n"
import { DEFAULT_MODEL_COLOR_PREFERENCES, type ModelColorPreferences } from "@/lib/model-colors"
import {
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
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type DisplayCurrency,
  type GlobalShortcut,
  type MenubarIconStyle,
  type MenubarActivityRotationSpeed,
  type MenubarMetric,
  type MultiTrayDisplayMode,
  type MultiTrayProviderCount,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"

type AppPreferencesStore = {
  language: AppLanguage
  autoUpdateInterval: AutoUpdateIntervalMinutes
  themeMode: ThemeMode
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  globalShortcut: GlobalShortcut
  startOnLogin: boolean
  menubarIconStyle: MenubarIconStyle
  menubarActivityRotationSpeed: MenubarActivityRotationSpeed
  menubarMetric: MenubarMetric
  multiTrayProviderCount: MultiTrayProviderCount
  multiTrayDisplayMode: MultiTrayDisplayMode
  overviewSpendStripEnabled: boolean
  displayCurrency: DisplayCurrency
  modelColors: ModelColorPreferences
  modelColorsHydrated: boolean
  setLanguage: (value: AppLanguage) => void
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setMenubarActivityRotationSpeed: (value: MenubarActivityRotationSpeed) => void
  setMenubarMetric: (value: MenubarMetric) => void
  setMultiTrayProviderCount: (value: MultiTrayProviderCount) => void
  setMultiTrayDisplayMode: (value: MultiTrayDisplayMode) => void
  setOverviewSpendStripEnabled: (value: boolean) => void
  setDisplayCurrency: (value: DisplayCurrency) => void
  setModelColors: (value: ModelColorPreferences) => void
  setModelColorsHydrated: (value: boolean) => void
  resetState: () => void
}

const initialState = {
  language: DEFAULT_APP_LANGUAGE,
  autoUpdateInterval: DEFAULT_AUTO_UPDATE_INTERVAL,
  themeMode: DEFAULT_THEME_MODE,
  displayMode: DEFAULT_DISPLAY_MODE,
  resetTimerDisplayMode: DEFAULT_RESET_TIMER_DISPLAY_MODE,
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  startOnLogin: DEFAULT_START_ON_LOGIN,
  menubarIconStyle: DEFAULT_MENUBAR_ICON_STYLE,
  menubarActivityRotationSpeed: DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED,
  menubarMetric: DEFAULT_MENUBAR_METRIC,
  multiTrayProviderCount: DEFAULT_MULTI_TRAY_PROVIDER_COUNT,
  multiTrayDisplayMode: DEFAULT_MULTI_TRAY_DISPLAY_MODE,
  overviewSpendStripEnabled: DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED,
  displayCurrency: DEFAULT_DISPLAY_CURRENCY,
  modelColors: DEFAULT_MODEL_COLOR_PREFERENCES,
  modelColorsHydrated: false,
}

export const useAppPreferencesStore = create<AppPreferencesStore>((set) => ({
  ...initialState,
  setLanguage: (value) => set({ language: value }),
  setAutoUpdateInterval: (value) => set({ autoUpdateInterval: value }),
  setThemeMode: (value) => set({ themeMode: value }),
  setDisplayMode: (value) => set({ displayMode: value }),
  setResetTimerDisplayMode: (value) => set({ resetTimerDisplayMode: value }),
  setGlobalShortcut: (value) => set({ globalShortcut: value }),
  setStartOnLogin: (value) => set({ startOnLogin: value }),
  setMenubarIconStyle: (value) => set({ menubarIconStyle: value }),
  setMenubarActivityRotationSpeed: (value) => set({ menubarActivityRotationSpeed: value }),
  setMenubarMetric: (value) => set({ menubarMetric: value }),
  setMultiTrayProviderCount: (value) => set({ multiTrayProviderCount: value }),
  setMultiTrayDisplayMode: (value) => set({ multiTrayDisplayMode: value }),
  setOverviewSpendStripEnabled: (value) => set({ overviewSpendStripEnabled: value }),
  setDisplayCurrency: (value) => set({ displayCurrency: value }),
  setModelColors: (value) => set({ modelColors: value }),
  setModelColorsHydrated: (value) => set({ modelColorsHydrated: value }),
  resetState: () => set(initialState),
}))
