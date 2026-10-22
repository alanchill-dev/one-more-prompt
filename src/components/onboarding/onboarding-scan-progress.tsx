import { useEffect, useState } from "react"
import { CircleNotch } from "@phosphor-icons/react"
import type { OnboardingScanProgress as ScanProgress } from "@/bindings"
import { useI18n } from "@/hooks/use-i18n"
import type { AppLanguage } from "@/lib/i18n"

export function OnboardingScanProgress({ language, progress }: { language: AppLanguage; progress: ScanProgress | null }) {
  const t = useI18n(language)
  const [startedAt] = useState(Date.now)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
  const phase = progress?.phase ?? "waiting"
  const hasFileCount = phase === "reading" || phase === "summarizing"
  const processedFiles = progress?.processedFiles ?? 0
  const totalFiles = progress?.totalFiles ?? 0
  const percent = totalFiles > 0 ? processedFiles / totalFiles * 100 : 0
  const format = new Intl.NumberFormat(language, { maximumFractionDigits: 2 })
  const phaseLabel = {
    waiting: t("onboarding.scan.waiting"), discovering: t("onboarding.scan.discovering"),
    reading: t("onboarding.scan.reading"), summarizing: t("onboarding.scan.summarizing"),
  }[phase]
  return <>
    <div className="onboarding-scan-status">
      <CircleNotch className="onboarding-spinner" aria-hidden />
      <span role="status" aria-live="polite">{phaseLabel}</span>
      {hasFileCount && <span className="onboarding-scan-percent">{format.format(percent)}%</span>}
    </div>
    <div className="onboarding-scan-progress">
    <div className="onboarding-scan-track" role="progressbar" aria-label={t("onboarding.scan.filesProgress")}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={phaseLabel}>
      <span className="onboarding-scan-fill" style={{ transform: `scaleX(${percent / 100})` }} />
    </div>
    <div className="onboarding-scan-meta">
      <span>{hasFileCount && progress ? t("onboarding.scan.filesChecked", {
        processed: format.format(processedFiles), total: format.format(totalFiles),
      }) : t("onboarding.scan.localOnly")}</span>
      <span className="onboarding-scan-elapsed">{t("onboarding.scan.elapsed", { time })}</span>
    </div>
    {seconds >= 15 && <p className="onboarding-scan-wait" role="status">{t("onboarding.scan.longWait")}</p>}
    </div>
  </>
}
