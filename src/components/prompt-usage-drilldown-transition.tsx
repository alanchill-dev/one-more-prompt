import { CalendarBlank } from "@phosphor-icons/react"
import { scopeLabel } from "@/components/prompt-usage-timeline-filters"
import { useI18n } from "@/hooks/use-i18n"
import { useEffect, type CSSProperties } from "react"
import { TrendWorkspaceContent } from "@/components/usage-trend-detail-card"
import { useAppUiStore, type UiRect } from "@/stores/app-ui-store"

const CARD_LIFT_SCALE = 1.012
const CARD_LIFT_Y = -4
const ACTION_LIFT_SCALE = 1.018

function localRect(rect: UiRect, panelRect: DOMRect | null): UiRect {
  return {
    left: rect.left - (panelRect?.left ?? 0),
    top: rect.top - (panelRect?.top ?? 0),
    width: rect.width,
    height: rect.height,
  }
}

function liftedRect(rect: UiRect, scale: number, translateY = 0): UiRect {
  const width = rect.width * scale
  const height = rect.height * scale
  return {
    left: rect.left - (width - rect.width) / 2,
    top: rect.top + translateY - (height - rect.height) / 2,
    width,
    height,
  }
}

function flipStyle({
  source,
  destination,
  liftScale,
  liftY = 0,
}: {
  source: UiRect
  destination: UiRect | null
  liftScale: number
  liftY?: number
}): CSSProperties {
  if (!destination) {
    return {
      left: source.left,
      top: source.top,
      width: source.width,
      height: source.height,
    }
  }

  const lifted = liftedRect(source, liftScale, liftY)
  return {
    left: destination.left,
    top: destination.top,
    width: destination.width,
    height: destination.height,
    "--prompt-drilldown-flip-x": `${lifted.left - destination.left}px`,
    "--prompt-drilldown-flip-y": `${lifted.top - destination.top}px`,
    "--prompt-drilldown-flip-scale-x": lifted.width / Math.max(1, destination.width),
    "--prompt-drilldown-flip-scale-y": lifted.height / Math.max(1, destination.height),
  } as CSSProperties
}

/**
 * One persistent FLIP layer for Usage Trend -> Prompt Usage.
 *
 * The same card/action shells survive the route change. Each destination renders at its
 * final, transform-free geometry first; once those destination rectangles are
 * measured, each shell keeps the final layout box and animates only the inverse
 * translate/scale back to identity. This avoids swapping clones and avoids
 * measuring a destination that is still moving under its own entrance animation.
 */
export function PromptUsageDrilldownTransitionLayer() {
  const t = useI18n()
  const transition = useAppUiStore((state) => state.promptUsageDrilldownTransition)
  const setTransition = useAppUiStore((state) => state.setPromptUsageDrilldownTransition)
  const ready = Boolean(
    transition?.phase === "arriving"
      && transition.destinationSurfaceRect
      && transition.destinationFilterRect,
  )

  useEffect(() => {
    if (transition?.phase !== "arriving") return

    // AnimationEnd is the authoritative handoff. This is only a safety valve
    // for suspended WebViews or interrupted CSS animation delivery.
    const fallback = setTimeout(() => setTransition(null), ready ? 1100 : 1500)
    return () => clearTimeout(fallback)
  }, [ready, transition?.phase, setTransition])

  if (!transition) return null

  const panelRect = typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>(".app-panel-surface")?.getBoundingClientRect() ?? null

  const sourceCardRect = localRect(transition.sourceCardRect, panelRect)
  const sourceActionRect = localRect(transition.sourceActionRect, panelRect)
  const destinationSurfaceRect = transition.destinationSurfaceRect
    ? localRect(transition.destinationSurfaceRect, panelRect)
    : null
  const destinationFilterRect = transition.destinationFilterRect
    ? localRect(transition.destinationFilterRect, panelRect)
    : null

  const finish = () => {
    if (!ready) return
    setTransition(null)
  }

  return (
    <div
      className="prompt-drilldown-layer pointer-events-none absolute inset-0 z-[130]"
      data-phase={transition.phase}
      data-destination={transition.destination ?? "timeline"}
      data-ready={ready}
      data-testid="prompt-usage-drilldown-layer"
      aria-hidden="true"
    >
      <div className="prompt-drilldown-veil absolute inset-0" />

      <div
        className="prompt-drilldown-card-shell pointer-events-none absolute z-[141] border"
        data-testid="prompt-usage-drilldown-card-shell"
        style={flipStyle({
          source: sourceCardRect,
          destination: destinationSurfaceRect,
          liftScale: CARD_LIFT_SCALE,
          liftY: CARD_LIFT_Y,
        })}
        onAnimationEnd={finish}
      />

      <div
        className="prompt-drilldown-action-shell pointer-events-none absolute z-[142] border"
        data-testid="prompt-usage-drilldown-action-shell"
        style={flipStyle({
          source: sourceActionRect,
          destination: destinationFilterRect,
          liftScale: ACTION_LIFT_SCALE,
        })}
      >
        <div className="prompt-drilldown-action-label">
          <TrendWorkspaceContent destination={transition.destination ?? "timeline"} />
        </div>
      </div>
      {transition.scope && (
        <div
          className="prompt-drilldown-range-label pointer-events-none z-[143]"
          style={flipStyle({ source: sourceActionRect, destination: destinationFilterRect, liftScale: ACTION_LIFT_SCALE })}
        >
          <CalendarBlank size={14} aria-hidden="true" />
          <span>{scopeLabel(transition.scope, t)}</span>
        </div>
      )}
    </div>
  )
}
