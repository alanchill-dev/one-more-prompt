import { useI18n } from "@/hooks/use-i18n"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { formatExecutionTime, promptDuration } from "@/lib/prompt-usage-duration"
import type { PromptUsageTurn } from "@/lib/prompt-usage"

export function PromptExecutionTime({ turn }: { turn: PromptUsageTurn }) {
  const t = useI18n()
  const now = useNowTicker({ enabled: Boolean(turn.isActive), resetKey: turn.id })
  const elapsed = promptDuration(turn, now)
  return <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-1" data-testid="prompt-execution-time">
    <span className="text-[10px] text-muted-foreground">{t(turn.isActive ? "promptUsage.elapsedTime" : "promptUsage.executionTime")}</span>
    <span className="text-xs font-medium tabular-nums text-foreground">{elapsed == null
      ? t("promptUsage.timeNotRecorded") : formatExecutionTime(elapsed, t("settings.currency.locale"))}</span>
  </span>
}
