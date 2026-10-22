import { formatPromptDate } from "@/lib/prompt-usage-display"
import { Badge } from "@/components/ui/badge"
import { RunningIndicator } from "@/components/prompt-usage-running-indicator"
import { PromptExecutionTime } from "./prompt-usage-execution-time"
import { CaretRight, Check, Copy as CopyIcon, X } from "@phosphor-icons/react"
import { useEffect, type RefObject } from "react"

import { useI18n } from "@/hooks/use-i18n"
import { TokenLedger } from "@/components/prompt-usage-token-ledger"
import { PromptUsageText } from "@/components/prompt-usage-text"
import type {
  PromptUsageRelatedTask,
  PromptUsageSession,
  PromptUsageTurn,
} from "@/lib/prompt-usage"
import { formatShareTokens } from "@/lib/today-models"

export type PromptUsageCopyState = { turnId: string; status: "success" | "error" } | null

function formatTokens(value: number): string {
  return formatShareTokens(value)
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function sessionTokens(session: PromptUsageSession): number {
  return session.turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0)
}

function PromptRelationshipMetadata({
  session,
  turn,
  onNavigateToSession,
}: {
  session: PromptUsageSession
  turn: PromptUsageTurn
  onNavigateToSession: (sessionId: string) => void
}) {
  const t = useI18n()
  const outgoingTasks = turn.outgoingTasks ?? []
  const sourceLabel = turn.isDelegated && turn.sourceThreadId && (!session.relatedSourceId || session.relatedSourceId === turn.sourceThreadId)
    ? session.relatedSourceTitle
      ? t("promptUsage.relationshipFrom", { source: session.relatedSourceTitle })
      : t("promptUsage.sourceUnavailable")
    : null
  if (outgoingTasks.length > 0 || sourceLabel) {
    return (
      <span className="contents" data-testid="prompt-usage-inspector-relationship">
        {outgoingTasks.map((relatedTask: PromptUsageRelatedTask) => (
          <button
            key={relatedTask.id}
            type="button"
            className="inline-flex min-h-9 max-w-full items-center gap-1 rounded px-1 text-[10px] text-muted-foreground underline decoration-border underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("promptUsage.relationshipTo", { destination: relatedTask.title })}
            title={t("promptUsage.relationshipTo", { destination: relatedTask.title })}
            data-testid={`prompt-usage-inspector-related-task-link-${safeDomId(relatedTask.id)}`}
            onClick={() => onNavigateToSession(relatedTask.id)}
          >
            <span className="truncate">{t("promptUsage.relationshipTo", { destination: relatedTask.title })}</span>
            <CaretRight size={11} className="shrink-0" aria-hidden="true" />
          </button>
        ))}
        {sourceLabel && turn.sourceThreadId && session.relatedSourceTitle ? (
          <button
            type="button"
            className="inline-flex min-h-9 max-w-full items-center gap-1 rounded px-1 text-[10px] text-muted-foreground underline decoration-border underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={sourceLabel}
            title={sourceLabel}
            data-testid="prompt-usage-inspector-related-source-link"
            onClick={() => onNavigateToSession(turn.sourceThreadId as string)}
          >
            <span className="truncate">{sourceLabel}</span>
            <CaretRight size={11} className="shrink-0" aria-hidden="true" />
          </button>
        ) : sourceLabel ? (
          <span
            className="inline-flex min-h-9 items-center px-1 text-[10px] text-muted-foreground"
            data-testid="prompt-usage-inspector-related-source-unavailable"
          >
            {sourceLabel}
          </span>
        ) : null}
      </span>
    )
  }
  return null
}

export function PromptInspector({
  session,
  turn,
  copyState,
  onCopy,
  onNavigateToSession,
  onClose,
  headingRef,
  layout = "responsive",
  animateEntrance = true,
}: {
  session: PromptUsageSession
  turn: PromptUsageTurn
  copyState: PromptUsageCopyState
  onCopy: () => void
  onNavigateToSession: (sessionId: string) => void
  onClose: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
  layout?: "responsive" | "overlay" | "preview"
  animateEntrance?: boolean
}) {
  const t = useI18n()
  const copied = copyState?.turnId === turn.id && copyState.status === "success"
  const copyFailed = copyState?.turnId === turn.id && copyState.status === "error"
  const subagentCount = turn.agents.filter((agent) => agent.kind === "subagent").length

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("[data-cost-explanation], .prompt-help-frame")) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return (
    <aside
      id={layout === "preview" ? undefined : "prompt-usage-inspector"}
      role="dialog"
      aria-label={t("promptUsage.promptDetailsFor", { title: session.title })}
      className={layout === "preview"
        ? "omp-scrollbar relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto p-4"
        : layout === "overlay"
        ? `omp-scrollbar relative z-20 flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto border-l border-border/70 bg-card/97 p-4 shadow-[-24px_0_60px_-36px_rgba(0,0,0,0.72)] backdrop-blur-xl ${animateEntrance ? "animate-in slide-in-from-right-4 fade-in duration-200 ease-out" : ""}`
        : `omp-scrollbar relative z-20 flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-y-auto border-l border-border/70 bg-card/95 p-4 backdrop-blur ${animateEntrance ? "animate-in slide-in-from-right-4 fade-in duration-200 ease-out" : ""} max-[1099px]:absolute max-[1099px]:inset-y-0 max-[1099px]:right-0 max-[1099px]:w-[min(86%,26rem)] max-[1099px]:max-w-full max-[1099px]:shadow-2xl min-[1100px]:w-full min-[1100px]:z-auto`}
      data-testid="prompt-usage-details-column"
      data-column="details"
      data-layout="right-inspector"
    >
      <div className="flex items-start gap-3 pb-3" data-testid="prompt-usage-inspector-header">
        <div className="min-w-0 flex-1">
          <h3 ref={headingRef} tabIndex={-1} className="truncate text-sm font-semibold text-foreground" title={session.title}>{session.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground" data-testid="prompt-usage-inspector-session-stats">
            <span>{t(session.promptCount === 1 ? "promptUsage.promptCount" : "promptUsage.promptsCount", { count: session.promptCount })}</span>
            <span>{t("promptUsage.totalTokenCount", { value: formatTokens(sessionTokens(session)) })}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("promptUsage.closeInspector")}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="border-y border-border/50 py-3" data-testid="prompt-usage-inspector-prompt-block">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3" data-testid="prompt-usage-inspector-metadata">
            <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-1" data-testid="prompt-usage-start-time">
              <span className="text-[10px] text-muted-foreground">{t("promptUsage.startTime")}</span>
              <time className="text-xs font-medium tabular-nums text-foreground" dateTime={turn.startedAt ?? undefined}>{turn.startedAt ? `${formatPromptDate(turn.startedAt)} ${new Date(turn.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : turn.timeLabel}</time>
            </span>
            <PromptExecutionTime turn={turn} />

            {turn.isActive && <Badge variant="outline" className="gap-1 border-border/70 bg-muted/40 text-[10px] text-muted-foreground"><RunningIndicator testId="prompt-usage-inspector-running" />{t("promptUsage.running")}</Badge>}
            {turn.retriedFromStartedAt && <Badge variant="outline" className="border-border/70 bg-muted/40 text-[10px] text-muted-foreground" title={turn.retriedFromStartedAt}>{t("promptUsage.retried")}</Badge>}
            {turn.interrupted && <Badge variant="outline" className="border-[var(--wire-orange)]/25 bg-[var(--wire-orange)]/10 text-[10px] text-foreground">{t("promptUsage.interrupted")}</Badge>}
          <div className="ml-auto flex min-w-0 shrink-0 items-end gap-2">
            {copyFailed && <span className="text-[10px] text-destructive" role="status">{t("promptUsage.copyFailed")}</span>}
            <button
              type="button"
              className="inline-flex min-h-7 items-end gap-1.5 rounded-lg px-2 pt-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={copied ? t("promptUsage.promptCopied") : t("promptUsage.copyPrompt")}
              title={copied ? t("promptUsage.promptCopied") : t("promptUsage.copyPrompt")}
              onClick={onCopy}
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <CopyIcon size={13} aria-hidden="true" />}
              <span>{copied ? t("promptUsage.copied") : t("promptUsage.copyPrompt")}</span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 empty:hidden">
          <PromptRelationshipMetadata session={session} turn={turn} onNavigateToSession={onNavigateToSession} />
        </div>
        <PromptUsageText text={turn.prompt} className="mt-2 text-sm font-medium leading-5 text-foreground" />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="prompt-usage-inspector-agents">
          <h4 className="text-xs font-semibold text-foreground">{t("promptUsage.usageDetails")}</h4>
          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{t("promptUsage.mainAgentCount", { count: 1 })}</span>
          {subagentCount > 0 && <span className="whitespace-nowrap text-[10px] text-muted-foreground">{t(subagentCount === 1 ? "promptUsage.subagentCount" : "promptUsage.subagentsCount", { count: subagentCount })}</span>}
        </div>
        <TokenLedger turn={turn} />
      </div>
    </aside>
  )
}
