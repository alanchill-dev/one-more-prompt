import { Dialog } from "@base-ui/react/dialog"
import { Question, X } from "@phosphor-icons/react"
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { SharedElementMorph, type SharedElementRect } from "./shared-element-morph"
import "./prompt-usage-timeline-help.css"
import "./prompt-usage-help-dialog.css"

type Frame = SharedElementRect & { radius: string }
let activeHelp: { close: () => void } | null = null
const EXIT_MS = 320

export function PromptUsageHelpDialog({ title, closeLabel, testId, panelClassName, children }: {
  title: string; closeLabel: string; testId: string; panelClassName?: string; children: ReactNode
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null)
  const setPanel = useCallback((element: HTMLDivElement | null) => { panel.current = element; setPopupElement(element) }, [])
  const source = useRef<SharedElementRect | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreFocus = useRef(true)
  const instance = useRef({ close: () => {} })
  const [rendered, setRendered] = useState(false)
  const [phase, setPhase] = useState<"open" | "closed">("closed")
  const [frame, setFrame] = useState<Frame | null>(null)
  const [destination, setDestination] = useState<SharedElementRect | null>(null)

  const close = useCallback(() => {
    setPhase("closed")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setRendered(false); setDestination(null)
      if (activeHelp === instance.current) activeHelp = null
    }, EXIT_MS)
  }, [])
  instance.current.close = () => {
    restoreFocus.current = false
    if (timer.current) clearTimeout(timer.current)
    setRendered(false); setDestination(null); setPhase("closed")
  }
  const open = () => {
    if (activeHelp && activeHelp !== instance.current) activeHelp.close()
    activeHelp = instance.current
    if (timer.current) clearTimeout(timer.current)
    restoreFocus.current = true
    const rect = trigger.current!.getBoundingClientRect()
    source.current = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    setRendered(true); setPhase("open")
  }
  useLayoutEffect(() => {
    if (!rendered) return
    const surface = trigger.current?.closest<HTMLElement>(".app-panel-surface") ?? document.querySelector<HTMLElement>(".app-panel-surface")
    const measure = () => {
      const anchor = trigger.current?.getBoundingClientRect()
      if (anchor) source.current = { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }
      const bounds = surface?.getBoundingClientRect()
      const next: Frame = bounds && bounds.width > 0 && bounds.height > 0
        ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, radius: getComputedStyle(surface!).borderRadius || "12px" }
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, radius: "0px" }
      const width = Math.max(1, Math.min(500, next.width - 40))
      const maxHeight = Math.max(1, next.height - 40)
      if (panel.current) {
        panel.current.style.width = `${width}px`
        panel.current.style.maxHeight = `${maxHeight}px`
      }
      const height = Math.min(maxHeight, panel.current?.getBoundingClientRect().height || panel.current?.scrollHeight || 96)
      setFrame(next)
      const target = { left: next.left + (next.width - width) / 2, top: next.top + (next.height - height) / 2, width, height }
      setDestination(previous => previous && Object.keys(target).every(key => previous[key as keyof SharedElementRect] === target[key as keyof SharedElementRect]) ? previous : target)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (surface) observer.observe(surface)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener("resize", measure)
    return () => { observer.disconnect(); window.removeEventListener("resize", measure) }
  }, [rendered, popupElement])
  useLayoutEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (activeHelp === instance.current) activeHelp = null
  }, [])

  const clip = frame ? `inset(${frame.top}px ${Math.max(0, window.innerWidth - frame.left - frame.width)}px ${Math.max(0, window.innerHeight - frame.top - frame.height)}px ${frame.left}px round ${frame.radius})` : "inset(0)"
  return <Dialog.Root open={rendered} onOpenChange={next => { if (next) open(); else close() }}>
    <Dialog.Trigger ref={trigger} className="timeline-help-trigger" data-help-hidden={rendered || undefined} aria-label={title} data-testid={`${testId}-trigger`}>
      <Question size={20} weight="bold" aria-hidden="true" />
    </Dialog.Trigger>
    {rendered && <Dialog.Portal>
      <Dialog.Backdrop className="prompt-help-backdrop" data-state={phase} style={frame ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height, borderRadius: frame.radius } : undefined} data-testid={`${testId}-backdrop`} />
      <div className="prompt-help-frame" style={{ clipPath: clip }} data-state={phase} data-testid={`${testId}-frame`}>
        {destination && <SharedElementMorph sourceRect={source.current} destinationRect={destination} motionState={phase} sourceRadius="50%" destinationRadius="16px" sourceBackground="var(--card)" destinationBackground="var(--surface-help, var(--popover))" sourceBorderColor="transparent" destinationBorderColor="transparent" sourceVisual={<Question size={20} weight="bold" className="text-[var(--wire-orange)]" />} testId={`${testId}-morph`} />}
        <Dialog.Viewport className="prompt-help-viewport">
          <Dialog.Popup ref={setPanel} initialFocus={panel} aria-modal="true" finalFocus={() => restoreFocus.current ? trigger.current : false} className={`prompt-help-panel shared-element-destination-card ${panelClassName ?? ""}`} data-ready={Boolean(destination)} data-state={phase} data-testid={testId} style={destination ? { left: destination.left, top: destination.top, width: destination.width, maxHeight: frame ? Math.max(1, frame.height - 40) : undefined } : undefined}>
            <header className="prompt-help-header"><Dialog.Title>{title}</Dialog.Title><button type="button" className="timeline-help-close" aria-label={closeLabel} data-testid={`${testId}-close`} onClick={close}><X size={18} aria-hidden="true" /></button></header>
            <div className="prompt-help-content omp-scrollbar">{children}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </div>
    </Dialog.Portal>}
  </Dialog.Root>
}
