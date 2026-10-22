import { usePromptDrilldownDestination } from "@/hooks/use-prompt-drilldown-destination"
import { TimeScopeControl, ModelFilterControl, ProjectFilterControl } from "@/components/prompt-usage-timeline-filters"
import {
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { type PromptUsageCopyState } from "@/components/prompt-usage-inspector"
import { CodexEmptyState } from "@/components/codex-empty-state"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useI18n } from "@/hooks/use-i18n"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { promptCopyText } from "@/lib/prompt-usage-display"
import { canonicalModelName, resolvedPaletteSurfaceColor } from "@/lib/model-colors"
import {
  type PromptUsageProject,
  type PromptUsageTurn,
} from "@/lib/prompt-usage"
import { formatShareTokens } from "@/lib/today-models"
import {
  usageTimeScopeContains, usageTimeScopeKey,
} from "@/lib/time-scope"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { promptUnreadKey, usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { flattenTimeline, timelineBounds, type TimelineItem } from "@/lib/prompt-usage-timeline"
import { PromptUsageSessionLanes } from "@/components/prompt-usage-session-lanes"
import { PromptUsageTimelineInspector } from "@/components/prompt-usage-timeline-inspector"
import { PromptUsageTimelineReaderOverlay } from "@/components/prompt-usage-timeline-reader-overlay"
import "./prompt-usage-timeline.css"

export interface PromptUsageTimelineExplorerProps {
  projects: PromptUsageProject[]
  promptCount: number
  sessionCount: number
  privacyNote?: string | null
  error?: string | null
  loading?: boolean
  onCheckForRecords?: () => void
  onOpenPrompt?: (item: TimelineItem, source: HTMLElement) => void
  onOpenSession?: (sessionId: string) => void
  active?: boolean
  locateTurnId?: string | null
}

const UNKNOWN_MODEL_FILTER_KEY = "__unknown_model__"
const UNKNOWN_MODEL_MARKER_COLOR = "var(--muted-foreground)"

function timelineItemModelKey(item: TimelineItem): string {
  return item.model?.canonicalName ?? UNKNOWN_MODEL_FILTER_KEY
}

function matchesItem(item: TimelineItem, query: string, unknownModelLabel: string): boolean {
  if (!query) return true
  const values = [
    item.project.name,
    item.session.title,
    promptCopyText(item.turn.prompt),
    item.model?.name ?? unknownModelLabel,
    ...item.turn.agents.flatMap((agent) => [agent.name, agent.role ?? "", ...agent.models.map((model) => model.name)]),
  ]
  return values.some((value) => value.toLocaleLowerCase().includes(query))
}

function LoadingState() {
  const t = useI18n()
  return (
    <div className="space-y-3 px-3 py-6" role="status">
      <span className="sr-only">{t("promptUsage.loading")}</span>
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/35" />
      ))}
    </div>
  )
}

export function PromptUsageTimelineExplorer({
  projects,
  promptCount,
  sessionCount,
  privacyNote,
  error,
  loading = false,
  onCheckForRecords,
  onOpenSession,
  onOpenPrompt,
  active = true,
  locateTurnId,
}: PromptUsageTimelineExplorerProps) {
  const t = useI18n()
  const unknownModelLabel = t("promptUsage.unknownModel")
  const isDark = useDarkMode()
  const modelColors = useAppPreferencesStore((state) => state.modelColors)
  const pinnedSessionIds = useAppUiStore(state => state.promptUsagePinnedSessionIds)
  const timeScope = useAppUiStore((state) => state.promptUsageTimeScope)
  const setTimeScope = useAppUiStore((state) => state.setPromptUsageTimeScope)
  const [query, setQuery] = useState("")
  const [modelFilter, setModelFilter] = useState("all")
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [inspectorClosing, setInspectorClosing] = useState(false)
  const [copyState, setCopyState] = useState<PromptUsageCopyState>(null)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null)
  const [clusterIds, setClusterIds] = useState<string[] | null>(null)
  const [locatedTurnId, setLocatedTurnId] = useState<string | null>(null)
  const clusterSource = useRef<HTMLButtonElement | null>(null)
  const lanesPaneRef = useRef<HTMLDivElement | null>(null)
  const [source, setSource] = useState<HTMLButtonElement | null>(null)
  const wasActive = useRef(active)
  useLayoutEffect(() => {
    if (active && !wasActive.current && source?.isConnected) source.focus({ preventScroll: true })
    wasActive.current = active
  }, [active, source])
  const nowTimestamp = useNowTicker({ enabled: active, intervalMs: 60_000 })
  const now = useMemo(() => new Date(nowTimestamp), [nowTimestamp])
  const timeFilterTargetRef = useRef<HTMLDivElement | null>(null)
  const timelineSurfaceRef = useRef<HTMLDivElement | null>(null)

  const drilldownTransition = usePromptDrilldownDestination("timeline", active, timelineSurfaceRef, timeFilterTargetRef)
  useLayoutEffect(() => {
    if (drilldownTransition?.phase !== "arriving") return
    setQuery("")
    setModelFilter("all")
    setProjectFilter([])
    setSelectedTurnId(null)
    setFocusedSessionId(null)
    setClusterIds(null)
  }, [drilldownTransition?.phase, drilldownTransition?.sourceCardRect])

  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
  }, [])

  const allItems = useMemo(() => flattenTimeline(projects), [projects])
  const scopedItems = useMemo(() => allItems.filter((item) => usageTimeScopeContains(timeScope, item.turn.startedAt, now)), [allItems, timeScope, now])
  const modelTotals = useMemo(() => {
    const totals = new Map<string, { label: string; tokens: number }>()
    const identities = new Map<string, string>()
    for (const item of scopedItems) {
      if (item.model) identities.set(item.model.canonicalName, item.model.name)
      for (const agent of item.turn.agents) {
        for (const model of agent.models) {
          const key = canonicalModelName(model.name)
          if (!key) continue
          const previous = totals.get(key)
          totals.set(key, {
            label: previous?.label ?? model.name,
            tokens: (previous?.tokens ?? 0) + model.totalTokens,
          })
        }
      }
    }
    for (const [key, label] of identities) {
      if (!totals.has(key)) totals.set(key, { label, tokens: 0 })
    }
    return [...totals.entries()].sort((a, b) => (
      Number(b[1].tokens > 0) - Number(a[1].tokens > 0) ||
      b[1].tokens - a[1].tokens ||
      a[0].localeCompare(b[0])
    ))
  }, [scopedItems])
  const modelOrder = useMemo(() => new Map(modelTotals.map(([key], index) => [key, index])), [modelTotals])
  const hasUnknownModel = scopedItems.some((item) => item.model == null)
  const modelOptions = [
    ...modelTotals.map(([key, value]) => ({ key, label: value.label })),
    ...(hasUnknownModel ? [{ key: UNKNOWN_MODEL_FILTER_KEY, label: unknownModelLabel }] : []),
  ]

  useEffect(() => {
    if (modelFilter !== "all" && !modelOptions.some((option) => option.key === modelFilter)) setModelFilter("all")
  }, [modelFilter, modelOptions])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredItems = useMemo(() => scopedItems.filter((item) => (
    (projectFilter.length === 0 || projectFilter.includes(item.project.id)) &&
    (modelFilter === "all" || timelineItemModelKey(item) === modelFilter) && matchesItem(item, normalizedQuery, unknownModelLabel)
  )), [projectFilter, modelFilter, normalizedQuery, scopedItems, unknownModelLabel])

  const pinnedSessions = useMemo(() => {
    const pins = new Set(pinnedSessionIds)
    const sessions = new Map<string, Pick<TimelineItem, "session" | "project">>()
    for (const item of allItems) {
      if (pins.has(item.session.id) &&
        (projectFilter.length === 0 || projectFilter.includes(item.project.id)) &&
        (modelFilter === "all" || timelineItemModelKey(item) === modelFilter) && matchesItem(item, normalizedQuery, unknownModelLabel)) {
        sessions.set(item.session.id, { session: item.session, project: item.project })
      }
    }
    return [...sessions.values()]
  }, [allItems, pinnedSessionIds, projectFilter, modelFilter, normalizedQuery, unknownModelLabel])
  const hasChartRows = filteredItems.length > 0 || pinnedSessions.length > 0

  const focusedSession = filteredItems.find((item) => item.session.id === focusedSessionId)?.session ?? pinnedSessions.find(item => item.session.id === focusedSessionId)?.session
  useEffect(() => {
    if (focusedSessionId && !focusedSession) setFocusedSessionId(null)
  }, [focusedSessionId, focusedSession])
  const bounds = timelineBounds(timeScope, now)
  const selectItem = (item: TimelineItem, button: HTMLButtonElement) => {
    setInspectorClosing(false)
    setSource(button)
    setSelectedTurnId(item.turn.id)
  }
  const markerColor = (item: TimelineItem) => item.model == null ? UNKNOWN_MODEL_MARKER_COLOR
    : resolvedPaletteSurfaceColor(Math.min(4, modelOrder.get(item.model.canonicalName) ?? 4), modelColors, isDark ? "dark" : "light")

  const scopeKey = usageTimeScopeKey(timeScope)
  useEffect(() => setFocusedSessionId(null), [scopeKey])
  useEffect(() => {
    setClusterIds(null)
    setSelectedTurnId(null)
    setLocatedTurnId(null)
    setHighlightedTurnId(null)
  }, [scopeKey, normalizedQuery, modelFilter, projectFilter])
  const clusterItems = clusterIds ? filteredItems.filter((item) => clusterIds.includes(item.turn.id)) : null
  const selectedGroupIds = clusterItems?.map((item) => item.turn.id)
  const narrowToDay = (dateKey: string) => {
    timeFilterTargetRef.current?.querySelector("button")?.focus({ preventScroll: true })
    setTimeScope({ type: "day", dateKey })
  }
  const previousScopeKey = useRef(scopeKey)
  useLayoutEffect(() => {
    const changed = previousScopeKey.current !== scopeKey
    previousScopeKey.current = scopeKey
    const pane = lanesPaneRef.current
    if (!changed || drilldownTransition || !pane?.animate) return
    const animation = pane.animate([{ opacity: .25, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 300, easing: "cubic-bezier(.2,.7,.2,1)" })
    return () => animation.cancel()
  }, [scopeKey, drilldownTransition])
  const locateItem = (item: TimelineItem) => {
    setLocatedTurnId(item.turn.id)
    setFocusedSessionId(item.session.id)
    const scroll = lanesPaneRef.current?.querySelector<HTMLElement>(".prompt-session-lanes-scroll")
    const lane = [...(scroll?.querySelectorAll<HTMLElement>("[data-session-id]") ?? [])].find((element) => element.dataset.sessionId === item.session.id)
    if (!scroll || !lane) return
    const headerHeight = scroll.querySelector(".prompt-session-axis")?.getBoundingClientRect().height ?? 0
    scroll.scrollTo({ top: Math.max(0, scroll.scrollTop + lane.getBoundingClientRect().top - scroll.getBoundingClientRect().top - headerHeight - 8), behavior: "smooth" })
  }

  const selectedItem = selectedTurnId ? allItems.find((item) => item.turn.id === selectedTurnId) ?? null : null
  const unreadKeys = usePromptUsageUnreadStore(state => state.unreadKeys)
  const markRead = usePromptUsageUnreadStore(state => state.markRead)
  useEffect(() => {
    const acknowledge = () => {
      if (!active || loading || error || document.visibilityState === "hidden" || !selectedItem || inspectorClosing) return
      if (!filteredItems.some(item => item.turn.id === selectedItem.turn.id) || selectedItem.turn.isActive) return
      if (unreadKeys.includes(promptUnreadKey(selectedItem.session.id, selectedItem.turn.id))) markRead(selectedItem.session.id, selectedItem.turn.id)
    }
    acknowledge()
    document.addEventListener("visibilitychange", acknowledge)
    return () => document.removeEventListener("visibilitychange", acknowledge)
  }, [active, loading, error, selectedItem, filteredItems, inspectorClosing, unreadKeys, markRead])
  useEffect(() => {
    if (selectedTurnId && !filteredItems.some((item) => item.turn.id === selectedTurnId)) setSelectedTurnId(null)
  }, [filteredItems, selectedTurnId])

  const filteredTokenTotal = filteredItems.reduce((sum, item) => sum + item.turn.tokens.totalTokens, 0)

  const copyPrompt = async (turn: PromptUsageTurn) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(promptCopyText(turn.prompt))
      setCopyState({ turnId: turn.id, status: "success" })
    } catch {
      setCopyState({ turnId: turn.id, status: "error" })
    }
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
    copyResetTimer.current = setTimeout(() => setCopyState(null), 2_000)
  }

  const navigateToSession = (sessionId: string) => {
    if (onOpenSession) {
      setSelectedTurnId(null)
      onOpenSession(sessionId)
      return
    }
    const candidate = allItems.find((item) => item.session.id === sessionId)
    if (candidate) setSelectedTurnId(candidate.turn.id)
  }

  if (loading && projects.length === 0) return <LoadingState />

  if (error && projects.length === 0) {
    return (
      <div className="flex items-start gap-3 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
        <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div><div className="font-medium">{t("promptUsage.unavailable")}</div><p className="mt-1 text-xs leading-5 text-destructive/90">{error}</p></div>
      </div>
    )
  }

  if (projects.length === 0) {
    return <CodexEmptyState onCheckForRecords={onCheckForRecords} />
  }

  return (
    <section
      id="guide-prompts-root"
      className="flex min-h-0 flex-1 flex-col"
      data-testid="prompt-usage-panel"
      data-drilldown-arriving={drilldownTransition?.phase === "arriving" || undefined}
      data-drilldown-ready={Boolean(
        drilldownTransition?.phase === "arriving"
          && drilldownTransition.destinationSurfaceRect
          && drilldownTransition.destinationFilterRect
      ) || undefined}
      aria-label={t("promptUsage.title")}
      aria-busy={loading}
    >
      {loading ? <p className="mb-2 text-[10px] text-muted-foreground" role="status">{t("promptUsage.refreshingStatus")}</p> : null}
      {error ? <div className="mb-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-[10px] text-destructive" role="alert">{t("promptUsage.resultsOutOfDate")} · {error}</div> : null}

      <div
        ref={timelineSurfaceRef}
        className="prompt-timeline-surface relative flex min-h-0 flex-1 overflow-hidden"
        data-testid="prompt-usage-timeline-shell"
      >
        <div className="flex min-w-0 flex-1 basis-full flex-col" data-testid="prompt-usage-timeline-primary-plane">
          <div className="prompt-timeline-filter-strip shrink-0 border-b border-border/40" data-guide-target="prompts-explore">
            <div className="flex flex-wrap items-center gap-2">
              <div ref={timeFilterTargetRef} className="shrink-0">
                <TimeScopeControl scope={timeScope} onChange={setTimeScope} minimumKey={allItems[0]?.dateKey} />
              </div>
              <ModelFilterControl value={modelFilter} onChange={setModelFilter} options={modelOptions} />
              <ProjectFilterControl selected={projectFilter} onChange={setProjectFilter} options={projects.map(project => ({ key: project.id, label: project.name }))} />
              <label className="relative min-w-52 flex-1">
                <span className="sr-only">{t("promptUsage.searchLabel")}</span>
                <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input type="search" aria-label={t("promptUsage.searchLabel")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={t("promptUsage.searchPromptPlaceholder")} className="prompt-timeline-filter-control h-10 w-full rounded-[10px] border border-border/70 bg-background/65 pl-9 pr-9 text-[11px] text-foreground outline-none placeholder:text-muted-foreground" />
                {query ? <button type="button" className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted/55 hover:text-foreground" onClick={() => setQuery("")} aria-label={t("promptUsage.clearSearch")}><X className="size-3.5" /></button> : null}
              </label>
              <div className="ml-auto shrink-0 text-right text-[10px] leading-4 text-muted-foreground" data-testid="prompt-usage-filter-summary">
                <div><strong className="font-semibold tabular-nums text-foreground">{filteredItems.length}</strong> {t("promptUsage.prompts")}</div>
                <div className="tabular-nums">{formatShareTokens(filteredTokenTotal)} {t("overview.tokenUnit")}</div>
              </div>
            </div>
          </div>

          <div className="prompt-timeline-workspace" data-guide-target="prompts-local" data-testid="prompt-usage-timeline">
            <div ref={lanesPaneRef} className="prompt-timeline-chart-pane">
              {hasChartRows && <>
                <PromptUsageSessionLanes
                  onNavigateToSession={navigateToSession}
                  onOpenPrompt={onOpenPrompt}
                  heading={t(timeScope.type === "today" ? "promptUsage.activityToday" : "promptUsage.activityOverview")}
                  summary={`${new Set([...filteredItems, ...pinnedSessions].map((item) => item.session.id)).size} ${t("promptUsage.sessions")} · ${filteredItems.length} ${t("promptUsage.prompts")}`}
                  items={filteredItems} pinnedSessions={pinnedSessions} start={bounds.start} end={bounds.end}
                  focusedSessionId={focusedSessionId} highlightedTurnId={highlightedTurnId ?? selectedTurnId ?? locatedTurnId}
                  locatedTurnId={locatedTurnId} locateTurnId={locateTurnId}
                  navigationLabels={{ previous: t("promptUsage.previousActivity"), next: t("promptUsage.nextActivity"), position: t("promptUsage.timePosition"), hint: t("promptUsage.timelineHelpNavigate") }}
                  previewDisabled={Boolean(clusterItems?.length || selectedItem || inspectorClosing)}
                  selectedGroupIds={selectedGroupIds} onNarrowToDay={narrowToDay}
                  onSelectGroup={(items, button) => { setSelectedTurnId(null); setClusterIds(items.map((item) => item.turn.id)); clusterSource.current = button }}
                  onFocusSession={id => setFocusedSessionId(current => current === id ? null : id)} onHighlight={setHighlightedTurnId} onSelect={(item, button) => { setClusterIds(null); selectItem(item, button) }} markerColor={markerColor}
                  labels={{ session: "Session", sentAt: t("promptUsage.sentAt"), empty: t("promptUsage.noMatchingPromptsTitle"), focusSession: t("promptUsage.focusSession"), prompts: t("promptUsage.prompts") }}
                />
              </>}
            </div>
            {!hasChartRows ? (
              <div className="grid min-h-48 place-items-center px-6 text-center" data-testid="prompt-usage-no-matches">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t(timeScope.type === "today" && scopedItems.length === 0 ? "promptUsage.noActivityToday" : "promptUsage.noMatchingPromptsTitle")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{t(timeScope.type === "today" && scopedItems.length === 0 ? "promptUsage.noActivityTodayHint" : "promptUsage.noMatchingPrompts")}</p>
                  {timeScope.type === "today" && scopedItems.length === 0 && allItems.length > 0 && <button type="button" className="prompt-timeline-focus-control mt-4 underline underline-offset-4" onClick={() => { setQuery(""); setModelFilter("all"); setTimeScope({ type: "day", dateKey: allItems[allItems.length - 1].dateKey }) }}>{t("promptUsage.latestActivity")}</button>}
                </div>
              </div>
            ) : null}
          </div>

          <div className="prompt-timeline-footer flex shrink-0 items-center justify-between gap-3 border-t border-border/30 text-[9px] text-muted-foreground">
            <span>{privacyNote ?? t("promptUsage.localData")}</span>
            <span>{promptCount} {t("promptUsage.prompts")} · {sessionCount} {t("promptUsage.sessions")}</span>
          </div>
        </div>

        <PromptUsageTimelineReaderOverlay
          onOpenPrompt={onOpenPrompt}
          items={filteredItems} clusterItems={clusterItems?.length ? clusterItems : null}
          source={clusterSource.current} covered={Boolean(selectedItem && !clusterItems?.length) || inspectorClosing}
          selectedItem={clusterItems?.some(item => item.turn.id === selectedTurnId) ? selectedItem : null} copyState={copyState} onCopy={() => { if (selectedItem) void copyPrompt(selectedItem.turn) }}
          onCloseItem={() => setSelectedTurnId(null)} onNavigateToSession={navigateToSession}
          highlightedTurnId={highlightedTurnId ?? selectedTurnId ?? locatedTurnId} focusedSessionId={focusedSessionId}
          markerColor={markerColor} onSelect={selectItem} onHighlight={setHighlightedTurnId}
          onLocate={(item) => { locateItem(item); setSelectedTurnId(null); setClusterIds(null) }}
          onClearCluster={() => { setSelectedTurnId(null); setClusterIds(null) }}
        />

        <PromptUsageTimelineInspector
          item={clusterItems?.length ? null : selectedItem} source={source} copyState={copyState}
          onCopy={() => { if (selectedItem) void copyPrompt(selectedItem.turn) }}
          onNavigateToSession={navigateToSession} onClose={() => { setInspectorClosing(true); setSelectedTurnId(null) }}
          onExitComplete={(restoreFocus) => { setInspectorClosing(false); requestAnimationFrame(restoreFocus) }}
          onOpenSession={selectedItem && (onOpenPrompt || onOpenSession) ? (source) => {
            if (onOpenPrompt) onOpenPrompt(selectedItem, source)
            else onOpenSession?.(selectedItem.session.id)
          } : undefined}
          openSessionLabel={t("promptUsage.openSessionInBrowser")}
        />
      </div>
    </section>
  )
}
