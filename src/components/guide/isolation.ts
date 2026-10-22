import { isAppLanguage, type AppLanguage } from "@/lib/i18n"
import { sanitizeModelColorPreferences, type ModelColorPreferences } from "@/lib/model-colors"
import type { ThemeMode } from "@/lib/settings"
import type { BarChartPoint, SessionQuotaResponse } from "@/bindings"

export type GuideInit = {
  type: "omp-guide-init"
  language: AppLanguage
  themeMode: ThemeMode
  modelPalette: ModelColorPreferences
}

export function readGuideInit(value: unknown): GuideInit | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Record<string, unknown>
  if (candidate.type !== "omp-guide-init" || !isAppLanguage(candidate.language)
    || !["system", "light", "dark"].includes(String(candidate.themeMode))) return null
  return {
    type: "omp-guide-init",
    language: candidate.language,
    themeMode: candidate.themeMode as ThemeMode,
    modelPalette: sanitizeModelColorPreferences(candidate.modelPalette),
  }
}

export { memoryStorage } from "./memory-storage"

export function guideInvoke(quota: SessionQuotaResponse, palette?: ModelColorPreferences, hourly: BarChartPoint[] = []) {
  let storeOpen = false
  let modelPalette = sanitizeModelColorPreferences(palette)
  return async (command: string, args: Record<string, unknown> = {}) => {
    if (command === "query_session_quota") return quota
    if (command === "query_codex_hourly_usage") return hourly
    if (["plugin:event|listen", "plugin:event|unlisten"].includes(command)) return 1
    if (command === "plugin:store|load" && args.path === "settings.json") {
      storeOpen = true
      return 1
    }
    if (storeOpen && args.rid === 1) {
      if (command === "plugin:store|get" && args.key === "modelPalette") return [structuredClone(modelPalette), true]
      if (command === "plugin:store|set" && args.key === "modelPalette") {
        modelPalette = sanitizeModelColorPreferences(args.value)
        return
      }
      if (command === "plugin:store|save") return
    }
    throw new Error(`Guide document blocked native command: ${command}`)
  }
}
