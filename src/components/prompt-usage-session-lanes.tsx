import { useAppUiStore } from "@/stores/app-ui-store"
import { usePromptPinDrag } from "./prompt-usage-pin-drag"
import { usePromptPinMotion } from "./prompt-usage-pin-motion"
import { PromptUsagePin } from "./prompt-usage-pin-button"
import { useI18n } from "@/hooks/use-i18n"
import { useTimelineLaneVisibility } from "./prompt-usage-lane-visibility"
import { RunningIndicator } from "@/components/prompt-usage-running-indicator"
import { ArrowUp, ArrowDown } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useId, type CSSProperties } from "react"
import { TimelineHelp } from "./prompt-usage-timeline-help"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { localDateKeyFromTimestamp } from "@/lib/time-scope"
import { formatPromptDate } from "@/lib/prompt-usage-display"
import { TimelineScrollbar } from "./prompt-usage-timeline-scrollbar"
import { TimelineNavigator } from "./prompt-usage-timeline-navigator"
import { CAMERA_SPAN, timelineTicks } from "./prompt-usage-timeline-camera"
import "./prompt-usage-session-lanes.css"
import { useTimelineCamera } from "./prompt-usage-timeline-camera"
import { LaneEvents } from "./prompt-usage-lane-events"
import { groupTimelineItems, visibleEventGroups } from "./prompt-usage-timeline-groups"
import { useTimelinePan } from "./prompt-usage-timeline-pan"

type LaneLabels = { session: string; sentAt: string; empty: string; focusSession: string; prompts: string }

export interface PromptUsageSessionLanesProps {
  items: TimelineItem[]
  pinnedSessions?: Pick<TimelineItem, "session" | "project">[]
  start: number
  end: number
  focusedSessionId: string | null
  highlightedTurnId: string | null
  onFocusSession: (id: string) => void
  onHighlight: (id: string | null) => void
  onNavigateToSession?: (sessionId: string) => void
  onOpenPrompt?: (item: TimelineItem, source: HTMLElement) => void
  onSelect: (item: TimelineItem, source: HTMLButtonElement) => void
  onSelectGroup: (items: TimelineItem[], source: HTMLButtonElement) => void
  selectedGroupIds?: string[]
  onNarrowToDay?: (dateKey: string) => void
  markerColor: (item: TimelineItem) => string
  labels: LaneLabels
  previewDisabled?: boolean
  locatedTurnId?: string | null
  locateTurnId?: string | null
  navigationLabels?: { previous: string; next: string; position: string; hint: string }
  heading?: string
  summary?: string
}

export function PromptUsageSessionLanes({ items, pinnedSessions, start, end, focusedSessionId, highlightedTurnId, onFocusSession, onHighlight, onSelect, onOpenPrompt, onNavigateToSession, onSelectGroup, selectedGroupIds, onNarrowToDay, markerColor, labels, heading, summary, locatedTurnId, locateTurnId, navigationLabels, previewDisabled = false }: PromptUsageSessionLanesProps) {
  const t = useI18n()
  const pinnedSessionIds = useAppUiStore(state => state.promptUsagePinnedSessionIds)
  const reorderPin = useAppUiStore(state => state.reorderPromptUsageSessionPin)
  const togglePin = useAppUiStore(state => state.togglePromptUsageSessionPin)
  const pinRanks = useMemo(() => new Map(pinnedSessionIds.map((id, index) => [id, index])), [pinnedSessionIds])
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [navigatorDragging, setNavigatorDragging] = useState(false)
  const frameRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollId = useId()
  const navigationItems = useMemo(() => items.filter(item => item.startedAt >= start && item.startedAt < end).sort((a, b) => a.startedAt - b.startedAt), [items, start, end])
  const times = useMemo(() => navigationItems.map(item => item.startedAt), [navigationItems])
  const markSessionIds = useMemo(() => navigationItems.map(item => item.session.id), [navigationItems])
  const camera = useTimelineCamera(start, end, times)
  const viewStart = camera.start
  const viewEnd = camera.end
  const pan = useTimelinePan(viewStart, viewEnd, camera.advance, previewDisabled)
  useEffect(() => {
    const id = locateTurnId ?? locatedTurnId
    if (!id) return
    const item = items.find(item => item.turn.id === id)
    if (!item) return
    if (locateTurnId) {
      const span = Math.min(camera.span, CAMERA_SPAN)
      camera.resize(item.startedAt - span / 2, span)
    } else if (item.startedAt < camera.start || item.startedAt >= camera.end) camera.move(item.startedAt - camera.span / 2)
  }, [locatedTurnId, locateTurnId])
  useLayoutEffect(() => {
    const element = trackRef.current
    if (!element) return
    const measure = () => { if (element.clientWidth > 0) setWidth(element.clientWidth) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const groupedLanes = useMemo(() => {
    const grouped = new Map<string, TimelineItem[]>()
    for (const item of items) {
      if (item.startedAt < start || item.startedAt >= end) continue
      const lane = grouped.get(item.session.id)
      if (lane) lane.push(item)
      else grouped.set(item.session.id, [item])
    }
    const rows = [...grouped.values()].map((entries) => {
      const groups = groupTimelineItems(entries, start, end, camera.span, width)
      return { session: entries[0].session, project: entries[0].project, groups }
    })
    for (const pinned of pinnedSessions ?? []) {
      if (pinRanks.has(pinned.session.id) && !grouped.has(pinned.session.id)) rows.push({ ...pinned, groups: [] })
    }
    return rows.sort((a, b) => (pinRanks.get(a.session.id) ?? pinnedSessionIds.length) - (pinRanks.get(b.session.id) ?? pinnedSessionIds.length))
  }, [items, start, end, camera.span, width, pinRanks, pinnedSessionIds.length, pinnedSessions])
  const maxTokens = useMemo(() => Math.max(1, ...groupedLanes.flatMap(lane => lane.groups.map(group => group.tokens))), [groupedLanes])
  const lanes = useMemo(() => groupedLanes.map(lane => ({ ...lane, groups: visibleEventGroups(lane.groups, viewStart, viewEnd) })), [groupedLanes, viewStart, viewEnd])

  const activeSessionIds = useMemo(() => lanes.filter(lane => lane.groups.length > 0).map(lane => lane.session.id), [lanes])
  const { above, below, revealSession, cancelReveal, refresh } = useTimelineLaneVisibility(scrollRef, activeSessionIds)
  const pinMotion = usePromptPinMotion(scrollRef, JSON.stringify([pinnedSessionIds, lanes.map(lane => lane.session.id)]), refresh)
  const pinDrag = usePromptPinDrag(scrollRef, lanes.filter(lane => pinRanks.has(lane.session.id)).map(lane => lane.session.id),
    (id, targetId) => pinMotion.reorder(() => reorderPin(id, targetId), false),
    () => { cancelReveal(); pan.cancel() })
  useLayoutEffect(refresh, [pinnedSessionIds, lanes.length, refresh])
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      cancelReveal()
      if (previewDisabled || pan.dragging || event.ctrlKey || (event.target as Element).closest(".prompt-session-preview-region")) return
      const label = (event.target as Element).closest(".prompt-session-label, .prompt-session-axis-label")
      if (label && Math.abs(event.deltaY) >= Math.abs(event.deltaX) && !event.shiftKey && !event.altKey) { return }
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) { return }
      event.preventDefault()
      if (event.altKey) {
        const bounds = trackRef.current?.getBoundingClientRect()
        const anchor = bounds?.width ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : .5
        camera.zoom(Math.exp(Math.max(-1, Math.min(1, delta / 500))), anchor)
        return
      }
      if (camera.span >= end - start) return
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1
      camera.advance(delta * scale / Math.max(1, width) * camera.span)
    }
    element.addEventListener("wheel", wheel, { passive: false })
    return () => element.removeEventListener("wheel", wheel)
  }, [camera.advance, camera.span, start, end, previewDisabled, pan.dragging, width, cancelReveal, camera.zoom])
  const revealRecord = (at: number) => {
    if (previewDisabled) return
    const candidates = new Set(items.filter(item => item.startedAt === at).map(item => item.session.id))
    const scroll = scrollRef.current
    if (!scroll || !candidates.size) return
    // At compressed scales, a nearby mark can lie outside the click-centered window.
    if (at < camera.target.current || at >= camera.target.current + camera.span) camera.move(at - camera.span / 2)
    const bounds = scroll.getBoundingClientRect()
    const top = Math.max(bounds.top, scroll.querySelector(".prompt-session-axis")?.getBoundingClientRect().bottom ?? bounds.top)
    const unpinnedTop = Math.max(top, ...[...scroll.querySelectorAll<HTMLElement>('[data-pinned="true"]')].map(row => row.getBoundingClientRect().bottom))
    const candidatesByDistance = [...scroll.querySelectorAll<HTMLElement>("[data-session-id]")]
      .filter(row => candidates.has(row.dataset.sessionId!))
      .map(row => {
        const rect = row.getBoundingClientRect()
        const visibleTop = row.dataset.pinned === "true" ? top : unpinnedTop
        return { id: row.dataset.sessionId!, distance: rect.bottom < visibleTop ? visibleTop - rect.bottom : rect.top > bounds.bottom ? rect.top - bounds.bottom : 0 }
      })
      .sort((a, b) => a.distance - b.distance)
    if (candidatesByDistance[0]) revealSession(candidatesByDistance[0].id)
  }
  const activityHint = (direction: "above" | "below", ids: string[]) => {
    const visible = ids.length > 0 && !previewDisabled && focusedSessionId === null
    const Icon = direction === "above" ? ArrowUp : ArrowDown
    return <div className="prompt-session-activity-hint" data-direction={direction} data-visible={visible || undefined} aria-hidden={!visible}>
      <button type="button" tabIndex={visible ? 0 : -1} disabled={!visible} onClick={() => {
        const id = direction === "above" ? ids[ids.length - 1] : ids[0]
        revealSession(id)
        // The hint may disappear after arrival; leave keyboard focus at its destination.
        const row = [...(scrollRef.current?.querySelectorAll<HTMLElement>("[data-session-id]") ?? [])].find(row => row.dataset.sessionId === id)
        row?.querySelector<HTMLButtonElement>(".prompt-session-identity")?.focus({ preventScroll: true })
      }}><Icon size={13} aria-hidden="true" />{t(direction === "above" ? "promptUsage.activityAbove" : "promptUsage.activityBelow", { count: ids.length })}</button>
    </div>
  }

  const span = Math.max(1, viewEnd - viewStart)
  const withDate = new Date(viewStart).toDateString() !== new Date(viewEnd - 1).toDateString()
  const ticks = timelineTicks(viewStart, viewEnd).map(time => {
    const date = new Date(time)
    const dateKey = localDateKeyFromTimestamp(date.toISOString())!
    const midnight = date.getHours() === 0
    const timeLabel = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    return { position: (time - viewStart) / span, label: timeLabel, dateLabel: withDate && midnight ? formatPromptDate(dateKey) : null, dateKey: withDate && midnight && time < viewEnd ? dateKey : null }
  })

  return (
    <section ref={frameRef} className="prompt-session-lanes" aria-label={labels.session} data-testid="prompt-session-lanes">
      <TimelineNavigator start={start} end={end} viewStart={viewStart} span={camera.span} times={times} markSessionIds={markSessionIds} focusedSessionId={focusedSessionId} width={width} move={camera.move} resize={camera.resize} zoom={camera.zoom} fit={camera.fit} minimumSpan={camera.minimumSpan} resizeLabels={{ start: t("promptUsage.resizeStart"), end: t("promptUsage.resizeEnd"), pan: t("promptUsage.panTime") }} onPan={delta => { cancelReveal(); if (!previewDisabled && !pan.dragging) { camera.advance(delta) } }} onRecordClick={revealRecord} onDraggingChange={dragging => { if (dragging) cancelReveal(); setNavigatorDragging(dragging) }} label={navigationLabels?.position ?? "Time Position"} hint={navigationLabels?.hint} spanLabel={camera.span < 3_600_000 ? t("promptUsage.visibleMinutes", { count: Math.round(camera.span / 60_000) }) : camera.span < 86_400_000 ? t("promptUsage.visibleHours", { count: Number((camera.span / 3_600_000).toFixed(1)) }) : t("promptUsage.visibleDays", { count: Number((camera.span / 86_400_000).toFixed(1)) })} />
      <div className="prompt-session-chart-viewport" style={{ "--pinned-lane-count": lanes.filter(lane => pinRanks.has(lane.session.id)).length } as CSSProperties}>
      {activityHint("above", above)}
      <div ref={scrollRef} id={scrollId} className="prompt-session-lanes-scroll omp-scrollbar" onScroll={pan.cancel}>
      <div className="prompt-session-axis">
        <div className="prompt-session-axis-label">
          <div className="prompt-session-heading">
            <h2>{heading ?? labels.session}</h2>
            <TimelineHelp />
          </div>
          {summary ? <p>{summary}</p> : null}
        </div>
        <div className="prompt-session-track prompt-session-ticks" ref={trackRef} {...pan.handlers}>
          {ticks.map((tick, index) => {
            const label = <>{tick.dateLabel && <span className="prompt-session-tick-date">{tick.dateLabel}{" "}</span>}{tick.label}</>
            return <span key={index} style={{ left: `${tick.position * 100}%` }} data-edge={tick.position === 0 ? "start" : tick.position === 1 ? "end" : undefined}>
              {tick.dateKey && onNarrowToDay ? <button type="button" aria-label={`${tick.dateLabel} ${tick.label}`} onClick={() => onNarrowToDay(tick.dateKey!)}>{label}</button> : label}
            </span>
          })}
        </div>
      </div>
        {lanes.length === 0 ? <p className="prompt-session-lanes-empty">{labels.empty}</p> : lanes.map(({ session, project, groups }, index) => (
          <div className="prompt-session-lane" key={session.id} style={pinRanks.has(session.id) ? { "--pinned-row-index": index } as CSSProperties : undefined} data-pin-row-id={session.id} data-session-id={session.id} data-pin-dragging={pinDrag.draggingId === session.id || undefined} data-pin-target={pinDrag.draggingId !== session.id && pinDrag.targetId === session.id || undefined} data-pinned={pinRanks.has(session.id) || undefined} data-selected={focusedSessionId === session.id || undefined} data-muted={focusedSessionId !== null && focusedSessionId !== session.id || undefined}>
            <div className="prompt-session-label">
            <button type="button" className="prompt-session-identity" {...(pinRanks.has(session.id) ? pinDrag.getDragHandlers(session.id) : {})} aria-description={pinRanks.has(session.id) ? t("promptUsage.reorderPinHint") : undefined} aria-pressed={focusedSessionId === session.id} aria-label={`${labels.focusSession}: ${session.title}`} onClick={() => onFocusSession(session.id)} title={`${session.title} · ${project.name}`}>
              <span className="flex items-center gap-2">{session.isActive && <RunningIndicator testId="prompt-session-lane-running" />}<span className="truncate">{session.title}</span></span>
              <small>{project.name}</small>
            </button>
            <PromptUsagePin pinId={session.id} title={session.title} pinned={pinRanks.has(session.id)}
              onToggle={() => { cancelReveal(); pan.cancel(); pinMotion.reorder(() => togglePin(session.id), !pinRanks.has(session.id)) }} />
            </div>
            <div className="prompt-session-track" {...pan.handlers} data-dragging={pan.dragging || undefined}>
              <div className="prompt-session-grid" aria-hidden="true">
                {ticks.map((tick, index) => <i key={index} style={{ left: `${tick.position * 100}%` }} />)}
                <span className="prompt-session-baseline" style={{ top: "35px" }} />
              </div>
              <LaneEvents trackWidth={width} onPreview={() => { cancelReveal() }} onNavigateToSession={onNavigateToSession} onOpenPrompt={onOpenPrompt} maxTokens={maxTokens} groups={groups} withDate={withDate} frameRef={frameRef} dragging={pan.dragging} previewDisabled={previewDisabled || camera.moving || navigatorDragging || pinMotion.moving || Boolean(pinDrag.draggingId)} highlightedTurnId={highlightedTurnId} onHighlight={onHighlight} onSelect={onSelect} onSelectGroup={onSelectGroup} selectedGroupIds={selectedGroupIds} markerColor={markerColor} labels={labels} />
            </div>
          </div>
        ))}
      </div>
      {activityHint("below", below)}
      </div>
      <TimelineScrollbar controls={scrollId} start={start} end={end} span={camera.span} viewStart={viewStart} move={camera.move} label={t("promptUsage.timePosition")} valueText={`${formatPromptDate(new Date(viewStart).toISOString())} ${new Date(viewStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} />
    </section>
  )
}
