import { formatPromptDate } from "@/lib/prompt-usage-display"
import { ArrowLeft, ArrowUpRight, Crosshair } from "@phosphor-icons/react"
import { useLayoutEffect, useMemo, useRef, useId } from "react"
import { PromptInspector, type PromptUsageCopyState } from "./prompt-usage-inspector"
import { useI18n } from "@/hooks/use-i18n"
import { PromptRow } from "./prompt-usage-prompt-row"
import { type TimelineItem } from "@/lib/prompt-usage-timeline"
import "./prompt-usage-timeline-reader.css"

export interface PromptUsageTimelineReaderProps {
  items: TimelineItem[]
  clusterItems: TimelineItem[] | null
  highlightedTurnId: string | null
  focusedSessionId: string | null
  markerColor: (item: TimelineItem) => string
  onOpenPrompt?: (item: TimelineItem, source: HTMLElement) => void
  onSelect: (item: TimelineItem, source: HTMLButtonElement) => void
  onHighlight: (id: string | null) => void
  onLocate: (item: TimelineItem) => void
  selectedItem?: TimelineItem | null
  copyState?: PromptUsageCopyState
  onCopy?: () => void
  onCloseItem?: () => void
  onNavigateToSession?: (id: string) => void
  onClearCluster: () => void
}

export function PromptUsageTimelineReader(props: PromptUsageTimelineReaderProps) {
  const { clusterItems, onClearCluster, selectedItem, onCloseItem } = props
  const detailId = useId()
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const listRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const selectionSource = useRef<HTMLButtonElement | null>(null)
  const savedScroll = useRef(0)
  const previousSelection = useRef<string | null>(null)
  const selectionId = selectedItem?.turn.id ?? null
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = savedScroll.current
    if (selectionId && listRef.current) {
      if (getComputedStyle(listRef.current.parentElement!).visibility === "hidden") headingRef.current?.focus({ preventScroll: true })
      else if (selectionSource.current) {
        const row = selectionSource.current.getBoundingClientRect(), bounds = listRef.current.getBoundingClientRect()
        if (row.top < bounds.top) listRef.current.scrollTop += row.top - bounds.top
        else if (row.bottom > bounds.bottom) listRef.current.scrollTop += row.bottom - bounds.bottom
        savedScroll.current = listRef.current.scrollTop
      }
    }
    if (!selectionId && previousSelection.current) selectionSource.current?.focus({ preventScroll: true })
    previousSelection.current = selectionId
  }, [selectionId])
  const t = useI18n()
  const cluster = useMemo(() => clusterItems ? [...clusterItems].sort((a, b) => a.startedAt - b.startedAt) : null, [clusterItems])
  const clusterKey = cluster?.map((item) => item.turn.id).join("|")
  useLayoutEffect(() => {
    savedScroll.current = 0
    if (listRef.current) listRef.current.scrollTop = 0
    selectionSource.current = null; previousSelection.current = null
  }, [clusterKey])
  const formatTimestamp = (timestamp: number) => `${formatPromptDate(new Date(timestamp).toISOString())} ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(timestamp)}`

  return (
    <div className="prompt-timeline-reader" data-testid="timeline-reader">
      {cluster && (
        <section className="prompt-reader-cluster" key={clusterKey} aria-label={cluster[0]?.session.title} data-testid="prompt-reader-cluster">
          <header className="prompt-reader-cluster-header">
            <div className="prompt-reader-header-actions">
              <button type="button" className="prompt-reader-back" onClick={onClearCluster}><ArrowLeft size={15} aria-hidden="true" />{t("promptUsage.backToTimeline")}</button>
              <button type="button" className="prompt-reader-locate" onClick={() => props.onLocate(selectedItem ?? cluster[0])} aria-label={`${t("promptUsage.locateOnTimeline")}: ${(selectedItem ?? cluster[0]).turn.timeLabel} · ${cluster[0].session.title}`} title={t("promptUsage.locateOnTimeline")}><Crosshair size={16} aria-hidden="true" /></button>
            </div>
            <h3>{cluster[0]?.session.title}</h3>
            <p>{cluster[0]?.project.name}<span>{t("promptUsage.promptsCount", { count: cluster.length })}</span></p>
            {cluster.length > 0 && <p className="prompt-reader-range">{formatTimestamp(cluster[0].startedAt)} — {formatTimestamp(cluster[cluster.length - 1].startedAt)}</p>}
          </header>
          <div className="prompt-reader-content" data-integrated={Boolean(onCloseItem) || undefined} data-detail={Boolean(selectedItem && onCloseItem) || undefined}>
            <div className="prompt-reader-list-pane">
              <div ref={listRef} className="prompt-reader-scroll omp-scrollbar" data-testid="prompt-reader-cluster-scroll" onScroll={event => { savedScroll.current = event.currentTarget.scrollTop }} onKeyDown={event => {
                if (!["Home", "End", "ArrowUp", "ArrowDown"].includes(event.key)) return
                const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("article > button")]
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                if (index < 0) return
                event.preventDefault()
                buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus()
              }}>
                {cluster.map((item, index) => <div key={item.turn.id} onPointerEnter={() => props.onHighlight(item.turn.id)} onPointerLeave={() => props.onHighlight(null)} onFocus={() => props.onHighlight(item.turn.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) props.onHighlight(null) }}>
                  {index > 0 && cluster[index - 1].dateKey !== item.dateKey && <div className="prompt-reader-date">{formatPromptDate(new Date(item.startedAt).toISOString())}</div>}
                  <PromptRow session={item.session} turn={item.turn} selected={selectionId === item.turn.id} inspectorId={detailId} buttonTestId={`prompt-reader-cluster-item-${item.turn.id}`} buttonRef={button => { if (button) rowRefs.current.set(item.turn.id, button); else rowRefs.current.delete(item.turn.id) }} onSelect={() => {
                    if (selectionId === item.turn.id && onCloseItem) { onCloseItem(); return }
                    const button = rowRefs.current.get(item.turn.id)!
                    savedScroll.current = listRef.current?.scrollTop ?? 0; selectionSource.current = button
                    props.onSelect(item, button)
                  }} />
                </div>)}
              </div>
            </div>
            {selectedItem && onCloseItem && <div id={detailId} className="prompt-reader-detail-pane" data-reader-detail="">
              <button type="button" className="prompt-reader-list-back" onClick={onCloseItem}><ArrowLeft size={15} aria-hidden="true" />{t("promptUsage.backToGroup")}</button>
              <div className="min-h-0 flex-1">
                <PromptInspector session={selectedItem.session} turn={selectedItem.turn} headingRef={headingRef} layout="preview" animateEntrance={false} copyState={props.copyState ?? null} onCopy={props.onCopy!} onNavigateToSession={props.onNavigateToSession!} onClose={onCloseItem} />
              </div>
              {props.onOpenPrompt && <button type="button" className="prompt-reader-detail-browser" onClick={event => props.onOpenPrompt?.(selectedItem, event.currentTarget.parentElement!)}>{t("promptUsage.openSessionInBrowser")}<ArrowUpRight size={16} aria-hidden="true" /></button>}
            </div>}
            {!selectedItem && onCloseItem && <div className="prompt-reader-placeholder">{t("promptUsage.selectGroupPrompt")}</div>}
          </div>
        </section>
      )}
    </div>
  )
}
