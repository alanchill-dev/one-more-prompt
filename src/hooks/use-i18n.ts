import { useMemo } from "react"
import { createTranslator, type AppLanguage } from "@/lib/i18n"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

export function useI18n(languageOverride?: AppLanguage) {
  const storedLanguage = useAppPreferencesStore((state) => state.language)
  const language = languageOverride ?? storedLanguage
  return useMemo(() => createTranslator(language), [language])
}
