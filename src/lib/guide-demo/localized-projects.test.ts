import { describe, expect, it } from "vitest"
import { APP_LANGUAGES } from "@/lib/i18n"
import { getGuideDemoContent } from "./content"
import { FEATURED_PROMPT_ID, projects } from "./fixtures"
import { getGuideProjects } from "./localized-projects"

describe("Localized guide practice history", () => {
  it.each(APP_LANGUAGES)("provides complete, varied practice content in $value", ({ value }) => {
    const content = getGuideDemoContent(value)
    const localized = getGuideProjects(value)
    expect(content.projectNames).toHaveLength(7)
    expect(Object.keys(content.sessionTitles)).toHaveLength(46)
    expect(content.projectPrompts).toHaveLength(7)
    for (const templates of content.projectPrompts) {
      expect(templates).toHaveLength(10)
      expect(new Set(templates).size).toBe(10)
      expect(templates.every(text => text.includes("{topic}"))).toBe(true)
    }
    expect(content.featuredPrompt.startsWith(content.featuredPromptLead)).toBe(true)
    const turns = localized.flatMap(project => project.sessions.flatMap(session => session.turns))
    expect(turns).toHaveLength(340)
    expect(new Set(turns.map(turn => turn.prompt)).size).toBeGreaterThan(300)
    expect(turns.find(turn => turn.id === FEATURED_PROMPT_ID)?.prompt).toBe(content.featuredPrompt)
    for (const project of localized) {
      expect(project.name.trim()).not.toBe("")
      for (const session of project.sessions) {
        expect(session.title.trim()).not.toBe("")
        for (const turn of session.turns) {
          expect(turn.prompt).toContain(turn.id === FEATURED_PROMPT_ID ? content.featuredPromptLead : session.title)
          expect(turn.prompt).not.toMatch(/\{topic\}/)
          expect(turn.timeLabel).toBe(new Date(turn.startedAt!).toLocaleTimeString(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }))
          for (const agent of turn.agents) {
            expect(Object.values(content.agents)).toContain(agent.name)
            if (agent.role) expect([content.agents.workerRole, content.agents.reviewerRole]).toContain(agent.role)
          }
        }
      }
    }
  })

  it.each(APP_LANGUAGES)("preserves every usage value, timestamp and stable identity in $value", ({ value }) => {
    const localized = getGuideProjects(value)
    for (const [projectIndex, project] of localized.entries()) {
      const originalProject = projects[projectIndex]
      expect({ ...project, name: "", sessions: [] }).toEqual({ ...originalProject, name: "", sessions: [] })
      for (const [sessionIndex, session] of project.sessions.entries()) {
        const originalSession = originalProject.sessions[sessionIndex]
        expect({ ...session, title: "", turns: [] }).toEqual({ ...originalSession, title: "", turns: [] })
        for (const [turnIndex, turn] of session.turns.entries()) {
          const originalTurn = originalSession.turns[turnIndex]
          const clearCopy = (item: typeof turn) => ({
            ...item, prompt: "", timeLabel: "",
            agents: item.agents.map(agent => ({ ...agent, name: "", role: null })),
          })
          expect(clearCopy(turn)).toEqual(clearCopy(originalTurn))
        }
      }
    }
  })
})
