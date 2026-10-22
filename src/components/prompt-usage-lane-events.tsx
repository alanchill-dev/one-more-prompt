import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react"
import { createPortal } from "react-dom"
import { formatPromptDate, promptPreviewText } from "@/lib/prompt-usage-display"
import { formatShareTokens } from "@/lib/today-models"
import { PromptUsageLaneGroupPreview } from "./prompt-usage-lane-group-preview"
import { RunningIndicator } from "./prompt-usage-running-indicator"
import type { PromptUsageSessionLanesProps } from "./prompt-usage-session-lanes"

import type { EventGroup } from "./prompt-usage-timeline-groups"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

export function eventTime(timestamp: number, withDate: boolean): string {
  const clock = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(timestamp)
  return withDate ? `${formatPromptDate(new Date(timestamp).toISOString())} ${clock}` : clock
}

type Props = Pick<PromptUsageSessionLanesProps, "onNavigateToSession" | "onOpenPrompt" | "highlightedTurnId" | "onHighlight" | "onSelect" | "onSelectGroup" | "selectedGroupIds" | "markerColor" | "labels"> & {
  onPreview?: () => void; trackWidth: number; maxTokens: number; groups: EventGroup[]; withDate: boolean; frameRef: RefObject<HTMLElement | null>; dragging: boolean; previewDisabled: boolean
}
export function LaneEvents({ trackWidth, onPreview, onNavigateToSession, onOpenPrompt, maxTokens, groups, withDate, frameRef, dragging, previewDisabled, highlightedTurnId, onHighlight, onSelect, onSelectGroup, selectedGroupIds, markerColor, labels }: Props) {
  const language = useAppPreferencesStore(state => state.language)
  const countFormat = new Intl.NumberFormat(language, { maximumFractionDigits: 0 })
  const host = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const [active, setActive] = useState<EventGroup | null>(null)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  openRef.current = open
  const [geometry, setGeometry] = useState({ left: 0, top: 0, width: 320, height: 158, bridgeLeft: 0, bridgeWidth: 0, bridgeTop: 0, bridgeHeight: 0 })
  const dismissed = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function keepOpen() { clearTimeout(leaveTimer.current); leaveTimer.current = undefined }
  function scheduleClose() {
    if (!openRef.current || leaveTimer.current !== undefined) return
    leaveTimer.current = setTimeout(() => { leaveTimer.current = undefined; close() }, 250)
  }
  function close() { keepOpen(); if (!openRef.current) return; setOpen(false); onHighlight(null); clearTimeout(timer.current); timer.current = setTimeout(() => setActive(null), 240) }
  function show(group: EventGroup) {
    if (dragging || previewDisabled || dismissed.current) return
    const button = buttons.current.get(group.items[0].turn.id)
    const frame = frameRef.current
    if (!button || !frame) return
    keepOpen()
    onPreview?.()
    clearTimeout(timer.current)
    const source = button.getBoundingClientRect(), bounds = frame.getBoundingClientRect()
    const x = source.left + source.width / 2 - bounds.left
    const y = source.top + source.height / 2 - bounds.top
    const right = bounds.width - x >= x
    const summary = group.items.length > 1
    const bridgeWidth = summary ? 12 : Math.max(0, 20 - source.width / 2)
    const offset = source.width / 2 + bridgeWidth
    const availableWidth = (right ? bounds.width - x : x) - offset - 12
    const width = Math.min(summary ? 360 : 480, Math.max(180, availableWidth))
    const height = Math.min(summary ? 172 : 620, Math.max(120, bounds.height - 16))
    const left = right ? x + offset : x - width - offset
    const top = Math.max(8, Math.min(bounds.height - height - 8, y - height / 2))
    setGeometry({ height, left, top, width,
      bridgeLeft: right ? x + source.width / 2 : left + width, bridgeWidth, bridgeTop: y - 22, bridgeHeight: 44 })
    setActive(group); setOpen(true); onHighlight(group.items[0].turn.id)
  }
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(leaveTimer.current) }, [])
  useEffect(() => {
    if (!active || !open) return
    const next = groups.find(group => group.position === active.position &&
      group.items.length === active.items.length && group.items.every((item, index) => item.turn.id === active.items[index].turn.id))
    if (next) setActive(next)
    else { setOpen(false); setActive(null); onHighlight(null) }
  }, [groups])
  useEffect(() => {
    const frame = frameRef.current
    const dismiss = (event: Event) => {
      if ((event.target as Element | null)?.closest?.(".prompt-session-preview-region, [data-cost-explanation]")) return
      setOpen(false); setActive(null); onHighlight(null)
    }
    const leave = (event: PointerEvent) => {
      if ((event.relatedTarget as Element | null)?.closest?.("[data-cost-explanation]")) return
      dismissed.current = false; scheduleClose()
    }
    const outside = (event: PointerEvent) => {
      if (!frame?.contains(event.target as Node) && !(event.target as Element)?.closest?.("[data-cost-explanation]")) close()
    }
    frame?.addEventListener("pointerleave", leave)
    document.addEventListener("pointerdown", outside)
    frame?.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    return () => { frame?.removeEventListener("pointerleave", leave); document.removeEventListener("pointerdown", outside); frame?.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss) }
  }, [frameRef, onHighlight])
  useEffect(() => {
    if (active && highlightedTurnId !== null && highlightedTurnId !== active.items[0].turn.id) { setOpen(false); setActive(null) }
  }, [highlightedTurnId])
  useEffect(() => { if (dragging || previewDisabled) { setOpen(false); setActive(null) } }, [dragging, previewDisabled])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && open && !document.querySelector("[data-cost-explanation]")) { event.stopPropagation(); dismissed.current = true; close() } }
    document.addEventListener("keydown", escape, true)
    return () => document.removeEventListener("keydown", escape, true)
  })
  function select(group: EventGroup) {
    const source = buttons.current.get(group.items[0].turn.id)
    if (!source) return
    dismissed.current = true; close()
    if (group.items.length > 1) onSelectGroup(group.items, source)
    else onSelect(group.items[0], source)
  }
  function bridgedGroup(clientX: number, clientY: number) {
    // The passage may contain another real bar. That bar wins over passage protection.
    return groups.find(group => {
      if (group === active) return false
      const rect = buttons.current.get(group.items[0].turn.id)?.getBoundingClientRect()
      return rect && clientX >= rect.left && clientX <= rect.left + rect.width &&
        clientY >= rect.top && clientY <= rect.top + rect.height
    })
  }
  return <>
    <div ref={host} className="prompt-session-events" onPointerLeave={() => { dismissed.current = false }}>
      {groups.map((group, index) => {
        const item = group.items[0], count = group.items.length
        const tokens = group.tokens
        const clustered = count > 1
        const countText = countFormat.format(count)
        const halfWidth = group.markerWidth / 2
        const x = clustered ? Math.max(halfWidth, Math.min(trackWidth - halfWidth, group.position * trackWidth)) : group.position * trackWidth
        const height = 16 + 24 * Math.sqrt(Math.min(1, Math.max(0, tokens) / maxTokens))
        const previousGap = index > 0 ? (group.position - groups[index - 1].position) * trackWidth : Infinity
        const nextGap = index + 1 < groups.length ? (groups[index + 1].position - group.position) * trackWidth : Infinity
        const hitWidth = clustered ? group.markerWidth : Math.max(2, Math.min(28, previousGap, nextGap))
        const selected = group.items.some((entry) => selectedGroupIds?.includes(entry.turn.id))
        const label = clustered ? `${item.session.title} · ${count} ${labels.prompts} · ${formatShareTokens(tokens)} Tokens · ${eventTime(group.start, withDate)} – ${eventTime(group.end, withDate)}` : `${labels.sentAt} ${eventTime(item.startedAt, withDate)} · ${item.session.title} · ${promptPreviewText(item.turn.prompt)}`
        return <button key={item.turn.id} ref={(button) => { if (button) buttons.current.set(item.turn.id, button); else buttons.current.delete(item.turn.id) }}
          type="button" className={`prompt-session-event${count > 1 ? " prompt-session-cluster" : ""}`} data-cluster={clustered || undefined}
          data-token-total={tokens} data-testid={`prompt-session-event-${item.turn.id}`} data-preview-active={open && active === group || undefined} data-highlighted={selected || group.items.some((entry) => entry.turn.id === highlightedTurnId) || (open && active === group) || undefined}
          style={{ left: `${x / Math.max(1, trackWidth) * 100}%`, top: "35px", width: `${hitWidth}px`, height: `${Math.max(24, height + 8)}px`, "--event-color": group.mixedModels ? "var(--muted-foreground)" : markerColor(item), "--event-height": `${height}px`, "--event-width": `${group.markerWidth}px` } as CSSProperties}
          onPointerEnter={event => { if (event.pointerType !== "touch") { keepOpen(); if (active !== group || !open) show(group) } }}
          onPointerMove={event => { if (event.pointerType !== "touch") { keepOpen(); if (active !== group || !open) show(group) } }}
          onPointerLeave={scheduleClose}
          aria-label={label} aria-pressed={selected} onFocus={(event) => { onHighlight(item.turn.id); if (event.currentTarget.matches(":focus-visible")) show(group) }}
          onBlur={(event) => { if (!(event.relatedTarget as Element | null)?.closest?.(".prompt-session-preview-region")) { onHighlight(null); close() } }}
          onClick={(event) => { event.stopPropagation(); select(group) }}>
          <span aria-hidden="true" />
          {clustered && <small aria-hidden="true">{countText}</small>}
          {group.items.some((entry) => entry.turn.isActive) && <RunningIndicator testId={count > 1 ? "prompt-session-cluster-running" : "prompt-session-event-running"} />}
        </button>
      })}
    </div>
    {active && frameRef.current && createPortal(<div className="prompt-session-preview-region" data-open={open} inert={!open ? true : undefined} aria-hidden={!open || undefined}>
      <div className="prompt-session-preview-bridge" onPointerMove={event => {
        if (event.pointerType === "touch" || dragging || previewDisabled) return
        const group = bridgedGroup(event.clientX, event.clientY)
        if (group) show(group)
      }} onClick={event => {
        const group = bridgedGroup(event.clientX, event.clientY)
        if (group && !dragging && !previewDisabled) select(group)
      }} style={{ left: geometry.bridgeLeft, width: geometry.bridgeWidth, top: geometry.bridgeTop, height: geometry.bridgeHeight }} />
      <div className={`prompt-session-preview prompt-session-preview-detail${active.items.length > 1 ? " prompt-session-preview-summary" : ""}`} onPointerEnter={keepOpen} onFocusCapture={keepOpen} onPointerLeave={event => {
        if (!(event.relatedTarget as Element | null)?.closest?.("[data-cost-explanation]")) scheduleClose()
      }} style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }} onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node) && !host.current?.contains(event.relatedTarget as Node) && !document.querySelector("[data-cost-explanation]")) close()
      }} aria-label={`${active.items[0].session.title} · ${active.items.length} ${labels.prompts}`}>
        <PromptUsageLaneGroupPreview key={active.items[0].turn.id} items={active.items} onOpenGroup={() => select(active)} summary={active.items.length > 1 ? { range: `${eventTime(active.start, withDate)} – ${eventTime(active.end, withDate)}`, tokens: active.tokens } : undefined} onClose={() => { dismissed.current = true; close() }} onNavigateToSession={onNavigateToSession} onOpenPrompt={onOpenPrompt} />
      </div>
    </div>, frameRef.current)}
  </>
}
