/** Supported panel widths in logical pixels. */
export const MIN_WINDOW_WIDTH = 980
export const MAX_WINDOW_WIDTH = 1440
export const DEFAULT_WINDOW_WIDTH = 1240
export const PREFERRED_WINDOW_HEIGHT = 875
export const MIN_WINDOW_HEIGHT = 480

export const WINDOW_WIDTH_PRESETS = [980, 1240, 1440] as const

export type WindowWidth = number

/** Migrate legacy/custom widths to the nearest supported preset. */
export function clampWindowWidth(width: number): WindowWidth {
  return WINDOW_WIDTH_PRESETS.reduce((nearest, preset) => (
    Math.abs(preset - width) < Math.abs(nearest - width) ? preset : nearest
  ), WINDOW_WIDTH_PRESETS[0])
}

export function getDisplaySafeWindowHeight(availableHeight: number, fallbackHeight: number): number {
  const height = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : fallbackHeight
  return Math.max(MIN_WINDOW_HEIGHT, Math.min(PREFERRED_WINDOW_HEIGHT, Math.round(height)))
}
