import { memo, useMemo } from "react"
import { PromptUsagePanel } from "@/components/prompt-usage-panel"
import { isCodexSignInRequired } from "@/components/codex-empty-state"
import { parsePromptUsageSuffix } from "@/lib/prompt-usage"
import type { PluginDisplayState } from "@/lib/plugin-types"

interface PromptUsagePageProps {
  plugin: PluginDisplayState | null
  onRetryPlugin?: (pluginId: string) => void
}

export const PromptUsagePage = memo(function PromptUsagePage({ plugin, onRetryPlugin }: PromptUsagePageProps) {
  const parsed = useMemo(
    () => parsePromptUsageSuffix(plugin?.data?.lines ?? []),
    [plugin?.data?.lines],
  )
  const needsCodexSetup = parsed.projects.length === 0 && !parsed.error && isCodexSignInRequired(plugin?.error)
  const error = parsed.error ?? (needsCodexSetup ? null : plugin?.error) ?? null

  return (
    <div
      id="prompt-usage-page"
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      data-testid="prompt-usage-page"
    >
      <PromptUsagePanel
        projects={parsed.projects}
        promptCount={parsed.promptCount}
        sessionCount={parsed.sessionCount}
        privacyNote={parsed.privacyNote}
        error={error}
        loading={Boolean(plugin?.loading)}
        onCheckForRecords={onRetryPlugin ? () => onRetryPlugin("codex") : undefined}
      />
    </div>
  )
})
