import { canonicalModelName } from "@/lib/model-colors"
import type { PromptUsageTurn } from "@/lib/prompt-usage"

export function promptQuestionReplies(value: string): { question: string; answer: string }[] | null {
  const text = value.trim(), opening = "<send_user_message_question_reply>", closing = "</send_user_message_question_reply>"
  if (!text.startsWith(opening) || !text.endsWith(closing)) return null
  try {
    const data: unknown = JSON.parse(text.slice(opening.length, -closing.length))
    const items = Array.isArray(data) ? data : [data]
    if (!items.length || !items.every(item => item !== null && typeof item === "object" &&
      typeof item.questionItemId === "string" && typeof item.question === "string" && typeof item.answer === "string")) return null
    return items.map(item => ({ question: item.question, answer: item.answer }))
  } catch {
    return null
  }
}

export function promptCopyText(value: string): string {
  return promptQuestionReplies(value)?.map(({ question, answer }) => `${question}\n${answer}`).join("\n\n") ?? value
}

export function promptPreviewText(value: string): string {
  return promptCopyText(value).replace(/\]\(codex-text-link:\/\//g, "](")
    .replace(/!?\[([^\]]+)\]\((<[^>]*>|(?:[^()]|\([^()]*\))*)\)/g, (_match, label: string, href: string) => {
      if (href.startsWith("browser-skill:")) return ""
      if (href.startsWith("plugin://")) return promptReferenceName(label)
      if (href.startsWith("app://")) return `$${promptReferenceName(label)}`
      return promptSkillLabel(label)
    })
}

export function promptReferenceName(label: string): string {
  const text = label.trim()
  if ((text.startsWith("$[") || text.startsWith("@[")) && text.endsWith("]")) return text.slice(2, -1)
  return text.startsWith("$") || text.startsWith("@") ? text.slice(1) : text
}

export function promptSkillLabel(label: string): string {
  const queryIndex = label.startsWith("$") ? label.indexOf("?") : -1
  return queryIndex >= 0 ? new URLSearchParams(label.slice(queryIndex + 1)).get("label") || label.slice(0, queryIndex) : label
}

export function formatPromptDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function formatPromptModel(name: string, efforts: string[] | undefined, unknownLabel: string): string {
  const labels = [...new Set(efforts ?? [])].map((effort) => effort === "xhigh" ? "XHigh" : effort.charAt(0).toUpperCase() + effort.slice(1))
  return `${name} · ${labels.length ? labels.join(" / ") : unknownLabel}`
}

export function promptModelEfforts(turn: PromptUsageTurn, name: string): string[] {
  const key = canonicalModelName(name)
  const models = turn.agents.flatMap((agent) => agent.models).filter((model) => canonicalModelName(model.name) === key)
  return [...new Set(models.length
    ? models.flatMap((model) => model.reasoningEfforts ?? [])
    : canonicalModelName(turn.model ?? "") === key ? turn.reasoningEfforts ?? [] : [])]
}
