import { ArrowRight } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import type { TimelineItem } from "@/lib/prompt-usage-timeline"
import { formatShareTokens } from "@/lib/today-models"
import { PromptUsageLanePreview } from "./prompt-usage-lane-preview"

type Props = {
  items: TimelineItem[]
  summary?: { range: string; tokens: number }
  onOpenGroup: () => void
  onClose: () => void
  onNavigateToSession?: (sessionId: string) => void
  onOpenPrompt?: (item: TimelineItem, source: HTMLElement) => void
}

export function PromptUsageLaneGroupPreview({ items, summary, onOpenGroup, ...previewProps }: Props) {
  const t = useI18n()
  return <>
    {summary && <div className="prompt-session-group-summary">
      <div>{summary.range}</div>
      <p><strong>{t("promptUsage.promptsCount", { count: items.length })}</strong><span>{formatShareTokens(summary.tokens)} {t("overview.tokenUnit")}</span></p>
    </div>}
    {summary ? <button type="button" className="prompt-session-open-group" onClick={onOpenGroup}>{t("promptUsage.openGroup", { count: items.length })}<ArrowRight size={16} aria-hidden="true" /></button> :
    <PromptUsageLanePreview key={items[0].turn.id} item={items[0]} {...previewProps} />}
  </>
}
