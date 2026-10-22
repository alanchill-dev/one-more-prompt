import { Checks } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/hooks/use-i18n"
import { usePromptUsageUnreadStore } from "@/stores/prompt-usage-unread-store"

export function PromptUsageMarkAllRead() {
  const t = useI18n()
  const unreadCount = usePromptUsageUnreadStore(state => state.unreadKeys.length)
  const markAllRead = usePromptUsageUnreadStore(state => state.markAllRead)
  const restoreUnread = usePromptUsageUnreadStore(state => state.restoreUnread)
  const [cleared, setCleared] = useState<string[] | null>(null)
  const [undone, setUndone] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [feedbackHost, setFeedbackHost] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    setFeedbackHost(anchor?.closest<HTMLElement>(".app-panel-surface")
      ?? anchor?.closest<HTMLElement>("[data-prompt-usage-feedback-surface]") ?? null)
  }, [])

  useEffect(() => {
    if (!cleared && !undone) return
    const timer = window.setTimeout(() => { setCleared(null); setUndone(false) }, 8_000)
    return () => window.clearTimeout(timer)
  }, [cleared, undone])

  return <span ref={anchorRef} className="contents">
    {unreadCount > 0 ? <Button type="button" variant="ghost" size="sm"
      className="min-h-8 max-w-full shrink-0 gap-1 whitespace-nowrap px-1.5 text-xs font-normal normal-case tracking-normal text-muted-foreground"
      aria-label={`${t("promptUsage.markAllRead")} ${unreadCount}`}
      title={t("promptUsage.markAllReadHint")}
      onClick={() => {
        const keys = markAllRead()
        if (keys.length === 0) return
        setUndone(false)
        setCleared(keys)
      }}>
      <Checks size={14} aria-hidden="true" />{t("promptUsage.markAllRead")}
      <span className="tabular-nums">{unreadCount}</span>
    </Button> : null}
    {feedbackHost ? createPortal(
      <div role="status" aria-live="polite" aria-atomic="true"
        className="pointer-events-none absolute inset-x-4 bottom-4 z-50 flex justify-center normal-case tracking-normal">
        {cleared || undone ? <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-popover px-4 py-2 text-xs font-normal leading-5 text-popover-foreground shadow-lg">
          <span className="min-w-0 break-words">{cleared
            ? t("promptUsage.markedAllRead", { count: cleared.length })
            : t("promptUsage.markAllReadUndone")}</span>
          {cleared ? <Button type="button" variant="link" size="sm" className="min-h-9 px-1 text-xs"
          onClick={() => {
            restoreUnread(cleared)
            setCleared(null)
            setUndone(true)
          }}>{t("promptUsage.undoMarkAllRead")}</Button> : null}
        </div> : null}
      </div>, feedbackHost) : null}
  </span>
}
