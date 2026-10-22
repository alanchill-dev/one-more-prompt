import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppContent, type AppContentActionProps } from "@/components/app/app-content"
import { ContextualGuide } from "@/components/app/contextual-guide"
import { AboutDialog } from "@/components/about-dialog"
import { PromptUsageDrilldownTransitionLayer } from "@/components/prompt-usage-drilldown-transition"
import { useWorkspacePageMotion } from "@/hooks/app/use-workspace-page-motion"
import { TopHeader } from "@/components/side-nav"
import { WindowResizeHandles } from "@/components/window-resize-handles"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppVersion } from "@/hooks/app/use-app-version"
import { useAppUpdate } from "@/hooks/app/use-app-update"
import { usePanel } from "@/hooks/app/use-panel"
import { useAppUiStore } from "@/stores/app-ui-store"
import { hasActivePromptUsage } from "@/lib/prompt-usage-summary"

type AppShellProps = {
  onRefreshAll: () => void
  displayPlugins: DisplayPluginState[]
  autoUpdateNextAt: number | null
  appContentProps: AppContentActionProps
}

export function AppShell({
  onRefreshAll,
  displayPlugins,
  autoUpdateNextAt,
  appContentProps,
}: AppShellProps) {
  const {
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
    promptUsageViewMode,
    setPromptUsageViewMode,
    promptUsageDrilldownTransition,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      showAbout: state.showAbout,
      setShowAbout: state.setShowAbout,
      promptUsageViewMode: state.promptUsageViewMode,
      setPromptUsageViewMode: state.setPromptUsageViewMode,
      promptUsageDrilldownTransition: state.promptUsageDrilldownTransition,
    }))
  )

  const { containerRef, scrollContainerRef, panelWidth, setPanelWidth, isPinned, setPanelPinned } = usePanel({
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
  })

  const pageKey = activeView === "prompt-usage" ? `prompt-usage:${promptUsageViewMode}` : activeView
  const isPromptWorkspace = activeView === "prompt-usage"
  useWorkspacePageMotion(pageKey, scrollContainerRef, promptUsageDrilldownTransition !== null)

  const appVersion = useAppVersion()
  useAppUpdate()
  const isCodexActive = useMemo(() => {
    const codex = displayPlugins.find((plugin) => plugin.meta.id === "codex")
    return hasActivePromptUsage(codex?.data?.lines ?? [])
  }, [displayPlugins])

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative flex h-[100dvh] w-[100dvw] flex-col items-center bg-transparent p-2 pt-1 outline-none"
    >
      <WindowResizeHandles />
      <div className="app-panel-surface relative flex min-h-0 w-full flex-1 select-none flex-col overflow-hidden rounded-xl border shadow-lg shadow-black/25">
        <TopHeader
          activeView={activeView}
          onViewChange={setActiveView}
          promptUsageViewMode={promptUsageViewMode}
          onPromptUsageViewModeChange={setPromptUsageViewMode}
          isCodexActive={isCodexActive}
          isPinned={isPinned}
          onPinnedChange={setPanelPinned}
          appVersion={appVersion}
        />
        <div
          className={`app-main-surface flex min-h-0 flex-1 flex-col ${isPromptWorkspace ? "p-0" : "px-3 pt-2 pb-1.5 sm:px-4"}`}
          data-active-view={activeView}
          data-prompt-usage-view-mode={promptUsageViewMode}
        >
          <div
            ref={scrollContainerRef}
            className={`min-h-0 flex-1 ${isPromptWorkspace ? "overflow-hidden" : "overflow-y-auto scrollbar-none"}`}
          >
            <AppContent
              {...appContentProps}
              displayPlugins={displayPlugins}
              windowWidth={panelWidth}
              onWindowWidthChange={setPanelWidth}
              autoUpdateNextAt={autoUpdateNextAt}
              onRefreshAll={onRefreshAll}
              appVersion={appVersion}
              onShowAbout={() => setShowAbout(true)}
            />
          </div>
        </div>
        <PromptUsageDrilldownTransitionLayer />
        <ContextualGuide />
        {showAbout ? <AboutDialog version={appVersion} onClose={() => setShowAbout(false)} /> : null}
      </div>
    </div>
  )
}
