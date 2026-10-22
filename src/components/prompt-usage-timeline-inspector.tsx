import { ArrowRight } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { PromptInspector, type PromptUsageCopyState } from "@/components/prompt-usage-inspector"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"

type InspectorItem = { session: PromptUsageSession; turn: PromptUsageTurn }

type Props = {
  item: InspectorItem | null
  source: HTMLButtonElement | null
  copyState: PromptUsageCopyState
  onCopy: () => void
  onNavigateToSession: (sessionId: string) => void
  onClose: () => void
  onExitComplete?: (restoreFocus: () => void) => void
  onOpenSession?: (source: HTMLElement) => void
  openSessionLabel?: string
}

function sourceTransform(source: HTMLButtonElement | null, destination: DOMRect, shell: HTMLElement): string {
  if (!source?.isConnected || !destination.width || !destination.height) return "translateX(24px)"
  const origin = source.getBoundingClientRect()
  const scaleX = shell.offsetWidth ? destination.width / shell.offsetWidth : 1
  const scaleY = shell.offsetHeight ? destination.height / shell.offsetHeight : 1
  return `translate(${(origin.left - destination.left) / scaleX}px, ${(origin.top - destination.top) / scaleY}px) scale(${Math.max(origin.width, 8) / destination.width}, ${Math.max(origin.height, 8) / destination.height})`
}

/** Preserve the shared inspector at its final geometry while its shell travels from the event. */
export function PromptUsageTimelineInspector({
  item, source, copyState, onCopy, onNavigateToSession, onClose, onOpenSession, openSessionLabel, onExitComplete,
}: Props) {
  const [retainedItem, setRetainedItem] = useState(item)
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sourceRef = useRef(source)
  const footerRef = useRef({ onOpenSession, openSessionLabel })
  const animations = useRef<Animation[]>([])
  const transition = useRef(0)
  const wasOpen = useRef(false)
  const displayedItem = item ?? retainedItem
  const selectionKey = item ? `${item.session.id}:${item.turn.id}` : null

  useLayoutEffect(() => {
    if (!item) return
    setRetainedItem(item)
    sourceRef.current = source
    footerRef.current = { onOpenSession, openSessionLabel }
  }, [item, source, onOpenSession, openSessionLabel])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const content = contentRef.current
    if (!shell || !content) return

    const sequence = ++transition.current
    const currentTransform = getComputedStyle(shell).transform
    const currentShellOpacity = getComputedStyle(shell).opacity
    const currentOpacity = getComputedStyle(content).opacity
    const interrupted = animations.current.some((animation) => animation.playState === "running")
    animations.current.forEach((animation) => animation.cancel())
    animations.current = []

    const opening = Boolean(item)
    const destination = shell.getBoundingClientRect()
    const originTransform = sourceTransform(sourceRef.current, destination, shell)
    const restoreFocus = document.activeElement === document.body || shell.contains(document.activeElement)

    const finish = (immediate = false) => {
      if (sequence !== transition.current) return
      animations.current.forEach((animation) => animation.cancel())
      animations.current = []
      if (opening) {
        const active = document.activeElement
        if (!shell.parentElement?.closest("[hidden], [inert]") &&
          (immediate || active === document.body || active === sourceRef.current || shell.contains(active))) {
          headingRef.current?.focus({ preventScroll: true })
        }
      } else {
        setRetainedItem(null)
        const returnToSource = () => {
          if (sequence !== transition.current) return
          const origin = sourceRef.current
          const stillInInspector = document.activeElement === document.body || shell.contains(document.activeElement)
          if (restoreFocus && stillInInspector && origin?.isConnected && !origin.closest("[hidden], [inert]")) origin.focus({ preventScroll: true })
        }
        if (onExitComplete) onExitComplete(returnToSource)
        else returnToSource()
      }
    }

    if (typeof shell.animate !== "function") {
      wasOpen.current = opening
      finish(true)
      return
    }

    const fromTransform = interrupted ? currentTransform : opening && !wasOpen.current ? originTransform : "none"
    const shellAnimation = shell.animate([
      { transform: fromTransform, opacity: interrupted ? currentShellOpacity : 1 },
      { transform: opening ? "none" : originTransform, opacity: opening ? 1 : 0 },
    ], { duration: opening ? 440 : 300, easing: opening ? "cubic-bezier(0.2,0.7,0.2,1)" : "cubic-bezier(0.4,0,0.6,1)", fill: "both" })
    const contentAnimation = content.animate(opening ? [
      { opacity: interrupted ? currentOpacity : 0, offset: 0 },
      { opacity: interrupted ? currentOpacity : 0, offset: 0.4 },
      { opacity: 1, offset: 1 },
    ] : [
      { opacity: currentOpacity, offset: 0 },
      { opacity: 0, offset: 0.35 },
      { opacity: 0, offset: 1 },
    ], { duration: opening ? 440 : 300, easing: "ease-out", fill: "both" })
    animations.current = [shellAnimation, contentAnimation]
    wasOpen.current = opening
    void shellAnimation.finished.then(() => finish(), () => {})
    // Selection identity owns the transition; copy feedback and refreshed data must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  useEffect(() => () => {
    transition.current++
    animations.current.forEach((animation) => animation.cancel())
  }, [])

  useEffect(() => {
    if (!item) return
    const dismissOutside = (event: MouseEvent) => {
      const shell = shellRef.current
      const target = event.target
      if (!shell || !(target instanceof Node) || shell.closest("[hidden], [inert]") ||
        shell.contains(target) || (target instanceof Element && target.closest("[data-cost-explanation], .contextual-guide-dock, .timeline-help-trigger, .prompt-help-frame, .prompt-help-backdrop")) || sourceRef.current?.contains(target)) return
      onClose()
    }
    // Capture runs before a different prompt's click handler, so that handler can retarget
    // the inspector. A listener installed by the opening click cannot see its capture phase.
    document.addEventListener("click", dismissOutside, true)
    return () => document.removeEventListener("click", dismissOutside, true)
  }, [Boolean(item), onClose])

  if (!displayedItem) return null
  const footer = item ? { onOpenSession, openSessionLabel } : footerRef.current
  return (
    <div
      ref={shellRef}
      className="absolute inset-y-0 right-0 z-30 min-h-0 w-[clamp(42rem,50vw,50rem)] max-w-[92%] overflow-hidden bg-card shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.72)] max-[760px]:w-full max-[760px]:max-w-full"
      style={{ transformOrigin: "top left", pointerEvents: item ? undefined : "none" }}
      data-testid="prompt-usage-detail-inspector-region"
      data-prompt-id={displayedItem.turn.id}
      data-state={item ? "open" : "closing"}
      inert={!item}
    >
      <div ref={contentRef} className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <PromptInspector
            session={displayedItem.session}
            turn={displayedItem.turn}
            copyState={copyState}
            onCopy={onCopy}
            onNavigateToSession={onNavigateToSession}
            onClose={onClose}
            headingRef={headingRef}
            layout="overlay"
            animateEntrance={false}
          />
        </div>
        {footer.onOpenSession && footer.openSessionLabel && (
          <div className="shrink-0 border-l border-t border-border/70 bg-card px-4 py-3">
            <button type="button" onClick={() => { if (shellRef.current) footer.onOpenSession?.(shellRef.current) }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm transition-colors hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {footer.openSessionLabel}<ArrowRight size={18} weight="bold" className="shrink-0" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
