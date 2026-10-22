import type { AppLanguage } from "@/lib/i18n"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { getGuideDemoContent } from "./content"
import { FEATURED_PROMPT_ID, projects } from "./fixtures"

export function getGuideProjects(language: AppLanguage): PromptUsageProject[] {
  const content = getGuideDemoContent(language)
  return projects.map((project, projectIndex) => ({
    ...project,
    name: content.projectNames[projectIndex],
    sessions: project.sessions.map(session => ({
      ...session,
      title: content.sessionTitles[session.id],
      turns: session.turns.map((turn, index) => ({
        ...turn,
        prompt: turn.id === FEATURED_PROMPT_ID ? content.featuredPrompt
          : content.projectPrompts[projectIndex][index].replace(/\{topic\}/g, content.sessionTitles[session.id]),
        timeLabel: new Date(turn.startedAt!).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
        agents: turn.agents.map(agent => ({
          ...agent,
          name: agent.kind === "main" ? content.agents.main
            : agent.role === "reviewer" ? content.agents.reviewer
              : turn.id === FEATURED_PROMPT_ID ? content.agents.featuredWorker : content.agents.worker,
          role: agent.role === "reviewer" ? content.agents.reviewerRole
            : agent.role ? content.agents.workerRole : null,
        })),
      })),
    })),
  }))
}
