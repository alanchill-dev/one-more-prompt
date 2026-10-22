import type { EN_MESSAGES } from "./messages/en"

export type TranslationKey = keyof typeof EN_MESSAGES
export type Messages = Record<TranslationKey, string>
