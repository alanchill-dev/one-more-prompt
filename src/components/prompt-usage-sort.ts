import type { PromptUsageProject, PromptUsageSession } from "@/lib/prompt-usage"

export type SortMode = "recent" | "prompts" | "tokens" | "name" | "codex"

const timestamp = (value: string | null) => value ? Date.parse(value) || 0 : 0
const sessionTokens = (session: PromptUsageSession) => session.turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0)

export function sortProjects(projects: PromptUsageProject[], sort: SortMode): PromptUsageProject[] {
  const compare = (a: PromptUsageProject | PromptUsageSession, b: PromptUsageProject | PromptUsageSession): number => {
    const nameA = "name" in a ? a.name : a.title
    const nameB = "name" in b ? b.name : b.title
    const byName = nameA.localeCompare(nameB, undefined, { numeric: true }) || a.id.localeCompare(b.id)
    switch (sort) {
      case "recent": return timestamp(b.updatedAt) - timestamp(a.updatedAt) || byName
      case "prompts": return b.promptCount - a.promptCount || byName
      case "tokens": {
        const total = (entry: typeof a) => "sessions" in entry
          ? entry.sessions.reduce((sum, session) => sum + sessionTokens(session), 0)
          : sessionTokens(entry)
        return total(b) - total(a) || byName
      }
      case "codex": return (a.codexOrder ?? Infinity) - (b.codexOrder ?? Infinity) || byName
      case "name": return byName
    }
  }
  return [...projects].sort(compare).map(project => ({ ...project, sessions: [...project.sessions].sort(compare) }))
}
