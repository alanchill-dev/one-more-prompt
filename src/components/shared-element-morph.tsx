import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SharedElementRect = {
  left: number
  top: number
  width: number
  height: number
}

type SharedElementMorphProps = {
  sourceRect: SharedElementRect | null
  destinationRect: SharedElementRect
  motionState: "open" | "closed"
  sourceRadius: string
  destinationRadius: string
  sourceBackground: string
  destinationBackground: string
  sourceBorderColor?: string
  destinationBorderColor?: string
  sourceVisual?: ReactNode
  className?: string
  testId?: string
}

/**
 * A geometry-first shared-element transition shell.
 *
 * The shell starts at the trigger's exact viewport rectangle, then animates
 * real left/top/width/height/border-radius values into the destination card.
 * The destination content is rendered separately and fades in behind it.
 */
export function SharedElementMorph({
  sourceRect,
  destinationRect,
  motionState,
  sourceRadius,
  destinationRadius,
  sourceBackground,
  destinationBackground,
  sourceBorderColor = "color-mix(in oklab, var(--border) 70%, transparent)",
  destinationBorderColor = "color-mix(in oklab, var(--border) 80%, transparent)",
  sourceVisual,
  className,
  testId = "shared-element-morph-shell",
}: SharedElementMorphProps) {
  if (!sourceRect) return null

  const style = {
    "--shared-source-left": `${sourceRect.left}px`,
    "--shared-source-top": `${sourceRect.top}px`,
    "--shared-source-width": `${sourceRect.width}px`,
    "--shared-source-height": `${sourceRect.height}px`,
    "--shared-source-radius": sourceRadius,
    "--shared-source-background": sourceBackground,
    "--shared-source-border": sourceBorderColor,
    "--shared-destination-left": `${destinationRect.left}px`,
    "--shared-destination-top": `${destinationRect.top}px`,
    "--shared-destination-width": `${destinationRect.width}px`,
    "--shared-destination-height": `${destinationRect.height}px`,
    "--shared-destination-radius": destinationRadius,
    "--shared-destination-background": destinationBackground,
    "--shared-destination-border": destinationBorderColor,
  } as CSSProperties

  return (
    <div
      className={cn("shared-element-morph-shell pointer-events-none fixed", className)}
      data-state={motionState}
      data-testid={testId}
      style={style}
      aria-hidden="true"
    >
      <span className="shared-element-morph-source-visual absolute inset-0 grid place-items-center">
        {sourceVisual}
      </span>
    </div>
  )
}
