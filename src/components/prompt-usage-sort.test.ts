import { describe, expect, it } from "vitest"
import type { PromptUsageProject, PromptUsageSession } from "@/lib/prompt-usage"
import { sortProjects } from "./prompt-usage-sort"

function session(id: string, promptCount: number, totalTokens: number, codexOrder: number | null = null): PromptUsageSession {
  return { id, title: id, promptCount, updatedAt: `2026-09-${String(promptCount).padStart(2, "0")}`, codexOrder, turns: [{ id: `${id}-turn`, tokens: { totalTokens } }] } as PromptUsageSession
}
const sessions = [session("Session 10", 1, 500, 0), session("Session 2", 3, 100, 2), session("Session 1", 2, 300)]
const projects = [
  { id: "b", name: "Project 10", updatedAt: "2026-09-01", promptCount: 10, codexOrder: null, sessions: [sessions[0]] },
  { id: "a", name: "Project 2", updatedAt: "2026-09-03", promptCount: 5, codexOrder: 0, sessions: sessions.slice(1) },
] as PromptUsageProject[]

describe("sortProjects", () => {
  it.each([
    ["recent", ["a", "b"], ["Session 2", "Session 1", "Session 10"]],
    ["prompts", ["b", "a"], ["Session 2", "Session 1", "Session 10"]],
    ["tokens", ["b", "a"], ["Session 10", "Session 1", "Session 2"]],
    ["name", ["a", "b"], ["Session 1", "Session 2", "Session 10"]],
    ["codex", ["a", "b"], ["Session 10", "Session 2", "Session 1"]],
  ] as const)("sorts both levels by %s without changing turn order", (mode, projectIds, sessionIds) => {
    expect(sortProjects(projects, mode).map(project => project.id)).toEqual(projectIds)
    const result = sortProjects([{ ...projects[0], sessions }], mode)[0]
    expect(result.sessions.map(session => session.id)).toEqual(sessionIds)
    expect(result.sessions.find(session => session.id === sessions[0].id)?.turns).toBe(sessions[0].turns)
    expect(sessions[0].id).toBe("Session 10")
  })
  it("breaks ties with natural names and then IDs", () => {
    const tied = [{ ...projects[0], id: "z", name: "Same" }, { ...projects[0], id: "a", name: "Same" }]
    expect(sortProjects(tied, "recent").map(project => project.id)).toEqual(["a", "z"])
  })
})
