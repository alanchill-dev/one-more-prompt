import { DE_MESSAGES } from "./i18n/messages/de"
import { EN_MESSAGES } from "./i18n/messages/en"
import { ES_MESSAGES } from "./i18n/messages/es"
import { FR_MESSAGES } from "./i18n/messages/fr"
import { JA_MESSAGES } from "./i18n/messages/ja"
import { KO_MESSAGES } from "./i18n/messages/ko"
import { PT_BR_MESSAGES } from "./i18n/messages/pt-BR"
import { ZH_CN_MESSAGES } from "./i18n/messages/zh-CN"
import { ZH_TW_MESSAGES } from "./i18n/messages/zh-TW"
import type { Messages, TranslationKey } from "./i18n/types"

export const APP_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "zh-CN", label: "简体中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
] as const

export type AppLanguage = (typeof APP_LANGUAGES)[number]["value"]
export type { TranslationKey } from "./i18n/types"

export const DEFAULT_APP_LANGUAGE: AppLanguage = "en"

const MESSAGES: Record<AppLanguage, Messages> = {
  en: EN_MESSAGES,
  "zh-TW": ZH_TW_MESSAGES,
  "zh-CN": ZH_CN_MESSAGES,
  ja: JA_MESSAGES,
  ko: KO_MESSAGES,
  es: ES_MESSAGES,
  "pt-BR": PT_BR_MESSAGES,
  de: DE_MESSAGES,
  fr: FR_MESSAGES,
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return APP_LANGUAGES.some((language) => language.value === value)
}

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey, values?: Record<string, string | number>): string => {
    const template = MESSAGES[language][key]
    if (!values) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = values[name]
      return value === undefined ? match : String(value)
    })
  }
}

export const translate = createTranslator(DEFAULT_APP_LANGUAGE)
