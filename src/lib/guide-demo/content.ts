import type { AppLanguage } from "@/lib/i18n"
import { DE_DEMO_CONTENT } from "./content-de"
import { EN_DEMO_CONTENT } from "./content-en"
import { ES_DEMO_CONTENT } from "./content-es"
import { FR_DEMO_CONTENT } from "./content-fr"
import { JA_DEMO_CONTENT } from "./content-ja"
import { KO_DEMO_CONTENT } from "./content-ko"
import { PT_BR_DEMO_CONTENT } from "./content-pt-BR"
import { ZH_CN_DEMO_CONTENT } from "./content-zh-CN"
import { ZH_TW_DEMO_CONTENT } from "./content-zh-TW"
import type { GuideDemoContent } from "./content-types"

const CONTENT: Record<AppLanguage, GuideDemoContent> = {
  en: EN_DEMO_CONTENT, "zh-TW": ZH_TW_DEMO_CONTENT, "zh-CN": ZH_CN_DEMO_CONTENT,
  ja: JA_DEMO_CONTENT, ko: KO_DEMO_CONTENT, es: ES_DEMO_CONTENT,
  "pt-BR": PT_BR_DEMO_CONTENT, de: DE_DEMO_CONTENT, fr: FR_DEMO_CONTENT,
}

export const getGuideDemoContent = (language: AppLanguage) => CONTENT[language]
