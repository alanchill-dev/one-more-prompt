import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { OverviewPage } from "@/pages/overview"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type {
  AutoUpdateIntervalMinutes,
  GlobalShortcut,
  MenubarIconStyle,
  MenubarActivityRotationSpeed,
  MenubarMetric,
  ThemeMode,
} from "@/lib/settings"
import type { AppLanguage } from "@/lib/i18n"
import type { WindowWidth } from "@/lib/window"
import { useI18n } from "@/hooks/use-i18n"
import { hasTrayDualQuotaData } from "@/lib/tray-primary-progress"

const PromptUsagePage = lazy(() =>
  import("@/pages/prompt-usage").then((module) => ({ default: module.PromptUsagePage }))
)
const SettingsPage = lazy(() =>
  import("@/pages/settings").then((module) => ({ default: module.SettingsPage }))
)

function DeferredPage({ children, loadingLabel }: { children: ReactNode; loadingLabel: string }) {
  return (
    <Suspense
      fallback={(
        <div className="grid min-h-48 place-items-center text-sm text-muted-foreground" role="status">
          {loadingLabel}
        </div>
      )}
    >
      {children}
    </Suspense>
  )
}

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[]
  windowWidth: WindowWidth
  onWindowWidthChange: (value: WindowWidth) => void
}

export type AppContentActionProps = {
  onRetryPlugin: (id: string) => void
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onUsageValueToggle: () => void
  onResetTimerDisplayModeToggle: () => void
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  onMenubarActivityRotationSpeedChange?: (value: MenubarActivityRotationSpeed) => void
  onMenubarMetricChange: (value: MenubarMetric) => void
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  onStartOnLoginChange: (value: boolean) => void
  onLanguageChange: (value: AppLanguage) => void
}

export type AppContentRuntimeProps = {
  autoUpdateNextAt: number | null
  onRefreshAll: () => void
  appVersion: string
  onShowAbout: () => void
}

export type AppContentProps = AppContentDerivedProps & AppContentActionProps & Partial<AppContentRuntimeProps>

export function AppContent({
  displayPlugins,
  onRetryPlugin,
  onAutoUpdateIntervalChange,
  onThemeModeChange,
  onUsageValueToggle,
  onResetTimerDisplayModeToggle,
  onMenubarIconStyleChange,
  onMenubarActivityRotationSpeedChange = () => {},
  onMenubarMetricChange,
  onGlobalShortcutChange,
  onStartOnLoginChange,
  onLanguageChange,
  windowWidth,
  onWindowWidthChange,
  autoUpdateNextAt = null,
  onRefreshAll = () => {},
  appVersion = "",
  onShowAbout = () => {},
}: AppContentProps) {
  const t = useI18n()
  const activeView = useAppUiStore((state) => state.activeView)
  const [promptUsageVisited, setPromptUsageVisited] = useState(activeView === "prompt-usage")

  useEffect(() => {
    if (activeView === "prompt-usage") setPromptUsageVisited(true)
  }, [activeView])

  const {
    displayMode,
    resetTimerDisplayMode,
    menubarIconStyle,
    menubarActivityRotationSpeed,
    menubarMetric,
    autoUpdateInterval,
    globalShortcut,
    themeMode,
    startOnLogin,
    language,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      displayMode: state.displayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      menubarActivityRotationSpeed: state.menubarActivityRotationSpeed,
      menubarMetric: state.menubarMetric,
      autoUpdateInterval: state.autoUpdateInterval,
      globalShortcut: state.globalShortcut,
      themeMode: state.themeMode,
      startOnLogin: state.startOnLogin,
      language: state.language,
    }))
  )

  const codexPlugin = displayPlugins.find((plugin) => plugin.meta.id === "codex") ?? null

  let activePage: ReactNode = null

  if (activeView === "home") {
    activePage = (
      <OverviewPage
        plugin={codexPlugin}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
        onUsageValueToggle={onUsageValueToggle}
      />
    )
  } else if (activeView === "settings") {
    activePage = (
      <DeferredPage loadingLabel={t("common.loadingView")}>
        <SettingsPage
          language={language}
          onLanguageChange={onLanguageChange}
          windowWidth={windowWidth}
          onWindowWidthChange={onWindowWidthChange}
          autoUpdateInterval={autoUpdateInterval}
          onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          menubarIconStyle={menubarIconStyle}
          onMenubarIconStyleChange={onMenubarIconStyleChange}
          dualQuotaAvailable={hasTrayDualQuotaData(codexPlugin?.meta, codexPlugin?.data)}
          menubarActivityRotationSpeed={menubarActivityRotationSpeed}
          onMenubarActivityRotationSpeedChange={onMenubarActivityRotationSpeedChange}
          menubarMetric={menubarMetric}
          onMenubarMetricChange={onMenubarMetricChange}
          globalShortcut={globalShortcut}
          onGlobalShortcutChange={onGlobalShortcutChange}
          startOnLogin={startOnLogin}
          onStartOnLoginChange={onStartOnLoginChange}
          autoUpdateNextAt={autoUpdateNextAt}
          onRefreshAll={onRefreshAll}
          appVersion={appVersion}
          onShowAbout={onShowAbout}
        />
      </DeferredPage>
    )
  }

  return (
    <>
      {promptUsageVisited || activeView === "prompt-usage" ? (
        <div
          className={activeView === "prompt-usage" ? "contents" : "hidden"}
          aria-hidden={activeView !== "prompt-usage"}
          data-testid="prompt-usage-view"
        >
          <DeferredPage loadingLabel={t("common.loadingView")}>
            <PromptUsagePage plugin={codexPlugin} onRetryPlugin={onRetryPlugin} />
          </DeferredPage>
        </div>
      ) : null}
      {activeView === "prompt-usage" ? null : activePage}
    </>
  )
}
