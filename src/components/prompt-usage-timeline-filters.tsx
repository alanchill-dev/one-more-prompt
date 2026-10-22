import "./prompt-usage-project-filter.css"
import { Popover } from "@base-ui/react/popover"
import { Select } from "@base-ui/react/select"
import { CalendarBlank, CaretDown, Check, Cpu, Folder, Folders, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import { UsageTrendDatePicker, type UsageTrendDatePickerSelection } from "@/components/usage-trend-date-picker"
import { useI18n } from "@/hooks/use-i18n"
import { DEFAULT_PROMPT_USAGE_TIME_SCOPE, localDateKeyFromDate, normalizeUsageTimeScope, type UsageTimeScope } from "@/lib/time-scope"

function formatShortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-")
  return `${year}/${Number(month)}/${Number(day)}`
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

export function scopeLabel(scope: UsageTimeScope, t: ReturnType<typeof useI18n>): string {
  switch (scope.type) {
    case "today": return t("overview.rangeToday")
    case "lastDays": return t("overview.rangeDays", { days: scope.days })
    case "day": return formatShortDate(scope.dateKey)
    case "hour": return `${formatShortDate(scope.dateKey)} · ${formatHour(scope.hour)}`
    case "window": return `${formatShortDate(scope.dateKey)} · ${formatMinute(scope.startMinute)}–${formatMinute(scope.endMinute)}`
    case "range": return `${formatShortDate(scope.startKey)}–${formatShortDate(scope.endKey)}`
    case "interval": {
      const label = (at: number) => {
        const date = new Date(at)
        return `${formatShortDate(localDateKeyFromDate(date))} ${formatMinute(date.getHours() * 60 + date.getMinutes())}`
      }
      return `${label(scope.startAt)}–${label(scope.endAt)}`
    }
  }
}

export function TimeScopeControl({ scope, onChange, minimumKey = "1970-01-01" }: {
  scope: UsageTimeScope
  onChange: (scope: UsageTimeScope) => void
  minimumKey?: string
}) {
  const t = useI18n()
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState<{
    anchor: { left: number; top: number; width: number; height: number }
    label: string
    selection: UsageTrendDatePickerSelection
    window: { startMinute: number; endMinute: number } | null
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const isSpecific = scope.type === "day" || scope.type === "hour" || scope.type === "window" || scope.type === "range" || scope.type === "interval"
  const todayKey = localDateKeyFromDate(new Date())

  useEffect(() => {
    if (!customOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || filterRef.current?.contains(target) || target.closest('[data-testid="usage-trend-date-picker-layer"]')) return
      setCustomOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomOpen(false)
    }
    document.addEventListener("pointerdown", closeOnOutside, true)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [customOpen])

  const beginCustom = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    let selection: UsageTrendDatePickerSelection = scope.type === "range"
      ? { mode: "range", startKey: scope.startKey, endKey: scope.endKey }
      : { mode: "single", dateKey: "dateKey" in scope ? scope.dateKey : todayKey }
    let window = scope.type === "window" ? { startMinute: scope.startMinute, endMinute: scope.endMinute }
      : scope.type === "hour" ? { startMinute: scope.hour * 60, endMinute: (scope.hour + 1) * 60 } : null
    if (scope.type === "interval") {
      const start = new Date(scope.startAt)
      const last = new Date(scope.endAt - 1)
      const startKey = localDateKeyFromDate(start)
      const endKey = localDateKeyFromDate(last)
      if (startKey === endKey) {
        selection = { mode: "single", dateKey: startKey }
        const startMinute = start.getHours() * 60 + start.getMinutes()
        // Round the draft outward without changing the exact selection until Apply.
        window = { startMinute, endMinute: Math.max(startMinute + 1, last.getHours() * 60 + last.getMinutes() + 1) }
      } else selection = { mode: "range", startKey, endKey }
    }
    setCustom({
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      label: scopeLabel(scope, t),
      selection,
      window,
    })
    setOpen(false)
    setCustomOpen(true)
  }

  const choose = (next: UsageTimeScope) => {
    onChange(normalizeUsageTimeScope(next))
    setOpen(false)
    setCustomOpen(false)
  }

  return (
    <div ref={filterRef} className="relative shrink-0" data-testid="prompt-usage-time-filter">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <div className="flex h-10 items-center rounded-[10px] border border-border/70 bg-background/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]" style={{ visibility: custom ? "hidden" : undefined }}>
          <Popover.Trigger
            ref={triggerRef}
            type="button"
            className="prompt-timeline-filter-control relative group flex h-full items-center gap-2 px-3 text-[11px] font-semibold text-foreground outline-none"
            aria-expanded={open || customOpen}
          >
            <CalendarBlank className="prompt-range-calendar size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="prompt-range-date max-w-40 truncate">{scopeLabel(scope, t)}</span>
            <span className="prompt-range-stamp" aria-hidden="true">{t("promptUsage.rangeLocated")}</span>
            <CaretDown className="size-3 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" aria-hidden="true" />
          </Popover.Trigger>
          {isSpecific && <button type="button" className="mr-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label={t("promptUsage.clearTimeFilter")} onClick={() => onChange(DEFAULT_PROMPT_USAGE_TIME_SCOPE)}><X className="size-3.5" aria-hidden="true" /></button>}
        </div>
        <Popover.Portal>
          <Popover.Positioner sideOffset={8} align="start" className="z-[80]">
            <Popover.Popup aria-label={scopeLabel(scope, t)} className="prompt-timeline-filter-popup w-60 p-2" data-testid="prompt-usage-time-menu">
              {([
                [t("overview.rangeToday"), { type: "today" } as UsageTimeScope],
                [t("overview.rangeDays", { days: 7 }), { type: "lastDays", days: 7 } as UsageTimeScope],
                [t("overview.rangeDays", { days: 14 }), { type: "lastDays", days: 14 } as UsageTimeScope],
                [t("overview.rangeDays", { days: 30 }), { type: "lastDays", days: 30 } as UsageTimeScope],
              ] as const).map(([label, value]) => (
                <button key={label} type="button" className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/55 hover:text-foreground" onClick={() => choose(value)}>
                  <span>{label}</span>{JSON.stringify(scope) === JSON.stringify(value) && <Check className="size-3.5 text-[var(--wire-orange)]" aria-hidden="true" />}
                </button>
              ))}
              <div className="my-1 h-px bg-border/60" />
              <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-semibold text-foreground hover:bg-muted/55" onClick={beginCustom}><CalendarBlank size={15} className="text-muted-foreground" aria-hidden="true" />{t("overview.rangeCustom")}</button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {custom && <UsageTrendDatePicker
        open={customOpen}
        anchorRect={custom.anchor}
        sourceLabel={custom.label}
        selection={custom.selection}
        initialWindow={custom.window}
        todayKey={todayKey}
        minimumKey={minimumKey}
        maxRangeDays={null}
        onClose={() => setCustomOpen(false)}
        onExitComplete={() => {
          const focused = document.activeElement
          const restoreFocus = focused === document.body || focused === triggerRef.current || Boolean(focused?.closest('[data-testid="usage-trend-date-picker-layer"]'))
          setCustom(null)
          if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
        }}
        onSelectSingle={(dateKey) => choose({ type: "day", dateKey })}
        onSelectRange={(startKey, endKey) => choose({ type: "range", startKey, endKey })}
        onSelectWindow={(dateKey, startMinute, endMinute) => choose({ type: "window", dateKey, startMinute, endMinute })}
      />}
    </div>
  )
}

export function ModelFilterControl({ value, options, onChange }: {
  value: string
  options: { key: string; label: string }[]
  onChange: (value: string) => void
}) {
  const t = useI18n()
  const items = [{ key: "all", label: t("promptUsage.allModels") }, ...options]
  return (
    <Select.Root value={value} onValueChange={(next) => next != null && onChange(next)}>
      <Select.Trigger aria-label={t("promptUsage.filterModel")} className="prompt-timeline-filter-control group flex h-10 min-w-32 max-w-56 shrink-0 items-center gap-2 rounded-[10px] border border-border/70 bg-background/65 px-3 text-[11px] font-semibold text-foreground">
        <Cpu data-testid="prompt-usage-model-filter-icon" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select.Value className="min-w-0 flex-1 truncate">{items.find((item) => item.key === value)?.label}</Select.Value>
        <Select.Icon><CaretDown className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false} className="z-[80]">
          <Select.Popup className="prompt-timeline-filter-popup min-w-56 p-2">
            <Select.List>
              {items.map((item) => (
                <Select.Item key={item.key} value={item.key} className="flex min-h-9 cursor-default items-center justify-between gap-3 rounded-lg px-3 text-[11px] font-medium text-muted-foreground outline-none data-[highlighted]:bg-muted/55 data-[highlighted]:text-foreground">
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator><Check className="size-3.5 text-[var(--wire-orange)]" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}


export function ProjectFilterControl({ selected, options, onChange }: {
  selected: string[]
  options: { key: string; label: string }[]
  onChange: (selected: string[]) => void
}) {
  const t = useI18n()
  return <Popover.Root>
    <Popover.Trigger aria-label={t("promptUsage.filterProjects")} className="prompt-timeline-filter-control group flex h-10 min-w-32 max-w-56 shrink-0 items-center justify-between gap-2 rounded-[10px] border border-border/70 bg-background/65 px-3 text-[11px] font-semibold text-foreground">
      <Folders size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{selected.length ? t("promptUsage.selectedProjects", { count: selected.length }) : t("promptUsage.allProjects")}</span>
      <CaretDown className="size-3 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[popup-open]:rotate-180" aria-hidden="true" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner sideOffset={8} align="start" className="z-[80]">
        <Popover.Popup aria-label={t("promptUsage.filterProjects")} className="prompt-timeline-filter-popup prompt-project-filter-popup">
          <button type="button" className="prompt-project-filter-row prompt-project-filter-all" aria-pressed={selected.length === 0} onClick={() => onChange([])}>
            <Folders size={16} className="prompt-project-filter-folder" aria-hidden="true" />
            <span className="prompt-project-filter-label">{t("promptUsage.allProjects")}</span>
            {selected.length === 0 && <Check size={14} weight="bold" className="prompt-project-filter-check" aria-hidden="true" />}
          </button>
          <div className="prompt-project-filter-divider" />
          <div className="prompt-project-filter-list">
            {options.map(option => <label key={option.key} className="prompt-project-filter-row" data-selected={selected.includes(option.key) || undefined}>
              <input type="checkbox" className="sr-only" checked={selected.includes(option.key)} onChange={event => onChange(event.currentTarget.checked ? [...selected, option.key] : selected.filter(key => key !== option.key))} />
              <Folder size={16} className="prompt-project-filter-folder" aria-hidden="true" />
              <span className="prompt-project-filter-label">{option.label}</span>
              {selected.includes(option.key) && <Check size={14} weight="bold" className="prompt-project-filter-check" aria-hidden="true" />}
            </label>)}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
}
