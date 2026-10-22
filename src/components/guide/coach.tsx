import { ArrowLeft, ArrowRight, Check, ArrowClockwise } from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import type { GuideCopy } from "@/lib/guide-demo/copy"
import { GUIDE_STAGE_FIRST_STEPS, GUIDE_STAGE_SIZES, GUIDE_STEPS } from "./steps"
import { useGuideInteraction } from "./use-guide-interaction"
import { useGuideLayout } from "./use-guide-layout"

type Props = {
  step: number
  reset: string
  complete: number[]
  copy: GuideCopy
  onComplete: (step: number) => void
  onStep: (step: number) => void
  onExit: () => void
}

export function Coach(props: Props) {
  const { complete, onStep, onExit, copy } = props
  const { shown, layout, active, failed, retry, card, hole, outline, dragging } = useGuideLayout(props)
  useGuideInteraction(props.step, onExit, card, dragging)
  const meta = GUIDE_STEPS[shown - 1]
  const s = copy.steps[shown - 1]
  const read = meta.type === "read"
  const done = complete.includes(shown)
  const first = GUIDE_STAGE_FIRST_STEPS[meta.stage - 1]
  const total = GUIDE_STAGE_SIZES[meta.stage - 1]
  const c = copy.chrome
  const highlights = active && layout ? layout.highlights : []
  const extras = active && layout && !["timeline-intro", "project-intro"].includes(meta.id) ? layout.extras : []
  const placement = layout?.placement
  const cardActive = active

  return createPortal(<div className={`guide-layer ${active ? "is-visible" : ""}`} data-testid="interactive-guide" data-step={shown} data-complete={done || read}>
    <svg className="guide-mask" width="100%" height="100%" aria-hidden="true">
      <defs><mask id="guide-hole">
        <rect width="100%" height="100%" fill="white" />
        {highlights.map((r, i) => <rect key={i} ref={i === 0 ? hole : undefined} x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill="black" />)}
        {extras.map((r, i) => <rect key={`extra-${i}`} x={r.x} y={r.y} width={r.w} height={r.h} rx="9" fill="black" />)}
      </mask></defs>
      <rect data-testid="guide-shade" width="100%" height="100%" fill="#080a0b" opacity=".68" mask="url(#guide-hole)" />
      {highlights.map((r, i) => <rect key={i} ref={i === 0 ? outline : undefined} className="guide-focus" x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill="none" stroke="#f5572f" strokeWidth="1.5" />)}
    </svg>
    {active && layout?.pins.map(p => <span className="area-pin" key={p.n} style={{ left: p.x, top: p.y }}>{p.n}</span>)}
    <section ref={card} className={`guide-card ${read ? "reading" : ""} ${meta.id === "timeline-intro" ? "area-overview" : ""} ${cardActive ? "" : "is-suspended"} notch-${placement?.side ?? "none"}`} role="dialog" aria-modal="false" aria-labelledby="guide-title" aria-hidden={!cardActive} inert={!cardActive}
      style={{ left: layout?.x ?? 28, top: layout?.y ?? 140, width: layout?.w ?? 330, "--guide-card-max-height": layout?.maxHeight ? `${layout.maxHeight - 2}px` : undefined, "--notch": `${placement?.offset ?? 24}px` } as CSSProperties} data-testid="guide-card">
      <div className="guide-card-content">
        <div className="guide-meta">
          <span className="guide-stage">{copy.stages[meta.stage - 1]}<b>{shown - first + 1}<i> / {total}</i></b></span>
          <button className="guide-skip" onClick={onExit}>{c.skip}</button>
        </div>
        <div className="guide-copy" key={shown}>
          <h2 id="guide-title">{s.title}</h2><p>{s.body}</p>
          {s.points && <dl>{s.points.map(([name, desc]) => <div key={name}><dt>{name}</dt><dd>{desc}</dd></div>)}</dl>}
        </div>
        {(meta.id === "pan" || meta.id === "zoom") && <p className="guide-keyboard">{meta.id === "pan" ? c.panKeyboard : c.zoomKeyboard}</p>}
        {failed && <div className="guide-failure" role="alert"><p>{c.failure}</p><button onClick={retry}><ArrowClockwise size={14} />{c.retry}</button></div>}
        <div className="guide-actions">
          <button className="back-action" onClick={() => onStep(shown === 1 ? 0 : shown - 1)}><ArrowLeft size={14} />{shown === 1 ? c.backToOpening : c.previous}</button>
          <span id="guide-completion-status" className="sr-only" role="status" aria-live="polite">{!read && done ? c.completedTask : ""}</span>
          <button className="primary-action" data-testid="guide-next" aria-describedby={!read && done ? "guide-completion-status" : undefined} disabled={(!read && !done) || !cardActive || failed} onClick={() => onStep(shown + 1)}>
            {!read && done && <Check data-testid="guide-next-check" size={15} weight="bold" aria-hidden="true" />}
            {shown === GUIDE_STEPS.length ? c.finish : read ? c.continue : c.next}
            {(read || !done) && <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </section>
  </div>, document.body)
}
