import { useEffect, useRef, useState } from "react"
import { Channel, invoke } from "@tauri-apps/api/core"
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChatCircleText,
  CheckCircle,
  CircleNotch,
  EyeSlash,
  Key,
  Rows,
  WarningCircle,
} from "@phosphor-icons/react"

import type { OnboardingCodexScan, OnboardingDestination, OnboardingScanProgress as ScanProgress } from "@/bindings"
import { ChromelessWindowShell } from "@/components/chromeless-window-shell"
import { LanguagePicker } from "@/components/language-picker"
import { Button } from "@/components/ui/button"
import { OnboardingScanProgress } from "./onboarding-scan-progress"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useI18n } from "@/hooks/use-i18n"
import type { AppLanguage } from "@/lib/i18n"
import { loadAppLanguage, loadThemeMode, saveAppLanguage, type ThemeMode } from "@/lib/settings"
import "./onboarding.css"

type Step = "language" | "welcome" | "result"
type ScanState =
  | { status: "idle" | "scanning" | "error"; result: null }
  | { status: "success"; result: OnboardingCodexScan }

function OnboardingApp() {
  const [step, setStep] = useState<Step>("language")
  const [language, setLanguage] = useState<AppLanguage>("en")
  const [themeMode, setThemeMode] = useState<ThemeMode>("system")
  const [scan, setScan] = useState<ScanState>({ status: "idle", result: null })
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  const [scanAttempt, setScanAttempt] = useState(0)
  const [finishBusy, setFinishBusy] = useState(false)
  const [finishError, setFinishError] = useState(false)
  const [languageError, setLanguageError] = useState(false)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [canSkip, setCanSkip] = useState<boolean | null>(null)
  const [modeError, setModeError] = useState(false)
  const finishPending = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useI18n(language)
  useSettingsTheme(themeMode)

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadAppLanguage(), loadThemeMode()])
      .then(([storedLanguage, storedTheme]) => {
        if (cancelled) return
        setLanguage(storedLanguage)
        setThemeMode(storedTheme)
      })
      .catch((error) => console.error("Failed to load onboarding preferences:", error))
      .finally(() => { if (!cancelled) setPreferencesReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setCanSkip(null)
    setModeError(false)
    void invoke<boolean>("can_skip_onboarding")
      .then((allowed) => { if (!cancelled) setCanSkip(allowed) })
      .catch((error) => {
        console.error("Failed to load onboarding mode:", error)
        if (!cancelled) setModeError(true)
      })
    return () => { cancelled = true }
  }, [scanAttempt])

  useEffect(() => { document.documentElement.lang = language }, [language])
  useEffect(() => { headingRef.current?.focus() }, [step])

  useEffect(() => {
    if (step !== "result") return
    let cancelled = false
    setScan({ status: "scanning", result: null })
    setScanProgress(null)
    const onProgress = new Channel<ScanProgress>()
    onProgress.onmessage = (progress) => { if (!cancelled) setScanProgress(progress) }
    void invoke<OnboardingCodexScan>("scan_onboarding_codex", { onProgress })
      .then((result) => { if (!cancelled) setScan({ status: "success", result }) })
      .catch((error) => {
        console.error("Failed to scan local Codex data:", error)
        if (!cancelled) setScan({ status: "error", result: null })
      })
    return () => { cancelled = true }
  }, [scanAttempt, step])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      if (finishPending.current || step === "language") return
      setFinishError(false)
      setStep(step === "result" ? "welcome" : "language")
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [step])

  const saveLanguage = async () => {
    setLanguageError(false)
    try {
      await saveAppLanguage(language)
      return true
    } catch (error) {
      console.error("Failed to save onboarding language:", error)
      setLanguageError(true)
      return false
    }
  }

  const continueFromLanguage = async () => {
    if (finishPending.current || !preferencesReady) return
    finishPending.current = true
    setFinishBusy(true)
    try {
      if (await saveLanguage()) setStep("welcome")
    } finally {
      finishPending.current = false
      setFinishBusy(false)
    }
  }

  const finish = async (showGuide: boolean, skipSetup = false) => {
    if (finishPending.current || canSkip === null || (skipSetup ? !canSkip : step !== "result" || scan.status === "idle" || scan.status === "scanning")) return
    finishPending.current = true
    setFinishBusy(true)
    setFinishError(false)
    try {
      if (!await saveLanguage()) return
      const destination: OnboardingDestination = "overview"
      await invoke("finish_onboarding", { destination, showGuide, skipSetup })
    } catch (error) {
      console.error("Failed to finish onboarding:", error)
      setFinishError(true)
    } finally {
      finishPending.current = false
      setFinishBusy(false)
    }
  }

  const retryScan = () => {
    setFinishError(false)
    setScan({ status: "scanning", result: null })
    setScanAttempt((attempt) => attempt + 1)
  }

  const changeLanguage = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage)
    setLanguageError(false)
  }

  const result = scan.status === "success" ? scan.result : null
  const hasActivity = (result?.promptCount ?? 0) > 0
  const scanning = scan.status === "idle" || scan.status === "scanning"
  const formatter = new Intl.NumberFormat(language)
  const formatCount = (count: number | null | undefined) => count == null ? "—" : formatter.format(count)
  const title = step === "language" ? t("onboarding.chooseLanguage.title") : step === "welcome"
    ? t("onboarding.welcome.title")
    : scanning
      ? t("onboarding.scan.title")
      : scan.status === "error"
        ? t("onboarding.scan.unavailableTitle")
        : t(hasActivity ? "onboarding.ready.foundTitle" : "onboarding.ready.emptyTitle")
  const description = step === "language" ? t("onboarding.chooseLanguage.description") : step === "welcome"
    ? t("onboarding.welcome.description")
    : scanning
      ? t("onboarding.scan.description")
      : scan.status === "error"
        ? t("onboarding.scan.unavailableDescription")
        : t(hasActivity ? "onboarding.ready.foundDescription" : "onboarding.ready.emptyDescription")

  return (
    <div className="onboarding-root h-screen" data-state={step === "result" ? scan.status : step}>
      <ChromelessWindowShell headerRight={
        <div className="onboarding-header-tools">
          {step !== "language" && <LanguagePicker value={language} onValueChange={changeLanguage} label={t("onboarding.language")} disabled={finishBusy} />}
          <ol className="onboarding-progress" aria-label={t("onboarding.progress", { current: ["language", "welcome", "result"].indexOf(step) + 1, total: 3 })}>
            {["language", "welcome", "result"].map((item, index) => (
              <li key={item} aria-current={item === step ? "step" : undefined}>
                <span className="sr-only">{index + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      }>
        <section className="onboarding-layout" aria-busy={finishBusy}>
          <div className="onboarding-content" key={step}>
            <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
            <p className="onboarding-description">{description}</p>

            {step === "language" ? <div className="mt-6">
              <LanguagePicker value={language} onValueChange={changeLanguage} label={t("onboarding.language")} disabled={!preferencesReady || finishBusy} />
            </div> : step === "welcome" ? (
              <>
                <ul className="onboarding-tasks">
                  {([
                    { Icon: ChartBar, title: "onboarding.task.overviewTitle", description: "onboarding.task.overviewDescription" },
                    { Icon: ChatCircleText, title: "onboarding.task.promptTitle", description: "onboarding.task.promptDescription" },
                    { Icon: Rows, title: "onboarding.task.timelineTitle", description: "onboarding.task.timelineDescription" },
                  ] as const).map(({ Icon, title: taskTitle, description: taskDescription }) => (
                    <li key={taskTitle}>
                      <Icon className="onboarding-task-icon" aria-hidden />
                      <div>
                        <h2>{t(taskTitle)}</h2>
                        <p>{t(taskDescription)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="onboarding-note"><EyeSlash aria-hidden />{t("onboarding.welcome.privacy")}</p>
              </>
            ) : (
              <div className="onboarding-result">
                {scanning ? <OnboardingScanProgress language={language} progress={scanProgress} /> :
                  <div className="onboarding-scan-status" role="status" aria-live="polite">
                    {scan.status === "error" ? <WarningCircle aria-hidden /> : <CheckCircle aria-hidden />}
                    <span>{t(scan.status === "error" ? "onboarding.scan.unavailable" : "onboarding.scan.complete")}</span>
                  </div>}
                {scan.status === "success" && (
                  <dl className="onboarding-facts">
                    <div><dt>{t("onboarding.scan.localActivity")}</dt><dd>{formatCount(result?.sessionCount)}</dd></div>
                    <div><dt>{t("onboarding.scan.promptHistory")}</dt><dd>{formatCount(result?.promptCount)}</dd></div>
                    <div className="onboarding-configuration">
                      <dt><Key aria-hidden />{t("onboarding.scan.privacy")}</dt>
                      <dd>{t(result?.credentialsDetected ? "onboarding.scan.credentialsFound" : "onboarding.scan.credentialsMissing")}</dd>
                    </div>
                  </dl>
                )}
                {!scanning && (
                  <>
                    {canSkip === false && <p className="onboarding-guide-hint">{t("onboarding.ready.guideHint")}</p>}
                    <p className="onboarding-note"><EyeSlash aria-hidden />{t("onboarding.ready.localOnly")}</p>
                  </>
                )}
              </div>
            )}
          </div>

          <footer className="onboarding-footer">
            {languageError && <p className="onboarding-error" role="alert">{t("onboarding.chooseLanguage.saveError")}</p>}
            {(finishError || modeError) && <p className="onboarding-error" role="alert">{t("onboarding.finishError")}</p>}
            <div className="onboarding-actions">
              {step === "language" ? null : step === "welcome" ? <>
                <Button className="onboarding-button" variant="ghost" disabled={finishBusy} onClick={() => setStep("language")}><CaretLeft aria-hidden />{t("onboarding.back")}</Button>
                {canSkip && (
                <Button className="onboarding-button" variant="ghost" disabled={finishBusy} onClick={() => void finish(false, true)}>{t("onboarding.skip")}</Button>
                )}
              </> : (
                <Button className="onboarding-button" variant="ghost" disabled={finishBusy} onClick={() => { setFinishError(false); setStep("welcome") }}><CaretLeft aria-hidden />{t("onboarding.back")}</Button>
              )}
              <div className="onboarding-primary-actions">
                {step === "result" && !scanning && (!hasActivity || modeError) && (
                  <Button className="onboarding-button" variant="outline" disabled={finishBusy} onClick={retryScan}><ArrowsClockwise aria-hidden />{t("onboarding.retry")}</Button>
                )}
                {step === "language" ? (
                  <Button className="onboarding-button onboarding-primary" disabled={finishBusy || !preferencesReady} onClick={() => void continueFromLanguage()}>{t("onboarding.continue")}<CaretRight aria-hidden /></Button>
                ) : step === "welcome" ? (
                  <Button className="onboarding-button onboarding-primary" disabled={finishBusy} onClick={() => { setFinishError(false); setScan({ status: "scanning", result: null }); setStep("result") }}>{t("onboarding.checkRecords")}<CaretRight aria-hidden /></Button>
                ) : (
                  <Button className="onboarding-button onboarding-primary" disabled={finishBusy || scanning || canSkip === null} onClick={() => void finish(canSkip === false)}>
                    {finishBusy && <CircleNotch className="onboarding-spinner" aria-hidden />}
                    {t("onboarding.openWorkspace")}<CaretRight aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </section>
      </ChromelessWindowShell>
    </div>
  )
}

export { OnboardingApp }
