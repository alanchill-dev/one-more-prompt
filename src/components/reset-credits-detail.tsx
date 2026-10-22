import { useMemo, useRef, useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { Tabs } from "@base-ui/react/tabs"
import { ArrowUpRight, ArrowCounterClockwise, ClockCounterClockwise, Minus, Plus, X } from "@phosphor-icons/react"
import type { MetricLine, ResetCredits } from "@/bindings"
import { useI18n } from "@/hooks/use-i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { cn } from "@/lib/utils"
import "./reset-credits-detail.css"

type TextLine = Extract<MetricLine, { type: "text" }>

export function ResetCreditsDetail({ line, value, className }: {
  line: TextLine
  value: string
  className?: string
}) {
  const t = useI18n()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const count = line.resetCredits?.availableCount ?? Number(line.value.match(/^(\d+) available$/)?.[1] ?? 0)

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (nextOpen) setContainer(triggerRef.current?.closest<HTMLElement>(".app-panel-surface") ?? null)
      setOpen(nextOpen)
    }}>
      <Dialog.Trigger
        ref={triggerRef}
        data-guide-target="reset-history-trigger"
        aria-label={`${t("quota.resets.viewDetails")} · ${value}`}
        className={cn("reset-credits-trigger", className)}
      >
        <span>{value}</span>
        <ArrowUpRight size={14} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop className="reset-credits-backdrop" />
        <Dialog.Viewport className="reset-credits-viewport">
          <Dialog.Popup ref={popupRef} className="reset-credits-popup" initialFocus={popupRef} aria-modal="true" data-guide-target="reset-history-detail">
            <ResetCreditsContent data={line.resetCredits} count={count} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ResetCreditsContent({ data, count }: { data: ResetCredits | null | undefined; count: number }) {
  const t = useI18n()
  const language = useAppPreferencesStore((state) => state.language)
  const [tab, setTab] = useState("available")
  const currentYear = new Date().getFullYear()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const available = useMemo(() => [...(data?.credits ?? [])].sort((a, b) =>
    (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity),
  ), [data?.credits])
  const history = useMemo(() => [...(data?.history ?? [])].sort((a, b) =>
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  ), [data?.history])

  function dateParts(iso: string | null) {
    if (!iso || !Number.isFinite(Date.parse(iso))) return null
    const date = new Date(iso)
    return {
      date: new Intl.DateTimeFormat(language, {
        year: date.getFullYear() === currentYear ? undefined : "numeric",
        month: "long", day: "numeric",
      }).format(date),
      time: new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit" }).format(date),
    }
  }

  return <>
    <header className="reset-credits-heading">
      <div>
        <Dialog.Title>{t("quota.resets.title")}</Dialog.Title>
        <Dialog.Description>{t("quota.resets.description")}</Dialog.Description>
      </div>
      <Dialog.Close className="reset-credits-close" aria-label={t("quota.resets.close")}>
        <X size={18} aria-hidden="true" />
      </Dialog.Close>
    </header>
    <Tabs.Root value={tab} onValueChange={(value) => setTab(String(value))} className="reset-credits-tabs">
      <div className="reset-credits-toolbar">
        <Tabs.List className="reset-credits-tab-list" aria-label={t("quota.resets.title")} activateOnFocus>
          <Tabs.Tab className="reset-credits-tab" value="available">{t("quota.resets.available", { count })}</Tabs.Tab>
          <Tabs.Tab className="reset-credits-tab" value="history">{t("quota.resets.history")}</Tabs.Tab>
        </Tabs.List>
        <span className="reset-credits-sort">{t(tab === "available" ? "quota.resets.sortExpiry" : "quota.resets.past30Days")}</span>
      </div>
      <Tabs.Panel value="available" className="reset-credits-panel">
        {data?.credits == null ? (
          <ResetCreditsEmpty message={t("quota.resets.detailsUnavailable")} />
        ) : available.length === 0 ? (
          <ResetCreditsEmpty message={t("quota.resets.noAvailable")} description={t("quota.resets.noAvailableDescription")} />
        ) : (
          <ul className="reset-credits-list" aria-label={t("quota.resets.available", { count })}>
            {available.map((credit, index) => {
              const expiry = dateParts(credit.expiresAt)
              const granted = dateParts(credit.grantedAt)
              return <li className="reset-credits-row" key={credit.id}>
                <span className="reset-credits-icon"><ArrowCounterClockwise size={18} aria-hidden="true" /></span>
                <div className="reset-credits-row-info">
                  <div className="reset-credits-row-title">
                    <span>{t("quota.resets.oneReset")}</span>
                    {index === 0 && expiry && <span className="reset-credits-earliest">{t("quota.resets.earliestExpiry")}</span>}
                  </div>
                  {granted && <p><time dateTime={credit.grantedAt!}>{t("quota.resets.grantedOn", { date: `${granted.date} ${granted.time}` })}</time></p>}
                </div>
                <div className="reset-credits-row-date">
                  {expiry ? <time dateTime={credit.expiresAt!}>
                    <span>{expiry.date}</span>
                    <small>{t("quota.resets.expiryTime", { time: expiry.time })}</small>
                  </time> : <small>{t("quota.resets.unknownExpiry")}</small>}
                </div>
              </li>
            })}
          </ul>
        )}
      </Tabs.Panel>
      <Tabs.Panel value="history" className="reset-credits-panel reset-credits-history-panel">
        {!data || data.historyState === "unavailable" ? (
          <ResetCreditsEmpty message={t("quota.resets.historyUnavailable")} />
        ) : data.historyState === "disabled" ? (
          <ResetCreditsEmpty message={t("quota.resets.historyDisabled")} />
        ) : <>
          {data.historyState === "partial" && <p className="reset-credits-notice" role="status">{t("quota.resets.historyPartial")}</p>}
          {history.length === 0 && data.historyState === "ready" ? (
            <ResetCreditsEmpty message={t("quota.resets.noHistory")} description={t("quota.resets.noHistoryDescription")} />
          ) : (
            <ul className="reset-credits-list" aria-label={t("quota.resets.history")}>
              {history.map((event) => {
                const date = dateParts(event.occurredAt)!
                const received = event.kind === "granted"
                const Icon = received ? Plus : Minus
                return <li className="reset-credits-row" key={event.id}>
                  <span className="reset-credits-icon" data-event={event.kind}><Icon size={16} aria-hidden="true" /></span>
                  <div className="reset-credits-row-info reset-credits-row-title">{t(received ? "quota.resets.received" : "quota.resets.used")}</div>
                  <div className="reset-credits-row-date"><time dateTime={event.occurredAt}>
                    <span>{date.date}</span><small>{date.time}</small>
                  </time></div>
                </li>
              })}
            </ul>
          )}
        </>}
      </Tabs.Panel>
    </Tabs.Root>
    <footer className="reset-credits-footer">
      <span>{t("quota.resets.localTime", { zone })}</span>
      <span>{new Intl.DateTimeFormat(language, { year: "numeric" }).format(new Date())}</span>
    </footer>
  </>
}

function ResetCreditsEmpty({ message, description }: { message: string; description?: string }) {
  return <div className="reset-credits-empty" role="status">
    <ClockCounterClockwise size={26} weight="light" aria-hidden="true" />
    <p>{message}</p>
    {description && <small>{description}</small>}
  </div>
}
