import { useCallback, useEffect, useRef, useState } from "react"
import { PromptUsageProjectBrowser } from "@/components/prompt-usage-project-browser"
import { PromptUsageTimelineExplorer } from "@/components/prompt-usage-timeline-explorer"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { captureBrowserTransition, PromptUsageBrowserTransition, type BrowserTransitionSource } from "./prompt-usage-browser-transition"

interface PromptUsagePanelProps {
  projects: PromptUsageProject[]
  promptCount: number
  sessionCount: number
  privacyNote?: string | null
  error?: string | null
  loading?: boolean
  onCheckForRecords?: () => void
}

export function PromptUsagePanel(props: PromptUsagePanelProps) {
  const activeView = useAppUiStore(state => state.activeView)
  const observeProjects = usePromptUsageUnreadStore(state => state.observeProjects)
  useEffect(() => {
    if (!props.loading && !props.error) observeProjects(props.projects)
  }, [props.projects, props.loading, props.error, observeProjects])
  const viewMode = useAppUiStore((state) => state.promptUsageViewMode)
  const setViewMode = useAppUiStore((state) => state.setPromptUsageViewMode)
  const [visitedModes, setVisitedModes] = useState(() => new Set([viewMode]))
  useEffect(() => {
    setVisitedModes(previous => previous.has(viewMode) ? previous : new Set([...previous, viewMode]))
  }, [viewMode])
  const timelineActive = activeView === "prompt-usage" && viewMode === "timeline"
  const browserActive = activeView === "prompt-usage" && viewMode === "hierarchy"
  const [browserNavigation, setBrowserNavigation] = useState(0)
  const frameRef = useRef<HTMLDivElement>(null)
  const [promptTarget, setPromptTarget] = useState<{ projectId: string; sessionId: string; turnId: string } | null>(null)
  const [browserTransition, setBrowserTransition] = useState<BrowserTransitionSource | null>(null)
  const finishBrowserTransition = useCallback(() => setBrowserTransition(null), [])
  const openPrompt = (item: TimelineItem, source: HTMLElement) => {
    setBrowserTransition(captureBrowserTransition(source))
    setPromptTarget({ projectId: item.project.id, sessionId: item.session.id, turnId: item.turn.id })
    setSessionTarget(item.session.id)
    setBrowserNavigation(value => value + 1)
    setViewMode("hierarchy")
  }
  const [sessionTarget, setSessionTarget] = useState<string | null>(null)
  const drilldownTransition = useAppUiStore((state) => activeView === "prompt-usage" ? state.promptUsageDrilldownTransition : null)
  const [drilldownOriginMode, setDrilldownOriginMode] = useState<typeof viewMode | null>(() => (
    drilldownTransition ? viewMode : null
  ))

  useEffect(() => {
    if (viewMode !== "hierarchy") setBrowserTransition(null)
  }, [viewMode])

  useEffect(() => {
    if (drilldownTransition && drilldownOriginMode == null) {
      setDrilldownOriginMode(viewMode)
      return
    }
    if (drilldownOriginMode != null && viewMode !== drilldownOriginMode) {
      setDrilldownOriginMode(null)
    }
  }, [drilldownOriginMode, drilldownTransition, viewMode])

  return (
    <div ref={frameRef} className={`relative flex min-h-0 flex-1 flex-col ${viewMode === "timeline" ? "overflow-visible" : "overflow-hidden"}`} data-testid="prompt-usage-view-shell">
      <div
        className="prompt-usage-mode-stage flex min-h-0 flex-1"
        data-mode={viewMode}
        data-drilldown-origin={Boolean(sessionTarget) || drilldownOriginMode === viewMode || undefined}
        data-testid="prompt-usage-mode-stage"
      >
        {(viewMode === "timeline" || visitedModes.has("timeline")) && <div className={viewMode === "timeline" ? "flex min-h-0 min-w-0 flex-1" : "hidden"} hidden={viewMode !== "timeline"} inert={viewMode !== "timeline"}>
          <PromptUsageTimelineExplorer {...props} active={timelineActive} onOpenPrompt={openPrompt} onOpenSession={(id) => { setPromptTarget(null); setSessionTarget(id); setBrowserNavigation(value => value + 1); setViewMode("hierarchy") }} />
        </div>}
        {(viewMode === "hierarchy" || visitedModes.has("hierarchy")) && <div data-browser-destination={viewMode === "hierarchy" || undefined} className={viewMode === "hierarchy" ? "flex min-h-0 min-w-0 flex-1" : "hidden"} hidden={viewMode !== "hierarchy"} inert={viewMode !== "hierarchy"}><PromptUsageProjectBrowser key={browserNavigation} {...props} active={browserActive} initialProjectId={promptTarget?.projectId} initialTurnId={promptTarget?.turnId} initialSessionId={sessionTarget ?? undefined} /></div>}
      </div>
      {browserTransition && viewMode === "hierarchy" && <PromptUsageBrowserTransition source={browserTransition} host={frameRef} onComplete={finishBrowserTransition} />}
    </div>
  )
}
