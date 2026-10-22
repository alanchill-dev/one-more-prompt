import { CircleNotch } from "@phosphor-icons/react"
import { useI18n } from "@/hooks/use-i18n"

export function RunningIndicator({ testId }: { testId: string }) {
  const t = useI18n()
  return <CircleNotch size={15} weight="bold" className="shrink-0 animate-spin text-[var(--wire-orange)]" role="img" aria-label={t("promptUsage.running")} data-testid={testId} />
}
