import { useEffect, useState } from "react"
import { ArrowCounterClockwise, CaretDown, CheckCircle, FolderOpen, WarningCircle } from "@phosphor-icons/react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/hooks/use-i18n"

type ActionStatus = "idle" | "started" | "stopped" | "opened" | "error" | "resetting" | "reset-error" | "guide-error"

export function SettingsAdvancedSection() {
  const t = useI18n()
  const [diagnosticLogging, setDiagnosticLogging] = useState<boolean | null>(() => (isTauri() ? null : false))
  const [actionStatus, setActionStatus] = useState<ActionStatus>("idle")

  useEffect(() => {
    if (!isTauri()) {
      setDiagnosticLogging(false)
      return
    }

    void invoke<boolean>("get_diagnostic_logging")
      .then(setDiagnosticLogging)
      .catch((error) => {
        console.error("Failed to load diagnostic logging state:", error)
        setActionStatus("error")
      })
  }, [])

  const handleDiagnosticLoggingToggle = async () => {
    if (diagnosticLogging === null) return
    setActionStatus("idle")
    try {
      const enabled = await invoke<boolean>("set_diagnostic_logging", { enabled: !diagnosticLogging })
      setDiagnosticLogging(enabled)
      setActionStatus(enabled ? "started" : "stopped")
    } catch (error) {
      console.error("Failed to change diagnostic logging:", error)
      setActionStatus("error")
    }
  }

  const handleOpenLogLocation = async () => {
    setActionStatus("idle")
    try {
      const path = await invoke<string>("get_log_path")
      await revealItemInDir(path)
      setActionStatus("opened")
    } catch (error) {
      console.error("Failed to open log location:", error)
      setActionStatus("error")
    }
  }

  const handleReplayGuide = async () => {
    setActionStatus("resetting")
    try {
      await invoke("replay_contextual_guide")
      setActionStatus("idle")
    } catch (error) {
      console.error("Failed to replay operation guide:", error)
      setActionStatus("guide-error")
    }
  }

  const handleResetOnboarding = async () => {
    setActionStatus("resetting")
    try {
      await invoke("reset_onboarding")
      setActionStatus("idle")
    } catch (error) {
      console.error("Failed to reset onboarding:", error)
      setActionStatus("reset-error")
    }
  }

  return (
    <details className="group rounded-[14px] border border-border/75 bg-background/55">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-4 rounded-[14px] px-4 py-3 transition-colors duration-200 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-foreground">{t("settings.troubleshooting.title")}</h4>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {t("settings.troubleshooting.description")}
          </p>
        </div>
        <CaretDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-border/65 px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(150px,0.72fr)_minmax(260px,1.28fr)] lg:items-center lg:gap-6">
          <div>
            <h5 className="text-sm font-medium text-foreground">{t("advanced.diagnosticLogging")}</h5>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("advanced.diagnosticLoggingDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 cursor-pointer gap-2 rounded-[10px] bg-background/70 px-3 lg:justify-self-end"
            disabled={diagnosticLogging === null}
            onClick={() => void handleDiagnosticLoggingToggle()}
          >
            {diagnosticLogging ? t("advanced.stopDiagnosticLogging") : t("advanced.startDiagnosticLogging")}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/55 pt-4 lg:grid-cols-[minmax(150px,0.72fr)_minmax(260px,1.28fr)] lg:items-center lg:gap-6">
          <div>
            <h5 className="text-sm font-medium text-foreground">{t("advanced.replayGuide")}</h5>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("advanced.replayGuideDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 cursor-pointer gap-2 rounded-[10px] bg-background/70 px-3 lg:justify-self-end"
            disabled={actionStatus === "resetting"}
            onClick={() => void handleReplayGuide()}
          >
            <ArrowCounterClockwise aria-hidden="true" className="size-4" />
            {t("advanced.replayGuideAction")}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/55 pt-4 lg:grid-cols-[minmax(150px,0.72fr)_minmax(260px,1.28fr)] lg:items-center lg:gap-6">
          <div>
            <h5 className="text-sm font-medium text-foreground">{t("advanced.resetOnboarding")}</h5>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t("advanced.resetOnboardingDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 cursor-pointer gap-2 rounded-[10px] bg-background/70 px-3 lg:justify-self-end"
            disabled={actionStatus === "resetting"}
            onClick={() => void handleResetOnboarding()}
          >
            <ArrowCounterClockwise aria-hidden="true" className="size-4" />
            {t("advanced.resetOnboardingAction")}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/55 pt-4">
          <div aria-live="polite" className="min-h-5 text-xs">
            {actionStatus === "started" ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <CheckCircle aria-hidden="true" className="size-4 text-page-accent" />
                {t("advanced.diagnosticLoggingStarted")}
              </span>
            ) : null}
            {actionStatus === "stopped" ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <CheckCircle aria-hidden="true" className="size-4 text-page-accent" />
                {t("advanced.diagnosticLoggingStopped")}
              </span>
            ) : null}
            {actionStatus === "opened" ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <CheckCircle aria-hidden="true" className="size-4 text-page-accent" />
                {t("advanced.logLocationOpened")}
              </span>
            ) : null}
            {actionStatus === "error" ? (
              <span className="inline-flex items-center gap-1.5 text-destructive" role="alert">
                <WarningCircle aria-hidden="true" className="size-4" />
                {t("advanced.actionFailed")}
              </span>
            ) : null}
            {actionStatus === "guide-error" ? (
              <span className="inline-flex items-center gap-1.5 text-destructive" role="alert">
                <WarningCircle aria-hidden="true" className="size-4" />
                {t("advanced.replayGuideFailed")}
              </span>
            ) : null}
            {actionStatus === "reset-error" ? (
              <span className="inline-flex items-center gap-1.5 text-destructive" role="alert">
                <WarningCircle aria-hidden="true" className="size-4" />
                {t("advanced.resetOnboardingFailed")}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 cursor-pointer gap-2 rounded-[10px] bg-background/70 px-3"
            onClick={() => void handleOpenLogLocation()}
          >
            <FolderOpen aria-hidden="true" className="size-4" />
            {t("advanced.openLogLocation")}
          </Button>
        </div>
      </div>
    </details>
  )
}
