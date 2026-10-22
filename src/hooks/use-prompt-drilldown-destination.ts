import { useLayoutEffect, useRef, type RefObject } from "react"
import { useAppUiStore, type PromptUsageViewMode } from "@/stores/app-ui-store"
import "@/components/prompt-usage-range-landing.css"

/** Measure only the visible destination after its scope/filter reset renders. */
export function usePromptDrilldownDestination(mode: PromptUsageViewMode, active: boolean, surfaceRef: RefObject<HTMLElement | null>, filterRef: RefObject<HTMLElement | null>) {
  const transition = useAppUiStore(state => active ? state.promptUsageDrilldownTransition : null)
  const setTransition = useAppUiStore(state => state.setPromptUsageDrilldownTransition)
  const own = (transition?.destination ?? "timeline") === mode ? transition : null
  const wasReady = useRef(false)
  useLayoutEffect(() => {
    const filter = filterRef.current
    if (!filter || !active || own?.phase !== "arriving") return
    filter.dataset.drilldownFilter = "target"
    return () => { delete filter.dataset.drilldownFilter }
  }, [active, own?.phase, filterRef])
  useLayoutEffect(() => {
    const completed = active && wasReady.current && transition === null
    wasReady.current = Boolean(active && own?.phase === "arriving" && own.destinationSurfaceRect && own.destinationFilterRect)
    const filter = filterRef.current
    if (!completed || !filter) return

    // The real FLIP handoff starts the emphasis; its duration only controls the dwell.
    filter.dataset.drilldownRange = "landing"
    const dismiss = () => { delete filter.dataset.drilldownRange }
    const timeout = window.setTimeout(dismiss, 3000)
    filter.addEventListener("pointerdown", dismiss)
    filter.addEventListener("keydown", dismiss)
    return () => {
      window.clearTimeout(timeout)
      filter.removeEventListener("pointerdown", dismiss)
      filter.removeEventListener("keydown", dismiss)
      dismiss()
    }
  }, [active, own, transition, filterRef])
  useLayoutEffect(() => {
    if (!active || own?.phase !== "arriving" || own.destinationSurfaceRect || own.destinationFilterRect) return
    const frame = requestAnimationFrame(() => {
      const surface = surfaceRef.current?.getBoundingClientRect()
      const filter = filterRef.current?.getBoundingClientRect()
      if (!surface || !filter || surface.width <= 0 || surface.height <= 0 || filter.width <= 0 || filter.height <= 0) return
      const rect = ({ left, top, width, height }: DOMRect) => ({ left, top, width, height })
      setTransition({ ...own, destinationSurfaceRect: rect(surface), destinationFilterRect: rect(filter) })
    })
    return () => cancelAnimationFrame(frame)
  }, [active, own, surfaceRef, filterRef, setTransition])
  return own
}
