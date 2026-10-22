import { ArrowLeft, LinkBreak } from "@phosphor-icons/react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/hooks/use-i18n"
import type { PromptUsageSession } from "@/lib/prompt-usage"

export type RelationshipRailInfo = {
  key: string
  sourceIndex: number | null
  sourceTitle: string | null
  childIndexes: number[]
  childTitles: string[]
  isDestination: boolean
  isUnavailable: boolean
}

export function relationshipRailInfo(
  session: PromptUsageSession,
  index: number,
  sessions: PromptUsageSession[],
): RelationshipRailInfo | null {
  const sourceIndex = session.relatedSourceId
    ? sessions.findIndex((candidate) => candidate.id === session.relatedSourceId)
    : -1
  const sourceSession = sourceIndex >= 0 ? sessions[sourceIndex] : null
  const childIds = new Set([
    ...(session.relatedTasks ?? []).map((task) => task.id),
    ...sessions
      .filter((candidate) => candidate.isDelegated && candidate.relatedSourceId === session.id)
      .map((candidate) => candidate.id),
  ])
  const childIndexes = sessions.flatMap((candidate, candidateIndex) => childIds.has(candidate.id) ? [candidateIndex] : [])
  const connectedChildIndexes = sourceSession
    ? sessions.flatMap((candidate, candidateIndex) => {
      const isDirectChild = candidate.isDelegated && candidate.relatedSourceId === sourceSession.id
      const isListedChild = sourceSession.relatedTasks?.some((task) => task.id === candidate.id) ?? false
      return isDirectChild || isListedChild ? [candidateIndex] : []
    })
    : childIndexes
  const childTitles = Array.from(new Set([
    ...(session.relatedTasks ?? []).map((task) => task.title),
    ...connectedChildIndexes.map((childIndex) => sessions[childIndex]?.title).filter((title): title is string => Boolean(title)),
  ]))
  const isDestination = Boolean(session.isDelegated && session.relatedSourceId)
  const isSource = childIndexes.length > 0 || (session.relatedTasks?.length ?? 0) > 0

  if (!isSource && !isDestination) return null

  const unavailable = isDestination && sourceIndex < 0
  return {
    key: unavailable
      ? `relationship:unavailable:${session.id}:${session.relatedSourceId}`
      : `relationship:${sourceIndex >= 0 ? session.relatedSourceId : session.id}`,
    sourceIndex: sourceIndex >= 0 ? sourceIndex : isSource ? index : null,
    sourceTitle: sourceSession?.title ?? session.relatedSourceTitle ?? null,
    childIndexes: connectedChildIndexes,
    childTitles,
    isDestination,
    isUnavailable: unavailable,
  }
}

export function SessionRelationshipRail({
  session,
  index,
  relationship,
  highlighted,
  onNavigateToSession,
  onHighlight,
}: {
  session: PromptUsageSession
  index: number
  relationship: RelationshipRailInfo
  highlighted: boolean
  onNavigateToSession: (sessionId: string) => void
  onHighlight: (key: string | null) => void
}) {
  const t = useI18n()
  const relatedIndexes = [relationship.sourceIndex, ...relationship.childIndexes]
    .filter((relatedIndex): relatedIndex is number => relatedIndex != null)
  const firstRelatedIndex = Math.min(index, ...relatedIndexes)
  const lastRelatedIndex = Math.max(index, ...relatedIndexes)
  const connected = relationship.sourceIndex != null && relationship.childIndexes.length > 0 && index >= firstRelatedIndex && index <= lastRelatedIndex
  const sourceNode = relationship.sourceIndex === index
  const unavailableLabel = t("promptUsage.sourceUnavailable")
  const destinationLabel = relationship.isUnavailable
    ? unavailableLabel
    : relationship.sourceTitle
      ? t("promptUsage.relationshipFrom", { source: relationship.sourceTitle })
      : unavailableLabel
  const relatedCount = Math.max(session.relatedTaskCount || 0, session.relatedTasks?.length || 0, relationship.childIndexes.length)
  const sourceLabel = relatedCount > 1
    ? t("promptUsage.relationshipToMany", { count: relatedCount })
    : t("promptUsage.relationshipTo", { destination: relationship.childTitles[0] ?? t("promptUsage.relatedTask") })
  const highlight = () => onHighlight(relationship.key)
  const clearHighlight = () => onHighlight(null)

  return (
    <div
      className={`pointer-events-none absolute inset-y-0 right-10 z-[1] w-12 text-muted-foreground transition-colors duration-200 ${highlighted ? "text-foreground" : ""}`}
      data-testid="prompt-usage-relationship-rail"
      data-relationship-key={relationship.key}
      data-relationship-highlighted={highlighted ? "true" : "false"}
    >
      {connected && (
        <span
          className={`absolute right-3 border-l transition-[border-color,opacity] duration-200 ${index === firstRelatedIndex ? "top-1/2" : "top-0"} ${index === lastRelatedIndex ? "bottom-1/2" : "bottom-0"} ${relationship.isUnavailable ? "border-dashed border-muted-foreground/40" : highlighted ? "border-[var(--wire-orange)]" : "border-border/70"}`}
          aria-hidden="true"
          data-testid="prompt-usage-relationship-stem"
        />
      )}
      {sourceNode && (
        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <button
                {...props}
                type="button"
                className={`pointer-events-auto absolute top-1/2 -right-2.5 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-md outline-none transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${highlighted ? "bg-muted/60 text-[var(--wire-orange)]" : "text-muted-foreground"}`}
                aria-label={sourceLabel}
                data-kind="source"
                data-testid="prompt-usage-relationship-source-node"
                onClick={() => onNavigateToSession(session.id)}
                onFocus={highlight}
                onBlur={clearHighlight}
                onMouseEnter={highlight}
                onMouseLeave={clearHighlight}
              >
                <span
                  className={`size-3 rounded-full border-2 bg-card transition-[border-color,transform] duration-200 ${highlighted ? "scale-110 border-[var(--wire-orange)]" : "border-muted-foreground/70"}`}
                  aria-hidden="true"
                />
              </button>
            )}
          />
          <TooltipContent side="top">{sourceLabel}</TooltipContent>
        </Tooltip>
      )}
      {relationship.isDestination && (
        <>
          <span
            className={`absolute top-1/2 left-5 right-3 -translate-y-1/2 border-t transition-[border-color,opacity] duration-200 ${relationship.isUnavailable ? highlighted ? "border-dashed border-foreground/70" : "border-dashed border-muted-foreground/45" : highlighted ? "border-[var(--wire-orange)]" : "border-border/70"}`}
            aria-hidden="true"
            data-testid="prompt-usage-relationship-branch"
          />
          {relationship.isUnavailable ? (
            <span
              className={`pointer-events-auto absolute top-1/2 left-0 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-md outline-none transition-colors duration-200 ${highlighted ? "text-foreground" : "text-muted-foreground/60"}`}
              role="img"
              aria-label={unavailableLabel}
              title={unavailableLabel}
              data-kind="unavailable"
              data-testid="prompt-usage-relationship-unavailable"
            >
              <LinkBreak size={15} aria-hidden="true" />
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className={`pointer-events-auto absolute top-1/2 left-0 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-md outline-none transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${highlighted ? "bg-muted/60 text-[var(--wire-orange)]" : "text-muted-foreground"}`}
                    aria-label={destinationLabel}
                    data-kind="destination"
                    data-testid="prompt-usage-relationship-destination"
                    onClick={() => onNavigateToSession(session.id)}
                    onFocus={highlight}
                    onBlur={clearHighlight}
                    onMouseEnter={highlight}
                    onMouseLeave={clearHighlight}
                  >
                    <ArrowLeft size={15} aria-hidden="true" />
                  </button>
                )}
              />
              <TooltipContent side="top">{destinationLabel}</TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  )
}
