import type { TranslationKey } from "@/lib/i18n"

type Translator = (key: TranslationKey, values?: Record<string, string | number>) => string

export function formatCompactDuration(deltaMs: number, t?: Translator): string | null {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return null
  const totalSeconds = Math.floor(deltaMs / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  if (days > 0) return t ? t("quota.durationDaysHours", { days, hours }) : `${days}d ${hours}h`
  if (totalHours > 0) return t ? t("quota.durationHoursMinutes", { hours: totalHours, minutes }) : `${totalHours}h ${minutes}m`
  if (totalMinutes > 0) return t ? t("quota.durationMinutes", { minutes: totalMinutes }) : `${totalMinutes}m`
  return t ? t("quota.durationUnderMinute") : "<1m"
}
