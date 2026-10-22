import { useEffect, useRef, useState } from "react"
import { ArrowRight } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import { promptCopyText } from "@/lib/prompt-usage-display"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { PromptInspector, type PromptUsageCopyState } from "./prompt-usage-inspector"
import "./prompt-usage-lane-preview.css"

type Props = {
  item: TimelineItem
  onClose: () => void
  onNavigateToSession?: (sessionId: string) => void
  onOpenPrompt?: (item: TimelineItem, source: HTMLElement) => void
}

export function PromptUsageLanePreview({ item, onClose, onNavigateToSession, onOpenPrompt }: Props) {
  const t = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [copyState, setCopyState] = useState<PromptUsageCopyState>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  async function copyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(promptCopyText(item.turn.prompt))
      setCopyState({ turnId: item.turn.id, status: "success" })
    } catch (error) {
      console.error("Failed to copy timeline prompt", error)
      setCopyState({ turnId: item.turn.id, status: "error" })
    }
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyState(null), 2_000)
  }
  return <>
    <div className="prompt-session-preview-inspector">
      <PromptInspector session={item.session} turn={item.turn} layout="preview" animateEntrance={false}
        headingRef={headingRef} copyState={copyState} onCopy={() => void copyPrompt()}
        onClose={onClose} onNavigateToSession={onNavigateToSession ?? (() => {})} />
    </div>
    {onOpenPrompt && <button type="button" aria-label={t("promptUsage.openSessionInBrowser")}
      className="prompt-session-preview-browser group mx-3 mb-3 flex min-h-[58px] w-[calc(100%_-_1.5rem)] items-center justify-between rounded-[13px] border border-[color:var(--wire-orange)]/38 bg-[color:var(--wire-orange)]/[0.075] px-3.5 text-left outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_22px_-16px_color-mix(in_srgb,var(--wire-orange)_70%,transparent)] transition-[background-color,border-color,box-shadow,transform] duration-180 hover:-translate-y-px hover:border-[color:var(--wire-orange)]/60 hover:bg-[color:var(--wire-orange)]/[0.12] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_-14px_color-mix(in_srgb,var(--wire-orange)_80%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--wire-orange)]/65"
      onClick={(event) => {
        const card = event.currentTarget.closest<HTMLElement>(".prompt-session-preview")
        if (card) onOpenPrompt(item, card)
      }}>
      <span className="min-w-0 pr-2">
        <span className="block text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--wire-orange)]">{t("nav.promptUsage")}</span>
        <span className="mt-0.5 block text-[11px] font-bold text-foreground">{t("promptUsage.openSessionInBrowser")}</span>
      </span>
      <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[var(--wire-orange)] text-white shadow-[0_8px_20px_-10px_color-mix(in_srgb,var(--wire-orange)_90%,transparent)] transition-[transform,box-shadow] duration-180 group-hover:translate-x-0.5 group-hover:scale-[1.04] group-hover:shadow-[0_10px_24px_-8px_color-mix(in_srgb,var(--wire-orange)_95%,transparent)]">
        <ArrowRight className="size-[18px]" weight="bold" aria-hidden="true" />
      </span>
    </button>}
  </>
}
