import { ArrowsClockwise, TerminalWindow } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/hooks/use-i18n"
import "./codex-empty-state.css"

interface CodexEmptyStateProps {
  onCheckForRecords?: () => void
  checking?: boolean
}

export const isCodexSignInRequired = (error: string | null | undefined) => error === "Open Codex and sign in to continue."

export function CodexEmptyState({ onCheckForRecords, checking = false }: CodexEmptyStateProps) {
  const t = useI18n()

  return (
    <section className="codex-empty-state" data-testid="codex-empty-state" aria-busy={checking}>
      <div className="codex-empty-state-layout">
        <div className="codex-empty-state-introduction">
          <TerminalWindow className="codex-empty-state-icon" weight="light" aria-hidden="true" />
          <h2 className="codex-empty-state-title">{t("codexEmpty.title")}</h2>
          <p className="codex-empty-state-description">{t("codexEmpty.description")}</p>
          {onCheckForRecords ? (
            <Button
              className="codex-empty-state-action"
              onClick={onCheckForRecords}
              disabled={checking}
              aria-label={t("codexEmpty.check")}
            >
              <ArrowsClockwise className="size-4" aria-hidden="true" />
              <span aria-live="polite">{t(checking ? "codexEmpty.checking" : "codexEmpty.check")}</span>
            </Button>
          ) : null}
          <p className="codex-empty-state-privacy">{t("codexEmpty.privacy")}</p>
        </div>
        <ol className="codex-empty-state-steps">
          <li>
            <span className="codex-empty-state-step-number" aria-hidden="true">1</span>
            <div><h3>{t("codexEmpty.stepOneTitle")}</h3><p>{t("codexEmpty.stepOneDescription")}</p></div>
          </li>
          <li>
            <span className="codex-empty-state-step-number" aria-hidden="true">2</span>
            <div><h3>{t("codexEmpty.stepTwoTitle")}</h3><p>{t("codexEmpty.stepTwoDescription")}</p></div>
          </li>
          <li>
            <span className="codex-empty-state-step-number" aria-hidden="true">3</span>
            <div><h3>{t("codexEmpty.stepThreeTitle")}</h3><p>{t("codexEmpty.stepThreeDescription")}</p></div>
          </li>
        </ol>
      </div>
    </section>
  )
}
