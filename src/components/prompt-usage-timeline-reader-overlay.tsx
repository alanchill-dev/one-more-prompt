import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { PromptUsageTimelineReader, type PromptUsageTimelineReaderProps } from "./prompt-usage-timeline-reader"

interface Props extends PromptUsageTimelineReaderProps {
  source: HTMLButtonElement | null
  covered: boolean
}

function sourceTransform(source: HTMLButtonElement | null, destination: DOMRect, shell: HTMLElement): string {
  if (!source?.isConnected || !destination.width || !destination.height) return "translateX(24px)"
  const origin = source.getBoundingClientRect()
  const scaleX = shell.offsetWidth ? destination.width / shell.offsetWidth : 1
  const scaleY = shell.offsetHeight ? destination.height / shell.offsetHeight : 1
  return `translate(${(origin.left - destination.left) / scaleX}px, ${(origin.top - destination.top) / scaleY}px) scale(${Math.max(origin.width, 8) / destination.width}, ${Math.max(origin.height, 8) / destination.height})`
}

export function PromptUsageTimelineReaderOverlay(props: Props) {
  const { clusterItems, source, covered, onClearCluster } = props
  const [retained, setRetained] = useState(clusterItems)
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef(source)
  const animations = useRef<Animation[]>([])
  const sequence = useRef(0)
  const wasOpen = useRef(false)
  const open = Boolean(clusterItems?.length)
  const key = clusterItems?.map(item => item.turn.id).join("|") ?? null
  useLayoutEffect(() => {
    if (open) { setRetained(clusterItems); sourceRef.current = source }
  }, [clusterItems, source, open])
  useLayoutEffect(() => {
    const shell = shellRef.current, content = contentRef.current
    if (!shell || !content) return
    const token = ++sequence.current
    const interrupted = animations.current.some(animation => animation.playState === "running")
    const transform = getComputedStyle(shell).transform
    const opacity = getComputedStyle(content).opacity
    animations.current.forEach(animation => animation.cancel())
    animations.current = []
    const origin = sourceTransform(sourceRef.current, shell.getBoundingClientRect(), shell)
    const shouldRestore = document.activeElement === document.body || shell.contains(document.activeElement)
    const finish = () => {
      if (token !== sequence.current) return
      animations.current.forEach(animation => animation.cancel())
      animations.current = []
      if (!open) {
        setRetained(null)
        if (shouldRestore && (document.activeElement === document.body || shell.contains(document.activeElement)) && sourceRef.current?.isConnected) sourceRef.current.focus({ preventScroll: true })
      } else if (!shell.closest("[hidden], [inert]") && (document.activeElement === document.body || document.activeElement === sourceRef.current || shell.contains(document.activeElement))) {
        content.querySelector<HTMLButtonElement>(".prompt-reader-back")?.focus({ preventScroll: true })
      }
    }
    if (typeof shell.animate !== "function") {
      wasOpen.current = open; finish(); return
    }
    const duration = open ? 440 : 300
    const movement = shell.animate([
      { transform: interrupted ? transform : open && !wasOpen.current ? origin : "none", opacity: 1 },
      { transform: open ? "none" : origin, opacity: open ? 1 : 0 },
    ], { duration, easing: open ? "cubic-bezier(.2,.7,.2,1)" : "cubic-bezier(.4,0,.6,1)", fill: "both" })
    const reveal = content.animate(open ? [
      { opacity: interrupted ? opacity : 0, offset: 0 },
      { opacity: interrupted ? opacity : 0, offset: .4 },
      { opacity: 1, offset: 1 },
    ] : [{ opacity }, { opacity: 0, offset: .35 }, { opacity: 0 }], { duration, fill: "both" })
    animations.current = [movement, reveal]
    wasOpen.current = open
    void movement.finished.then(finish, () => {})
  }, [key, open])
  useEffect(() => () => { sequence.current++; animations.current.forEach(animation => animation.cancel()) }, [])
  useEffect(() => {
    if (!open || covered) return
    const blocked = () => shellRef.current?.parentElement?.querySelector('[data-testid="prompt-usage-detail-inspector-region"]')
    const outside = (event: MouseEvent) => {
      const shell = shellRef.current
      if (blocked() || !shell || shell.closest("[hidden], [inert]") || !(event.target instanceof Node) || shell.contains(event.target) ||
        (event.target instanceof Element && event.target.closest(".contextual-guide-dock, [data-cost-explanation]")) || sourceRef.current?.contains(event.target)) return
      if (shell.querySelector("[data-reader-detail]")) props.onCloseItem?.()
      else onClearCluster()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !shellRef.current?.querySelector("[data-reader-detail]") && !blocked() && !shellRef.current?.closest("[hidden], [inert]")) { event.preventDefault(); onClearCluster() }
    }
    document.addEventListener("click", outside, true)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("click", outside, true); document.removeEventListener("keydown", escape) }
  }, [open, covered, onClearCluster])
  const displayed = open ? clusterItems : retained
  if (!displayed?.length) return null
  return <div ref={shellRef} className="prompt-reader-overlay" style={{ transformOrigin: "top left" }} data-testid="timeline-reader-overlay" data-state={open ? "open" : "closing"} inert={!open || covered} aria-hidden={!open || covered}>
    <div ref={contentRef} className="h-full min-h-0"><PromptUsageTimelineReader {...props} clusterItems={displayed} /></div>
  </div>
}
