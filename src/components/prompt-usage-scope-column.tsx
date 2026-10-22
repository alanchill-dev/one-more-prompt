import { useMemo, useRef, useState } from "react"
import { ChatCircleText, CaretDown, Folder } from "@phosphor-icons/react"
import { useAppUiStore } from "@/stores/app-ui-store"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { RunningIndicator } from "./prompt-usage-running-indicator"
import { SessionRelationshipRail, relationshipRailInfo } from "./prompt-usage-relationship-rail"
import { PromptUsageMarkAllRead } from "./prompt-usage-mark-all-read"
import { PromptUsagePin } from "./prompt-usage-pin-button"
import { usePromptPinDrag } from "./prompt-usage-pin-drag"
import { usePromptPinMotion } from "./prompt-usage-pin-motion"
import { UnreadDot } from "./prompt-usage-prompt-row"
import { useI18n } from "@/hooks/use-i18n"
import { formatShareTokens } from "@/lib/today-models"
import type { PromptUsageProject, PromptUsageSession } from "@/lib/prompt-usage"
import type { PromptUsageColumnBrowserProps } from "./prompt-usage-columns"
import "./prompt-usage-scope-column.css"

const INITIAL_SESSION_LIMIT = 5
const SESSION_PAGE_SIZE = 10
const safeDomId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-")
const sessionTokens = (session: PromptUsageSession) => session.turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0)
const formatTokens = formatShareTokens

export function ScopeColumn({
  entries,
  selectedEntryId,
  expandedEntryId,
  selectedSessionId,
  onSelectEntry,
  onSelectSession,
  onNavigateToSession,
}: Pick<PromptUsageColumnBrowserProps, "entries" | "selectedEntryId" | "expandedEntryId" | "selectedSessionId" | "onSelectEntry" | "onSelectSession" | "onNavigateToSession">) {
  const t = useI18n()
  const pinnedProjectIds = useAppUiStore(state => state.promptUsagePinnedProjectIds)
  const toggleProjectPin = useAppUiStore(state => state.togglePromptUsageProjectPin)
  const reorderProjectPin = useAppUiStore(state => state.reorderPromptUsageProjectPin)
  const pinnedProjectSet = useMemo(() => new Set(pinnedProjectIds), [pinnedProjectIds])
  const pinnedProjects = pinnedProjectIds.flatMap(id => {
    const project = entries.find(entry => entry.kind === "project" && entry.id === id)
    return project ? [project] : []
  })
  const pinnedIds = useAppUiStore(state => state.promptUsagePinnedSessionIds)
  const togglePin = useAppUiStore(state => state.togglePromptUsageSessionPin)
  const reorderPin = useAppUiStore(state => state.reorderPromptUsageSessionPin)
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const pinnedRows = useMemo(() => {
    const available = new Map(entries.flatMap(entry => entry.sessions.map(session => [session.id, { entry, session }] as const)))
    return pinnedIds.flatMap(id => available.has(id) ? [available.get(id)!] : [])
  }, [entries, pinnedIds])
  const scrollRef = useRef<HTMLElement>(null)
  const pinMotion = usePromptPinMotion(scrollRef, JSON.stringify([pinnedProjectIds, pinnedIds, entries.map(entry => [entry.id, entry.sessions.map(session => session.id)])]), () => {})
  const pinDrag = usePromptPinDrag(scrollRef, pinnedRows.map(row => row.session.id), (id, target) => pinMotion.reorder(() => reorderPin(id, target), false))
  const projectDrag = usePromptPinDrag(scrollRef, pinnedProjects.map(entry => `project:${entry.id}`), (id, target) => pinMotion.reorder(() => reorderProjectPin(id.slice(8), target.slice(8)), false))
  const changeProjectPin = (id: string) => pinMotion.reorder(() => toggleProjectPin(id), !pinnedProjectSet.has(id))
  const changePin = (id: string) => pinMotion.reorder(() => togglePin(id), !pinnedSet.has(id))
  const unreadKeys = usePromptUsageUnreadStore(state => state.unreadKeys)
  const unreadSessions = useMemo(() => new Set(unreadKeys.map(key => JSON.parse(key)[0] as string)), [unreadKeys])
  const [sessionPage, setSessionPage] = useState({ entryId: "", count: INITIAL_SESSION_LIMIT })
  const [highlightedRelationshipKey, setHighlightedRelationshipKey] = useState<string | null>(null)
  const selectedIndex = entries.find(entry => entry.id === expandedEntryId)?.sessions.filter(session => !pinnedSet.has(session.id)).findIndex(session => session.id === selectedSessionId) ?? -1
  const visibleSessionCount = Math.max(selectedIndex + 1, sessionPage.entryId === expandedEntryId
    ? sessionPage.count
    : INITIAL_SESSION_LIMIT)

  const renderEntry = (entry: PromptUsageProject, projectPinned = false) => {
    const selected = selectedEntryId === entry.id
    const isProject = entry.kind === "project"
    const standalone = !isProject ? entry.sessions[0] : undefined
    if (standalone && pinnedSet.has(standalone.id)) return null
    const sessions = entry.sessions.filter(session => !pinnedSet.has(session.id))
    const expanded = isProject && expandedEntryId === entry.id
    const unread = entry.sessions.some(session => unreadSessions.has(session.id))
    const unreadLabel = unread ? `, ${t("promptUsage.unreadResult")}` : ""
    const runningLabel = entry.isActive ? `, ${t("promptUsage.running")}` : ""
    return (
      <div key={entry.id}>
        <div className="relative" data-pin-row-id={isProject ? `project:${entry.id}` : standalone?.id} data-session-id={standalone?.id}
          data-pinned={projectPinned || undefined} data-pin-dragging={projectDrag.draggingId === `project:${entry.id}` || undefined}
          data-pin-target={projectDrag.draggingId !== `project:${entry.id}` && projectDrag.targetId === `project:${entry.id}` || undefined}>
        <button
          type="button"
          {...(projectPinned ? projectDrag.getDragHandlers(`project:${entry.id}`) : {})}
          aria-description={projectPinned ? t("promptUsage.reorderPinHint") : undefined}
          className={`prompt-project-entry flex min-h-11 w-full items-center justify-between gap-3 rounded-lg pl-8 pr-2.5 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-[var(--nav-active)] font-semibold text-[var(--nav-active-foreground)] shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
          aria-current={selected ? "page" : undefined}
          aria-expanded={isProject ? expanded : undefined}
          aria-label={`${t(isProject ? "promptUsage.openProject" : "promptUsage.openStandaloneSession", { name: entry.name })}${runningLabel}${unreadLabel}`}
          data-testid={`prompt-usage-entry-${safeDomId(entry.id)}`}
          data-kind={entry.kind}
          onClick={() => onSelectEntry(entry)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {isProject
              ? <Folder size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" data-testid="prompt-usage-project-icon" />
              : <ChatCircleText size={16} className={`shrink-0 ${selected ? "text-[var(--wire-orange)]" : "text-muted-foreground"}`} aria-hidden="true" data-testid="prompt-usage-standalone-icon" />}
            <span className="min-w-0">
              <span className="block truncate" title={entry.name}>{entry.name}</span>
              {!isProject && entry.sessions[0] && <span className="mt-1 flex min-w-0 gap-1 text-[10px] font-normal text-muted-foreground">
                <span className="truncate">{t("promptUsage.tokenCount", { value: formatTokens(sessionTokens(entry.sessions[0])) })}</span>
              </span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[10px]">
            {unread && <UnreadDot testId="prompt-usage-entry-unread" />}
            {entry.isActive && !expanded
              ? <RunningIndicator testId="prompt-usage-entry-running" />
              : <span data-testid="prompt-usage-entry-count">{entry.sessionCount}</span>}
            {isProject
              ? <CaretDown size={13} className={`transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`} aria-hidden="true" />
              : <span className="size-[13px] shrink-0" aria-hidden="true" data-testid="prompt-usage-entry-action-spacer" />}
          </span>
        </button>

        {isProject
          ? <PromptUsagePin pinId={`project:${entry.id}`} kind="project" title={entry.name} pinned={projectPinned} onToggle={() => changeProjectPin(entry.id)} />
          : standalone && <PromptUsagePin pinId={standalone.id} title={standalone.title} pinned={false} onToggle={() => changePin(standalone.id)} />}
        </div>
        {expanded && (
          <div
            className={`ml-4 mt-1 border-l border-border/70 pl-2 ${projectPinned ? "prompt-project-pinned-children omp-scrollbar" : ""}`}
            data-testid="prompt-usage-session-column"
            aria-label={t("promptUsage.sessionsIn", { name: entry.name })}
          >
            {entry.sessions.length === 0 ? (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">{t("promptUsage.noMatchingSessions")}</p>
            ) : sessions.slice(0, visibleSessionCount).map((session, sessionIndex, visibleSessions) => {
              const sessionUnread = unreadSessions.has(session.id)
              const sessionSelected = selectedSessionId === session.id
              const sessionRunningLabel = session.isActive ? `, ${t("promptUsage.running")}` : ""
              const relatedSessions = [...pinnedRows.map(row => row.session), ...visibleSessions]
              const related = relationshipRailInfo(session, relatedSessions.indexOf(session), relatedSessions)
              const visibleRelated = relationshipRailInfo(session, sessionIndex, visibleSessions)
              const relationship = related ? { ...related, sourceIndex: !related.isDestination ? sessionIndex : visibleRelated?.sourceIndex ?? null, childIndexes: visibleRelated?.childIndexes ?? [] } : null
              const relationshipHighlighted = relationship?.key === highlightedRelationshipKey
              return (
                <div
                  key={session.id}
                  className="relative h-[3.75rem] rounded-md"
                  data-pin-row-id={session.id} data-session-id={session.id}
                  data-testid={`prompt-usage-session-row-${safeDomId(session.id)}`}
                  data-relationship-key={relationship?.key}
                  data-relationship-highlighted={relationshipHighlighted ? "true" : "false"}
                  onMouseEnter={() => relationship && setHighlightedRelationshipKey(relationship.key)}
                  onMouseLeave={() => relationship && setHighlightedRelationshipKey(null)}
                  onFocus={() => relationship && setHighlightedRelationshipKey(relationship.key)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedRelationshipKey(null)
                  }}
                >
                  <button
                    type="button"
                    className={`prompt-project-session relative flex h-full w-full items-center rounded-md py-2 ${relationship ? "pr-[5.5rem]" : "pr-7"} pl-8 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${sessionSelected ? "bg-muted font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[var(--wire-orange)]" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"} ${relationshipHighlighted ? "bg-muted/80" : ""}`}
                    aria-current={sessionSelected ? "page" : undefined}
                    aria-label={`${t("promptUsage.openSession", { title: session.title })}${sessionRunningLabel}${sessionUnread ? `, ${t("promptUsage.unreadResult")}` : ""}`}
                    data-testid={`prompt-usage-session-${safeDomId(session.id)}`}
                    onClick={() => onSelectSession(session)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="prompt-project-session-title block truncate text-xs font-medium" title={session.title}>{session.title}</span>
                      <span className="prompt-project-session-metadata mt-1 flex min-w-0 gap-x-2 overflow-hidden whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                        <span className="shrink-0">{t(session.promptCount === 1 ? "promptUsage.promptCount" : "promptUsage.promptsCount", { count: session.promptCount })}</span>
                        <span className="truncate">{t("promptUsage.tokenCount", { value: formatTokens(sessionTokens(session)) })}</span>
                      </span>
                    </span>
                    <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                      {sessionUnread && <UnreadDot testId="prompt-usage-session-unread" />}
                      {session.isActive && <RunningIndicator testId="prompt-usage-session-running" />}
                    </span>
                  </button>
                  <PromptUsagePin pinId={session.id} title={session.title} pinned={false} onToggle={() => changePin(session.id)} />
                  {relationship && (
                    <SessionRelationshipRail
                      session={{ ...session, relatedTaskCount: Math.max(session.relatedTaskCount ?? 0, related!.childIndexes.length) }}
                      index={sessionIndex}
                      relationship={relationship}
                      highlighted={relationshipHighlighted}
                      onNavigateToSession={onNavigateToSession}
                      onHighlight={setHighlightedRelationshipKey}
                    />
                  )}
                </div>
              )
            })}
            {sessions.length > visibleSessionCount && (
              <button
                type="button"
                className="min-h-11 w-full rounded-md px-2.5 text-left text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSessionPage((current) => ({
                  entryId: expandedEntryId ?? "",
                  count: (current.entryId === expandedEntryId ? current.count : INITIAL_SESSION_LIMIT) + SESSION_PAGE_SIZE,
                }))}
              >
                {t("promptUsage.showMoreSessions")}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside ref={scrollRef} tabIndex={-1}
      className="prompt-project-scope omp-scrollbar min-h-0 min-w-0 overflow-y-auto border-b border-border/70 bg-muted/15 p-2 min-[700px]:border-r min-[700px]:border-b-0"
      aria-label={t("promptUsage.entriesAria")}
      data-column="scope"
      data-guide-target="prompts-hierarchy"
      data-testid="prompt-usage-scope-column"
    >
      <div className="sticky top-0 z-[2] bg-card">
        <div className="flex min-h-11 items-center justify-between gap-x-2 px-2 pb-2 pt-1 text-muted-foreground">
          <span className="min-w-0 flex-1 truncate py-2.5 text-[10px] font-semibold" title={t("promptUsage.projectsAndSessions")}>{t("promptUsage.projectsAndSessions")}</span>
          <PromptUsageMarkAllRead />
        </div>
        {pinnedProjects.length > 0 && <div className="prompt-project-pinned-projects space-y-1" data-testid="prompt-usage-pinned-projects">
          {pinnedProjects.map(entry => renderEntry(entry, true))}
        </div>}
        {pinnedRows.length > 0 && <div className="prompt-project-pinned-sessions" data-testid="prompt-usage-pinned-sessions">
          {pinnedRows.map(({ entry, session }, pinIndex) => {
            const selected = selectedSessionId === session.id
            const unread = unreadSessions.has(session.id)
            const related = relationshipRailInfo(session, entry.sessions.indexOf(session), entry.sessions)
            const pinnedRelated = relationshipRailInfo(session, pinIndex, pinnedRows.map(row => row.session))
            const relationship = related ? { ...related, sourceIndex: !related.isDestination ? pinIndex : pinnedRelated?.sourceIndex ?? null, childIndexes: pinnedRelated?.childIndexes ?? [] } : null
            const relationshipHighlighted = relationship?.key === highlightedRelationshipKey
            return <div key={session.id} className="prompt-project-pinned-session relative h-[3.75rem] rounded-md"
              data-relationship-key={relationship?.key} data-relationship-highlighted={relationshipHighlighted ? "true" : "false"}
              onMouseEnter={() => relationship && setHighlightedRelationshipKey(relationship.key)}
              onMouseLeave={() => relationship && setHighlightedRelationshipKey(null)}
              onFocus={() => relationship && setHighlightedRelationshipKey(relationship.key)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHighlightedRelationshipKey(null)
              }}
              data-pin-row-id={session.id} data-session-id={session.id} data-pinned="true" data-pin-dragging={pinDrag.draggingId === session.id || undefined}
              data-pin-target={pinDrag.draggingId !== session.id && pinDrag.targetId === session.id || undefined}>
              <button type="button" {...pinDrag.getDragHandlers(session.id)}
                className={`prompt-project-session prompt-project-pinned-identity flex h-full w-full items-center rounded-md py-2 ${relationship ? "pr-[5.5rem]" : "pr-7"} pl-8 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-muted font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[var(--wire-orange)]" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"} ${relationshipHighlighted ? "bg-muted/80" : ""}`}
                aria-current={selected ? "page" : undefined} aria-description={t("promptUsage.reorderPinHint")}
                aria-label={`${t("promptUsage.openSession", { title: session.title })}${session.isActive ? `, ${t("promptUsage.running")}` : ""}${unread ? `, ${t("promptUsage.unreadResult")}` : ""}`}
                data-testid={`prompt-usage-session-${safeDomId(session.id)}`} onClick={() => onSelectSession(session)}>
                <span className="min-w-0 flex-1">
                  <span className="prompt-project-session-title block truncate text-xs font-medium" title={session.title}>{session.title}</span>
                  <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={entry.name}>{entry.name}</span>
                </span>
                <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                  {unread && <UnreadDot testId="prompt-usage-session-unread" />}
                  {session.isActive && <RunningIndicator testId="prompt-usage-session-running" />}
                </span>
              </button>
              <PromptUsagePin pinId={session.id} title={session.title} pinned onToggle={() => changePin(session.id)} />
              {relationship && <SessionRelationshipRail
                session={{ ...session, relatedTaskCount: Math.max(session.relatedTaskCount ?? 0, related!.childIndexes.length) }}
                index={pinIndex} relationship={relationship} highlighted={relationshipHighlighted}
                onNavigateToSession={onNavigateToSession} onHighlight={setHighlightedRelationshipKey} />}
            </div>
          })}
        </div>}
      </div>
      {entries.length === 0 ? (
        <p className="flex min-h-40 items-center justify-center px-6 text-center text-xs text-muted-foreground" data-testid="prompt-usage-no-matches">{t("promptUsage.noMatchingPrompts")}</p>
      ) : (
        <nav className="space-y-1" aria-label={t("promptUsage.entriesAria")}>
          {entries.filter(entry => entry.kind !== "project" || !pinnedProjectSet.has(entry.id)).map(entry => renderEntry(entry))}
        </nav>
      )}
    </aside>
  )
}
