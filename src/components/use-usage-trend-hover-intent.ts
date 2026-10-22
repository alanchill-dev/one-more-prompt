import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react"

import type { UsageTrendDetailCardLayout } from "@/components/usage-trend-detail-card"

type HoverIntentOptions = {
  interactiveIndices: readonly number[]
  initialIndex: number
  resetKey: unknown
}

export type UsageTrendHoverBridgeGeometry = {
  left: number
  top: number
  width: number
  height: number
}

const HIDE_DELAY_MS = 120

function isMouseLikePointer(pointerType: string): boolean {
  return pointerType === "" || pointerType === "mouse"
}

export function getUsageTrendHoverBridgeGeometry({
  activeX,
  slotWidth,
  slotTop,
  slotBottom,
  card,
}: {
  activeX: number
  slotWidth: number
  slotTop: number
  slotBottom: number
  card: UsageTrendDetailCardLayout
}): UsageTrendHoverBridgeGeometry | null {
  const slotEdgeX = card.side === "right"
    ? activeX + slotWidth / 2
    : activeX - slotWidth / 2
  const cardEdgeX = card.side === "right" ? card.left : card.left + card.width
  const width = card.side === "right" ? cardEdgeX - slotEdgeX : slotEdgeX - cardEdgeX
  if (width <= 0) return null

  // Cover the whole transit gap so diagonal travel cannot hit a neighboring slot.
  const top = Math.min(slotTop, card.top)
  const bottom = Math.max(slotBottom, card.top + card.height)
  return { left: Math.min(slotEdgeX, cardEdgeX), top, width, height: bottom - top }
}

export function useUsageTrendHoverIntent({
  interactiveIndices,
  initialIndex,
  resetKey,
}: HoverIntentOptions) {
  const lastInteractiveIndex = interactiveIndices[interactiveIndices.length - 1] ?? -1
  const safeInitialIndex = interactiveIndices.includes(initialIndex) ? initialIndex : lastInteractiveIndex
  const interactiveKey = interactiveIndices.join(",")
  const [activeIndexState, setActiveIndex] = useState(safeInitialIndex)
  const [tooltipIndexState, setTooltipIndex] = useState<number | null>(null)
  const pointRefs = useRef<Array<HTMLButtonElement | null>>([])
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeIndex = interactiveIndices.includes(activeIndexState) ? activeIndexState : safeInitialIndex
  const tooltipIndex = tooltipIndexState != null && interactiveIndices.includes(tooltipIndexState) ? tooltipIndexState : null

  useEffect(() => {
    setActiveIndex(safeInitialIndex)
    setTooltipIndex(null)
    pointRefs.current = []
  }, [resetKey, safeInitialIndex, interactiveKey])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  function cancelHide() {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = null
  }

  function scheduleHide() {
    cancelHide()
    hideTimerRef.current = setTimeout(() => {
      setTooltipIndex(null)
    }, HIDE_DELAY_MS)
  }

  function activate(index: number, focus = false) {
    cancelHide()
    if (!interactiveIndices.includes(index)) {
      setTooltipIndex(null)
      return
    }
    setActiveIndex(index)
    setTooltipIndex(index)
    if (focus) pointRefs.current[index]?.focus()
  }

  function handleSlotPointerEnter(event: PointerEvent<HTMLElement>, index: number) {
    if (!isMouseLikePointer(event.pointerType)) return
    activate(index)
  }

  function handleSlotMouseEnter(index: number) {
    activate(index)
  }

  function handleSlotFocus(index: number) {
    activate(index)
  }

  function handleSlotBlur(event: FocusEvent<HTMLButtonElement>) {
    if ((event.relatedTarget as Element | null)?.closest?.('[data-trend-detail-card="true"]')) return
    scheduleHide()
  }

  function handlePointKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }
    if (event.key in moves) {
      event.preventDefault()
      const position = interactiveIndices.indexOf(index)
      const nextPosition = Math.max(0, Math.min(interactiveIndices.length - 1, position + moves[event.key]))
      activate(interactiveIndices[nextPosition] ?? -1, true)
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      activate((event.key === "Home" ? interactiveIndices[0] : lastInteractiveIndex) ?? -1, true)
    }
  }

  return {
    activeIndex,
    tooltipIndex,
    pointRefs,
    cancelHide,
    scheduleHide,
    activate,
    handleSlotPointerEnter,
    handleSlotMouseEnter,
    handleSlotFocus,
    handleSlotBlur,
    handlePointKeyDown,
  }
}
