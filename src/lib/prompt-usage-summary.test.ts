import { afterEach, describe, expect, it, vi } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { parsePromptUsageSuffix } from "@/lib/prompt-usage"
import { getPromptUsageLines, hasActivePromptUsage } from "@/lib/prompt-usage-summary"

function text(label: string, value: string, metadata: unknown = null): MetricLine {
  return { type: "text", label, value, subtitle: metadata === null ? null : JSON.stringify(metadata) }
}

const usage = { totalTokens: 1, inputTokens: 1, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 }

function lines(projectActivity: unknown = false, sessionActivity: unknown = false): MetricLine[] {
  return [
    text("Today", "1 Token"),
    text("Prompt Usage", "1 prompt · 1 session"),
    text("Project Group", "Project", { id: "project", kind: "project", sessionCount: 1, promptCount: 1, isActive: projectActivity }),
    text("Session", "Session", { id: "session", promptCount: 1, isActive: sessionActivity }),
    text("Prompt", "Prompt", { id: "prompt", usage }),
    text("Agent", "Agent", { id: "agent", kind: "main", usage, models: [] }),
  ]
}

afterEach(() => vi.restoreAllMocks())

describe("getPromptUsageLines", () => {
  it("reuses the input when there is no history suffix", () => {
    const source = [text("Today", "1 Token")]
    expect(getPromptUsageLines(source)).toBe(source)
  })

  it("keeps only the prefix before the latest history header", () => {
    const source = [...lines(true), ...lines(false)]
    expect(getPromptUsageLines(source)).toEqual(source.slice(0, 7))
    expect(getPromptUsageLines(source)[0]).toBe(source[0])
  })

  it("extracts Overview usage even when the history suffix is malformed without parsing JSON", () => {
    const source = lines()
    source[2] = { type: "text", label: "Project Group", value: "Project", subtitle: "malformed" }
    const parse = vi.spyOn(JSON, "parse")

    expect(getPromptUsageLines(source)).toEqual([source[0]])
    expect(parse).not.toHaveBeenCalled()
  })
})

describe("hasActivePromptUsage", () => {
  it.each([[true, false], [false, true], [false, false]] as const)(
    "matches history activity for project %s and session %s",
    (projectActive, sessionActive) => {
      const source = lines(projectActive, sessionActive)
      const projects = parsePromptUsageSuffix(source).projects
      expect(hasActivePromptUsage(source)).toBe(projects.some((project) => (
        project.isActive || project.sessions.some((session) => session.isActive)
      )))
    },
  )

  it("reads Project and Session metadata without parsing or accessing detailed history JSON", () => {
    const source = lines(false, true)
    for (const index of [4, 5]) {
      Object.defineProperty(source[index], "subtitle", {
        get: () => { throw new Error("Detailed history must not be accessed") },
      })
    }
    const parse = vi.spyOn(JSON, "parse")

    expect(hasActivePromptUsage(source)).toBe(true)
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it("uses explicit activity booleans rather than truthy strings or Prompt flags", () => {
    const source = lines("true", 1)
    source[4] = text("Prompt", "Prompt", { id: "prompt", usage, isActive: true })

    expect(hasActivePromptUsage(source)).toBe(false)
  })

  it("ignores activity before the latest suffix", () => {
    expect(hasActivePromptUsage([...lines(true), ...lines(false)])).toBe(false)
  })

  it("finds an active session in a later valid project", () => {
    const source = lines()
    source[1] = text("Prompt Usage", "2 prompts · 2 sessions")
    source.push(...lines(false, true).slice(2))

    expect(hasActivePromptUsage(source)).toBe(true)
  })

  it.each([
    ["missing header", (source: MetricLine[]) => source.filter((line) => line.label !== "Prompt Usage")],
    ["invalid header", (source: MetricLine[]) => [source[0], text("Prompt Usage", "Invalid counts"), ...source.slice(2)]],
    ["malformed project metadata", (source: MetricLine[]) => source.map((line, index) => index === 2 ? { ...line, subtitle: "malformed" } : line)],
    ["malformed session metadata", (source: MetricLine[]) => source.map((line, index) => index === 3 ? { ...line, subtitle: "[]" } : line)],
    ["invalid project identity", (source: MetricLine[]) => source.map((line, index) => index === 2 ? text("Project Group", "Project", { id: "", kind: "project", sessionCount: 1, promptCount: 1, isActive: true }) : line)],
    ["unknown project kind", (source: MetricLine[]) => source.map((line, index) => index === 2 ? text("Project Group", "Project", { id: "project", kind: "unknown", sessionCount: 1, promptCount: 1, isActive: true }) : line)],
    ["invalid session count", (source: MetricLine[]) => source.map((line, index) => index === 3 ? text("Session", "Session", { id: "session", promptCount: -1, isActive: true }) : line)],
    ["session before project", (source: MetricLine[]) => [source[0], source[1], source[3], source[2], ...source.slice(4)]],
    ["prompt before session", (source: MetricLine[]) => [source[0], source[1], source[2], source[4], source[3], source[5]]],
    ["agent before prompt", (source: MetricLine[]) => [source[0], source[1], source[2], source[3], source[5], source[4]]],
    ["missing agent", (source: MetricLine[]) => source.slice(0, -1)],
    ["missing prompt", (source: MetricLine[]) => source.slice(0, -2)],
    ["unknown suffix row", (source: MetricLine[]) => [...source, text("Unknown", "Row")]],
    ["blank row title", (source: MetricLine[]) => source.map((line, index) => index === 3 ? { ...line, value: " " } : line)],
    ["header count mismatch", (source: MetricLine[]) => [source[0], text("Prompt Usage", "2 prompts · 1 session"), ...source.slice(2)]],
    ["project count mismatch", (source: MetricLine[]) => source.map((line, index) => index === 2 ? text("Project Group", "Project", { id: "project", kind: "project", sessionCount: 2, promptCount: 1, isActive: true }) : line)],
    ["session count mismatch", (source: MetricLine[]) => source.map((line, index) => index === 3 ? text("Session", "Session", { id: "session", promptCount: 2, isActive: true }) : line)],
  ] as const)("rejects %s without showing stale activity", (_name, malformed) => {
    expect(hasActivePromptUsage(malformed(lines(true, true)) as MetricLine[])).toBe(false)
  })
})
