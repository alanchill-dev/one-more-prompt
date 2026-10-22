import type { MetricLine } from "@/lib/plugin-types"

export function findPromptUsageHeaderIndex(lines: MetricLine[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.type === "text" && line.label === "Prompt Usage") return index
  }
  return -1
}

/** Overview only needs the quota/chart prefix, not a parsed history hierarchy. */
export function getPromptUsageLines(lines: MetricLine[]): MetricLine[] {
  const headerIndex = findPromptUsageHeaderIndex(lines)
  return headerIndex < 0 ? lines : lines.slice(0, headerIndex)
}

function metadata(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function count(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** Read only project/session activity metadata; keep detailed turn and agent
 * JSON unparsed. Cheap structure/count checks suppress malformed summaries.
 */
export function hasActivePromptUsage(lines: MetricLine[]): boolean {
  const headerIndex = findPromptUsageHeaderIndex(lines)
  if (headerIndex < 0) return false
  const header = lines[headerIndex]
  if (header.type !== "text") return false
  const counts = header.value.trim().match(/^(\d+)\s+prompts?\s+·\s+(\d+)\s+sessions?$/i)
  if (!counts) return false

  let active = false
  let projects = 0
  let sessions = 0
  let prompts = 0
  let project: { sessions: number; prompts: number; expectedSessions: number; expectedPrompts: number } | null = null
  let session: { prompts: number; expectedPrompts: number } | null = null
  let hasPrompt = false
  let hasAgent = false
  const validPrompt = () => !hasPrompt || hasAgent
  const validSession = () => !session || session.prompts === session.expectedPrompts
  const validProject = () => !project || (
    project.sessions === project.expectedSessions && project.prompts === project.expectedPrompts
  )

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.type !== "text" || !line.value.trim()) return false
    if (line.label === "Project Group") {
      if (!validPrompt() || !validSession() || !validProject()) return false
      const meta = metadata(line.subtitle)
      const expectedSessions = count(meta?.sessionCount)
      const expectedPrompts = count(meta?.promptCount)
      if (!hasText(meta?.id) || (meta?.kind !== "project" && meta?.kind !== "standalone")
        || expectedSessions === null || expectedPrompts === null) return false
      active ||= meta?.isActive === true
      project = { sessions: 0, prompts: 0, expectedSessions, expectedPrompts }
      session = null
      hasPrompt = false
      hasAgent = false
      projects += 1
    } else if (line.label === "Session") {
      if (!project || !validPrompt() || !validSession()) return false
      const meta = metadata(line.subtitle)
      const expectedPrompts = count(meta?.promptCount)
      if (!hasText(meta?.id) || expectedPrompts === null) return false
      active ||= meta?.isActive === true
      session = { prompts: 0, expectedPrompts }
      hasPrompt = false
      hasAgent = false
      project.sessions += 1
      sessions += 1
    } else if (line.label === "Prompt") {
      if (!session || !project || !validPrompt()) return false
      session.prompts += 1
      project.prompts += 1
      prompts += 1
      hasPrompt = true
      hasAgent = false
    } else if (line.label === "Agent") {
      if (!hasPrompt) return false
      hasAgent = true
    } else {
      return false
    }
  }
  return active && projects > 0 && validPrompt() && validSession() && validProject()
    && prompts === Number(counts[1]) && sessions === Number(counts[2])
}
