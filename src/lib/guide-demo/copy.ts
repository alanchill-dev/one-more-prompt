import { createTranslator, type AppLanguage } from "@/lib/i18n"
import type { GuideCopy } from "./copy-types"
import { DE_GUIDE_COPY } from "./copy-de"
import { EN_GUIDE_COPY } from "./copy-en"
import { ES_GUIDE_COPY } from "./copy-es"
import { FR_GUIDE_COPY } from "./copy-fr"
import { JA_GUIDE_COPY } from "./copy-ja"
import { KO_GUIDE_COPY } from "./copy-ko"
import { PT_BR_GUIDE_COPY } from "./copy-pt-BR"
import { ZH_CN_GUIDE_COPY } from "./copy-zh-CN"
import { ZH_TW_GUIDE_COPY } from "./copy-zh-TW"
import { getGuideDemoContent } from "./content"

const GUIDE_COPY: Record<AppLanguage, GuideCopy> = {
  en: EN_GUIDE_COPY,
  "zh-TW": ZH_TW_GUIDE_COPY,
  "zh-CN": ZH_CN_GUIDE_COPY,
  ja: JA_GUIDE_COPY,
  ko: KO_GUIDE_COPY,
  es: ES_GUIDE_COPY,
  "pt-BR": PT_BR_GUIDE_COPY,
  de: DE_GUIDE_COPY,
  fr: FR_GUIDE_COPY,
}

export function getGuideCopy(language: AppLanguage): GuideCopy {
  const content = getGuideDemoContent(language)
  const t = createTranslator(language)
  return {
    ...GUIDE_COPY[language],
    steps: GUIDE_COPY[language].steps.map(step => ({
      ...step,
      title: step.title.replace(/\{featuredSession\}/g, content.sessionTitles["story-homepage"]),
      body: step.body.replace(/\{featuredPromptLead\}/g, content.featuredPromptLead),
      points: step.points?.map(([label, body]) => [
        label.replace("Main Agent", content.agents.main).replace("Sub Agent", t("promptUsage.subagent")), body,
      ] as const),
    })),
  }
}

export type { GuideCopy, GuideStepCopy } from "./copy-types"
