import { useRef } from "react"

interface Props { controls: string; start: number; end: number; viewStart: number; span: number; move: (at: number, animate?: boolean) => void; label: string; valueText: string }

export function TimelineScrollbar({ controls, start, end, viewStart, span, move, label, valueText }: Props) {
  const gesture = useRef<{ id: number; x: number; position: number } | null>(null)
  const maximum = Math.max(start, end - span)
  const thumbPercent = span / (end - start) * 100
  const progress = maximum > start ? (viewStart - start) / (maximum - start) : 0
  return <div className="prompt-timeline-horizontal-scroll" role="scrollbar" aria-controls={controls} aria-orientation="horizontal" tabIndex={maximum > start ? 0 : -1} aria-label={label} aria-valuemin={start} aria-valuemax={maximum} aria-valuenow={viewStart} aria-valuetext={valueText} aria-disabled={maximum <= start}
    onKeyDown={event => {
      const delta = Math.min(3_600_000, span / 4)
      const next = event.key === "ArrowLeft" ? viewStart - delta : event.key === "ArrowRight" ? viewStart + delta : event.key === "PageDown" ? viewStart + span : event.key === "PageUp" ? viewStart - span : event.key === "Home" ? start : event.key === "End" ? maximum : null
      if (next === null) return
      event.preventDefault(); move(next)
    }}
    onPointerDown={event => {
      if (event.button !== 0 || maximum <= start) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
      const bounds = event.currentTarget.getBoundingClientRect()
      const thumb = event.currentTarget.firstElementChild!.getBoundingClientRect()
      if (!bounds.width || bounds.width <= thumb.width) return
      const inside = event.clientX >= thumb.left && event.clientX <= thumb.right
      const position = inside ? viewStart : start + Math.max(0, Math.min(1, (event.clientX - bounds.left - thumb.width / 2) / (bounds.width - thumb.width))) * (maximum - start)
      move(position, false)
      gesture.current = { id: event.pointerId, x: event.clientX, position }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const current = gesture.current
      if (!current || current.id !== event.pointerId) return
      const width = event.currentTarget.getBoundingClientRect().width - event.currentTarget.firstElementChild!.getBoundingClientRect().width
      if (width > 0) move(current.position + (event.clientX - current.x) / width * (maximum - start), false)
    }}
    onPointerUp={event => { if (gesture.current?.id !== event.pointerId) return; gesture.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
    onLostPointerCapture={() => { gesture.current = null }} onPointerCancel={() => { gesture.current = null }}>
    <span style={{ width: `max(44px, ${thumbPercent}%)`, left: `${progress * 100}%`, transform: `translateX(-${progress * 100}%)` }} />
  </div>
}
