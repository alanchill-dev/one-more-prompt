import { Fragment, useEffect, useRef } from "react"
import { ArrowRight, ChartBar, Clock, FolderSimple } from "@phosphor-icons/react"
import type { GuideCopy } from "@/lib/guide-demo/copy"
import { GUIDE_STAGE_SIZES } from "./steps"

export function GuideBookend({ finished, copy, onStart, onExit }: {
  finished: boolean
  copy: GuideCopy
  onStart: () => void
  onExit: () => void
}) {
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    const buttons = [...dialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? []]
    buttons.find(b => b.classList.contains("primary-action"))?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onExit() }
      if (e.key === "Tab" && buttons.length) {
        e.preventDefault()
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus()
      }
    }
    document.addEventListener("keydown", key, true)
    return () => document.removeEventListener("keydown", key, true)
  }, [onExit])
  const welcome = copy.welcome
  const finish = copy.finishCard
  return <div className="bookend-shade">
    <section ref={dialog} className={`bookend-card ${finished ? "finish-card" : ""}`} role="dialog" aria-modal="true" aria-labelledby="bookend-title">
      {finished && <div className="finish-symbol"><ChartBar size={27} /></div>}
      <div className="bookend-meta">
        <div className="bookend-kicker">{finished ? finish.kicker : welcome.kicker}{!finished && <span>{welcome.range}</span>}</div>
        {!finished && <button className="bookend-skip" onClick={onExit}>{copy.chrome.skip}</button>}
      </div>
      <h1 id="bookend-title">{finished ? finish.title : welcome.title}</h1>
      <p>{finished ? finish.body : welcome.body}</p>
      {finished ? <div className="finish-route">{finish.route.map((stage, i) => <Fragment key={stage}>{i > 0 && <span>／</span>}{stage}</Fragment>)}</div>
        : <ol>{[ChartBar, FolderSimple, Clock].map((Icon, i) => <li key={i}>
          <Icon size={22} weight="regular" /><div><b>{copy.stages[i]}</b><span>{welcome.stageDetails[i]}</span></div>
          <em>{GUIDE_STAGE_SIZES[i]} {welcome.stepsUnit}</em>
        </li>)}</ol>}
      <div className="bookend-actions">
        {!finished && <button className="text-action" onClick={onExit}>{welcome.explore}</button>}
        <button className="primary-action" data-testid={finished ? "finish-guide" : "start-guide"} onClick={finished ? onExit : onStart}>
          {finished ? finish.returnToWorkspace : welcome.start}<ArrowRight size={16} />
        </button>
      </div>
    </section>
  </div>
}
