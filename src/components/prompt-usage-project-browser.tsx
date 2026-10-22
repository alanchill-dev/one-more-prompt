import { useSessionQuota } from "@/hooks/use-session-quota"
import { usePromptDrilldownDestination } from "@/hooks/use-prompt-drilldown-destination"
import {
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import {
  PromptUsageColumnBrowser,
} from "@/components/prompt-usage-columns"
import type { PromptUsageCopyState } from "@/components/prompt-usage-inspector"
import { CodexEmptyState } from "@/components/codex-empty-state"
import { promptUnreadKey, usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { sortProjects, type SortMode } from "./prompt-usage-sort"
import { PromptUsageSortControl } from "./prompt-usage-sort-control"
import { ProjectFilterControl, TimeScopeControl } from "./prompt-usage-timeline-filters"
import { scopeForSession, scopeProjects } from "./prompt-usage-project-scope"
import { localDateKeyFromTimestamp, type UsageTimeScope } from "@/lib/time-scope"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { useI18n } from "@/hooks/use-i18n"
import { useAppUiStore } from "@/stores/app-ui-store"
import { promptCopyText } from "@/lib/prompt-usage-display"
import type {
  PromptUsageProject,
  PromptUsageSession,
  PromptUsageTurn,
} from "@/lib/prompt-usage"

export interface PromptUsageProjectBrowserProps {
  projects: PromptUsageProject[]
  active?: boolean
  promptCount: number
  sessionCount: number
  privacyNote?: string | null
  error?: string | null
  loading?: boolean
  onCheckForRecords?: () => void
  initialProjectId?: string
  initialTurnId?: string
  initialSessionId?: string
}

function timestamp(value: string | null): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function matches(value: string | null | undefined, query: string): boolean {
  return Boolean(value?.toLocaleLowerCase().includes(query))
}

function turnMatches(turn: PromptUsageTurn, query: string): boolean {
  return matches(promptCopyText(turn.prompt), query) || turn.agents.some((agent) => (
    matches(agent.name, query) ||
    matches(agent.role, query) ||
    agent.models.some((model) => matches(model.name, query))
  ))
}

function filterProjects(
  projects: PromptUsageProject[],
  query: string,
  sort: SortMode,
  matchingPins: Set<string>,
  matchingProjectPins: Set<string>,
): PromptUsageProject[] {
  const ordered = sortProjects(projects, sort)
  if (!query) return ordered

  const filtered = ordered.flatMap((project) => {
    const projectMatches = matches(project.name, query) || matchingProjectPins.has(project.id)
    const sessions = project.sessions.flatMap((session) => {
      const sessionMatches = matches(session.title, query)
      if (projectMatches || sessionMatches || matchingPins.has(session.id)) return [session]
      const turns = session.turns.filter((turn) => turnMatches(turn, query))
      return turns.length > 0 ? [{ ...session, turns }] : []
    })
    return sessions.length > 0 || projectMatches ? [{ ...project, sessions }] : []
  })
  return filtered
}

function latestSession(entry: PromptUsageProject): PromptUsageSession | null {
  return entry.sessions.reduce<PromptUsageSession | null>((latest, session) => (
    !latest || timestamp(session.updatedAt) > timestamp(latest.updatedAt) ? session : latest
  ), null) ?? entry.sessions[0] ?? null
}

function latestBranch(entries: PromptUsageProject[]) {
  return entries.reduce<{
    entry: PromptUsageProject
    session: PromptUsageSession
  } | null>((latest, entry) => {
    const session = latestSession(entry)
    if (!session) return latest
    if (!latest || timestamp(session.updatedAt) > timestamp(latest.session.updatedAt)) {
      return { entry, session }
    }
    return latest
  }, null)
}

function LoadingState() {
  const t = useI18n()

  return (
    <div className="relative grid min-h-72 grid-cols-1 border-t border-border/60 lg:grid-cols-[17rem_minmax(0,1fr)]" role="status">
      <span className="sr-only">{t("promptUsage.loading")}</span>
      <div className="space-y-3 border-b border-border/60 p-4 lg:border-r lg:border-b-0" aria-hidden="true">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-9 animate-pulse rounded-md bg-muted/70" />
        <div className="h-9 animate-pulse rounded-md bg-muted/45" />
        <div className="h-9 animate-pulse rounded-md bg-muted/45" />
      </div>
      <div className="space-y-3 p-4" aria-hidden="true">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-14 animate-pulse rounded-md bg-muted/70" />
        <div className="h-14 animate-pulse rounded-md bg-muted/45" />
        <div className="h-14 animate-pulse rounded-md bg-muted/45" />
      </div>
    </div>
  )
}

export function PromptUsageProjectBrowser({
  projects,
  active = true,
  error,
  loading = false,
  onCheckForRecords,
  initialSessionId,
  initialProjectId,
  initialTurnId,
}: PromptUsageProjectBrowserProps) {
  const t = useI18n()
  const [query, setQuery] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("recent")
  const initialEntry = projects.find((project) => (!initialProjectId || project.id === initialProjectId) && project.sessions.some((session) => session.id === initialSessionId))
  const [timeScope, setTimeScope] = useState<UsageTimeScope>(() => scopeForSession(initialEntry?.sessions.find(session => session.id === initialSessionId), initialTurnId))
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(() => initialEntry?.id ?? null)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(() => initialEntry?.kind === "project" ? initialEntry.id : null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() => initialEntry ? initialSessionId ?? null : null)
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(() => initialEntry?.sessions.find(session => session.id === initialSessionId)?.turns.find(turn => turn.id === initialTurnId)?.id ?? null)
  const [copyState, setCopyState] = useState<PromptUsageCopyState>(null)
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const surfaceRef = useRef<HTMLElement | null>(null)
  const timeFilterRef = useRef<HTMLDivElement | null>(null)
  const drilldownTransition = usePromptDrilldownDestination("hierarchy", active, surfaceRef, timeFilterRef)
  useLayoutEffect(() => {
    if (drilldownTransition?.phase !== "arriving" || !drilldownTransition.scope) return
    setTimeScope(drilldownTransition.scope)
    setQuery("")
    setProjectFilter([])
    setSelectedTurnId(null)
  }, [drilldownTransition?.phase, drilldownTransition?.scope, drilldownTransition?.sourceCardRect])


  useEffect(() => () => {
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
  }, [])

  const now = useNowTicker({ enabled: active, intervalMs: 60_000 })
  const pinnedSessionIds = useAppUiStore(state => state.promptUsagePinnedSessionIds)
  const pinnedProjectIds = useAppUiStore(state => state.promptUsagePinnedProjectIds)
  const scopedProjects = useMemo(() => scopeProjects(projects, timeScope, projectFilter, new Date(now), pinnedSessionIds, pinnedProjectIds), [projects, timeScope, projectFilter, now, pinnedSessionIds, pinnedProjectIds])
  const minimumKey = useMemo(() => projects.flatMap(project => project.sessions.flatMap(session => session.turns.map(turn => localDateKeyFromTimestamp(turn.startedAt)))).filter((key): key is string => key != null).sort()[0], [projects])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingPins = useMemo(() => new Set(projects.flatMap(project => project.sessions
    .filter(session => pinnedSessionIds.includes(session.id) && session.turns.some(turn => turnMatches(turn, normalizedQuery)))
    .map(session => session.id))), [projects, pinnedSessionIds, normalizedQuery])
  const matchingProjectPins = useMemo(() => new Set(projects.filter(project => pinnedProjectIds.includes(project.id)
    && project.sessions.some(session => matches(session.title, normalizedQuery) || session.turns.some(turn => turnMatches(turn, normalizedQuery))))
    .map(project => project.id)), [projects, pinnedProjectIds, normalizedQuery])
  const filteredProjects = useMemo(
    () => filterProjects(scopedProjects, normalizedQuery, sortMode, matchingPins, matchingProjectPins),
    [normalizedQuery, scopedProjects, sortMode, matchingPins, matchingProjectPins],
  )

  const unreadKeys = usePromptUsageUnreadStore(state => state.unreadKeys)
  const markRead = usePromptUsageUnreadStore(state => state.markRead)
  useEffect(() => {
    const acknowledge = () => {
      if (!active || loading || error || document.visibilityState === "hidden" || !selectedSessionId || !selectedTurnId) return
      const turn = filteredProjects.flatMap(project => project.sessions).find(session => session.id === selectedSessionId)?.turns.find(turn => turn.id === selectedTurnId)
      if (turn && !turn.isActive && unreadKeys.includes(promptUnreadKey(selectedSessionId, selectedTurnId))) markRead(selectedSessionId, selectedTurnId)
    }
    acknowledge()
    document.addEventListener("visibilitychange", acknowledge)
    return () => document.removeEventListener("visibilitychange", acknowledge)
  }, [active, loading, error, filteredProjects, selectedSessionId, selectedTurnId, unreadKeys, markRead])

  // Select a session for browsing, but leave prompt details closed until the user opens one.
  useEffect(() => {
    if (filteredProjects.length === 0) {
      if (selectedEntryId !== null) setSelectedEntryId(null)
      if (expandedEntryId !== null) setExpandedEntryId(null)
      if (selectedSessionId !== null) setSelectedSessionId(null)
      if (selectedTurnId !== null) setSelectedTurnId(null)
      return
    }

    const latest = latestBranch(filteredProjects)
    const selectedEntry = filteredProjects.find((project) => project.id === selectedEntryId)
    if (!selectedEntry) {
      const nextEntry = latest?.entry ?? null
      setSelectedEntryId(nextEntry?.id ?? null)
      setExpandedEntryId(nextEntry?.kind === "project" ? nextEntry.id : null)
      setSelectedSessionId(latest?.session.id ?? null)
      setSelectedTurnId(null)
      return
    }

    const selectedSession = selectedEntry.sessions.find((session) => session.id === selectedSessionId)
    if (!selectedSession) {
      const next = latestSession(selectedEntry)
      setSelectedSessionId(next?.id ?? null)
      setSelectedTurnId(null)
      return
    }

    if (selectedTurnId && !selectedSession.turns.some((turn) => turn.id === selectedTurnId)) {
      setSelectedTurnId(null)
    }
  }, [expandedEntryId, filteredProjects, selectedEntryId, selectedSessionId, selectedTurnId])

  const quotaSessions = projects.find(project => project.id === selectedEntryId)?.sessions ?? []
  const sessionQuota = useSessionQuota(quotaSessions, active)

  const selectEntry = (entry: PromptUsageProject) => {
    if (entry.kind === "project") {
      setExpandedEntryId((current) => current === entry.id ? null : entry.id)
      return
    }
    setSelectedEntryId(entry.id)
    setExpandedEntryId(null)
    const session = latestSession(entry)
    setSelectedSessionId(session?.id ?? null)
    setSelectedTurnId(null)
  }

  const selectSession = (session: PromptUsageSession) => {
    if (selectedSessionId === session.id) return
    const entry = filteredProjects.find(entry => entry.sessions.some(candidate => candidate.id === session.id))!
    setSelectedEntryId(entry.id)
    setSelectedSessionId(session.id)
    setSelectedTurnId(null)
  }

  const selectTurn = (turn: PromptUsageTurn) => {
    setSelectedTurnId((current) => current === turn.id ? null : turn.id)
  }

  const navigateToSession = (sessionId: string) => {
    const targetEntry = projects.find((project) => project.sessions.some((session) => session.id === sessionId))
    const targetSession = targetEntry?.sessions.find((session) => session.id === sessionId)
    if (!targetEntry || !targetSession) return

    setQuery("")
    setProjectFilter([])
    setTimeScope(scopeForSession(targetSession, undefined, timeScope))
    setSelectedEntryId(targetEntry.id)
    setExpandedEntryId(targetEntry.kind === "project" ? targetEntry.id : null)
    setSelectedSessionId(targetSession.id)
    setSelectedTurnId(null)
  }

  const closeInspector = () => {
    setSelectedTurnId(null)
  }

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

  return (
    <section
      ref={surfaceRef}
      data-drilldown-arriving={drilldownTransition?.phase === "arriving" || undefined}
      data-drilldown-ready={Boolean(drilldownTransition?.phase === "arriving" && drilldownTransition.destinationSurfaceRect && drilldownTransition.destinationFilterRect) || undefined}
      id="guide-prompts-root"
      className="prompt-project-surface flex min-h-0 flex-1 flex-col"
      data-testid="prompt-usage-panel"
      aria-label={t("promptUsage.title")}
      aria-busy={loading}
    >
      {loading && projects.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">{t("promptUsage.refreshingStatus")}</p>
      )}
      {error && projects.length > 0 && (
        <div className="flex items-start gap-3 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-medium">{t("promptUsage.resultsOutOfDate")}</div>
            <p className="mt-1 text-xs leading-5 text-destructive/90">{error}</p>
          </div>
        </div>
      )}

      {loading && projects.length === 0 ? (
        <LoadingState />
      ) : error && projects.length === 0 ? (
        <div className="flex items-start gap-3 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <div className="font-medium">{t("promptUsage.unavailable")}</div>
            <p className="mt-1 text-xs leading-5 text-destructive/90">{error}</p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <CodexEmptyState onCheckForRecords={onCheckForRecords} />
      ) : (
        <>
          <div className="prompt-workspace-filters flex flex-wrap items-center gap-2" data-guide-target="prompts-explore">
            <div ref={timeFilterRef} className="shrink-0"><TimeScopeControl scope={timeScope} onChange={setTimeScope} minimumKey={minimumKey} /></div>
            <ProjectFilterControl selected={projectFilter} onChange={setProjectFilter} options={projects.map(project => ({ key: project.id, label: project.name }))} />
            <div className="shrink-0"><PromptUsageSortControl value={sortMode} onChange={setSortMode} /></div>
            <label className="relative block min-w-48 flex-1">
              <span className="sr-only">{t("promptUsage.searchLabel")}</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                className="prompt-usage-filter-control h-10 w-full rounded-lg border border-border bg-background pr-10 pl-10 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/30"
                placeholder={t("promptUsage.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("promptUsage.clearSearch")}
                  onClick={() => setQuery("")}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </label>
          </div>

          <div className="flex min-h-0 flex-1">
            <PromptUsageColumnBrowser
              initialTurnId={initialTurnId}
              entries={filteredProjects}
              fullEntries={projects}
              active={active}
              sessionQuota={sessionQuota}
              selectedEntryId={selectedEntryId}
              expandedEntryId={expandedEntryId}
              selectedSessionId={selectedSessionId}
              selectedTurnId={selectedTurnId}
              copyState={copyState}
              onSelectEntry={selectEntry}
              onSelectSession={selectSession}
              onSelectTurn={selectTurn}
              onNavigateToSession={navigateToSession}
              onCloseInspector={closeInspector}
              onCopy={copyPrompt}
            />
          </div>
        </>
      )}
    </section>
  )
}
