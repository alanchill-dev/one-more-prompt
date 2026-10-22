import { useState, type ReactNode } from "react"
import { Palette } from "@phosphor-icons/react"
import { ModelColorInspector } from "@/components/model-color-inspector"
import { Checkbox } from "@/components/ui/checkbox"
import { GlobalShortcutSection } from "@/components/global-shortcut-section"
import { LanguagePicker } from "@/components/language-picker"
import { NotificationsSection } from "@/components/notifications-section"
import { PricingSettingsSection } from "@/components/pricing-settings-section"
import { SettingsAdvancedSection } from "@/components/settings-advanced-section"
import { AppUpdateSettings } from "@/components/app-update"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useI18n } from "@/hooks/use-i18n"
import { useModelColorPreferences } from "@/hooks/use-model-color-preferences"
import { DEFAULT_APP_LANGUAGE, type AppLanguage } from "@/lib/i18n"
import {
  DEFAULT_WINDOW_WIDTH,
  WINDOW_WIDTH_PRESETS,
  type WindowWidth,
} from "@/lib/window"
import {
  AUTO_UPDATE_OPTIONS,
  MENUBAR_ICON_STYLE_OPTIONS,
  MENUBAR_ACTIVITY_ROTATION_SPEED_OPTIONS,
  MENUBAR_METRIC_OPTIONS,
  THEME_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type GlobalShortcut,
  type MenubarIconStyle,
  type MenubarActivityRotationSpeed,
  type MenubarMetric,
  type ThemeMode,
} from "@/lib/settings"
import {
  MODEL_PALETTE_SLOT_COUNT,
  resolvedPaletteSurfaceColor,
} from "@/lib/model-colors"
import { cn } from "@/lib/utils"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { isWindowsTrayRuntime } from "@/hooks/app/use-tray-icon"

interface SettingsPageProps {
  language?: AppLanguage
  onLanguageChange?: (value: AppLanguage) => void
  windowWidth?: WindowWidth
  onWindowWidthChange?: (value: WindowWidth) => void
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  menubarIconStyle: MenubarIconStyle
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  dualQuotaAvailable?: boolean
  menubarActivityRotationSpeed?: MenubarActivityRotationSpeed
  onMenubarActivityRotationSpeedChange?: (value: MenubarActivityRotationSpeed) => void
  menubarMetric: MenubarMetric
  onMenubarMetricChange: (value: MenubarMetric) => void
  globalShortcut: GlobalShortcut
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  startOnLogin: boolean
  onStartOnLoginChange: (value: boolean) => void
  autoUpdateNextAt?: number | null
  onRefreshAll?: () => void
  appVersion?: string
  onShowAbout?: () => void
}

type Option<T extends string | number> = { label: string; value: T }

function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap gap-1 rounded-[12px] border border-border/70 bg-muted/45 p-1"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(
              "min-h-9 cursor-pointer whitespace-nowrap rounded-[8px] px-3 text-[13px] font-medium",
              "transition-[background-color,color,box-shadow] duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/75"
                : "text-muted-foreground hover:bg-background/55 hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-5 border-b border-border/70 px-5 py-6 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 md:px-7 md:py-7">
      <div className="self-start md:sticky md:top-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</h3>
        <p className="mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function SettingsRow({
  title,
  description,
  children,
  last = false,
}: {
  title: string
  description?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        "grid min-h-[76px] items-center gap-3 py-4 lg:grid-cols-[minmax(150px,0.72fr)_minmax(260px,1.28fr)] lg:gap-6",
        !last && "border-b border-border/60",
      )}
    >
      <div>
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        {description ? (
          <p className="mt-0.5 max-w-[46ch] text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0 lg:justify-self-end">{children}</div>
    </div>
  )
}

function WindowWidthControl({
  value,
  onChange,
}: {
  value: WindowWidth
  onChange: (value: WindowWidth) => void
}) {
  const t = useI18n()
  const options = [
    { value: WINDOW_WIDTH_PRESETS[0], label: t("settings.windowWidth.compact") },
    { value: WINDOW_WIDTH_PRESETS[1], label: t("settings.windowWidth.comfortable") },
    { value: WINDOW_WIDTH_PRESETS[2], label: t("settings.windowWidth.wide") },
  ] as const

  return (
    <SegmentedControl
      label={t("settings.windowWidth.groupLabel")}
      options={options}
      value={value}
      onChange={onChange}
    />
  )
}

function RefreshCountdown({ autoUpdateNextAt, onRefreshAll }: { autoUpdateNextAt: number | null; onRefreshAll: () => void }) {
  const t = useI18n()
  const now = useNowTicker({ enabled: autoUpdateNextAt !== null, resetKey: autoUpdateNextAt })
  const countdownLabel = (() => {
    if (autoUpdateNextAt === null) return t("footer.paused")
    const totalSeconds = Math.ceil(Math.max(0, autoUpdateNextAt - now) / 1000)
    return totalSeconds >= 60
      ? t("footer.nextUpdateMinutes", { minutes: Math.ceil(totalSeconds / 60) })
      : t("footer.nextUpdateSeconds", { seconds: totalSeconds })
  })()

  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.blur()
        onRefreshAll()
      }}
      className="min-h-11 shrink-0 rounded-[10px] border border-border/70 bg-background/70 px-3 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      title={t("footer.refreshNow")}
    >
      {countdownLabel}
    </button>
  )
}

export function SettingsPage({
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  dualQuotaAvailable = false,
  menubarActivityRotationSpeed = "standard",
  onMenubarActivityRotationSpeedChange = () => {},
  menubarMetric,
  onMenubarMetricChange,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
  language = DEFAULT_APP_LANGUAGE,
  onLanguageChange = () => {},
  windowWidth = DEFAULT_WINDOW_WIDTH,
  onWindowWidthChange = () => {},
  autoUpdateNextAt = null,
  onRefreshAll = () => {},
  appVersion = "",
  onShowAbout = () => {},
}: SettingsPageProps) {
  const t = useI18n(language)
  const isDark = useDarkMode()
  const isWindowsTray = isWindowsTrayRuntime(window.navigator.userAgent)
  const { preferences: modelColorPreferences, hydrated: modelColorsHydrated } = useModelColorPreferences()
  const [modelColorInspectorOpen, setModelColorInspectorOpen] = useState(false)
  const [modelColorInspectorSlot, setModelColorInspectorSlot] = useState(0)
  const autoUpdateOptions = AUTO_UPDATE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.value === 60
      ? t("settings.autoUpdate.hour")
      : t("settings.autoUpdate.minutes", { value: option.value }),
  }))
  const themeOptions = THEME_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`settings.theme.${option.value}` as "settings.theme.system" | "settings.theme.light" | "settings.theme.dark"),
  }))
  const menubarMetricOptions = MENUBAR_METRIC_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.value === "weekly" ? "settings.menubar.weekly" : "settings.menubar.default"),
  }))
  const menubarActivityRotationSpeedOptions = MENUBAR_ACTIVITY_ROTATION_SPEED_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`settings.menubarActivity.${option.value}` as "settings.menubarActivity.slow" | "settings.menubarActivity.standard" | "settings.menubarActivity.fast"),
  }))
  const iconOptions = MENUBAR_ICON_STYLE_OPTIONS
    .filter((option) => option.value !== "multi" && (option.value !== "dual" || (dualQuotaAvailable && !isWindowsTray)))
    .map((option) => ({
      value: option.value,
      label: t(option.value === "provider"
        ? isWindowsTray ? "tray.preview.numbers" : "settings.menubar.plugin"
        : option.value === "dual"
          ? "settings.menubar.dual"
        : option.value === "donut"
          ? "settings.menubar.donut"
          : "settings.menubar.bars"),
    }))
  const visibleMenubarIconStyle = menubarIconStyle === "multi" || (menubarIconStyle === "dual" && (!dualQuotaAvailable || isWindowsTray))
    ? "provider"
    : menubarIconStyle

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4 pb-8">
      <header className="space-y-2 px-1">
        <h2 className="text-[28px] font-semibold tracking-[-0.035em] text-foreground">
          {t("settings.title")}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("settings.description")}
        </p>
      </header>

      <div className="settings-console overflow-hidden rounded-[20px] border border-border/80">
        <SettingsGroup title={t("settings.general.title")} description={t("settings.general.description")}>
          <SettingsRow title={t("settings.refresh.title")} description={t("settings.refresh.description")}>
            <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
              <SegmentedControl
                label={t("settings.autoUpdate.groupLabel")}
                options={autoUpdateOptions}
                value={autoUpdateInterval}
                onChange={onAutoUpdateIntervalChange}
              />
              <RefreshCountdown autoUpdateNextAt={autoUpdateNextAt} onRefreshAll={onRefreshAll} />
            </div>
          </SettingsRow>
          <SettingsRow title={t("settings.login.title")} description={t("settings.login.description")}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-border/70 bg-background/70 px-3 py-2 text-sm transition-colors duration-200 hover:bg-background">
              <Checkbox
                key={`start-on-login-${startOnLogin}`}
                aria-label={t("settings.startOnLogin")}
                checked={startOnLogin}
                onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
              />
              <span className={cn("font-medium", startOnLogin ? "text-foreground" : "text-muted-foreground")}>
                {t("settings.startOnLogin")}
              </span>
            </label>
          </SettingsRow>
          <SettingsRow title={t("settings.language.title")} description={t("settings.language.description")} last>
            <LanguagePicker
              label={t("settings.language.title")}
              value={language}
              onValueChange={onLanguageChange}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title={t("settings.displayGroup.title")} description={t("settings.displayGroup.description")}>
          <SettingsRow title={t("settings.appearance.title")} description={t("settings.appearance.description")}>
            <SegmentedControl
              label={t("settings.theme.groupLabel")}
              options={themeOptions}
              value={themeMode}
              onChange={onThemeModeChange}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.windowWidth.title")} description={t("settings.windowWidth.description")}>
            <WindowWidthControl value={windowWidth} onChange={onWindowWidthChange} />
          </SettingsRow>
          <SettingsRow title={t("settings.modelColors.title")} description={t("settings.modelColors.description")} last>
            <div className="flex min-h-11 flex-wrap items-center justify-end gap-2.5">
              <div className="flex items-end gap-1.5" aria-label={t("settings.modelColors.title")}>
                {Array.from({ length: MODEL_PALETTE_SLOT_COUNT }, (_, index) => (
                  <span key={index} className="flex flex-col items-center gap-1" title={`${t("modelColors.slot")} ${index + 1}`}>
                    <span className="text-[8px] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                    <span
                      className="size-5 rounded-full border border-border/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      style={{ backgroundColor: resolvedPaletteSurfaceColor(index, modelColorPreferences, isDark ? "dark" : "light") }}
                      aria-hidden="true"
                    />
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={!modelColorsHydrated}
                className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border/70 bg-background/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-wait disabled:opacity-50"
                onClick={() => setModelColorInspectorOpen(true)}
              >
                <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("settings.modelColors.manage")}
              </button>
            </div>
          </SettingsRow>
        </SettingsGroup>

        <PricingSettingsSection />

        <SettingsGroup title={t("settings.quickOpen.title")} description={t("settings.quickOpen.description")}>
          <SettingsRow title={t("settings.menubarIcon.title")} description={t(isWindowsTray ? "tray.preview.windowsHint" : "settings.menubarIcon.description")}>
            <SegmentedControl
              label={t("settings.menubarIcon.groupLabel")}
              options={iconOptions}
              value={visibleMenubarIconStyle}
              onChange={onMenubarIconStyleChange}
            />
          </SettingsRow>
          {visibleMenubarIconStyle === "dual" ? null : (
            <SettingsRow title={t("settings.menubarMetric.title")} description={t("settings.menubarMetric.description")}>
              <SegmentedControl
                label={t("settings.menubarMetric.groupLabel")}
                options={menubarMetricOptions}
                value={menubarMetric}
                onChange={onMenubarMetricChange}
              />
            </SettingsRow>
          )}
          <SettingsRow title={t("settings.menubarActivity.title")} description={t("settings.menubarActivity.description")}>
            <SegmentedControl
              label={t("settings.menubarActivity.groupLabel")}
              options={menubarActivityRotationSpeedOptions}
              value={menubarActivityRotationSpeed}
              onChange={onMenubarActivityRotationSpeedChange}
            />
          </SettingsRow>
          <SettingsRow title={t("settings.usageAlerts.title")} description={t("settings.usageAlerts.description")}>
            <NotificationsSection triggerLabel={t("settings.usageAlerts.manage")} />
          </SettingsRow>
          <SettingsRow title={t("settings.shortcut.title")} description={t("settings.shortcut.description")} last>
            <GlobalShortcutSection
              globalShortcut={globalShortcut}
              onGlobalShortcutChange={onGlobalShortcutChange}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title={t("settings.support.title")} description={t("settings.support.description")}>
          <SettingsRow title={t("updates.title")} description={t("updates.automatic")}>
            <AppUpdateSettings appVersion={appVersion} />
          </SettingsRow>
          <SettingsRow title={t("settings.about.title")} description={t("settings.about.description")}>
            <button
              type="button"
              onClick={onShowAbout}
              className="min-h-11 rounded-[10px] border border-border/70 bg-background/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-background"
            >
              {t("app.name")} {appVersion}
            </button>
          </SettingsRow>
          <SettingsAdvancedSection />
        </SettingsGroup>
      </div>

      <ModelColorInspector
        open={modelColorInspectorOpen}
        onClose={() => setModelColorInspectorOpen(false)}
        activeSlotIndex={modelColorInspectorSlot}
        onActiveSlotIndexChange={setModelColorInspectorSlot}
        testId="settings-model-color-inspector"
      />
    </div>
  )
}
