import { LazyStore } from "@tauri-apps/plugin-store";
import type { PluginMeta } from "@/lib/plugin-types";
import {
  DEFAULT_APP_LANGUAGE,
  isAppLanguage,
  type AppLanguage,
} from "@/lib/i18n";
import {
  DEFAULT_MODEL_COLOR_PREFERENCES,
  sanitizeModelColorPreferences,
  type ModelColorPreferences,
} from "@/lib/model-colors";

// Refresh cooldown duration in milliseconds (5 minutes)
export const REFRESH_COOLDOWN_MS = 300_000;

// Codex stays enabled; retain the stored order and legacy provider preferences.
export type PluginSettings = {
  order: string[];
  disabled: string[];
};

export type AutoUpdateIntervalMinutes = 5 | 15 | 30 | 60;

export type ThemeMode = "system" | "light" | "dark";

export type DisplayMode = "used" | "left";

export type ResetTimerDisplayMode = "relative" | "absolute";

export type MenubarIconStyle = "provider" | "dual" | "bars" | "donut" | "multi";

export type MultiTrayProviderCount = 2 | 3 | 4;

export type MultiTrayDisplayMode = "percent" | "bars";

export type MenubarMetric = "default" | "weekly";

export type MenubarActivityRotationSpeed = "slow" | "standard" | "fast";

export type DisplayCurrency = "USD" | "TWD" | "EUR" | "JPY" | "GBP" | "CNY" | "KRW";

export type GlobalShortcut = string | null;

/** Per-milestone quota notification toggles. All default OFF; the app requests notification
 * permission the first time a trigger is enabled, so a fresh install stays quiet until opted in. */
export type PaceNotificationSettings = {
  underTenPercent: boolean;
  sessionReset: boolean;
};

export const DEFAULT_PACE_NOTIFICATION_SETTINGS: PaceNotificationSettings = {
  underTenPercent: false,
  sessionReset: false,
};

export const DEFAULT_ONBOARDING_COMPLETED = false;

/** Overview strip chart shape. */
export type OverviewGraphStyle = "bar" | "donut";

/** Overview strip slice grouping. */
export type OverviewGraphGroupBy = "model" | "provider";

/** Overview strip displayed values: today's cost or token counts. */
export type OverviewStripMetric = "price" | "usage";

const SETTINGS_STORE_PATH = "settings.json";
const PLUGIN_SETTINGS_KEY = "plugins";
const AUTO_UPDATE_SETTINGS_KEY = "autoUpdateInterval";
const APP_LANGUAGE_KEY = "appLanguage";
const THEME_MODE_KEY = "themeMode";
const DISPLAY_MODE_KEY = "displayMode";
const RESET_TIMER_DISPLAY_MODE_KEY = "resetTimerDisplayMode";
const MENUBAR_ICON_STYLE_KEY = "menubarIconStyle";
const MULTI_TRAY_PROVIDER_COUNT_KEY = "multiTrayProviderCount";
const MULTI_TRAY_DISPLAY_MODE_KEY = "multiTrayDisplayMode";
const MENUBAR_METRIC_KEY = "menubarMetric";
const MENUBAR_ACTIVITY_ROTATION_SPEED_KEY = "menubarActivityRotationSpeed";
const LEGACY_TRAY_ICON_STYLE_KEY = "trayIconStyle";
const LEGACY_TRAY_SHOW_PERCENTAGE_KEY = "trayShowPercentage";
const GLOBAL_SHORTCUT_KEY = "globalShortcut";
const START_ON_LOGIN_KEY = "startOnLogin";
const ONBOARDING_COMPLETED_KEY = "onboardingCompleted";
const ONBOARDING_COMPLETED_AT_KEY = "onboardingCompletedAt";
const ONBOARDING_GUIDE_PENDING_KEY = "onboardingGuidePending";
const ONBOARDING_GUIDE_REQUIRED_KEY = "onboardingGuideRequired";
const ONBOARDING_GUIDE_COMPLETED_AT_KEY = "onboardingGuideCompletedAt";
const ONBOARDING_GUIDE_FINISHED_AT_KEY = "onboardingGuideFinishedAt";
const PACE_NOTIFICATIONS_KEY = "paceNotifications";
const OVERVIEW_GRAPH_STYLE_KEY = "overviewGraphStyle";
const OVERVIEW_GRAPH_GROUP_BY_KEY = "overviewGraphGroupBy";
const OVERVIEW_STRIP_METRIC_KEY = "overviewStripMetric";
const OVERVIEW_SPEND_STRIP_ENABLED_KEY = "overviewSpendStripEnabled";
const DISPLAY_CURRENCY_KEY = "displayCurrency";
const MODEL_PALETTE_KEY = "modelPalette";
const LEGACY_MODEL_COLORS_KEY = "modelColors";

export const DEFAULT_AUTO_UPDATE_INTERVAL: AutoUpdateIntervalMinutes = 15;
export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_DISPLAY_MODE: DisplayMode = "left";
export const DEFAULT_RESET_TIMER_DISPLAY_MODE: ResetTimerDisplayMode = "relative";
export const DEFAULT_MENUBAR_ICON_STYLE: MenubarIconStyle = "dual";
export const DEFAULT_MULTI_TRAY_PROVIDER_COUNT: MultiTrayProviderCount = 3;
export const DEFAULT_MULTI_TRAY_DISPLAY_MODE: MultiTrayDisplayMode = "percent";
export const DEFAULT_MENUBAR_METRIC: MenubarMetric = "default";
export const DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED: MenubarActivityRotationSpeed = "standard";
export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = null;
export const DEFAULT_START_ON_LOGIN = false;
export const DEFAULT_OVERVIEW_GRAPH_STYLE: OverviewGraphStyle = "donut";
export const DEFAULT_OVERVIEW_GRAPH_GROUP_BY: OverviewGraphGroupBy = "provider";
export const DEFAULT_OVERVIEW_STRIP_METRIC: OverviewStripMetric = "price";
export const DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED = true;
export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = "USD";

const AUTO_UPDATE_INTERVALS: AutoUpdateIntervalMinutes[] = [5, 15, 30, 60];
const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];
const DISPLAY_MODES: DisplayMode[] = ["used", "left"];
const RESET_TIMER_DISPLAY_MODES: ResetTimerDisplayMode[] = ["relative", "absolute"];
const MENUBAR_ICON_STYLES: MenubarIconStyle[] = ["provider", "dual", "donut", "bars", "multi"];
const MULTI_TRAY_PROVIDER_COUNTS: MultiTrayProviderCount[] = [2, 3, 4];
const MULTI_TRAY_DISPLAY_MODES: MultiTrayDisplayMode[] = ["percent", "bars"];
const MENUBAR_METRICS: MenubarMetric[] = ["default", "weekly"];
const MENUBAR_ACTIVITY_ROTATION_SPEEDS: MenubarActivityRotationSpeed[] = ["slow", "standard", "fast"];
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["USD", "TWD", "EUR", "JPY", "GBP", "CNY", "KRW"];

const store = new LazyStore(SETTINGS_STORE_PATH);

export async function loadModelColorPreferences(): Promise<ModelColorPreferences> {
  const stored = await store.get<unknown>(MODEL_PALETTE_KEY);
  if (stored !== undefined) return sanitizeModelColorPreferences(stored);

  // Best-effort migration from the previous model-identity color schema.
  const legacy = await store.get<unknown>(LEGACY_MODEL_COLORS_KEY);
  return legacy === undefined
    ? DEFAULT_MODEL_COLOR_PREFERENCES
    : sanitizeModelColorPreferences(legacy);
}

export async function saveModelColorPreferences(preferences: ModelColorPreferences): Promise<void> {
  await store.set(MODEL_PALETTE_KEY, sanitizeModelColorPreferences(preferences));
  await store.save();
}

export async function loadDisplayCurrency(): Promise<DisplayCurrency> {
  const stored = await store.get<unknown>(DISPLAY_CURRENCY_KEY);
  return typeof stored === "string" && DISPLAY_CURRENCIES.includes(stored as DisplayCurrency)
    ? stored as DisplayCurrency
    : DEFAULT_DISPLAY_CURRENCY;
}

export async function saveDisplayCurrency(currency: DisplayCurrency): Promise<void> {
  await store.set(DISPLAY_CURRENCY_KEY, currency);
  await store.save();
}

export const MULTI_TRAY_DISPLAY_MODE_OPTIONS: { value: MultiTrayDisplayMode; label: string }[] = [
  { value: "percent", label: "Numbers" },
  { value: "bars", label: "Bars" },
];

export const MENUBAR_ICON_STYLE_OPTIONS: { value: MenubarIconStyle; label: string }[] = [
  { value: "dual", label: "Dual" },
  { value: "provider", label: "Plugin" },
  { value: "donut", label: "Donut" },
  { value: "bars", label: "Bars" },
  { value: "multi", label: "Multi" },
];

export const MENUBAR_METRIC_OPTIONS: { value: MenubarMetric; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "weekly", label: "Weekly" },
];

export const MENUBAR_ACTIVITY_ROTATION_SPEED_OPTIONS: {
  value: MenubarActivityRotationSpeed;
  label: string;
  periodMs: number;
}[] = [
  { value: "slow", label: "Slow", periodMs: 2_000 },
  { value: "standard", label: "Standard", periodMs: 1_200 },
  { value: "fast", label: "Fast", periodMs: 800 },
];

export const MENUBAR_ACTIVITY_ROTATION_PERIOD_MS: Record<MenubarActivityRotationSpeed, number> =
  Object.fromEntries(
    MENUBAR_ACTIVITY_ROTATION_SPEED_OPTIONS.map((option) => [option.value, option.periodMs]),
  ) as Record<MenubarActivityRotationSpeed, number>;

export const AUTO_UPDATE_OPTIONS: { value: AutoUpdateIntervalMinutes; label: string }[] =
  AUTO_UPDATE_INTERVALS.map((value) => ({
    value,
    label: value === 60 ? "1 hour" : `${value} min`,
  }));

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] =
  THEME_MODES.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

export const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "used", label: "Used" },
];

export const RESET_TIMER_DISPLAY_OPTIONS: { value: ResetTimerDisplayMode; label: string }[] = [
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
];

export async function loadAppLanguage(): Promise<AppLanguage> {
  const stored = await store.get<unknown>(APP_LANGUAGE_KEY);
  return isAppLanguage(stored) ? stored : DEFAULT_APP_LANGUAGE;
}

export async function saveAppLanguage(language: AppLanguage): Promise<void> {
  await store.set(APP_LANGUAGE_KEY, language);
  await store.save();
}

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  order: [],
  disabled: [],
};

export async function loadPluginSettings(): Promise<PluginSettings> {
  const stored = await store.get<PluginSettings>(PLUGIN_SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_PLUGIN_SETTINGS };
  return {
    order: Array.isArray(stored.order) ? stored.order : [],
    disabled: Array.isArray(stored.disabled) ? stored.disabled : [],
  };
}

export async function savePluginSettings(settings: PluginSettings): Promise<void> {
  await store.set(PLUGIN_SETTINGS_KEY, settings);
  await store.save();
}

function isAutoUpdateInterval(value: unknown): value is AutoUpdateIntervalMinutes {
  return (
    typeof value === "number" &&
    AUTO_UPDATE_INTERVALS.includes(value as AutoUpdateIntervalMinutes)
  );
}

export async function loadAutoUpdateInterval(): Promise<AutoUpdateIntervalMinutes> {
  const stored = await store.get<unknown>(AUTO_UPDATE_SETTINGS_KEY);
  if (isAutoUpdateInterval(stored)) return stored;
  return DEFAULT_AUTO_UPDATE_INTERVAL;
}

export async function saveAutoUpdateInterval(
  interval: AutoUpdateIntervalMinutes
): Promise<void> {
  await store.set(AUTO_UPDATE_SETTINGS_KEY, interval);
  await store.save();
}

export function normalizePluginSettings(
  settings: PluginSettings,
  plugins: PluginMeta[]
): PluginSettings {
  const knownIds = plugins.map((plugin) => plugin.id);
  const knownSet = new Set(knownIds);

  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of settings.order) {
    if (!knownSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const newlyAdded: string[] = [];
  for (const id of knownIds) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
      newlyAdded.push(id);
    }
  }

  const disabled = settings.disabled.filter((id) => id !== "codex" && knownSet.has(id));
  // Codex must keep checking even before its first sign-in.
  for (const id of newlyAdded) {
    const plugin = plugins.find((p) => p.id === id);
    const isDetected = plugin?.detected ?? false;
    if (id !== "codex" && !isDetected && !disabled.includes(id)) {
      disabled.push(id);
    }
  }
  return { order, disabled };
}

export function arePluginSettingsEqual(
  a: PluginSettings,
  b: PluginSettings
): boolean {
  if (a.order.length !== b.order.length) return false;
  if (a.disabled.length !== b.disabled.length) return false;
  for (let i = 0; i < a.order.length; i += 1) {
    if (a.order[i] !== b.order[i]) return false;
  }
  for (let i = 0; i < a.disabled.length; i += 1) {
    if (a.disabled[i] !== b.disabled[i]) return false;
  }
  return true;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const stored = await store.get<unknown>(THEME_MODE_KEY);
  if (isThemeMode(stored)) return stored;
  return DEFAULT_THEME_MODE;
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await store.set(THEME_MODE_KEY, mode);
  await store.save();
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === "string" && DISPLAY_MODES.includes(value as DisplayMode);
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  const stored = await store.get<unknown>(DISPLAY_MODE_KEY);
  if (isDisplayMode(stored)) return stored;
  return DEFAULT_DISPLAY_MODE;
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  await store.set(DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isResetTimerDisplayMode(value: unknown): value is ResetTimerDisplayMode {
  return (
    typeof value === "string" &&
    RESET_TIMER_DISPLAY_MODES.includes(value as ResetTimerDisplayMode)
  );
}

export async function loadResetTimerDisplayMode(): Promise<ResetTimerDisplayMode> {
  const stored = await store.get<unknown>(RESET_TIMER_DISPLAY_MODE_KEY);
  if (isResetTimerDisplayMode(stored)) return stored;
  return DEFAULT_RESET_TIMER_DISPLAY_MODE;
}

export async function saveResetTimerDisplayMode(mode: ResetTimerDisplayMode): Promise<void> {
  await store.set(RESET_TIMER_DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isMenubarIconStyle(value: unknown): value is MenubarIconStyle {
  return (
    typeof value === "string" &&
    MENUBAR_ICON_STYLES.includes(value as MenubarIconStyle)
  );
}

export async function loadMenubarIconStyle(): Promise<MenubarIconStyle> {
  const stored = await store.get<unknown>(MENUBAR_ICON_STYLE_KEY);
  if (isMenubarIconStyle(stored)) return stored;
  return DEFAULT_MENUBAR_ICON_STYLE;
}

export async function saveMenubarIconStyle(style: MenubarIconStyle): Promise<void> {
  await store.set(MENUBAR_ICON_STYLE_KEY, style);
  await store.save();
}

function isMultiTrayProviderCount(value: unknown): value is MultiTrayProviderCount {
  return (
    typeof value === "number" &&
    MULTI_TRAY_PROVIDER_COUNTS.includes(value as MultiTrayProviderCount)
  );
}

export function cycleMultiTrayProviderCount(
  current: MultiTrayProviderCount,
): MultiTrayProviderCount {
  if (current === 2) return 3;
  if (current === 3) return 4;
  return 2;
}

export async function loadMultiTrayProviderCount(): Promise<MultiTrayProviderCount> {
  const stored = await store.get<unknown>(MULTI_TRAY_PROVIDER_COUNT_KEY);
  if (isMultiTrayProviderCount(stored)) return stored;
  return DEFAULT_MULTI_TRAY_PROVIDER_COUNT;
}

export async function saveMultiTrayProviderCount(
  count: MultiTrayProviderCount,
): Promise<void> {
  await store.set(MULTI_TRAY_PROVIDER_COUNT_KEY, count);
  await store.save();
}

function isMultiTrayDisplayMode(value: unknown): value is MultiTrayDisplayMode {
  return (
    typeof value === "string" &&
    MULTI_TRAY_DISPLAY_MODES.includes(value as MultiTrayDisplayMode)
  );
}

export async function loadMultiTrayDisplayMode(): Promise<MultiTrayDisplayMode> {
  const stored = await store.get<unknown>(MULTI_TRAY_DISPLAY_MODE_KEY);
  if (isMultiTrayDisplayMode(stored)) return stored;
  return DEFAULT_MULTI_TRAY_DISPLAY_MODE;
}

export async function saveMultiTrayDisplayMode(
  mode: MultiTrayDisplayMode,
): Promise<void> {
  await store.set(MULTI_TRAY_DISPLAY_MODE_KEY, mode);
  await store.save();
}

function isMenubarMetric(value: unknown): value is MenubarMetric {
  return typeof value === "string" && MENUBAR_METRICS.includes(value as MenubarMetric);
}

export async function loadMenubarMetric(): Promise<MenubarMetric> {
  const stored = await store.get<unknown>(MENUBAR_METRIC_KEY);
  if (isMenubarMetric(stored)) return stored;
  return DEFAULT_MENUBAR_METRIC;
}

export async function saveMenubarMetric(metric: MenubarMetric): Promise<void> {
  await store.set(MENUBAR_METRIC_KEY, metric);
  await store.save();
}

function isMenubarActivityRotationSpeed(value: unknown): value is MenubarActivityRotationSpeed {
  return (
    typeof value === "string" &&
    MENUBAR_ACTIVITY_ROTATION_SPEEDS.includes(value as MenubarActivityRotationSpeed)
  );
}

export async function loadMenubarActivityRotationSpeed(): Promise<MenubarActivityRotationSpeed> {
  const stored = await store.get<unknown>(MENUBAR_ACTIVITY_ROTATION_SPEED_KEY);
  if (isMenubarActivityRotationSpeed(stored)) return stored;
  return DEFAULT_MENUBAR_ACTIVITY_ROTATION_SPEED;
}

export async function saveMenubarActivityRotationSpeed(
  speed: MenubarActivityRotationSpeed,
): Promise<void> {
  await store.set(MENUBAR_ACTIVITY_ROTATION_SPEED_KEY, speed);
  await store.save();
}

function normalizePaceNotifications(value: unknown): PaceNotificationSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const readBool = (key: keyof PaceNotificationSettings) =>
    typeof record[key] === "boolean"
      ? (record[key] as boolean)
      : DEFAULT_PACE_NOTIFICATION_SETTINGS[key];
  return {
    underTenPercent: readBool("underTenPercent"),
    sessionReset: readBool("sessionReset"),
  };
}

export async function loadPaceNotificationSettings(): Promise<PaceNotificationSettings> {
  const stored = await store.get<unknown>(PACE_NOTIFICATIONS_KEY);
  return normalizePaceNotifications(stored);
}

export async function savePaceNotificationSettings(
  settings: PaceNotificationSettings
): Promise<void> {
  await store.set(PACE_NOTIFICATIONS_KEY, settings);
  await store.save();
}

const OVERVIEW_GRAPH_STYLES: OverviewGraphStyle[] = ["bar", "donut"];
const OVERVIEW_GRAPH_GROUP_BY: OverviewGraphGroupBy[] = ["model", "provider"];
const OVERVIEW_STRIP_METRICS: OverviewStripMetric[] = ["price", "usage"];

function isOverviewGraphStyle(value: unknown): value is OverviewGraphStyle {
  if (typeof value !== "string") return false;
  if (OVERVIEW_GRAPH_STYLES.includes(value as OverviewGraphStyle)) return true;
  // Migrate the retired compact/detailed values.
  return value === "compact" || value === "detailed";
}

function normalizeOverviewGraphStyle(value: unknown): OverviewGraphStyle {
  if (value === "compact" || value === "bar") return "bar";
  if (value === "detailed" || value === "donut") return "donut";
  return DEFAULT_OVERVIEW_GRAPH_STYLE;
}

function isOverviewGraphGroupBy(value: unknown): value is OverviewGraphGroupBy {
  return (
    typeof value === "string" &&
    OVERVIEW_GRAPH_GROUP_BY.includes(value as OverviewGraphGroupBy)
  );
}

export async function loadOverviewGraphStyle(): Promise<OverviewGraphStyle> {
  const stored = await store.get<unknown>(OVERVIEW_GRAPH_STYLE_KEY);
  if (isOverviewGraphStyle(stored)) return normalizeOverviewGraphStyle(stored);
  return DEFAULT_OVERVIEW_GRAPH_STYLE;
}

export async function saveOverviewGraphStyle(style: OverviewGraphStyle): Promise<void> {
  await store.set(OVERVIEW_GRAPH_STYLE_KEY, style);
  await store.save();
}

export async function loadOverviewGraphGroupBy(): Promise<OverviewGraphGroupBy> {
  const stored = await store.get<unknown>(OVERVIEW_GRAPH_GROUP_BY_KEY);
  if (isOverviewGraphGroupBy(stored)) return stored;
  return DEFAULT_OVERVIEW_GRAPH_GROUP_BY;
}

export async function saveOverviewGraphGroupBy(groupBy: OverviewGraphGroupBy): Promise<void> {
  await store.set(OVERVIEW_GRAPH_GROUP_BY_KEY, groupBy);
  await store.save();
}

function isOverviewStripMetric(value: unknown): value is OverviewStripMetric {
  return (
    typeof value === "string" &&
    OVERVIEW_STRIP_METRICS.includes(value as OverviewStripMetric)
  );
}

export async function loadOverviewStripMetric(): Promise<OverviewStripMetric> {
  const stored = await store.get<unknown>(OVERVIEW_STRIP_METRIC_KEY);
  if (isOverviewStripMetric(stored)) return stored;
  return DEFAULT_OVERVIEW_STRIP_METRIC;
}

export async function saveOverviewStripMetric(metric: OverviewStripMetric): Promise<void> {
  await store.set(OVERVIEW_STRIP_METRIC_KEY, metric);
  await store.save();
}

export async function loadOverviewSpendStripEnabled(): Promise<boolean> {
  const stored = await store.get<unknown>(OVERVIEW_SPEND_STRIP_ENABLED_KEY);
  if (typeof stored === "boolean") return stored;
  return DEFAULT_OVERVIEW_SPEND_STRIP_ENABLED;
}

export async function saveOverviewSpendStripEnabled(value: boolean): Promise<void> {
  await store.set(OVERVIEW_SPEND_STRIP_ENABLED_KEY, value);
  await store.save();
}

type LegacyStoreWithDelete = {
  delete?: (key: string) => Promise<void>;
};

async function deleteStoreKey(key: string): Promise<void> {
  const maybeDelete = (store as unknown as LegacyStoreWithDelete).delete;
  if (typeof maybeDelete === "function") {
    await maybeDelete.call(store, key);
    return;
  }
  // Fallback for store implementations without delete support.
  await store.set(key, null);
}

export async function migrateLegacyTraySettings(): Promise<void> {
  const [legacyTrayStyle, legacyShowPercentage, currentMenubarStyle] = await Promise.all([
    store.get<unknown>(LEGACY_TRAY_ICON_STYLE_KEY),
    store.get<unknown>(LEGACY_TRAY_SHOW_PERCENTAGE_KEY),
    store.get<unknown>(MENUBAR_ICON_STYLE_KEY),
  ]);

  const hasLegacyTrayStyle = legacyTrayStyle != null;
  const hasLegacyShowPercentage = legacyShowPercentage != null;
  if (!hasLegacyTrayStyle && !hasLegacyShowPercentage) return;

  if (hasLegacyTrayStyle && currentMenubarStyle == null) {
    if (legacyTrayStyle === "bars") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "bars");
    } else if (legacyTrayStyle === "circle") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "donut");
    }
  }

  const removals: Promise<void>[] = [];
  if (hasLegacyTrayStyle) removals.push(deleteStoreKey(LEGACY_TRAY_ICON_STYLE_KEY));
  if (hasLegacyShowPercentage) removals.push(deleteStoreKey(LEGACY_TRAY_SHOW_PERCENTAGE_KEY));
  await Promise.all(removals);
  await store.save();
}

export function getEnabledPluginIds(settings: PluginSettings): string[] {
  const disabledSet = new Set(settings.disabled);
  return settings.order.filter((id) => id === "codex" || !disabledSet.has(id));
}

function isGlobalShortcut(value: unknown): value is GlobalShortcut {
  if (value === null) return true;
  return typeof value === "string";
}

export async function loadGlobalShortcut(): Promise<GlobalShortcut> {
  const stored = await store.get<unknown>(GLOBAL_SHORTCUT_KEY);
  if (isGlobalShortcut(stored)) return stored;
  return DEFAULT_GLOBAL_SHORTCUT;
}

export async function saveGlobalShortcut(shortcut: GlobalShortcut): Promise<void> {
  await store.set(GLOBAL_SHORTCUT_KEY, shortcut);
  await store.save();
}

export async function loadStartOnLogin(): Promise<boolean> {
  const stored = await store.get<unknown>(START_ON_LOGIN_KEY);
  if (typeof stored === "boolean") return stored;
  return DEFAULT_START_ON_LOGIN;
}

export async function saveStartOnLogin(value: boolean): Promise<void> {
  await store.set(START_ON_LOGIN_KEY, value);
  await store.save();
}

export async function loadOnboardingCompleted(): Promise<boolean> {
  const stored = await store.get<unknown>(ONBOARDING_COMPLETED_KEY);
  if (typeof stored === "boolean") return stored;
  return DEFAULT_ONBOARDING_COMPLETED;
}

export async function saveOnboardingCompleted(value: boolean): Promise<void> {
  await store.set(ONBOARDING_COMPLETED_KEY, value);
  await store.set(ONBOARDING_COMPLETED_AT_KEY, value ? Date.now() : null);
  await store.save();
}

export async function resetOnboardingCompleted(): Promise<void> {
  await deleteStoreKey(ONBOARDING_COMPLETED_KEY);
  await deleteStoreKey(ONBOARDING_COMPLETED_AT_KEY);
  await store.save();
}

export async function loadOnboardingGuidePending(): Promise<boolean> {
  const stored = await store.get<unknown>(ONBOARDING_GUIDE_PENDING_KEY);
  return stored === true;
}

export async function loadOnboardingGuideRequired(): Promise<boolean> {
  const stored = await store.get<unknown>(ONBOARDING_GUIDE_REQUIRED_KEY);
  return stored === true;
}

export async function dismissOnboardingGuide(finished: boolean): Promise<void> {
  await store.set(ONBOARDING_GUIDE_PENDING_KEY, false);
  if (finished) {
    const finishedAt = Date.now();
    await store.set(ONBOARDING_GUIDE_REQUIRED_KEY, false);
    await store.set(ONBOARDING_GUIDE_COMPLETED_AT_KEY, finishedAt);
    await store.set(ONBOARDING_GUIDE_FINISHED_AT_KEY, finishedAt);
  }
  await store.save();
}
