import { useCallback, useEffect, useRef, useState } from "react"

export const CAMERA_SPAN = 6 * 60 * 60_000
export function cameraStart(start: number, end: number, span: number, value: number) {
  return Math.min(Math.max(start, value), Math.max(start, end - span))
}
export function hourlyTimelineTicks(start: number, end: number): number[] {
  const first = new Date(start)
  first.setMinutes(0, 0, 0)
  const ticks: number[] = []
  for (let time = first.getTime(); time <= end; time += 60 * 60_000) {
    if (time >= start) ticks.push(time)
  }
  return ticks
}
export function timelineTicks(start: number, end: number): number[] {
  if (end - start <= 48 * 3_600_000) {
    if (end - start >= 2 * 3_600_000) {
      const stride = Math.max(1, Math.ceil((end - start) / (8 * 3_600_000)))
      return hourlyTimelineTicks(start, end).filter(at => new Date(at).getHours() % stride === 0)
    }
    const interval = end - start <= 15 * 60_000 ? 60_000 : end - start <= 60 * 60_000 ? 5 * 60_000 : 15 * 60_000
    const ticks: number[] = []
    for (let at = Math.ceil(start / interval) * interval; at <= end; at += interval) ticks.push(at)
    return ticks
  }
  const day = new Date(start)
  day.setHours(0, 0, 0, 0)
  const ticks: number[] = []
  const stride = Math.max(1, Math.ceil((end - start) / (8 * 86_400_000)))
  if (day.getTime() < start) day.setDate(day.getDate() + 1)
  for (; day.getTime() <= end; day.setDate(day.getDate() + stride)) ticks.push(day.getTime())
  return ticks
}

export function useTimelineCamera(start: number, end: number, times: number[]) {
  const minimumSpan = Math.min(5 * 60_000, end - start)
  const [requestedSpan, setRequestedSpan] = useState(CAMERA_SPAN)
  const span = Math.min(requestedSpan, end - start)
  const initial = () => cameraStart(start, end, span, (times[0] ?? start) - 30 * 60_000)
  const [position, setPosition] = useState(initial)
  const [moving, setMoving] = useState(false)
  const spanRef = useRef(span)
  const target = useRef(position)
  const rendered = useRef(position)
  const animation = useRef(0)
  const stop = useCallback(() => { cancelAnimationFrame(animation.current); animation.current = 0 }, [])
  const move = useCallback((value: number, animate = true) => {
    stop()
    const next = cameraStart(start, end, spanRef.current, value)
    target.current = next
    const from = rendered.current
    if (!animate || Math.abs(next - from) < 1) {
      rendered.current = next; setPosition(next); setMoving(false); return
    }
    setMoving(true)
    let began: number | undefined
    const frame = (now: number) => {
      began ??= now
      const progress = Math.max(0, Math.min(1, (now - began) / 320))
      const value = from + (next - from) * (1 - Math.pow(1 - progress, 3))
      rendered.current = value; setPosition(value)
      if (progress < 1) animation.current = requestAnimationFrame(frame)
      else setMoving(false)
    }
    animation.current = requestAnimationFrame(frame)
  }, [start, end, span, stop])
  useEffect(() => {
    stop()
    const resetSpan = Math.min(CAMERA_SPAN, end - start)
    const next = cameraStart(start, end, resetSpan, (times[0] ?? start) - 30 * 60_000)
    spanRef.current = resetSpan; setRequestedSpan(resetSpan)
    rendered.current = next; target.current = next
    setPosition(next); setMoving(false)
    return stop
  }, [start, end]) // Activity updates preserve the user's viewport.
  useEffect(() => stop, [stop])
  const advance = useCallback((delta: number) => move(rendered.current + delta, false), [move])
  const resize = useCallback((value: number, duration: number) => {
    stop()
    const nextSpan = Math.max(minimumSpan, Math.min(end - start, duration))
    const next = cameraStart(start, end, nextSpan, value)
    spanRef.current = nextSpan; setRequestedSpan(nextSpan)
    rendered.current = next; target.current = next
    setPosition(next); setMoving(false)
  }, [start, end, minimumSpan, stop])
  const zoom = useCallback((factor: number, anchor = .5) => {
    const nextSpan = Math.max(minimumSpan, Math.min(end - start, spanRef.current * factor))
    resize(rendered.current + (spanRef.current - nextSpan) * anchor, nextSpan)
  }, [span, minimumSpan, start, end, resize])
  return { start: position, end: position + span, span, minimumSpan, moving, target, move, advance, resize, zoom, fit: () => resize(start, end - start) }
}
