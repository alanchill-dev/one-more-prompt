export type ModelColorTheme = "light" | "dark"

export type ModelPaletteSlot = {
  base: string
}

export type ModelColorPreferences = {
  slots: ModelPaletteSlot[]
}

export type OklchColor = {
  l: number
  c: number
  h: number
}

export const MODEL_PALETTE_SLOT_COUNT = 5

const DEFAULT_MODEL_PALETTE_SLOTS: readonly ModelPaletteSlot[] = [
  { base: "#F1EBD5" },
  { base: "#EB8C76" },
  { base: "#E29B44" },
  { base: "#C7374F" },
  { base: "#9FAF91" },
]

export const DEFAULT_MODEL_COLOR_PREFERENCES: ModelColorPreferences = {
  slots: DEFAULT_MODEL_PALETTE_SLOTS.map((slot) => ({ ...slot })),
}

export const MODEL_COLOR_RECOMMENDED_SWATCHES = [
  "#F1EBD5",
  "#EAB9A5",
  "#EB8C76",
  "#C7374F",
  "#E29B44",
  "#C89D66",
  "#B5AD83",
  "#9FAF91",
] as const

const CANONICAL_MODEL_NAMES = new Map<string, string>([
  ["gpt56sol", "GPT-5.6 Sol"],
  ["gpt56terra", "GPT-5.6 Terra"],
  ["gpt56luna", "GPT-5.6 Luna"],
  ["gpt55", "GPT-5.5"],
])

const LEGACY_SLOT_KEYS = ["gpt56sol", "gpt56luna", "gpt56terra", "gpt55"] as const

export function normalizedModelKey(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function modelIdentityKey(name: string) {
  return normalizedModelKey(name)
}

export function canonicalModelName(name: string) {
  return CANONICAL_MODEL_NAMES.get(modelIdentityKey(name)) ?? name.trim()
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null
  return withHash.toUpperCase()
}

function srgbToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number) {
  const clamped = Math.min(1, Math.max(0, value))
  const encoded = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}

export function hexToOklch(hex: string): OklchColor {
  const normalized = normalizeHexColor(hex) ?? "#000000"
  const r = srgbToLinear(Number.parseInt(normalized.slice(1, 3), 16))
  const g = srgbToLinear(Number.parseInt(normalized.slice(3, 5), 16))
  const b = srgbToLinear(Number.parseInt(normalized.slice(5, 7), 16))

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.sqrt(a * a + labB * labB)
  const hue = chroma < 0.00001
    ? 0
    : (Math.atan2(labB, a) * 180 / Math.PI + 360) % 360

  return { l: lightness, c: chroma, h: hue }
}

export function oklchToHex({ l, c, h }: OklchColor): string {
  const lightness = Math.min(1, Math.max(0, l))
  const chroma = Math.min(0.4, Math.max(0, c))
  const hueRadians = ((h % 360) + 360) % 360 * Math.PI / 180
  const a = chroma * Math.cos(hueRadians)
  const labB = chroma * Math.sin(hueRadians)

  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * labB
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * labB
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * labB
  const lLinear = lRoot ** 3
  const mLinear = mRoot ** 3
  const sLinear = sRoot ** 3

  const r = linearToSrgb(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear)
  const g = linearToSrgb(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear)
  const b = linearToSrgb(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear)

  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase()
}

function themeAutoSurface(base: string, theme: ModelColorTheme) {
  const color = hexToOklch(base)
  if (theme === "dark") {
    const minimumLightness = color.c < 0.06 ? 0.78 : color.c < 0.12 ? 0.68 : 0.58
    return oklchToHex({
      l: Math.min(0.94, Math.max(minimumLightness, color.l)),
      c: Math.min(0.2, color.c),
      h: color.h,
    })
  }

  return oklchToHex({
    l: Math.max(0.46, Math.min(color.c < 0.06 ? 0.72 : 0.7, color.l)),
    c: Math.min(0.19, color.c * 1.04),
    h: color.h,
  })
}

export function activeColorFromSurface(surface: string, theme: ModelColorTheme) {
  const color = hexToOklch(surface)
  return oklchToHex({
    l: theme === "dark"
      ? Math.min(0.985, color.l + (color.c < 0.06 ? 0.035 : 0.055))
      : Math.max(0.4, color.l - 0.1),
    c: Math.min(0.22, color.c * (theme === "dark" ? 1.08 : 1.12)),
    h: color.h,
  })
}

function cloneDefaultSlots() {
  return DEFAULT_MODEL_PALETTE_SLOTS.map((slot) => ({ ...slot }))
}

function sanitizeSlot(value: unknown, fallback: ModelPaletteSlot): ModelPaletteSlot {
  if (!value || typeof value !== "object") return { ...fallback }
  const candidate = value as { base?: unknown }
  const base = typeof candidate.base === "string" ? normalizeHexColor(candidate.base) : null
  return { base: base ?? fallback.base }
}

/**
 * Accepts the new rank-palette schema and performs a best-effort migration from
 * the old model-identity override schema. Legacy Sol/Luna/Terra/GPT-5.5 custom
 * colors become palette slots 1–4 in that order; model identities themselves
 * are deliberately not persisted in the new system.
 */
export function sanitizeModelColorPreferences(value: unknown): ModelColorPreferences {
  const defaults = cloneDefaultSlots()
  if (!value || typeof value !== "object") return { slots: defaults }
  const source = value as { slots?: unknown; overrides?: unknown }

  if (Array.isArray(source.slots)) {
    const storedSlots = source.slots
    return {
      slots: defaults.map((fallback, index) => sanitizeSlot(storedSlots[index], fallback)),
    }
  }

  if (source.overrides && typeof source.overrides === "object") {
    const legacy = source.overrides as Record<string, unknown>
    const slots = defaults.map((fallback, index) => {
      const key = LEGACY_SLOT_KEYS[index]
      return key ? sanitizeSlot(legacy[key], fallback) : fallback
    })
    return { slots }
  }

  return { slots: defaults }
}

export function paletteSlotIndex(name: string, order: Map<string, number>) {
  const index = order.get(canonicalModelName(name)) ?? order.get(name)
  if (index == null || index < 0) return MODEL_PALETTE_SLOT_COUNT - 1
  return Math.min(index, MODEL_PALETTE_SLOT_COUNT - 1)
}

export function defaultPaletteBaseColor(index: number) {
  const safeIndex = Math.min(MODEL_PALETTE_SLOT_COUNT - 1, Math.max(0, index))
  return DEFAULT_MODEL_PALETTE_SLOTS[safeIndex].base
}

export function resolvedPaletteSurfaceColor(
  index: number,
  preferences: ModelColorPreferences,
  theme: ModelColorTheme,
) {
  const safeIndex = Math.min(MODEL_PALETTE_SLOT_COUNT - 1, Math.max(0, index))
  const slot = preferences.slots[safeIndex] ?? DEFAULT_MODEL_PALETTE_SLOTS[safeIndex]
  return themeAutoSurface(slot.base, theme)
}

export function resolvedModelSurfaceColor(
  name: string,
  preferences: ModelColorPreferences,
  theme: ModelColorTheme,
  order: Map<string, number>,
) {
  return resolvedPaletteSurfaceColor(paletteSlotIndex(name, order), preferences, theme)
}

export function resolvedModelActiveColor(
  name: string,
  preferences: ModelColorPreferences,
  theme: ModelColorTheme,
  order: Map<string, number>,
) {
  return activeColorFromSurface(resolvedModelSurfaceColor(name, preferences, theme, order), theme)
}

export function makeModelColorCssVariables(
  preferences: ModelColorPreferences,
  theme: ModelColorTheme,
) {
  const variables: Record<string, string> = {}
  for (let index = 0; index < MODEL_PALETTE_SLOT_COUNT; index += 1) {
    const surface = resolvedPaletteSurfaceColor(index, preferences, theme)
    variables[`--trend-model-surface-rank-${index + 1}`] = surface
    variables[`--trend-model-rank-${index + 1}`] = activeColorFromSurface(surface, theme)
  }
  return variables
}

export function setPaletteSlotBaseColor(
  preferences: ModelColorPreferences,
  index: number,
  base: string,
) {
  const normalized = normalizeHexColor(base)
  if (!normalized || index < 0 || index >= MODEL_PALETTE_SLOT_COUNT) return preferences
  const slots = preferences.slots.map((slot) => ({ ...slot }))
  const current = slots[index] ?? { base: defaultPaletteBaseColor(index) }
  slots[index] = {
    ...current,
    base: normalized,
  }
  return { slots }
}

export function resetPaletteSlot(preferences: ModelColorPreferences, index: number) {
  if (index < 0 || index >= MODEL_PALETTE_SLOT_COUNT) return preferences
  const slots = preferences.slots.map((slot) => ({ ...slot }))
  slots[index] = { ...DEFAULT_MODEL_PALETTE_SLOTS[index] }
  return { slots }
}

export function resetAllModelColors(_preferences: ModelColorPreferences) {
  return { slots: cloneDefaultSlots() }
}

export function isDefaultModelPalette(preferences: ModelColorPreferences) {
  return preferences.slots.every((slot, index) => {
    const fallback = DEFAULT_MODEL_PALETTE_SLOTS[index]
    return slot.base === fallback.base
  })
}
