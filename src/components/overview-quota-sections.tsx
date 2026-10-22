import type { ReactNode } from "react"
import { useI18n } from "@/hooks/use-i18n"
import type { MetricLine } from "@/lib/plugin-types"

type OverviewQuotaSectionsProps = {
  progressLines: MetricLine[]
  accountLines: MetricLine[]
  links?: ReactNode
  renderProgressLine: (line: MetricLine, index: number) => ReactNode
  renderAccountLine: (line: MetricLine, index: number) => ReactNode
}

/** One continuous allowance field with account facts embedded in its header. */
export function OverviewQuotaSections({
  progressLines,
  accountLines,
  links,
  renderProgressLine,
  renderAccountLine,
}: OverviewQuotaSectionsProps) {
  const t = useI18n()

  return (
    <section
      aria-label={t("overview.usageLimits")}
      className="min-w-0"
      data-guide-target={progressLines.length > 0 ? "limits-windows" : undefined}
      data-layout="allowance-ledger"
      data-testid="overview-usage-limits"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div className="flex min-h-12 flex-col items-start gap-1" data-testid="overview-usage-links">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("overview.usageLimits")}
          </h2>
          {links}
        </div>
        {accountLines.length > 0 ? (
          <div className="grid min-w-0 grid-cols-2 gap-x-10 gap-y-4" data-testid="overview-account-status">
            {accountLines.map((line, index) => (
              <div key={`${line.label}-${index}`} className="min-w-0">
                {renderAccountLine(line, index)}
              </div>
            ))}
          </div>
        ) : null}
      </header>
      {progressLines.length > 0 ? (
        <div className="mt-7 space-y-5" data-guide-target="limits-reset-pace" data-testid="overview-quota-reset-pace">
          {progressLines.map(renderProgressLine)}
        </div>
      ) : null}
    </section>
  )
}
