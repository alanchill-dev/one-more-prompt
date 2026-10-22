import { describe, expect, it } from "vitest"
import {
  APP_LANGUAGES,
  DEFAULT_APP_LANGUAGE,
  createTranslator,
  isAppLanguage,
  type AppLanguage,
  type TranslationKey,
} from "@/lib/i18n"
import { DE_MESSAGES } from "@/lib/i18n/messages/de"
import { EN_MESSAGES } from "@/lib/i18n/messages/en"
import { ES_MESSAGES } from "@/lib/i18n/messages/es"
import { FR_MESSAGES } from "@/lib/i18n/messages/fr"
import { JA_MESSAGES } from "@/lib/i18n/messages/ja"
import { KO_MESSAGES } from "@/lib/i18n/messages/ko"
import { PT_BR_MESSAGES } from "@/lib/i18n/messages/pt-BR"
import { ZH_CN_MESSAGES } from "@/lib/i18n/messages/zh-CN"
import { ZH_TW_MESSAGES } from "@/lib/i18n/messages/zh-TW"
import type { Messages } from "@/lib/i18n/types"

const LOCALE_MESSAGES: Record<AppLanguage, Messages> = {
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

const GUIDE_BEAT_KEYS = [
  "guide.activity.chartTitle",
  "guide.activity.chartDescription",
  "guide.activity.controlsTitle",
  "guide.activity.controlsDescription",
  "guide.activity.modelsTitle",
  "guide.activity.modelsDescription",
  "guide.limits.windowsTitle",
  "guide.limits.windowsDescription",
  "guide.limits.resetPaceTitle",
  "guide.limits.resetPaceDescription",
  "guide.prompts.hierarchyTitle",
  "guide.prompts.hierarchyDescription",
  "guide.prompts.inspectTitle",
  "guide.prompts.inspectDescription",
  "guide.prompts.tokensTitle",
  "guide.prompts.tokensDescription",
  "guide.timeline.compareTitle",
  "guide.timeline.compareDescription",
  "guide.timeline.promptTitle",
  "guide.timeline.promptDescription",
  "guide.timeline.selectPromptDescription",
  "guide.selectPromptDescription",
  "guide.selectSessionDescription",
] satisfies TranslationKey[]

describe("i18n", () => {
  it("defaults to English and keeps the complete language union strict at runtime", () => {
    expect(DEFAULT_APP_LANGUAGE).toBe("en")
    expect(APP_LANGUAGES.map((language) => language.value)).toEqual([
      "en",
      "zh-TW",
      "zh-CN",
      "ja",
      "ko",
      "es",
      "pt-BR",
      "de",
      "fr",
    ])
    for (const language of APP_LANGUAGES) {
      expect(isAppLanguage(language.value)).toBe(true)
    }
    expect(isAppLanguage("not-a-language")).toBe(false)
  })

  it("interpolates typed messages in supported languages", () => {
    expect(createTranslator("en")("footer.nextUpdateMinutes", { minutes: 5 })).toBe(
      "Next update in 5m",
    )
    expect(createTranslator("zh-TW")("footer.nextUpdateMinutes", { minutes: 5 })).toBe(
      "下次更新於 5 分鐘後",
    )
  })

  it("provides localized settings and guide copy for every locale", () => {
    const settingsTitles: Record<AppLanguage, string> = {
      en: "Settings",
      "zh-TW": "設定",
      "zh-CN": "设置",
      ja: "設定",
      ko: "설정",
      es: "Configuración",
      "pt-BR": "Configurações",
      de: "Einstellungen",
      fr: "Réglages",
    }

    for (const language of APP_LANGUAGES) {
      const t = createTranslator(language.value)
      expect(t("settings.title")).toBe(settingsTitles[language.value])
      expect(t("guide.progress", { current: 2, total: 3 })).not.toMatch(
        /\{(?:current|total)\}/,
      )
      expect(t("onboarding.ready.openOverview")).not.toBe("")
    }
  })

  it("keeps every locale complete with matching interpolation parameters", () => {
    const englishKeys = Object.keys(EN_MESSAGES).sort()
    const placeholders = (message: string) =>
      [...message.matchAll(/\{\w+\}/g)].map(([placeholder]) => placeholder).sort()

    for (const language of APP_LANGUAGES) {
      const messages = LOCALE_MESSAGES[language.value]
      expect(Object.keys(messages).sort()).toEqual(englishKeys)
      for (const key of englishKeys) {
        const translationKey = key as keyof Messages
        expect(messages[translationKey].trim()).not.toBe("")
        expect(placeholders(messages[translationKey])).toEqual(
          placeholders(EN_MESSAGES[translationKey]),
        )
      }
    }
  })

  it("localizes every guide beat without hiding the data boundaries", () => {
    for (const key of GUIDE_BEAT_KEYS) {
      expect(EN_MESSAGES[key]).not.toBe("")
      for (const language of APP_LANGUAGES.slice(1)) {
        expect(LOCALE_MESSAGES[language.value][key]).not.toBe(EN_MESSAGES[key])
      }
    }

    expect(EN_MESSAGES["guide.activity.controlsDescription"]).toMatch(
      /Today, 7, 14 or 30 days/,
    )
    expect(EN_MESSAGES["guide.activity.controlsDescription"]).not.toMatch(/switch between.*Token.*API/i)
    expect(EN_MESSAGES["guide.limits.windowsDescription"]).toMatch(
      /separate from local Token activity/,
    )
    expect(EN_MESSAGES["guide.limits.resetPaceDescription"]).toMatch(
      /countdown and the exact time/,
    )
    expect(EN_MESSAGES["guide.prompts.localDescription"]).toMatch(
      /local Codex session logs.*without uploading prompt text/,
    )
  })

  it("provides honest weekly-quota observation copy in both languages", () => {
    expect(createTranslator("en")("promptUsage.quotaMeasured", { delta: "4.25" })).toBe(
      "4.25% of 7-day quota",
    )
    expect(createTranslator("en")("promptUsage.quotaNoObservation")).toMatch(
      /future prompts.*historically backfilled/i,
    )
    expect(createTranslator("zh-TW")("promptUsage.quotaMeasured", { delta: 4 })).toBe(
      "佔 7 天額度 4%",
    )
    expect(createTranslator("zh-TW")("promptUsage.quotaNoObservation")).toMatch(
      /未來的提示詞.*回溯補算/,
    )
  })
})
