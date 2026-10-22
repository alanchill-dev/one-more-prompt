import { CaretRight } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"
import { promptUnreadKey, usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"
import { RunningIndicator } from "./prompt-usage-running-indicator"
import type { PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { promptPreviewText } from "@/lib/prompt-usage-display"
import { formatShareTokens } from "@/lib/today-models"

export function UnreadDot({ testId }: { testId: string }) {
  const t = useI18n()
  return <span className="inline-block size-1.5 shrink-0 rounded-full bg-[var(--wire-orange)]" role="img" aria-label={t("promptUsage.unreadResult")} title={t("promptUsage.unreadResult")} data-testid={testId} />
}

export function PromptRow({
  session,
  turn,
  selected,
  onSelect,
  buttonRef,
  inspectorId = "prompt-usage-inspector",
  buttonTestId,
}: {
  session: PromptUsageSession
  turn: PromptUsageTurn
  selected: boolean
  onSelect: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
  inspectorId?: string
  buttonTestId?: string
}) {
  const t = useI18n()
  const unread = usePromptUsageUnreadStore(state => state.unreadKeys.includes(promptUnreadKey(session.id, turn.id)))
  const subagentCount = turn.agents.filter((agent) => agent.kind === "subagent").length
  const outgoingTasks = turn.outgoingTasks ?? []
  const sourceLabel = turn.isDelegated && turn.sourceThreadId && (!session.relatedSourceId || session.relatedSourceId === turn.sourceThreadId) && session.relatedSourceTitle
    ? t("promptUsage.relationshipFrom", { source: session.relatedSourceTitle })
    : null
  const preview = promptPreviewText(turn.prompt)
  const promptLabel = t(selected ? "promptUsage.collapsePrompt" : "promptUsage.openPrompt", { prompt: preview })

  return (
    <article className="border-b border-border/50" data-testid="prompt-usage-prompt">
      <button
        ref={buttonRef}
        type="button"
        className={`prompt-project-prompt-button flex min-h-[4.75rem] w-full items-start justify-between gap-4 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? "bg-muted/70" : "hover:bg-muted/25"}`}
        aria-expanded={selected}
        aria-controls={selected ? inspectorId : undefined}
        aria-label={`${promptLabel}${turn.isActive ? `, ${t("promptUsage.running")}` : ""}${unread ? `, ${t("promptUsage.unreadResult")}` : ""}`}
        data-prompt-id={turn.id}
        data-selected={selected ? "true" : "false"}
        data-testid={buttonTestId}
        onClick={onSelect}
      >
        <div className="min-w-0 flex-1">
          <div className="prompt-project-prompt-metadata flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <time className="tabular-nums" dateTime={turn.startedAt ?? undefined} title={turn.startedAt ? new Date(turn.startedAt).toLocaleString() : undefined}>{turn.timeLabel}</time>
            {turn.isActive && <RunningIndicator testId="prompt-usage-prompt-running" />}
            {unread && <UnreadDot testId="prompt-usage-prompt-unread" />}
            {turn.interrupted && <span>{t("promptUsage.interrupted")}</span>}
            {outgoingTasks.map((relatedTask) => (
              <span key={relatedTask.id} className="truncate" title={t("promptUsage.relationshipTo", { destination: relatedTask.title })}>
                {t("promptUsage.relationshipTo", { destination: relatedTask.title })}
              </span>
            ))}
            {sourceLabel && <span className="truncate" title={sourceLabel}>{sourceLabel}</span>}
            {subagentCount > 0 && <span>{t(subagentCount === 1 ? "promptUsage.subagentCount" : "promptUsage.subagentsCount", { count: subagentCount })}</span>}
          </div>
          <h4 className="prompt-project-prompt-title mt-1.5 line-clamp-2 break-words text-[13px] font-medium leading-5 text-foreground">{preview}</h4>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="max-w-[10rem] text-right">
            <div className="prompt-project-prompt-total tabular-nums text-sm font-semibold text-foreground">{turn.tokenUsageRecorded === false ? t("promptUsage.noTokenData") : formatShareTokens(turn.tokens.totalTokens)}</div>

          </div>
          <CaretRight size={15} className={`text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${selected ? "rotate-180 text-[var(--wire-orange)]" : ""}`} aria-hidden="true" />
        </div>
      </button>
    </article>
  )
}
