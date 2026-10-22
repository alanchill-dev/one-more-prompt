import { useLayoutEffect, type RefObject } from "react"
import { allowed, peakSlot } from "./runtime"
import { GUIDE_STEPS } from "./steps"

export function useGuideInteraction(step: number, onExit: () => void, card: RefObject<HTMLElement | null>, dragging: RefObject<boolean>) {
  useLayoutEffect(() => {
    const meta = GUIDE_STEPS[step - 1]
    const id = meta.id
    const detailRead = ["prompt-original", "prompt-timing", "prompt-usage", "prompt-agents"].includes(id)
    const inspector = '#prompt-usage-inspector,[data-testid="prompt-usage-detail-inspector-region"]'
    function inside(node: Element) {
      if (node.closest('[data-testid^="usage-trend-slot-"]')) return false
      const sidecarButton = node.closest('[data-testid="usage-trend-tooltip"] button')
      if (sidecarButton && (id !== "drill" || !sidecarButton.querySelector('[data-destination="hierarchy"]'))) return false
      if (node.closest(".guide-card,.demo-status button")) return true
      return !detailRead && allowed(step).some(e => e === node || e.contains(node))
    }
    function guard(e: Event) {
      if (!(e.target instanceof Element)) return
      const slot = e.target.closest('[data-testid^="usage-trend-slot-"]')
      // Only the deliberate drill-in activation may open a chart sidecar.
      if (id === "drill" && slot && slot === peakSlot() && e.type === "focusin" && !e.isTrusted) return
      if (inside(e.target)) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    const crossing = (e: MouseEvent) => {
      // React also synthesizes enter from the old element's out event.
      if (e.relatedTarget instanceof Element && !inside(e.relatedTarget)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    const down = (e: PointerEvent) => {
      guard(e)
      if (!e.defaultPrevented && e.target instanceof Element) {
        dragging.current = !!e.target.closest(".prompt-session-navigation-map,.prompt-navigation-handle")
      }
    }
    const up = () => { dragging.current = false }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onExit(); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "Tab") {
        const roots = [...(detailRead ? [] : allowed(step)), ...(card.current ? [card.current] : [])]
        const nodes = [...new Set(roots.flatMap(root => [root, ...root.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"],a,input')]))]
          .filter(n => n.tabIndex >= 0 && n.getBoundingClientRect().width > 0 && !(n as HTMLButtonElement).disabled
            && !n.closest('[inert],[aria-hidden="true"]')
            && !n.closest('[data-testid^="usage-trend-slot-"]')
            && (!n.closest('[data-testid="usage-trend-tooltip"]') || (id === "drill" && !!n.querySelector('[data-destination="hierarchy"]'))))
        e.preventDefault()
        if (nodes.length) {
          const current = nodes.indexOf(document.activeElement as HTMLElement)
          nodes[(current + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus({ preventScroll: true })
        }
      } else if (!(detailRead && e.target instanceof Element && e.target.closest(inspector)
        && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key))) guard(e)
    }
    const wheel = (e: WheelEvent) => {
      if (!(e.target instanceof Element) || e.target.closest(".guide-card")) return
      const palette = id === "model-palette" && e.target.closest('[data-testid="usage-trend-model-color-inspector"][data-state="open"]')
      const overview = meta.stage === 1 && e.target.closest(".overview-screen")
      const project = meta.stage === 2 && !detailRead && e.target.closest('[data-testid="prompt-usage-panel"]') && !e.altKey && !e.ctrlKey
      const pan = id === "pan" && e.target.closest(".prompt-session-navigation-map") && !e.altKey && !e.ctrlKey
      const detail = (detailRead || id === "event") && e.target.closest(inspector)
      if (!overview && !project && !pan && !detail && !palette) { e.preventDefault(); e.stopImmediatePropagation() }
    }
    // Capture before React's delegated handlers, including moves that do not enter a new element.
    const kinds = ["click", "dblclick", "contextmenu", "mouseover", "mousemove", "mouseenter", "pointerover", "pointermove", "pointerenter", "focus", "focusin"]
    kinds.forEach(k => document.addEventListener(k, guard, true))
    document.addEventListener("pointerout", crossing, true)
    document.addEventListener("mouseout", crossing, true)
    document.addEventListener("pointerdown", down, true)
    document.addEventListener("pointerup", up, true)
    document.addEventListener("pointercancel", up, true)
    document.addEventListener("keydown", key, true)
    document.addEventListener("wheel", wheel, { capture: true, passive: false })
    window.addEventListener("blur", up)
    return () => {
      kinds.forEach(k => document.removeEventListener(k, guard, true))
      document.removeEventListener("pointerout", crossing, true)
      document.removeEventListener("mouseout", crossing, true)
      document.removeEventListener("pointerdown", down, true)
      document.removeEventListener("pointerup", up, true)
      document.removeEventListener("pointercancel", up, true)
      document.removeEventListener("keydown", key, true)
      document.removeEventListener("wheel", wheel, true)
      window.removeEventListener("blur", up)
    }
  }, [step, onExit, card, dragging])
}
