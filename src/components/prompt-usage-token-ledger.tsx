import { ApiEquivalentCell } from "@/components/prompt-usage-cost-explanation"
import { useI18n } from "@/hooks/use-i18n"
import type { PromptUsageAgent, PromptUsageTurn } from "@/lib/prompt-usage"
import { formatPromptModel } from "@/lib/prompt-usage-display"
import { formatShareTokens } from "@/lib/today-models"
import "./prompt-usage-token-ledger.css"

function formatTokenPercentage(value: number, denominator: number): string {
  const numerator = Number.isFinite(value) && value > 0 ? value : 0
  const total = Number.isFinite(denominator) && denominator > 0 ? denominator : 0
  if (numerator === 0 || total === 0) return "0%"
  const percentage = (numerator / total) * 100
  if (!Number.isFinite(percentage) || percentage <= 0) return "0%"
  if (percentage < 0.1) return "<0.1%"
  return `${percentage.toFixed(1).replace(/\.0$/, "")}%`
}

export function TokenLedger({ turn }: { turn: PromptUsageTurn }) {
  const t = useI18n()
  const usageRecorded = turn.tokenUsageRecorded !== false
  const headers = [
    ["promptUsage.agentColumn", null],
    ["promptUsage.tokenTotal", "cost.apiEquivalent"],
    ["promptUsage.tokenInput", "promptUsage.tokenCached"],
    ["promptUsage.tokenOutput", "promptUsage.tokenReasoning"],
    ["promptUsage.shareColumn", null],
  ] as const
  return (
    <section className="token-ledger" data-testid="prompt-usage-token-ledger">
      {!usageRecorded && <p className="mb-4 text-xs text-muted-foreground" data-testid="prompt-usage-no-token-data">{t("promptUsage.noTokenDataHint")}</p>}
      <div className="token-ledger-scroll" tabIndex={0} role="region" aria-label={t("promptUsage.tokenTotal")}>
        <table className="token-ledger-table" aria-label={t("promptUsage.allAgentsCombined")}>
          <thead>
            <tr data-testid="prompt-usage-token-ledger-columns">
              {headers.map(([label, secondary]) => <th scope="col" key={label}>
                <span className={label === "promptUsage.agentColumn" ? "sr-only" : "token-ledger-heading"}>{t(label)}</span><span className="token-ledger-secondary" aria-hidden={secondary ? undefined : true}>{secondary ? t(secondary) : "\u00a0"}</span>
              </th>)}
            </tr>
          </thead>
          <tbody key={turn.id}>
            <LedgerRow turn={turn} usageRecorded={usageRecorded} />
            {turn.agents.map((agent) => <LedgerRow key={`${agent.kind}-${agent.id}`} turn={turn} agent={agent} usageRecorded={usageRecorded} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function LedgerRow({ turn, agent, usageRecorded }: { turn: PromptUsageTurn; agent?: PromptUsageAgent; usageRecorded: boolean }) {
  const t = useI18n()
  const estimate = agent ?? turn
  const tokens = estimate.tokens
  const isMain = agent?.kind === "main"
  const nickname = agent && !isMain && agent.name.trim().toLocaleLowerCase() !== "subagent" ? agent.name.trim() : ""
  const models = agent?.models.map(model => formatPromptModel(model.name, model.reasoningEfforts, t("promptUsage.effortUnknown"))).join(", ")
  const value = (number: number) => usageRecorded ? formatShareTokens(number) : "—"
  return (
    <tr className={agent ? "token-ledger-agent" : "token-ledger-summary"} data-testid={agent ? `prompt-usage-${agent.kind}-agent` : "prompt-usage-token-summary"}>
      <th scope="row">
        <div className="token-ledger-name" data-testid={agent ? "prompt-usage-agent-identity" : undefined}>
          {!agent ? t("promptUsage.thisPrompt") : isMain ? agent.name : <>{t("promptUsage.subagent")}{nickname && <span className="token-ledger-nickname font-normal text-muted-foreground"> ({nickname})</span>}</>}
        </div>
        {agent ? <>
          {isMain && <span className="sr-only">{t("promptUsage.mainAgent")}</span>}
          {(agent.role || models) && <div className="token-ledger-model" title={[models, agent.role].filter(Boolean).join(" · ")}>
            {models && <span data-testid="prompt-usage-agent-models">{models}</span>}
            {agent.role && models && <span aria-hidden="true"> · </span>}{agent.role && <span>{agent.role}</span>}
          </div>}
        </> : <div className="token-ledger-model">{t("promptUsage.allAgentsCombined")}</div>}
      </th>
      <td data-testid={agent ? "prompt-usage-agent-token-summary" : "prompt-usage-token-metrics"}>
        <span className="token-ledger-number">{value(tokens.totalTokens)}</span>
        <div className="token-ledger-secondary token-ledger-cost">
          {usageRecorded ? <ApiEquivalentCell estimate={estimate} testId={agent ? "prompt-usage-agent-cost" : "prompt-usage-token-cost"} /> : "—"}
        </div>
      </td>
      <td><span className="token-ledger-number">{value(tokens.inputTokens)}</span><span className="token-ledger-secondary">{value(tokens.cachedInputTokens)}</span></td>
      <td><span className="token-ledger-number">{value(tokens.outputTokens)}</span><span className="token-ledger-secondary">{value(tokens.reasoningOutputTokens)}</span></td>
      <td className="token-ledger-share whitespace-nowrap" data-testid={agent ? "prompt-usage-agent-share" : undefined}>
        {usageRecorded ? agent ? formatTokenPercentage(tokens.totalTokens, turn.tokens.totalTokens) : formatTokenPercentage(tokens.totalTokens, tokens.totalTokens) : "—"}
      </td>
    </tr>
  )
}
