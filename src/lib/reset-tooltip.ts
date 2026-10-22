import type { ResetTimerDisplayMode } from "@/lib/settings"
import { formatCompactDuration } from "@/lib/compact-duration"
import type { TranslationKey } from "@/lib/i18n"

type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string
type LocalizedFormat = { t?: Translator; locale?: string }

export function getTimeFormatter(locale?: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
}

const RESET_SOON_THRESHOLD_MS = 5 * 60 * 1000

function parseResetTimestamp(resetsAtIso: string): number | null {
  const resetsAtMs = Date.parse(resetsAtIso)
  return Number.isFinite(resetsAtMs) ? resetsAtMs : null
}

function getLocalDayIndex(timestampMs: number): number {
  const date = new Date(timestampMs)
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

function formatMonthDay(timestampMs: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(timestampMs)
}

export function formatResetRelativeLabel(nowMs: number, resetsAtIso: string, localized: LocalizedFormat = {}): string | null {
  const resetsAtMs = parseResetTimestamp(resetsAtIso)
  if (resetsAtMs === null) return null
  const deltaMs = resetsAtMs - nowMs
  if (deltaMs < RESET_SOON_THRESHOLD_MS) return localized.t ? localized.t("quota.resetsSoon") : "Resets soon"
  const durationText = formatCompactDuration(deltaMs, localized.t)
  return durationText ? (localized.t ? localized.t("quota.resetsIn", { duration: durationText }) : `Resets in ${durationText}`) : null
}

export function formatResetAbsoluteLabel(
  nowMs: number,
  resetsAtIso: string,
  localized: LocalizedFormat = {},
): string | null {
  const resetsAtMs = parseResetTimestamp(resetsAtIso)
  if (resetsAtMs === null) return null
  if (resetsAtMs - nowMs <= 0) return localized.t ? localized.t("quota.resetsSoon") : "Resets soon"
  const dayDiff = getLocalDayIndex(resetsAtMs) - getLocalDayIndex(nowMs)
  const timeText = getTimeFormatter(localized.locale).format(resetsAtMs)
  if (dayDiff <= 0) return localized.t ? localized.t("quota.resetsTodayAt", { time: timeText }) : `Resets today at ${timeText}`
  if (dayDiff === 1) return localized.t ? localized.t("quota.resetsTomorrowAt", { time: timeText }) : `Resets tomorrow at ${timeText}`
  const dateText = formatMonthDay(resetsAtMs, localized.locale)
  return localized.t ? localized.t("quota.resetsDateAt", { date: dateText, time: timeText }) : `Resets ${dateText} at ${timeText}`
}

export function formatResetTooltipText({
  nowMs,
  resetsAtIso,
  visibleMode,
  t,
  locale,
}: {
  nowMs: number
  resetsAtIso: string
  visibleMode: ResetTimerDisplayMode
  t?: Translator
  locale?: string
}): string | null {
  return visibleMode === "absolute"
    ? formatResetRelativeLabel(nowMs, resetsAtIso, { t, locale })
    : formatResetAbsoluteLabel(nowMs, resetsAtIso, { t, locale })
}

export function formatExpiryRelativeLabel(nowMs: number, expiresAtIso: string, localized: LocalizedFormat = {}): string | null {
  const expiresAtMs = parseResetTimestamp(expiresAtIso)
  if (expiresAtMs === null) return null
  const deltaMs = expiresAtMs - nowMs
  if (deltaMs < RESET_SOON_THRESHOLD_MS) return localized.t ? localized.t("quota.expiresSoon") : "Expires soon"
  const durationText = formatCompactDuration(deltaMs, localized.t)
  return durationText ? (localized.t ? localized.t("quota.expiresIn", { duration: durationText }) : `Expires in ${durationText}`) : null
}

export function formatExpiryAbsoluteLabel(
  nowMs: number,
  expiresAtIso: string,
  localized: LocalizedFormat = {},
): string | null {
  const expiresAtMs = parseResetTimestamp(expiresAtIso)
  if (expiresAtMs === null) return null
  if (expiresAtMs - nowMs <= 0) return localized.t ? localized.t("quota.expiresSoon") : "Expires soon"
  const dayDiff = getLocalDayIndex(expiresAtMs) - getLocalDayIndex(nowMs)
  const timeText = getTimeFormatter(localized.locale).format(expiresAtMs)
  if (dayDiff <= 0) return localized.t ? localized.t("quota.expiresTodayAt", { time: timeText }) : `Expires today at ${timeText}`
  if (dayDiff === 1) return localized.t ? localized.t("quota.expiresTomorrowAt", { time: timeText }) : `Expires tomorrow at ${timeText}`
  const dateText = formatMonthDay(expiresAtMs, localized.locale)
  return localized.t ? localized.t("quota.expiresDateAt", { date: dateText, time: timeText }) : `Expires ${dateText} at ${timeText}`
}

export function formatExpiryTooltipText({
  nowMs,
  expiresAtIso,
  visibleMode,
  t,
  locale,
}: {
  nowMs: number
  expiresAtIso: string
  visibleMode: ResetTimerDisplayMode
  t?: Translator
  locale?: string
}): string | null {
  return visibleMode === "absolute"
    ? formatExpiryRelativeLabel(nowMs, expiresAtIso, { t, locale })
    : formatExpiryAbsoluteLabel(nowMs, expiresAtIso, { t, locale })
}
