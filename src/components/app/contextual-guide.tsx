import { useCallback, useEffect, useRef, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useI18n } from "@/hooks/use-i18n"
import { dismissOnboardingGuide, loadAppLanguage, loadOnboardingGuidePending } from "@/lib/settings"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

// Keep the real workspace mounted: the guide's document owns its stores and demo data.
export function ContextualGuide() {
  const t = useI18n()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const visibleRef = useRef(false)
  const busyRef = useRef(false)
  const refreshIdRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)
  const [openError, setOpenError] = useState(false)
  const [exitRequest, setExitRequest] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    const id = ++refreshIdRef.current
    try {
      const [pending, language] = await Promise.all([loadOnboardingGuidePending(), loadAppLanguage()])
      if (id !== refreshIdRef.current) return
      useAppPreferencesStore.getState().setLanguage(language)
      if (!pending || visibleRef.current) return
      if (isTauri()) await invoke("set_contextual_guide_active", { active: true })
      if (id !== refreshIdRef.current) return
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      visibleRef.current = true
      setError(false)
      setOpenError(false)
      setExitRequest(null)
      setVisible(true)
    } catch (failure) {
      console.error("Failed to open the contextual guide:", failure)
      setOpenError(true)
    }
  }, [])

  const dismiss = useCallback(async (finished: boolean) => {
    if (busyRef.current) return
    busyRef.current = true
    setExitRequest(finished)
    setError(false)
    try {
      await dismissOnboardingGuide(finished)
      if (isTauri()) await invoke("set_contextual_guide_active", { active: false })
      ++refreshIdRef.current
      visibleRef.current = false
      setVisible(false)
      requestAnimationFrame(() => {
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true })
        returnFocusRef.current = null
      })
    } catch (failure) {
      console.error("Failed to close the contextual guide:", failure)
      setError(true)
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const disposers: (() => void)[] = []
    if (!isTauri()) void refresh()
    else void Promise.all(["contextual-guide-requested", "tray:navigate"].map(async name => {
      const dispose = await listen(name, () => { if (!cancelled) void refresh() })
      if (cancelled) dispose()
      else disposers.push(dispose)
    })).then(() => { if (!cancelled) void refresh() }).catch(failure => {
      console.error("Failed to listen for contextual guide requests:", failure)
    })
    return () => {
      cancelled = true
      ++refreshIdRef.current
      disposers.forEach(dispose => dispose())
      if (visibleRef.current && isTauri()) {
        void invoke("set_contextual_guide_active", { active: false }).catch(console.error)
      }
    }
  }, [refresh])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const frame = frameRef.current
      if (!frame || event.source !== frame.contentWindow || !visibleRef.current) return
      if (event.data?.type === "omp-guide-ready") {
        void loadAppLanguage().then(language => {
          if (frameRef.current !== frame || !visibleRef.current) return
          useAppPreferencesStore.getState().setLanguage(language)
          const preferences = useAppPreferencesStore.getState()
          frame.contentWindow?.postMessage({
            type: "omp-guide-init", language,
            themeMode: preferences.themeMode, modelPalette: preferences.modelColors,
          }, "*")
        }).catch(failure => {
          console.error("Failed to load guide language:", failure)
          setOpenError(true)
        })
      } else if (event.data?.type === "omp-guide-error") {
        console.error("The isolated guide reported a failure:", event.data.message)
      } else if (event.data?.type === "omp-guide-exit" && typeof event.data.finished === "boolean") {
        void dismiss(event.data.finished)
      }
    }
    window.addEventListener("message", receive)
    return () => window.removeEventListener("message", receive)
  }, [dismiss])

  useEffect(() => {
    if (!visible) return
    const siblings = [...(hostRef.current?.parentElement?.children ?? [])]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== hostRef.current)
      .map(node => ({ node, inert: node.inert }))
    siblings.forEach(({ node }) => { node.inert = true })
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopImmediatePropagation()
      void dismiss(false)
    }
    document.addEventListener("keydown", escape, true)
    return () => {
      siblings.forEach(({ node, inert }) => { node.inert = inert })
      document.removeEventListener("keydown", escape, true)
    }
  }, [visible, dismiss])

  if (!visible) return openError ? <div role="alert" className="absolute inset-x-4 bottom-4 z-[1000] rounded-lg border bg-background p-4 text-foreground">
    <p>{t("advanced.replayGuideFailed")}</p>
    <button type="button" className="mt-2 min-h-11 underline" onClick={() => void refresh()}>{t("common.retry")}</button>
  </div> : null
  return <div ref={hostRef} className="absolute inset-0 z-[1000] overflow-hidden rounded-[inherit]" data-testid="contextual-guide">
    <iframe ref={frameRef} name="omp-guide-sandbox" aria-label={t("guide.label")}
      src={new URL(`${import.meta.env.BASE_URL}guide.html`, window.location.href).href}
      className="h-full w-full border-0 bg-background" />
    {openError && <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg border bg-background p-4 text-foreground shadow-lg">
      <p>{t("advanced.replayGuideFailed")}</p>
      <button type="button" className="mt-2 min-h-11 underline" onClick={() => {
        setOpenError(false)
        if (frameRef.current) frameRef.current.src = frameRef.current.src
      }}>{t("common.retry")}</button>
    </div>}
    {error ? <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg border bg-background p-4 text-foreground shadow-lg">
      <p>{t("guide.dismissError")}</p>
      <button type="button" className="mt-2 min-h-11 underline" onClick={() => void dismiss(exitRequest ?? false)}>{t("common.retry")}</button>
    </div> : null}
  </div>
}
