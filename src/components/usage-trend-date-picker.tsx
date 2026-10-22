import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { SharedElementMorph } from "@/components/shared-element-morph"
import {
  addCalendarMonths,
  addLocalDays,
  dateFromLocalKey,
  inclusiveCalendarDayCount,
  localDateKey,
  MAX_CUSTOM_RANGE_DAYS,
} from "@/components/usage-trend-utils"
import { useI18n } from "@/hooks/use-i18n"
import { cn } from "@/lib/utils"

export type UsageTrendDatePickerSelection =
  | { mode: "single"; dateKey: string | null }
  | { mode: "range"; startKey: string | null; endKey: string | null }

type UsageTrendDatePickerAnchorRect = {
  left: number
  top: number
  width: number
  height: number
}

type UsageTrendDatePickerProps = {
  open: boolean
  anchorRect: UsageTrendDatePickerAnchorRect | null
  sourceLabel: string
  sourceVisual?: ReactNode
  sourceRadius?: string
  sourceBackground?: string
  sourceBorderColor?: string
  selection: UsageTrendDatePickerSelection
  todayKey: string
  minimumKey: string
  onClose: () => void
  onSelectSingle: (dateKey: string) => void
  onSelectRange: (startKey: string, endKey: string) => void
  onSelectWindow?: (dateKey: string, startMinute: number, endMinute: number) => void
  initialWindow?: { startMinute: number; endMinute: number } | null
  maxRangeDays?: number | null
  onExitComplete?: () => void
}

const DATE_PICKER_EXIT_ANIMATION_MS = 320
const DATE_PICKER_WIDTH = 352
const DATE_PICKER_ESTIMATED_HEIGHT = 420

const WEEKDAY_KEYS = [
  "overview.calendarSun",
  "overview.calendarMon",
  "overview.calendarTue",
  "overview.calendarWed",
  "overview.calendarThu",
  "overview.calendarFri",
  "overview.calendarSat",
] as const

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthKey(date: Date) {
  return localDateKey(monthStart(date)).slice(0, 7)
}

function monthTitle(date: Date) {
  return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, "0")}`
}

function shortDate(key: string | null) {
  return key ? key.replace(/^(\d{4})-0?(\d{1,2})-0?(\d{1,2})$/, "$1/$2/$3") : ""
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

function parseMinute(value: string): number | null {
  if (value === "24:00") return 1440
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

export function UsageTrendDatePicker({
  open,
  anchorRect,
  sourceLabel,
  sourceVisual,
  sourceRadius = "7px",
  sourceBackground = "color-mix(in oklab, var(--background) 92%, transparent)",
  sourceBorderColor,
  selection,
  todayKey,
  minimumKey,
  onClose,
  onSelectSingle,
  onSelectRange,
  onSelectWindow,
  initialWindow = null,
  maxRangeDays = MAX_CUSTOM_RANGE_DAYS,
  onExitComplete,
}: UsageTrendDatePickerProps) {
  const t = useI18n()
  const today = dateFromLocalKey(todayKey) ?? new Date()
  const minimum = dateFromLocalKey(minimumKey) ?? addLocalDays(today, -364)
  const requestedDateKey = selection.mode === "single"
    ? selection.dateKey ?? todayKey
    : selection.startKey ?? todayKey
  const validInitialKey = dateFromLocalKey(requestedDateKey) ? requestedDateKey : todayKey
  const initialDateKey = validInitialKey < localDateKey(minimum) ? localDateKey(minimum)
    : validInitialKey > todayKey ? todayKey : validInitialKey
  const [mode, setMode] = useState<"single" | "range">(selection.mode)
  const [month, setMonth] = useState(() => monthStart(dateFromLocalKey(initialDateKey) ?? today))
  const [rangeStartKey, setRangeStartKey] = useState<string | null>(selection.mode === "range" ? selection.startKey : null)
  const [rangeEndKey, setRangeEndKey] = useState<string | null>(selection.mode === "range" ? selection.endKey : null)
  const [message, setMessage] = useState("")
  const [draftDay, setDraftDay] = useState(initialDateKey)
  const [startTime, setStartTime] = useState(formatMinute(initialWindow?.startMinute ?? 0))
  const [endTime, setEndTime] = useState(formatMinute(initialWindow?.endMinute ?? 1440))
  const timeErrorId = useId()
  const startMinute = parseMinute(startTime)
  const endMinute = parseMinute(endTime)
  const invalidTime = (startMinute === null || endMinute === null || endMinute <= startMinute)
  const [rendered, setRendered] = useState(open)
  const [motionState, setMotionState] = useState<"open" | "closed">(open ? "open" : "closed")
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const firstDateRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocusKeyRef = useRef<string | null>(null)
  const exitCompleteRef = useRef(onExitComplete)
  useEffect(() => { exitCompleteRef.current = onExitComplete }, [onExitComplete])

  function isSelectable(key: string) {
    return dateFromLocalKey(key) !== null && key >= localDateKey(minimum) && key <= todayKey
  }

  const maximumMonth = monthStart(today)
  const minimumMonth = monthStart(minimum)
  const days = useMemo(() => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return Array.from({ length: firstDay + dayCount }, (_, index) => {
      if (index < firstDay) return null
      const date = new Date(month.getFullYear(), month.getMonth(), index - firstDay + 1)
      return localDateKey(date)
    })
  }, [month])

  useEffect(() => {
    let exitTimer: ReturnType<typeof setTimeout> | null = null
    if (open) {
      setRendered(true)
      setMotionState("open")
      setMode(selection.mode)
      const nextInitialDateKey = initialDateKey
      setMonth(monthStart(dateFromLocalKey(nextInitialDateKey) ?? today))
      setRangeStartKey(selection.mode === "range" ? selection.startKey : null)
      setRangeEndKey(selection.mode === "range" ? selection.endKey : null)
      setDraftDay(nextInitialDateKey)
      setStartTime(formatMinute(initialWindow?.startMinute ?? 0))
      setEndTime(formatMinute(initialWindow?.endMinute ?? 1440))
      setMessage("")
    } else if (rendered) {
      setMotionState("closed")
      exitTimer = setTimeout(() => {
        setRendered(false)
        exitCompleteRef.current?.()
      }, DATE_PICKER_EXIT_ANIMATION_MS)
    }
    return () => {
      if (exitTimer) clearTimeout(exitTimer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", updateViewport)
    return () => window.removeEventListener("resize", updateViewport)
  }, [open])

  useEffect(() => {
    if (!open || !rendered) return
    const frame = requestAnimationFrame(() => firstDateRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, rendered])

  useEffect(() => {
    const key = pendingFocusKeyRef.current
    if (!key) return
    pendingFocusKeyRef.current = null
    document.getElementById(dateButtonId(key))?.focus()
  }, [month])

  function changeMonth(offset: number) {
    const next = addCalendarMonths(month, offset)
    if (monthKey(next) < monthKey(minimumMonth) || monthKey(next) > monthKey(maximumMonth)) return
    setMonth(next)
  }

  function focusDateKey(key: string) {
    const date = dateFromLocalKey(key)
    if (!date) return
    pendingFocusKeyRef.current = key
    if (monthKey(date) !== monthKey(month)) {
      setMonth(monthStart(date))
      return
    }
    requestAnimationFrame(() => {
      pendingFocusKeyRef.current = null
      document.getElementById(dateButtonId(key))?.focus()
    })
  }

  function monthFocusKey(key: string, offset: number) {
    const date = dateFromLocalKey(key)
    if (!date) return null
    const nextMonth = addCalendarMonths(date, offset)
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
    const nextDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(date.getDate(), lastDay))
    const nextKey = localDateKey(nextDate)
    if (nextKey < minimumKey) return minimumKey
    if (nextKey > todayKey) return todayKey
    return nextKey
  }

  function moveFocus(key: string, offset: number) {
    const date = dateFromLocalKey(key)
    if (!date) return
    const next = addLocalDays(date, offset)
    const nextKey = localDateKey(next)
    if (!isSelectable(nextKey)) return
    focusDateKey(nextKey)
  }

  function handleDateKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (event.key in moves) {
      event.preventDefault()
      moveFocus(key, moves[event.key])
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault()
      const nextKey = monthFocusKey(key, event.key === "PageUp" ? -1 : 1)
      if (nextKey) focusDateKey(nextKey)
    }
  }

  function handleDateClick(key: string) {
    if (!isSelectable(key)) return
    setMessage("")
    if (mode === "single") {
      if (onSelectWindow) setDraftDay(key)
      else onSelectSingle(key)
      return
    }

    if (!rangeStartKey || rangeEndKey) {
      setRangeStartKey(key)
      setRangeEndKey(null)
      return
    }
    if (key < rangeStartKey) {
      setMessage(t("overview.calendarStartAfterEnd"))
      return
    }
    const length = inclusiveCalendarDayCount(rangeStartKey, key)
    if (length == null || (maxRangeDays !== null && length > maxRangeDays)) {
      if (maxRangeDays !== null) setMessage(t("overview.calendarRangeTooLong", { days: maxRangeDays }))
      return
    }
    setRangeEndKey(key)
    if (!onSelectWindow) onSelectRange(rangeStartKey, key)
  }

  const appliedSingle = mode === "single" ? onSelectWindow ? draftDay : selection.mode === "single" ? selection.dateKey : null : null
  const activeStart = mode === "range"
    ? rangeStartKey
    : null
  const activeEnd = mode === "range"
    ? rangeEndKey
    : null
  const rangeLength = activeStart && activeEnd ? inclusiveCalendarDayCount(activeStart, activeEnd) : null

  if (!rendered || typeof document === "undefined") return null

  const panelWidth = Math.min(DATE_PICKER_WIDTH, Math.max(280, viewport.width - 32))
  const anchorRight = anchorRect ? anchorRect.left + anchorRect.width : viewport.width - 24
  const panelLeft = Math.max(16, Math.min(anchorRight - panelWidth, viewport.width - panelWidth - 16))
  const preferredTop = anchorRect ? anchorRect.top + anchorRect.height + 8 : 96
  const estimatedHeight = onSelectWindow ? 520 : DATE_PICKER_ESTIMATED_HEIGHT
  const panelHeight = Math.min(estimatedHeight, Math.max(0, viewport.height - 32))
  const panelTop = Math.max(16, Math.min(preferredTop, Math.max(16, viewport.height - panelHeight - 16)))
  const destinationRect = { left: panelLeft, top: panelTop, width: panelWidth, height: panelHeight }

  const picker = (
    <div className="usage-trend-date-picker-layer pointer-events-none fixed inset-0 z-[118]" data-state={motionState} data-testid="usage-trend-date-picker-layer">
    <SharedElementMorph
      sourceRect={anchorRect}
      destinationRect={destinationRect}
      motionState={motionState}
      sourceRadius={sourceRadius}
      destinationRadius="var(--radius-xl)"
      sourceBackground={sourceBackground}
      sourceBorderColor={sourceBorderColor}
      destinationBackground="var(--card)"
      destinationBorderColor="var(--border)"
      sourceVisual={sourceVisual ?? <span className="px-2 text-[11px] font-semibold text-foreground">{sourceLabel}</span>}
      className="z-[1]"
      testId="usage-trend-date-picker-shared-morph"
    />
    <div
      role="dialog"
      aria-label={t("overview.customCalendar")}
      aria-hidden={!open}
      inert={!open}
      className={cn(onSelectWindow ? "flex flex-col overflow-hidden" : "overflow-y-auto", "usage-trend-date-picker-card shared-element-destination-card pointer-events-auto fixed z-[2] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-3 text-card-foreground shadow-[0_18px_45px_-24px_rgba(0,0,0,0.75)] [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-foreground/60 [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-foreground/60")}
      style={{ left: panelLeft, top: panelTop, width: panelWidth, height: panelHeight }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
      data-testid="usage-trend-date-picker"
      data-state={motionState}
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("overview.customCalendar")}</h2>
          {maxRangeDays !== null && <p className="mt-0.5 text-[10px] text-muted-foreground">{t("overview.calendarWindow", { days: maxRangeDays })}</p>}
        </div>
        <button type="button" className="size-9 rounded-md text-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} aria-label={t("overview.calendarClose")}>×</button>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-2 rounded-lg bg-muted p-1" role="tablist" aria-label={t("overview.calendarMode")}>
        {(["single", "range"] as const).map((nextMode) => (
          <button
            key={nextMode}
            type="button"
            role="tab"
            aria-selected={mode === nextMode}
            onClick={() => {
              setMode(nextMode)
              setMessage("")
              if (nextMode === "single") {
                setRangeStartKey(null)
                setRangeEndKey(null)
              }
            }}
            className={cn("min-h-9 rounded-md px-2 text-xs font-semibold", mode === nextMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {nextMode === "single" ? t("overview.singleDay") : t("overview.dateRange")}
          </button>
        ))}
      </div>

      <div className={cn(onSelectWindow && "min-h-0 flex-1 overflow-y-auto")} data-testid="calendar-date-scroll">
      <div className="mt-3 flex items-center justify-between">
        <button type="button" className="size-9 rounded-md text-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30" onClick={() => changeMonth(-1)} disabled={monthKey(month) <= monthKey(minimumMonth)} aria-label={t("overview.previousMonth")}>‹</button>
        <p className="text-xs font-semibold tabular-nums" aria-live="polite">{monthTitle(month)}</p>
        <button type="button" className="size-9 rounded-md text-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30" onClick={() => changeMonth(1)} disabled={monthKey(month) >= monthKey(maximumMonth)} aria-label={t("overview.nextMonth")}>›</button>
      </div>

      <div className="mt-2 grid grid-cols-7 text-center" role="grid" aria-label={t("overview.calendarGrid")}>
        {WEEKDAY_KEYS.map((key) => <span key={key} role="columnheader" className="py-1 text-[9px] font-semibold uppercase text-muted-foreground">{t(key)}</span>)}
        {days.map((key, index) => {
          if (!key) return <span key={`empty-${index}`} aria-hidden="true" />
          const selectable = isSelectable(key)
          const selected = appliedSingle === key || (mode === "range" && (key === activeStart || key === activeEnd))
          const inRange = mode === "range" && activeStart && activeEnd && key >= activeStart && key <= activeEnd
          const buttonRef = key === initialDateKey ? firstDateRef : undefined
          return (
            <button
              key={key}
              id={dateButtonId(key)}
              ref={buttonRef}
              type="button"
              role="gridcell"
              aria-label={t("overview.calendarSelectDate", { date: shortDate(key) })}
              aria-selected={selected}
              aria-current={key === todayKey ? "date" : undefined}
              disabled={!selectable}
              onClick={() => handleDateClick(key)}
              onKeyDown={(event) => handleDateKeyDown(event, key)}
              className={cn(
                "relative min-h-9 rounded-md text-xs tabular-nums transition-colors",
                selectable ? "hover:bg-muted" : "cursor-not-allowed text-muted-foreground/35",
                inRange ? "bg-[color:var(--wire-orange)]/15" : "",
                selected ? "font-bold text-[var(--wire-orange)] ring-1 ring-[var(--wire-orange)]" : "",
              )}
            >
              {Number(key.slice(8, 10))}
            </button>
          )
        })}
      </div>

      </div>
      {!onSelectWindow && (
        <div className="mt-3 min-h-9 rounded-lg bg-muted/60 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground" aria-live="polite">
          {message || (mode === "single"
            ? (appliedSingle ? t("overview.calendarSelectedDay", { date: shortDate(appliedSingle) }) : t("overview.calendarChooseDay"))
            : activeStart && activeEnd
              ? t("overview.calendarSelectedRange", { start: shortDate(activeStart), end: shortDate(activeEnd), days: rangeLength ?? 0 })
              : activeStart
                ? t("overview.calendarChooseRangeEnd", { date: shortDate(activeStart) })
                : t("overview.calendarChooseRangeStart"))}
        </div>
      )}
      {onSelectWindow && (
        <div className="mt-3 shrink-0 border-t border-border pt-3">
          <div className="min-h-[58px]">
          {mode === "single" ? (
            <div className="grid grid-cols-2 gap-2">
              {([
                [t("promptUsage.startTime"), startTime, setStartTime],
                [t("promptUsage.endTime"), endTime, setEndTime],
              ] as const).map(([label, value, setValue]) => (
                <label key={label} className="text-[10px] font-semibold text-muted-foreground">
                  {label}
                  <input value={value} onChange={(event) => setValue(event.currentTarget.value)} placeholder="HH:mm" maxLength={5} aria-invalid={invalidTime} aria-describedby={invalidTime ? timeErrorId : undefined} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs tabular-nums text-foreground outline-none focus-visible:border-foreground/50" />
                </label>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/60 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground" aria-live="polite">
              {message || (activeStart && activeEnd
                ? t("overview.calendarSelectedRange", { start: shortDate(activeStart), end: shortDate(activeEnd), days: rangeLength ?? 0 })
                : activeStart
                  ? t("overview.calendarChooseRangeEnd", { date: shortDate(activeStart) })
                  : t("overview.calendarChooseRangeStart"))}
            </p>
          )}
          </div>
          {mode === "single" && invalidTime && <p id={timeErrorId} role="alert" className="mt-2 text-[10px] text-destructive">{t("promptUsage.invalidTimeWindow")}</p>}
          <button type="button" disabled={mode === "single" ? !isSelectable(draftDay) || invalidTime : !rangeStartKey || !rangeEndKey} className="mt-3 min-h-10 w-full rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/85 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => {
            if (mode === "range") {
              if (rangeStartKey && rangeEndKey) onSelectRange(rangeStartKey, rangeEndKey)
              return
            }
            if (!isSelectable(draftDay) || invalidTime || startMinute === null || endMinute === null) return
            if (startMinute === 0 && endMinute === 1440) onSelectSingle(draftDay)
            else onSelectWindow(draftDay, startMinute, endMinute)
          }}>{t("promptUsage.applyFilter")}</button>
        </div>
      )}
    </div>
    </div>
  )

  return createPortal(picker, document.body)
}

function dateButtonId(key: string) {
  return `usage-trend-calendar-date-${key}`
}
