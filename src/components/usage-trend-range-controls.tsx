import { CalendarBlank } from "@phosphor-icons/react"
import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react"
import { UsageTrendDatePicker, type UsageTrendDatePickerSelection } from "./usage-trend-date-picker"
import { dateFromLocalKey, formatDayLabel } from "./usage-trend-utils"
import { useI18n } from "@/hooks/use-i18n"
import { cn } from "@/lib/utils"

export type TrendPresetDays = 1 | 7 | 14 | 30
export type TrendSelection =
  | { type: "preset"; days: TrendPresetDays }
  | { type: "single"; dateKey: string }
  | { type: "range"; startKey: string; endKey: string }

export type UsageTrendRangeControlsProps = {
  options: readonly number[]
  selection: TrendSelection
  setPreset: (days: TrendPresetDays) => void
  onOpenCustom: () => void
  customButtonRef: RefObject<HTMLButtonElement | null>
  datePickerOpen: boolean
  datePickerSourceHidden: boolean
  pickerSelection: UsageTrendDatePickerSelection
  todayKey: string
  minimumKey: string
  onClose: () => void
  onSelectSingle: (dateKey: string) => void
  onSelectRange: (startKey: string, endKey: string) => void
}

export function UsageTrendRangeControls(props: UsageTrendRangeControlsProps) {
  const t = useI18n()
  return (
    <div
      className="min-w-0 border-l border-border/65 pl-7"
      data-guide-target="activity-controls"
      data-testid="usage-trend-control-stack"
    >
      <div className="min-w-0" data-testid="usage-trend-range-group">
        <span className="mb-2 ml-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("overview.chartRange")}</span>
        <div className="h-[3.25rem] overflow-visible" data-testid="usage-trend-control-console">
          <RangeSelector {...props} />
        </div>
      </div>
    </div>
  )
}

function RangeSelector({
  options,
  selection,
  setPreset,
  onOpenCustom,
  customButtonRef,
  datePickerOpen,
  datePickerSourceHidden,
  pickerSelection,
  todayKey,
  minimumKey,
  onClose,
  onSelectSingle,
  onSelectRange,
}: UsageTrendRangeControlsProps) {
  const t = useI18n()
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const presetRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = selection.type === "preset" ? options.indexOf(selection.days) : -1
  const thumbHidden = selectedIndex < 0 || datePickerOpen || datePickerSourceHidden
  const customSelected = selection.type !== "preset"
  const customLabel = selection.type === "single" ? formatDayLabel(dateFromLocalKey(selection.dateKey) ?? new Date()) : t("overview.rangeCustom")
  const customContent = <><CalendarBlank size={18} weight="regular" className="shrink-0 text-[var(--wire-orange)]" aria-hidden="true" />{customLabel}</>

  useEffect(() => {
    if (!datePickerOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (selectorRef.current?.contains(event.target as Node)) return
      onClose()
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer)
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer)
  }, [datePickerOpen, onClose])

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const controls = [...presetRefs.current.slice(0, options.length), customButtonRef.current]
    let next: number | null = null
    if (event.key === "ArrowRight") next = (index + 1) % controls.length
    if (event.key === "ArrowLeft") next = (index + controls.length - 1) % controls.length
    if (event.key === "Home") next = 0
    if (event.key === "End") next = controls.length - 1
    if (next !== null) { event.preventDefault(); controls[next]?.focus() }
  }

  return (
    <div
      ref={selectorRef}
      className="relative flex h-full min-h-0 items-stretch gap-3"
      role="group"
      aria-label={t("overview.chartRange")}
      data-testid="usage-trend-range-row"
    >
      <div
        className="relative isolate grid min-w-0 flex-1 rounded-[9px] bg-secondary p-[3px] dark:bg-background"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        data-testid="usage-trend-preset-track"
      >
        <span
          className={cn(
            "trend-range-thumb pointer-events-none absolute inset-y-[3px] left-[3px] rounded-[6px] border border-border bg-card dark:bg-accent",
            thumbHidden && "opacity-0",
          )}
          style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${Math.max(0, selectedIndex) * 100}%)` }}
          data-testid="usage-trend-range-thumb"
          aria-hidden="true"
        />
        {options.map((option, index) => (
          <button
            key={option}
            ref={(node) => { presetRefs.current[index] = node }}
            onKeyDown={(event) => moveFocus(event, index)}
            type="button"
            data-preset-days={option}
            aria-pressed={selection.type === "preset" && selection.days === option}
            onClick={() => setPreset(option as TrendPresetDays)}
            className={cn(
              "relative z-10 min-h-10 min-w-0 rounded-[6px] px-1 text-[11px] font-semibold tabular-nums transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 xl:text-[13px]",
              selection.type === "preset" && selection.days === option ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {option === 1 ? t("overview.rangeToday") : t("overview.rangeDays", { days: option })}
          </button>
        ))}
      </div>
      <button
        ref={customButtonRef}
        type="button"
        aria-pressed={selection.type !== "preset"}
        aria-expanded={datePickerOpen}
        aria-haspopup="dialog"
        onKeyDown={(event) => moveFocus(event, options.length)}
        onClick={onOpenCustom}
        className={cn(
          "relative z-10 flex min-h-10 min-w-[91px] shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] border px-2.5 text-[11px] font-semibold transition-[color,background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 xl:text-[13px]",
          selection.type !== "preset" || datePickerOpen ? "border-[var(--wire-orange)] bg-[color-mix(in_srgb,var(--wire-orange)_9%,transparent)] text-foreground" : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          datePickerSourceHidden && "opacity-0",
        )}
      >
        {customContent}
      </button>
      <UsageTrendDatePicker
        open={datePickerOpen}
        anchorRect={customButtonRef.current ? (() => {
          const rect = customButtonRef.current.getBoundingClientRect()
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        })() : null}
        sourceLabel={customLabel}
        sourceRadius="9px"
        sourceBackground={customSelected ? "color-mix(in srgb, var(--wire-orange) 9%, transparent)" : "transparent"}
        sourceBorderColor={customSelected ? "var(--wire-orange)" : "var(--border)"}
        sourceVisual={<span className={cn("flex h-full w-full items-center justify-center gap-[7px] px-2.5 text-[11px] font-semibold xl:text-[13px]", customSelected ? "text-foreground" : "text-muted-foreground")}>{customContent}</span>}
        selection={pickerSelection}
        todayKey={todayKey}
        minimumKey={minimumKey}
        onClose={onClose}
        onSelectSingle={onSelectSingle}
        onSelectRange={onSelectRange}
      />
    </div>
  )
}
