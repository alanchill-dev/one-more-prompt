import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { X } from "@phosphor-icons/react"
import { TopHeader } from "@/components/side-nav"
import { OverviewPage } from "@/pages/overview"
import { PromptUsageProjectBrowser } from "@/components/prompt-usage-project-browser"
import { PromptUsageTimelineExplorer } from "@/components/prompt-usage-timeline-explorer"
import { PromptUsageDrilldownTransitionLayer } from "@/components/prompt-usage-drilldown-transition"
import { AppErrorBoundary, reportFrontendError } from "@/components/app/app-error-boundary"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { getGuideCopy } from "@/lib/guide-demo/copy"
import { DEMO_NOW, FEATURED_PROMPT_ID, getGuideProjects } from "@/lib/guide-demo/fixtures"
import { makeGuideOverviewPlugin } from "@/lib/guide-demo/overview"
import type { GuideInit } from "./isolation"
import { Coach } from "./coach"
import { GuideBookend } from "./bookends"
import { GUIDE_STEPS } from "./steps"
import "@/index.css"
import "./workspace.css"
import "./guide.css"

function GuideWorkspace() {
  const language = useAppPreferencesStore(s => s.language)
  const projects = useMemo(() => getGuideProjects(language), [language])
  const counts = { prompts: projects.reduce((n, p) => n + p.promptCount, 0), sessions: projects.reduce((n, p) => n + p.sessionCount, 0) }
  const theme = useAppPreferencesStore(s => s.themeMode)
  const copy = getGuideCopy(language)
  const [step, setStep] = useState(0)
  const [reset, setReset] = useState<"relative" | "absolute">("relative")
  const [visited, setVisited] = useState({ project: false, timeline: false })
  const [complete, setComplete] = useState<number[]>([])
  const activeView = useAppUiStore(s => s.activeView)
  const mode = useAppUiStore(s => s.promptUsageViewMode)
  const view = activeView === "home" ? "overview" : mode === "timeline" ? "timeline" : "project"
  const finished = step === GUIDE_STEPS.length + 1
  const inGuide = step > 0 && !finished
  useSettingsTheme(theme)
  const exit = useCallback(() => {
    window.parent.postMessage({ type: "omp-guide-exit", finished }, "*")
  }, [finished])
  const finishAction = useCallback((n: number) => setComplete(old => old.includes(n) ? old : [...old, n]), [])
  const changeStep = useCallback((next: number) => {
    const meta = GUIDE_STEPS[next - 1]
    if (next === 0 || meta?.stage === 1) useAppUiStore.setState({ activeView: "home" })
    else if (meta?.stage === 2 || meta?.id === "timeline-entry") useAppUiStore.setState({ activeView: "prompt-usage", promptUsageViewMode: "hierarchy" })
    else if (meta) useAppUiStore.setState({ activeView: "prompt-usage", promptUsageViewMode: "timeline" })
    setStep(next)
  }, [])
  useLayoutEffect(() => {
    // Arrival starts the Project introduction instead of retargeting the completed Overview CTA.
    if (GUIDE_STEPS[step - 1]?.id === "drill" && view === "project") setStep(step + 1)
  }, [step, view])
  useEffect(() => {
    if (view !== "overview") setVisited(v => ({ ...v, [view]: true }))
  }, [view])
  const [chartNow] = useState(() => new Date(DEMO_NOW))
  const [now] = useState(Date.now)
  const plugin = makeGuideOverviewPlugin(copy.chrome.demoAccount, now)

  return <div className="app-panel-surface guide-workspace" data-guide-step={step} data-view={view}>
    <TopHeader activeView={activeView} promptUsageViewMode={mode}
      onViewChange={v => useAppUiStore.getState().setActiveView(v)}
      onPromptUsageViewModeChange={v => useAppUiStore.setState({ activeView: "prompt-usage", promptUsageViewMode: v })} />
    <div className="demo-status"><span className="demo-dot" />{copy.chrome.demoMode}<span className="demo-status-detail" title={copy.chrome.demoDetail}>{copy.chrome.demoDetail}</span>
      {inGuide && <button onClick={exit}>{copy.chrome.exit}<X size={13} /></button>}
    </div>
    <main className="app-main-surface guide-workspace-main" data-active-view={activeView} data-prompt-usage-view-mode={mode}>
      <div className={`guide-workspace-view overview-screen ${view === "overview" ? "active-view" : ""}`}>
        <OverviewPage plugin={plugin} displayMode="left" resetTimerDisplayMode={reset} chartNow={chartNow}
          modelPaletteGuideActive={GUIDE_STEPS[step - 1]?.id === "model-palette"}
          onResetTimerDisplayModeToggle={() => setReset(v => v === "relative" ? "absolute" : "relative")}  />
      </div>
      {(visited.project || view === "project") && <div className={`guide-workspace-view ${view === "project" ? "active-view" : ""}`}>
        <PromptUsageProjectBrowser active={view === "project"} projects={projects} promptCount={counts.prompts} sessionCount={counts.sessions}
          initialProjectId="story-product" initialSessionId="story-checkout" />
      </div>}
      {(visited.timeline || view === "timeline") && <div className={`guide-workspace-view ${view === "timeline" ? "active-view" : ""}`}>
        <PromptUsageTimelineExplorer active={view === "timeline"} projects={projects} promptCount={counts.prompts} sessionCount={counts.sessions}
          locateTurnId={GUIDE_STEPS[step - 1]?.id === "event" ? FEATURED_PROMPT_ID : null} />
      </div>}
    </main>
    <PromptUsageDrilldownTransitionLayer />
    {inGuide && <Coach step={step} reset={reset} complete={complete} copy={copy} onComplete={finishAction} onStep={changeStep} onExit={exit} />}
    {(step === 0 || finished) && <GuideBookend finished={finished} copy={copy} onStart={() => setStep(1)} onExit={exit} />}
  </div>
}

function reportGuideRenderError(error: unknown, info?: { componentStack?: string | null }) {
  reportFrontendError(error, info)
  window.parent.postMessage({ type: "omp-guide-error", message: "Guide workspace failed to render" }, "*")
}

export function renderGuide(init: GuideInit) {
  useAppPreferencesStore.setState({ language: init.language, themeMode: init.themeMode, displayMode: "left", modelColors: init.modelPalette, modelColorsHydrated: true })
  useAppUiStore.setState({ activeView: "home", promptUsageViewMode: "hierarchy", promptUsageDrilldownTransition: null })
  document.documentElement.lang = init.language
  createRoot(document.getElementById("root")!, { onCaughtError: reportGuideRenderError, onUncaughtError: reportGuideRenderError })
    .render(<AppErrorBoundary><GuideWorkspace /></AppErrorBoundary>)
}
