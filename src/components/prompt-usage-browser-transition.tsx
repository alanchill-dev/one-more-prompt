import { useLayoutEffect, useRef, type RefObject } from "react"

export type BrowserTransitionSource = { rect: DOMRect; content: HTMLElement; background: string; radius: string }

/** Capture before hiding Timeline. The same shell survives until the reader is ready. */
export function captureBrowserTransition(source: HTMLElement): BrowserTransitionSource {
  const style = getComputedStyle(source)
  const content = source.cloneNode(true) as HTMLElement
  content.removeAttribute("id")
  content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"))
  content.setAttribute("aria-hidden", "true")
  content.inert = true
  Object.assign(content.style, { position: "relative", inset: "auto", left: "0", top: "0", width: "100%", height: "100%", margin: "0", transform: "none", animation: "none", boxShadow: "none" })
  return { rect: source.getBoundingClientRect(), content, background: style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent" ? "var(--card)" : style.backgroundColor, radius: style.borderRadius }
}

export function PromptUsageBrowserTransition({ source, host, onComplete }: {
  source: BrowserTransitionSource
  host: RefObject<HTMLDivElement | null>
  onComplete: () => void
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const shell = shellRef.current, content = contentRef.current, frame = host.current ?? shell?.parentElement
    const destination = frame?.querySelector<HTMLElement>('[data-browser-destination] [data-column="details"]')
    if (!shell || !content || !frame || !destination) { onComplete(); return }
    const focusReader = () => destination.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true })
    if (!shell.animate) {
      focusReader(); onComplete(); return
    }
    // Measure only the transform-free destination, never a moving panel.
    const bounds = frame.getBoundingClientRect(), target = destination.getBoundingClientRect()
    if (!target.width || !target.height || !source.rect.width || !source.rect.height) { focusReader(); onComplete(); return }
    content.replaceChildren(source.content)
    Object.assign(content.style, { width: `${source.rect.width}px`, height: `${source.rect.height}px`, transformOrigin: "top left" })
    Object.assign(shell.style, { left: `${target.left - bounds.left}px`, top: `${target.top - bounds.top}px`, width: `${target.width}px`, height: `${target.height}px` })
    const from = `translate(${source.rect.left - target.left}px, ${source.rect.top - target.top}px) scale(${source.rect.width / target.width}, ${source.rect.height / target.height})`
    let cancelled = false
    const duration = 460
    const travel = shell.animate([
      { transform: from, borderRadius: source.radius, opacity: 1 },
      { transform: "none", borderRadius: "0px", opacity: 1, offset: .8 },
      { transform: "none", borderRadius: "0px", opacity: 0 },
    ], { duration, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" })
    const fadeSource = content.animate([{ opacity: 1, transform: `scale(${target.width / source.rect.width}, ${target.height / source.rect.height})` }, { opacity: 0, transform: "none", offset: .4 }, { opacity: 0, transform: "none" }], { duration, fill: "both" })
    const reveal = destination.animate([{ opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 }], { duration, fill: "both" })
    void travel.finished.then(() => { if (!cancelled) { focusReader(); onComplete() } }, () => {})
    return () => { cancelled = true; travel.cancel(); fadeSource.cancel(); reveal.cancel() }
  }, [source, host, onComplete])
  return <div ref={shellRef} aria-hidden="true" data-testid="prompt-browser-transition-shell" className="pointer-events-none absolute z-[140] overflow-hidden border border-border bg-card" style={{ transformOrigin: "top left", background: source.background }}>
    <div ref={contentRef} className="h-full w-full overflow-hidden" />
  </div>
}
