import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { ArrowCounterClockwise, Check, Info, Palette, X } from "@phosphor-icons/react"
import { SharedElementMorph } from "@/components/shared-element-morph"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { useI18n } from "@/hooks/use-i18n"
import { useModelColorPreferences } from "@/hooks/use-model-color-preferences"
import {
  MODEL_PALETTE_SLOT_COUNT,
  defaultPaletteBaseColor,
  hexToOklch,
  normalizeHexColor,
  oklchToHex,
  resetPaletteSlot,
  resolvedPaletteSurfaceColor,
  setPaletteSlotBaseColor,
  type ModelColorPreferences,
  type OklchColor,
} from "@/lib/model-colors"
import { cn } from "@/lib/utils"

type ModelPaletteAnchorRect = {
  left: number
  top: number
  width: number
  height: number
}

type ModelColorInspectorProps = {
  open: boolean
  onClose: () => void
  onApply?: () => void
  activeSlotIndex: number
  onActiveSlotIndexChange: (index: number) => void
  anchorRect?: ModelPaletteAnchorRect | null
  className?: string
  testId?: string
}

const MAX_WHEEL_CHROMA = 0.24
const PANEL_HEIGHT = 350
const PANEL_MAX_WIDTH = 470
const EXIT_ANIMATION_MS = 320

type SharpBarsSnapshot = {
  left: number
  top: number
  width: number
  height: number
  viewBox: string
  preserveAspectRatio: string
  markup: string
}

type AppSurfaceFrame = {
  left: number
  top: number
  width: number
  height: number
  borderRadius: string
}

function SharpBarsLayer({ refreshKey, motionState }: { refreshKey: string; motionState: "open" | "closed" }) {
  const [snapshot, setSnapshot] = useState<SharpBarsSnapshot | null>(null)

  useLayoutEffect(() => {
    let frame = 0

    function capture() {
      const groups = Array.from(document.querySelectorAll<SVGGElement>(
        '[data-testid="usage-trend-daily-stacked-columns"], [data-testid="usage-trend-hourly-stacked-columns"]',
      ))
      const sourceGroup = groups.find((candidate) => {
        const svg = candidate.ownerSVGElement
        if (!svg) return false
        const rect = svg.getBoundingClientRect()
        return rect.width > 1 && rect.height > 1 && getComputedStyle(svg).display !== "none"
      })
      const svg = sourceGroup?.ownerSVGElement
      if (!sourceGroup || !svg) {
        setSnapshot(null)
        return
      }

      const rect = svg.getBoundingClientRect()
      const nodes = Array.from(sourceGroup.querySelectorAll<SVGElement>(
        '[data-segment-kind], [data-testid*="-separator-"]',
      ))
      const markup = nodes.map((source) => {
        const clone = source.cloneNode(true) as SVGElement
        const computed = getComputedStyle(source)
        clone.removeAttribute("class")
        clone.removeAttribute("style")
        clone.style.animation = "none"
        clone.style.transition = "none"
        clone.style.opacity = "1"
        clone.style.filter = "none"
        if (source.matches('[data-segment-kind]')) clone.setAttribute("fill", computed.fill)
        else clone.setAttribute("stroke", computed.stroke)
        return clone.outerHTML
      }).join("")

      setSnapshot({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewBox: svg.getAttribute("viewBox") ?? `0 0 ${rect.width} ${rect.height}`,
        preserveAspectRatio: svg.getAttribute("preserveAspectRatio") ?? "xMidYMid meet",
        markup,
      })
    }

    capture()
    frame = requestAnimationFrame(capture)
    window.addEventListener("resize", capture)
    window.addEventListener("scroll", capture, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", capture)
      window.removeEventListener("scroll", capture, true)
    }
  }, [refreshKey])

  if (!snapshot || !snapshot.markup) return null

  return (
    <div
      className="model-palette-sharp-bars pointer-events-none fixed z-[1]"
      data-state={motionState}
      data-testid="model-palette-sharp-bars"
      style={{ left: snapshot.left, top: snapshot.top, width: snapshot.width, height: snapshot.height }}
      aria-hidden="true"
    >
      <svg
        className="block h-full w-full overflow-visible"
        viewBox={snapshot.viewBox}
        preserveAspectRatio={snapshot.preserveAspectRatio}
        dangerouslySetInnerHTML={{ __html: snapshot.markup }}
      />
    </div>
  )
}

function clonePreferences(preferences: ModelColorPreferences): ModelColorPreferences {
  return { slots: preferences.slots.map((slot) => ({ base: slot.base })) }
}

function preferencesEqual(left: ModelColorPreferences | null, right: ModelColorPreferences) {
  if (!left || left.slots.length !== right.slots.length) return false
  return left.slots.every((slot, index) => slot.base === right.slots[index]?.base)
}

function ColorWheel({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const current = hexToOklch(color)
  const radiusRatio = Math.min(1, current.c / MAX_WHEEL_CHROMA)
  const radians = current.h * Math.PI / 180
  const handleX = 50 + Math.sin(radians) * radiusRatio * 42
  const handleY = 50 - Math.cos(radians) * radiusRatio * 42

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const wheel = wheelRef.current
    if (!wheel) return
    const rect = wheel.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    const usableRadius = Math.max(1, Math.min(rect.width, rect.height) / 2 - 5)
    const distance = Math.min(usableRadius, Math.hypot(dx, dy))
    const hue = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360
    const chroma = distance / usableRadius * MAX_WHEEL_CHROMA
    onChange(oklchToHex({ ...current, h: hue, c: chroma }))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: OklchColor | null = null
    if (event.key === "ArrowLeft") next = { ...current, h: (current.h - 3 + 360) % 360 }
    if (event.key === "ArrowRight") next = { ...current, h: (current.h + 3) % 360 }
    if (event.key === "ArrowUp") next = { ...current, c: Math.min(MAX_WHEEL_CHROMA, current.c + 0.01) }
    if (event.key === "ArrowDown") next = { ...current, c: Math.max(0, current.c - 0.01) }
    if (!next) return
    event.preventDefault()
    onChange(oklchToHex(next))
  }

  const lightness = Number(current.l.toFixed(3))
  const wheelBackground = [
    `radial-gradient(circle, oklch(${lightness} 0 0) 0%, oklch(${lightness} 0 0 / 0.82) 18%, transparent 66%)`,
    `conic-gradient(from 0deg, oklch(${lightness} ${MAX_WHEEL_CHROMA} 0), oklch(${lightness} ${MAX_WHEEL_CHROMA} 60), oklch(${lightness} ${MAX_WHEEL_CHROMA} 120), oklch(${lightness} ${MAX_WHEEL_CHROMA} 180), oklch(${lightness} ${MAX_WHEEL_CHROMA} 240), oklch(${lightness} ${MAX_WHEEL_CHROMA} 300), oklch(${lightness} ${MAX_WHEEL_CHROMA} 360))`,
  ].join(", ")

  return (
    <div
      ref={wheelRef}
      role="slider"
      tabIndex={0}
      aria-label="Color wheel"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(current.h)}
      aria-valuetext={`Hue ${Math.round(current.h)} degrees, chroma ${current.c.toFixed(2)}`}
      className="relative size-[132px] touch-none cursor-crosshair rounded-full border border-border/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10),0_10px_28px_rgba(0,0,0,0.22)] outline-none focus-visible:ring-4 focus-visible:ring-ring/45"
      style={{ background: wheelBackground }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId)
        updateFromPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) updateFromPointer(event)
      }}
      onKeyDown={handleKeyDown}
      data-testid="model-color-wheel"
    >
      <span
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_3px_8px_rgba(0,0,0,0.38)]"
        style={{ left: `${handleX}%`, top: `${handleY}%`, backgroundColor: color }}
        aria-hidden="true"
      />
    </div>
  )
}

export function ModelColorInspector({
  open,
  onClose,
  onApply,
  activeSlotIndex,
  onActiveSlotIndexChange,
  anchorRect = null,
  className,
  testId = "model-color-inspector",
}: ModelColorInspectorProps) {
  const t = useI18n()
  const isDark = useDarkMode()
  const theme = isDark ? "dark" : "light"
  const { preferences, hydrated, previewPreferences, commitPreferences } = useModelColorPreferences()
  const requestedSlot = Number.isFinite(activeSlotIndex) ? activeSlotIndex : 0
  const activeSlot = Math.min(MODEL_PALETTE_SLOT_COUNT - 1, Math.max(0, requestedSlot))
  const slot = preferences.slots[activeSlot] ?? preferences.slots[0]
  const baseColor = slot?.base ?? "#F1EBD5"
  const baseOklch = hexToOklch(baseColor)
  const [hexDraft, setHexDraft] = useState(baseColor)
  const [hexError, setHexError] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const infoButtonRef = useRef<HTMLButtonElement | null>(null)
  const infoPopoverRef = useRef<HTMLDivElement | null>(null)
  const [rendered, setRendered] = useState(open)
  const [motionState, setMotionState] = useState<"open" | "closed">(open ? "open" : "closed")
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [appSurfaceFrame, setAppSurfaceFrame] = useState<AppSurfaceFrame | null>(null)
  const committedRef = useRef<ModelColorPreferences | null>(null)
  const wasOpenRef = useRef(false)
  const latestPreferencesRef = useRef(preferences)
  latestPreferencesRef.current = preferences

  useEffect(() => {
    let exitTimer: ReturnType<typeof setTimeout> | null = null
    if (open) {
      if (!wasOpenRef.current) committedRef.current = clonePreferences(latestPreferencesRef.current)
      setRendered(true)
      setMotionState("open")
    } else if (wasOpenRef.current) {
      if (committedRef.current) previewPreferences(clonePreferences(committedRef.current))
      setMotionState("closed")
      exitTimer = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS)
    }
    wasOpenRef.current = open
    return () => {
      if (exitTimer) clearTimeout(exitTimer)
    }
  }, [open, previewPreferences])

  useLayoutEffect(() => {
    if (!open) return

    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      const surface = document.querySelector<HTMLElement>(".app-panel-surface")
      if (!surface) {
        setAppSurfaceFrame(null)
        return
      }
      const rect = surface.getBoundingClientRect()
      const style = getComputedStyle(surface)
      setAppSurfaceFrame({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: style.borderRadius || style.borderTopLeftRadius || "12px",
      })
    }

    measure()
    const frame = requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", measure)
    }
  }, [open])

  useEffect(() => {
    setHexDraft(baseColor)
    setHexError(false)
  }, [activeSlot, baseColor])

  useEffect(() => {
    if (!infoOpen) return
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (target && (infoButtonRef.current?.contains(target) || infoPopoverRef.current?.contains(target))) return
      setInfoOpen(false)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [infoOpen])

  function cancelAndClose() {
    if (committedRef.current) previewPreferences(clonePreferences(committedRef.current))
    onClose()
  }

  function applyAndClose() {
    const committed = commitPreferences()
    committedRef.current = clonePreferences(committed)
    onApply?.()
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") cancelAndClose()
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  })

  if (!rendered || typeof document === "undefined") return null

  function previewBaseColor(color: string) {
    previewPreferences((current) => setPaletteSlotBaseColor(current, activeSlot, color))
  }

  const hasDraftChanges = !preferencesEqual(committedRef.current, preferences)
  const hexDraftInvalid = hexDraft.length > 0 && normalizeHexColor(hexDraft) == null
  const sharpBarsRefreshKey = preferences.slots.map((item) => item.base).join("|")

  const panelWidth = Math.min(PANEL_MAX_WIDTH, Math.max(420, viewport.width - 96))
  const anchorCenterX = anchorRect ? anchorRect.left + anchorRect.width / 2 : viewport.width - 54
  const anchorCenterY = anchorRect ? anchorRect.top + anchorRect.height / 2 : 160
  const anchorLeft = anchorRect?.left ?? anchorCenterX - 22
  const desiredRight = viewport.width - anchorLeft + 14
  const maxRight = Math.max(28, viewport.width - panelWidth - 28)
  const panelRight = Math.max(28, Math.min(desiredRight, maxRight))
  const panelLeft = viewport.width - panelRight - panelWidth
  const desiredTop = anchorCenterY - PANEL_HEIGHT + 28
  const panelTop = Math.max(24, Math.min(desiredTop, viewport.height - PANEL_HEIGHT - 28))
  const destinationRect = { left: panelLeft, top: panelTop, width: panelWidth, height: PANEL_HEIGHT }

  const inspector = (
    <div
      className="model-palette-layer fixed inset-0 z-[119]"
      data-state={motionState}
      data-testid="model-palette-layer"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && open) cancelAndClose()
      }}
    >
      {appSurfaceFrame ? (
        <div
          className="model-palette-backdrop pointer-events-none fixed z-0 overflow-hidden"
          data-state={motionState}
          data-testid="model-palette-backdrop"
          style={{
            left: appSurfaceFrame.left,
            top: appSurfaceFrame.top,
            width: appSurfaceFrame.width,
            height: appSurfaceFrame.height,
            borderRadius: appSurfaceFrame.borderRadius,
          }}
          aria-hidden="true"
        />
      ) : null}
      <SharedElementMorph
        sourceRect={anchorRect}
        destinationRect={destinationRect}
        motionState={motionState}
        sourceRadius="12px"
        destinationRadius="20px"
        sourceBackground="color-mix(in oklab, var(--background) 78%, transparent)"
        destinationBackground="var(--popover)"
        sourceVisual={<Palette className="size-[22px] text-muted-foreground" weight="regular" />}
        className="z-[2]"
        testId="model-palette-shared-morph"
      />
      <SharpBarsLayer refreshKey={sharpBarsRefreshKey} motionState={motionState} />

      <aside
        className={cn(
          "model-color-inspector shared-element-destination-card absolute z-[3] isolate flex flex-col overflow-hidden rounded-[20px] border border-border/80 bg-popover/98 text-popover-foreground shadow-[0_28px_90px_rgba(0,0,0,0.44)] backdrop-blur-xl",
          className,
        )}
        data-state={motionState}
        style={{ top: panelTop, right: panelRight, width: panelWidth, height: PANEL_HEIGHT }}
        aria-label={t("modelColors.title")}
        data-testid={testId}
        data-theme={theme}
        data-layout="focused-palette-card"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="relative flex h-[52px] items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Palette className="size-[19px] shrink-0 text-foreground" weight="regular" aria-hidden="true" />
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground">{t("modelColors.title")}</h3>
            <button
              ref={infoButtonRef}
              type="button"
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              aria-label={t("modelColors.rankRule")}
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((value) => !value)}
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border/65 text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={cancelAndClose}
            aria-label={t("modelColors.close")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
          {infoOpen ? (
            <div
              ref={infoPopoverRef}
              className="absolute left-5 top-[44px] z-20 w-[300px] rounded-[11px] border border-border/75 bg-popover px-3 py-2.5 text-[11px] leading-5 text-muted-foreground shadow-[0_14px_34px_rgba(0,0,0,0.30)]"
              role="tooltip"
              data-testid="model-palette-rank-info"
            >
              {t("modelColors.rankRule")}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 px-5 pt-2.5 pb-2">
          <div className="grid grid-cols-5 gap-3" role="list" aria-label={t("modelColors.paletteSlots")} data-testid="model-palette-order">
            {Array.from({ length: MODEL_PALETTE_SLOT_COUNT }, (_, index) => {
              const selected = index === activeSlot
              const color = resolvedPaletteSurfaceColor(index, preferences, theme)
              const slotIsDefault = (preferences.slots[index]?.base ?? defaultPaletteBaseColor(index)) === defaultPaletteBaseColor(index)
              return (
                <div key={index} className="flex min-w-0 flex-col items-center justify-center rounded-[14px] px-1 py-0.5">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${t("modelColors.slot")} ${index + 1}`}
                    className="group flex min-w-0 flex-col items-center justify-center rounded-[12px] px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    onClick={() => onActiveSlotIndexChange(index)}
                    data-testid={`model-palette-slot-${index + 1}`}
                  >
                    <span
                      className={cn(
                        "block size-[48px] rounded-full border-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10),0_5px_13px_rgba(0,0,0,0.17)] transition-[transform,box-shadow,border-color] duration-150 group-hover:scale-[1.055]",
                        selected
                          ? "border-[color:var(--wire-orange)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--wire-orange)_22%,transparent),0_7px_18px_rgba(0,0,0,0.2)]"
                          : "border-border/70",
                      )}
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span className={cn("mt-1 text-[11px] font-bold tabular-nums", selected ? "text-foreground" : "text-muted-foreground")}>{index + 1}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("modelColors.resetModel")} ${index + 1}`}
                    disabled={slotIsDefault || !hydrated}
                    className="mt-0.5 grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-default disabled:opacity-25"
                    onClick={() => {
                      onActiveSlotIndexChange(index)
                      previewPreferences((current) => resetPaletteSlot(current, index))
                    }}
                    data-testid={`model-palette-reset-${index + 1}`}
                  >
                    <ArrowCounterClockwise className="size-3" aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="mt-2 grid grid-cols-[150px_minmax(0,1fr)] items-end gap-4" data-testid="model-palette-color-controls">
            <div className="flex items-end justify-center pb-5">
              <ColorWheel color={baseColor} onChange={previewBaseColor} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between text-[12px] font-semibold text-muted-foreground">
                <span>{t("modelColors.lightness")}</span>
                <span className="tabular-nums text-foreground">{Math.round(baseOklch.l * 100)}%</span>
              </div>
              <input
                type="range"
                className="model-color-slider mt-2"
                min={0.35}
                max={0.99}
                step={0.005}
                value={Number(baseOklch.l.toFixed(3))}
                aria-label={t("modelColors.lightness")}
                onChange={(event) => previewBaseColor(oklchToHex({ ...baseOklch, l: Number(event.currentTarget.value) }))}
              />
              <label className="mt-1.5 block text-[11px] font-semibold text-muted-foreground" htmlFor={`model-palette-hex-${activeSlot}`}>
                {t("modelColors.hex")}
              </label>
              <input
                id={`model-palette-hex-${activeSlot}`}
                value={hexDraft}
                disabled={!hydrated}
                spellCheck={false}
                maxLength={7}
                className="mt-1.5 h-10 w-full rounded-[9px] border border-border/70 bg-background/55 px-3 font-mono text-[12px] font-semibold uppercase tabular-nums text-foreground outline-none transition-colors focus:border-[color:var(--wire-orange)]/70 focus:ring-2 focus:ring-[color:var(--wire-orange)]/35"
                onChange={(event) => {
                  const value = event.currentTarget.value.toUpperCase()
                  setHexDraft(value)
                  const normalized = normalizeHexColor(value)
                  if (normalized) {
                    setHexError(false)
                    previewBaseColor(normalized)
                  }
                }}
                onBlur={() => setHexError(hexDraft.length > 0 && normalizeHexColor(hexDraft) == null)}
              />
              <p className={cn("mt-1 min-h-4 text-[9px]", hexError ? "text-destructive" : "text-transparent")} role={hexError ? "alert" : undefined}>
                {hexError ? t("modelColors.invalidHex") : "·"}
              </p>
            </div>
          </div>
        </div>

        <footer className="flex h-[50px] shrink-0 items-center justify-end bg-popover/95 px-5">
          <button
            type="button"
            disabled={!hydrated || !hasDraftChanges || hexDraftInvalid}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] bg-foreground px-5 text-[12px] font-semibold text-background shadow-sm transition-[transform,opacity] hover:-translate-y-px disabled:translate-y-0 disabled:opacity-35"
            onClick={applyAndClose}
            data-testid="model-palette-apply"
          >
            <Check className="size-3.5" aria-hidden="true" />
            {t("modelColors.apply")}
          </button>
        </footer>
      </aside>
    </div>
  )

  return createPortal(inspector, document.body)
}
