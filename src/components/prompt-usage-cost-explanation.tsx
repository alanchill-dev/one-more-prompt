import "./prompt-usage-cost-explanation.css"

import { Popover } from "@base-ui/react/popover"
import { Info, X } from "@phosphor-icons/react"
import { useLayoutEffect, useRef } from "react"

import { useApiEquivalentEstimate } from "@/hooks/use-api-equivalent-estimate"
import { useI18n } from "@/hooks/use-i18n"
import type { PromptUsageCostEstimate } from "@/lib/prompt-usage"
import { PromptUsageModelCostDetails } from "./prompt-usage-model-cost-details"

export function ApiEquivalentCell({ estimate, testId, inline = false }: { estimate: PromptUsageCostEstimate; testId: string; inline?: boolean }) {
  const t = useI18n()
  const { amount, basis, formatAmount, displayCurrency } = useApiEquivalentEstimate(estimate.costUsd, estimate.estimationStatus, 2)
  const formattedAmount = formatAmount(estimate.costUsd)
  const inlineAmount = `(${formattedAmount ?? amount})`
  const amountContainer = useRef<HTMLDivElement>(null)
  const amountTrigger = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    const container = amountContainer.current
    const trigger = amountTrigger.current
    if (!inline || !container || !trigger) return
    const fit = () => {
      let fontSize = 13
      trigger.style.fontSize = `${fontSize}px`
      const availableWidth = container.getBoundingClientRect().width
      if (availableWidth <= 0) return
      // Small text can change width nonlinearly, so remeasure after each correction.
      for (let correction = 0; correction < 3; correction++) {
        const width = trigger.getBoundingClientRect().width
        if (width <= availableWidth) break
        fontSize *= Math.max(0, availableWidth - .5) / width
        trigger.style.fontSize = `${fontSize}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [inline, inlineAmount])
  const fees = estimate.costBreakdown
  const rows = fees ? [
    [t("cost.explainInput"), t("cost.explainInputDetail"), fees.inputUsd],
    [t("cost.explainCache"), t("cost.explainCacheDetail"), fees.cacheReadUsd],
    ...(fees.cacheWriteUsd > 0 ? [[t("cost.explainWrite"), t("cost.explainWriteDetail"), fees.cacheWriteUsd] as const] : []),
    [t("cost.explainOutput"), t("cost.explainOutputDetail"), fees.outputUsd],
  ] as const : []

  return (
    <div ref={amountContainer} className={inline ? "prompt-summary-api-container" : "flex min-w-0 items-center justify-end gap-0.5"}>
      {!inline && <span className="truncate text-right text-[10px] font-semibold tabular-nums text-foreground" title={`${amount} · ${basis}`} data-testid={testId}>{amount}</span>}
      <Popover.Root>
        <Popover.Trigger ref={amountTrigger} openOnHover={inline} delay={150} closeDelay={150} data-testid={inline ? testId : undefined}
          aria-label={inline ? `${t("promptUsage.sessionApiEquivalent")}: ${amount}. ${basis}` : t("cost.explainTitle")}
          title={inline ? `${amount} · ${basis}` : undefined}
          className={inline ? "prompt-summary-api prompt-summary-table-value" : "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"}>
          {inline ? inlineAmount : <Info size={13} aria-hidden="true" />}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align={inline ? "start" : "end"} sideOffset={8} collisionPadding={12} className="z-[100]">
            <Popover.Popup initialFocus={inline ? false : undefined} data-cost-explanation="" className="cost-explanation omp-scrollbar" data-has-models={Boolean(estimate.costLines?.length)}>
              <div className="cost-explanation-heading">
                <Popover.Title>{t("cost.explainTitle")}</Popover.Title>
                <Popover.Close aria-label={t("promptUsage.closeInspector")} className="cost-explanation-close"><X size={16} aria-hidden="true" /></Popover.Close>
              </div>
              <div className="cost-explanation-total">
                <div><span>{t("cost.explainTotal")}</span><p>{basis}</p></div>
                <div className="cost-explanation-total-reading">
                  <strong>{formattedAmount ?? amount}</strong>
                  {formattedAmount != null && <span className="cost-explanation-currency">{displayCurrency}</span>}
                </div>
              </div>
              <div className="cost-explanation-method">
                <p className="cost-explanation-formula">{t("cost.explainFormula")}</p>
                <Popover.Description>{t("cost.explainCalculation")}</Popover.Description>
              </div>
              {estimate.costLines?.length ? <PromptUsageModelCostDetails estimate={estimate} formatAmount={formatAmount} currency={displayCurrency} /> : <>
              {fees && <dl className="cost-explanation-fees">
                {rows.map(([label, detail, value]) => <div key={label} className="cost-explanation-fee"><dt><span>{label}</span><p>{detail}</p></dt><dd>{formatAmount(value) ?? "—"}</dd></div>)}
              </dl>}
              <PromptUsageModelCostDetails estimate={estimate} formatAmount={formatAmount} currency={displayCurrency} />
              </>}
              {(!fees || estimate.estimationStatus === "partial_rate") && <p className="cost-explanation-incomplete">{t("cost.explainIncomplete")}</p>}
              <p className="cost-explanation-reference">{t("cost.explainReference")}</p>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
