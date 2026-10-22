import { useLayoutEffect, useRef, useState } from "react"
import { useAppUiStore } from "@/stores/app-ui-store"
import { camera, cardPosition, find, isComplete, localRect, peakSlot, projectRegions, target, timelinePlot, timelineRegions, type Rect } from "./runtime"
import { stabilizeCardPosition, type CardPlacement, type CardPosition } from "./positioning"
import { GUIDE_STEPS } from "./steps"

export type GuideLayout = {
  app: DOMRect; focus: Rect; extras: Rect[]; x: number; y: number; w: number
  placement: CardPlacement; highlights: Rect[]
  maxHeight?: number
  pins: { n: number; x: number; y: number }[]
}
export const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function useGuideLayout(props: {
  step: number
  reset: string
  onComplete: (step: number) => void
}) {
  const { step } = props
  const meta = GUIDE_STEPS[step - 1]
  const id = meta.id
  const [shown, setShown] = useState(step)
  const [layout, setLayout] = useState<GuideLayout | null>(null)
  const [phase, setPhase] = useState("entering")
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const card = useRef<HTMLElement>(null)
  const baseline = useRef(camera())
  const dragging = useRef(false)
  const latest = useRef(props)
  const hole = useRef<SVGRectElement>(null)
  const outline = useRef<SVGRectElement>(null)
  const previousFocus = useRef<{ rect: Rect; step: number } | null>(null)
  const previousCard = useRef<{ x: number; y: number; step: number } | null>(null)
  latest.current = props

  useLayoutEffect(() => {
    let live = true
    let frame = 0
    let timer = 0
    setPhase("leaving")
    setFailed(false)
    void (async () => {
      if (shown !== step) await wait(reduced() ? 0 : 110)
      if (!live) return
      setShown(step)
      setLayout(null)
      const scroll = find(".overview-screen")
      if (meta.stage === 1 && scroll) {
        const next = id === "quota-intro" ? Math.max(0, scroll.scrollHeight - scroll.clientHeight - 28) : 0
        if (Math.abs(scroll.scrollTop - next) > 8) {
          scroll.scrollTo({ top: next, behavior: reduced() ? "instant" : "smooth" })
          await wait(reduced() ? 0 : 370)
        }
      }
      if (id === "session" || id === "prompt") target(step)?.scrollIntoView({ block: id === "prompt" ? "center" : "nearest", inline: "nearest", behavior: "instant" })
      if (id.startsWith("prompt-")) target(step)?.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      if (!live) return
      baseline.current = camera()
      let missingAt = 0
      let last = ""
      let stablePosition: CardPosition | null = null
      let revealed = false
      const measure = () => {
        if (!live) return
        // Keep the discovered day open while the user travels to its workspace action.
        if (id === "drill" && useAppUiStore.getState().activeView === "home" && !find('[data-testid="usage-trend-tooltip"]')) {
          peakSlot()?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
        }
        const app = find(".guide-workspace")?.getBoundingClientRect()
        const node = target(step)
        const routing = useAppUiStore.getState().promptUsageDrilldownTransition
        if (app && node && !routing) {
          if (id === "event" && !revealed) {
            node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
            revealed = true
          }
          missingAt = 0
          setFailed(false)
          const regions = id === "timeline-intro" ? timelineRegions(app) : id === "project-intro" ? projectRegions(app) : []
          const focus = regions[0]?.rect ?? localRect(node, app, id === "zoom" ? 5 : 7)
          if (id === "pan") {
            const pan = find(".prompt-navigation-handle-pan")
            if (pan) {
              const p = localRect(pan, app)
              focus.h = Math.max(focus.h, p.y + p.h - focus.y)
            }
          }
          const extras: Rect[] = regions.slice(1).map(region => region.rect)
          const plot = id === "pan" || id === "zoom" ? timelinePlot(app) : null
          if (plot) extras.push(plot)
          if (id === "drill") {
            for (const selector of ['[data-testid="usage-trend-tooltip"]', '[data-testid="usage-trend-hover-bridge"]']) {
              const detail = find(selector)
              if (detail && detail !== node) extras.push(localRect(detail, app, 5))
            }
          }
          if (id === "api-estimate") {
            const reading = find('[data-testid="usage-trend-primary-reading"]')
            if (reading) extras.push(localRect(reading, app, 5))
          }
          if (id === "model-palette" && find('[data-testid="usage-trend-model-color-inspector"][data-state="open"]')) {
            const chart = find('[data-guide-target="activity-chart"]')
            if (chart) extras.push(localRect(chart, app, 0))
          }
          if (id === "prompt-usage") {
            const columns = find('[data-testid="prompt-usage-token-ledger-columns"]')
            if (columns) extras.push(localRect(columns, app, 5))
          }
          if (id === "prompt-agents") {
            for (const agent of document.querySelectorAll("#prompt-usage-inspector .token-ledger-agent")) {
              if (agent !== node && agent.getBoundingClientRect().height) extras.push(localRect(agent, app, 5))
            }
          }
          const right = id === "project-intro" ? regions.find(region => region.n === 3)?.rect : undefined
          const w = Math.min(id === "timeline-intro" ? 760 : 330, app.width - 28, plot ? plot.x - 24 : Infinity, right ? right.w - 32 : Infinity)
          const maxHeight = Math.min(app.height - 118, plot ? plot.h - 24 : Infinity, right ? right.h - 32 : Infinity)
          const h = Math.min(card.current?.getBoundingClientRect().height ?? 280, maxHeight)
          const anchor = regions.length ? regions[regions.length - 1].rect : focus
          const obstacles = regions.length ? regions.slice(0, -1).map(region => region.rect) : id === "model-palette" ? [] : extras
          const pos = stabilizeCardPosition(cardPosition(step, app, w, h, anchor, obstacles), stablePosition, dragging.current && (id === "pan" || id === "zoom"))
          stablePosition = pos
          const pins = regions.map(({ n, rect: r }) => ({ n, x: Math.min(app.width - 36, r.x + (id === "project-intro" ? r.w - 32 : n === 1 ? r.w - 46 : n === 3 ? r.w - 32 : 14)), y: r.y + (id === "project-intro" ? -11 : 7) }))
          const highlights = regions.length ? regions.map(region => region.rect) : [focus]
          const next = { app, focus, extras, highlights, ...pos, w, maxHeight, pins }
          const key = JSON.stringify([focus, extras, highlights, pos, w, maxHeight, app.width, app.height, pins])
          if (key !== last) { setLayout(next); last = key }
          setPhase("visible")
        } else if (routing) {
          missingAt = 0
          setFailed(false)
          setPhase("leaving")
        } else {
          setPhase("leaving")
          if (!missingAt) missingAt = performance.now()
          if (performance.now() - missingAt > 4800) { setFailed(true); setPhase("visible") }
        }
        frame = requestAnimationFrame(measure)
      }
      frame = requestAnimationFrame(measure)
      timer = window.setInterval(() => {
        if (!dragging.current && isComplete(step, latest.current.reset, baseline.current)) latest.current.onComplete(step)
      }, 110)
    })()
    return () => { live = false; cancelAnimationFrame(frame); clearInterval(timer) }
  }, [step, retry])

  useLayoutEffect(() => {
    if (!layout || !card.current) return
    const oldFocus = previousFocus.current
    if (oldFocus && oldFocus.step !== shown && !reduced()
      && Math.hypot(oldFocus.rect.x - layout.focus.x, oldFocus.rect.y - layout.focus.y) < 440) {
      const frame = (r: Rect) => ({ x: `${r.x}px`, y: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
      for (const node of [hole.current, outline.current]) {
        node?.animate([frame(oldFocus.rect), frame(layout.focus)], { duration: 280, easing: "cubic-bezier(.16,1,.3,1)" })
      }
    }
    previousFocus.current = { rect: layout.focus, step: shown }
    const prev = previousCard.current
    if (prev && prev.step !== shown && !reduced()) {
      const dx = prev.x - layout.x
      const dy = prev.y - layout.y
      if (Math.hypot(dx, dy) < 440) {
        card.current.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "translate(0,0)" }], { duration: 280, easing: "cubic-bezier(.16,1,.3,1)" })
      } else card.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 190, easing: "ease-out" })
    }
    previousCard.current = { x: layout.x, y: layout.y, step: shown }
  }, [shown, layout?.x, layout?.y])

  return { shown, layout, active: phase === "visible", failed, retry: () => setRetry(n => n + 1), card, hole, outline, dragging }
}
