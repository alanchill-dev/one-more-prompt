import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { hourlyTimelineTicks } from "./prompt-usage-timeline-camera"
import { formatPromptDate } from "@/lib/prompt-usage-display"

interface Props {
  start: number; end: number; viewStart: number; span: number; times: number[]; width: number
  markSessionIds?: string[]; focusedSessionId?: string | null
  move: (value: number, animate?: boolean) => void
  onPan: (deltaMs: number) => void
  onDraggingChange: (dragging: boolean) => void
  onRecordClick?: (at: number) => void
  resize?: (start: number, span: number) => void
  minimumSpan?: number
  resizeLabels?: { start: string; end: string; pan: string }
  zoom?: (factor: number) => void
  fit?: () => void
  label: string; hint?: string; spanLabel?: string
}

export function TimelineNavigator({ start, end, viewStart, span, times, markSessionIds, focusedSessionId, width, move, onPan, onDraggingChange, onRecordClick, label, hint, resize, minimumSpan = 300_000, resizeLabels, zoom, fit, spanLabel }: Props) {
  const handleDrag = useRef<{ id: number; kind: "start" | "end" | "pan"; x: number; start: number; span: number } | null>(null)
  const drag = useRef<{ pointerId: number; offset: number; x: number; y: number; moved: boolean } | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const gripRef = useRef<HTMLButtonElement>(null)
  const [gripWidth, setGripWidth] = useState(104)
  const firstLabelRef = useRef<HTMLSpanElement>(null)
  const [hourLabelWidth, setHourLabelWidth] = useState(32)
  const singleDay = new Date(start).toDateString() === new Date(end - 1).toDateString()
  const [mapWidth, setMapWidth] = useState(width)
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return
    const measure = () => {
      if (map.clientWidth > 0) setMapWidth(map.clientWidth)
      if (gripRef.current?.offsetWidth) setGripWidth(gripRef.current.offsetWidth)
      const textWidth = firstLabelRef.current?.getBoundingClientRect().width ?? 0
      if (singleDay && textWidth > 0) setHourLabelWidth(textWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(map)
    if (gripRef.current) observer.observe(gripRef.current)
    if (firstLabelRef.current) observer.observe(firstLabelRef.current)
    return () => observer.disconnect()
  }, [singleDay])
  useLayoutEffect(() => {
    const map = mapRef.current
    if (!map) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || drag.current || handleDrag.current || mapWidth <= 0) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta) return
      event.preventDefault()
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mapWidth : 1
      onPan(delta * scale * span / mapWidth)
    }
    map.addEventListener("wheel", wheel, { passive: false })
    return () => map.removeEventListener("wheel", wheel)
  }, [mapWidth, onPan, span])
  const duration = end - start
  const dates: number[] = []
  const day = new Date(start)
  day.setHours(0, 0, 0, 0)
  if (day.getTime() < start) day.setDate(day.getDate() + 1)
  for (; day.getTime() < end; day.setDate(day.getDate() + 1)) dates.push(day.getTime())
  if (!dates.length || dates[0] > start) dates.unshift(start)
  const ticks = singleDay ? hourlyTimelineTicks(start, end) : dates
  const labeledDates = new Set<number>()
  if (singleDay) {
    const intervals = Math.max(1, ticks.length - 1)
    const tickWidth = 60 * 60_000 / duration * mapWidth
    // A divisor keeps both endpoints on the same regular rhythm as all interior labels.
    let stride = 1
    while (stride < intervals && (intervals % stride !== 0 || stride * tickWidth < hourLabelWidth + 8)) stride++
    ticks.forEach((at, index) => { if (index % stride === 0) labeledDates.add(at) })
  } else {
    let labelRight = -Infinity
    for (const [index, at] of ticks.entries()) {
      const x = (at - start) / duration * mapWidth
      const left = index === 0 ? x : x - 46
      const right = index === 0 ? x + 92 : x + 46
      if (left >= labelRight + 8 && right <= mapWidth) { labeledDates.add(at); labelRight = right }
    }
  }
  const tickLabel = (at: number) => singleDay
    ? at === end && new Date(at).getHours() === 0 ? "24:00" : `${String(new Date(at).getHours()).padStart(2, "0")}:00`
    : formatPromptDate(new Date(at).toISOString())
  const timeLabel = (at: number) => `${formatPromptDate(new Date(at).toISOString())} ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number
    switch (event.key) {
      case "-": case "_": if (zoom) { event.preventDefault(); zoom(2) }; return
      case "+": case "=": if (zoom) { event.preventDefault(); zoom(.5) }; return
      case "0": if (fit) { event.preventDefault(); fit() }; return
      case "ArrowLeft": case "ArrowDown": next = viewStart - Math.min(60 * 60_000, span / 4); break
      case "ArrowRight": case "ArrowUp": next = viewStart + Math.min(60 * 60_000, span / 4); break
      case "PageDown": next = viewStart - span; break
      case "PageUp": next = viewStart + span; break
      case "Home": next = start; break
      case "End": next = end - span; break
      default: return
    }
    event.preventDefault(); move(next)
  }
  const handle = (kind: "start" | "end" | "pan", text: string, at: number) => <button type="button" ref={kind === "pan" ? gripRef : undefined} className={`prompt-navigation-handle prompt-navigation-handle-${kind}`} aria-label={text} aria-description={kind === "pan" ? spanLabel : undefined} data-boundary={kind === "start" && at <= start ? "start" : kind === "end" && at >= end ? "end" : undefined} style={{ left: kind === "pan" ? `clamp(${gripWidth / 2 + 2}px, ${(at - start) / duration * 100}%, calc(100% - ${gripWidth / 2 + 2}px))` : `${Math.max(0, Math.min(100, (at - start) / duration * 100))}%` }}
    onKeyDown={event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      const delta = (event.key === "ArrowLeft" ? -1 : 1) * Math.min(60 * 60_000, span / 4)
      if (kind === "pan") move(viewStart + delta)
      else if (kind === "start") { const next = Math.max(start, Math.min(viewStart + span - minimumSpan, viewStart + delta)); resize?.(next, viewStart + span - next) }
      else resize?.(viewStart, Math.max(minimumSpan, Math.min(end - viewStart, span + delta)))
    }}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
      handleDrag.current = { id: event.pointerId, kind, x: event.clientX, start: viewStart, span }
      event.currentTarget.setPointerCapture(event.pointerId); onDraggingChange(true)
    }}
    onPointerMove={event => {
      const gesture = handleDrag.current
      const bounds = mapRef.current?.getBoundingClientRect()
      if (!gesture || gesture.id !== event.pointerId || !bounds?.width) return
      const delta = (event.clientX - gesture.x) / bounds.width * duration
      if (kind === "pan") move(gesture.start + delta, false)
      else if (kind === "start") { const next = Math.max(start, Math.min(gesture.start + gesture.span - minimumSpan, gesture.start + delta)); resize?.(next, gesture.start + gesture.span - next) }
      else resize?.(gesture.start, Math.max(minimumSpan, Math.min(end - gesture.start, gesture.span + delta)))
    }}
    onPointerUp={event => { if (handleDrag.current?.id !== event.pointerId) return; handleDrag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); onDraggingChange(false) }}
    onLostPointerCapture={() => { handleDrag.current = null; onDraggingChange(false) }}
    onPointerCancel={() => { handleDrag.current = null; onDraggingChange(false) }}>{kind === "pan" ? <span className="prompt-navigation-capsule" aria-hidden="true"><i data-side="left" />{spanLabel && <output>{spanLabel}</output>}<i data-side="right" /></span> : kind === "start" ? <CaretLeft className="prompt-navigation-resize-icon" size={16} weight="fill" aria-hidden="true" /> : <CaretRight className="prompt-navigation-resize-icon" size={16} weight="fill" aria-hidden="true" />}</button>
  return <div className="prompt-session-navigation">
    <div className="prompt-session-navigation-dates" data-hourly={singleDay || undefined} aria-hidden="true">
      {ticks.map((at, index) => <span ref={index === 0 ? firstLabelRef : undefined} key={at} style={{ left: `${(at - start) / duration * 100}%` }} data-first={index === 0 || undefined} data-last={at === end || undefined}>
        {labeledDates.has(at) ? tickLabel(at) : ""}
      </span>)}
    </div>
    <div className="prompt-navigation-interaction">
    <div ref={mapRef} className="prompt-session-navigation-map" role="slider" tabIndex={0} aria-label={label} title={hint}
      aria-valuemin={start} aria-valuemax={end - span} aria-valuenow={viewStart}
      aria-valuetext={`${timeLabel(viewStart)} – ${timeLabel(viewStart + span)}`} onKeyDown={keyDown}
      onPointerDown={event => {
        if (event.button !== 0) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (!bounds.width) return
        const at = start + (event.clientX - bounds.left) / bounds.width * duration
        const inside = at >= viewStart && at <= viewStart + span
        drag.current = { pointerId: event.pointerId, offset: inside ? at - viewStart : span / 2, x: event.clientX, y: event.clientY, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.focus({ preventScroll: true })
        onDraggingChange(true)
        move(inside ? viewStart : at - span / 2, !inside)
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return
        drag.current.moved ||= Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 4
        const bounds = event.currentTarget.getBoundingClientRect()
        if (bounds.width) move(start + (event.clientX - bounds.left) / bounds.width * duration - drag.current.offset, false)
      }}
      onPointerUp={event => {
        const gesture = drag.current
        if (gesture?.pointerId !== event.pointerId) return
        const moved = gesture.moved || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4
        const bounds = event.currentTarget.getBoundingClientRect()
        drag.current = null; onDraggingChange(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (!moved && onRecordClick && times.length && bounds.width > 0) {
          const at = start + (event.clientX - bounds.left) / bounds.width * duration
          const nearest = times.reduce((best, time) => Math.abs(time - at) < Math.abs(best - at) ? time : best)
          if (Math.abs(nearest - at) / duration * bounds.width <= 6) onRecordClick(nearest)
        }
      }}
      onLostPointerCapture={() => { drag.current = null; onDraggingChange(false) }}
      onPointerCancel={() => { drag.current = null; onDraggingChange(false) }}>
      <div className="prompt-session-navigation-marks" aria-hidden="true">{times.map((at, index) => <i key={index} data-selected={Boolean(focusedSessionId && markSessionIds?.[index] === focusedSessionId) || undefined} data-muted={Boolean(focusedSessionId && markSessionIds?.[index] !== focusedSessionId) || undefined} style={{ left: `${(at - start) / duration * 100}%` }} />)}</div>
      <div className="prompt-session-navigation-window" aria-hidden="true" style={{ left: `${(viewStart - start) / duration * 100}%`, width: `${span / duration * 100}%` }} />
    </div>
    {resize && resizeLabels && <>
      {handle("start", resizeLabels.start, viewStart)}
      {handle("end", resizeLabels.end, viewStart + span)}
      {handle("pan", resizeLabels.pan, viewStart + span / 2)}
    </>}
    </div>
  </div>
}
