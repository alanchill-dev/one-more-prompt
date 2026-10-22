import userEvent from "@testing-library/user-event"
import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsageProjectBrowser } from "./prompt-usage-project-browser"
import { PromptUsageTimelineExplorer } from "./prompt-usage-timeline-explorer"
import { PromptUsageLanePreview } from "./prompt-usage-lane-preview"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { flattenTimeline } from "@/lib/prompt-usage-timeline"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

vi.mock("@/lib/time-scope", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/time-scope")>(),
  DEFAULT_PROMPT_USAGE_TIME_SCOPE: { type: "day", dateKey: "2026-09-04" },
}))
vi.mock("@/components/prompt-usage-timeline-camera", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/prompt-usage-timeline-camera")>(),
  useTimelineCamera: (start: number, end: number) => ({ start, end, span: end - start, moving: false, target: { current: start }, move: vi.fn(), advance: vi.fn() }),
}))

const replies = [
  { questionItemId: '["request_user_input_async","call_internal_only",0]', question: "How should the library be organized?", answer: "Keep separate collections." },
  { questionItemId: '["request_user_input_async","call_internal_only",1]', question: "Which action should be available?", answer: "Archive selected records." },
  { questionItemId: '["request_user_input_async","call_internal_only",2]', question: "Which preview should open first?", answer: "Show the complete design." },
]
const questionReply = `<send_user_message_question_reply>${JSON.stringify(replies)}</send_user_message_question_reply>`
const readableReply = replies.map(({ question, answer }) => `${question}\n${answer}`).join("\n\n")

function project(prompt: string): PromptUsageProject {
  const startedAt = "2026-09-04T14:30:00+08:00"
  const turn = {
    id: "reply", prompt, startedAt, timeLabel: "14:30", agents: [], quotaObservation: null,
    costUsd: null, estimationStatus: "current_rate" as const,
    tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  }
  const session = {
    id: "session", title: "Synthetic Session", updatedAt: startedAt, promptCount: 1, isActive: false,
    codexOrder: 0, costUsd: null, estimationStatus: "current_rate" as const, turns: [turn],
  }
  return { id: "project", kind: "project", name: "Synthetic Project", updatedAt: startedAt, promptCount: 1,
    sessionCount: 1, isActive: false, codexOrder: 0, sessions: [session] }
}

type View = "Project Browser" | "Timeline" | "Lane Preview"
function mount(view: View, prompt: string) {
  const data = project(prompt)
  if (view === "Project Browser") {
    render(<PromptUsageProjectBrowser projects={[data]} promptCount={1} sessionCount={1}
      initialProjectId="project" initialSessionId="session" initialTurnId="reply" />)
  } else if (view === "Timeline") {
    render(<PromptUsageTimelineExplorer projects={[data]} promptCount={1} sessionCount={1} />)
  } else {
    render(<PromptUsageLanePreview item={flattenTimeline([data])[0]} onClose={vi.fn()} />)
  }
}

beforeEach(() => {
  window.localStorage.clear()
  useAppPreferencesStore.getState().resetState()
  useAppPreferencesStore.setState({ language: "en" })
  useAppUiStore.getState().resetState()
  useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" })
})

describe("Question Reply Caller Integration", () => {
  it.each<View>(["Project Browser", "Timeline", "Lane Preview"])("shows and copies readable question replies in %s", async view => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    mount(view, questionReply)
    if (view === "Timeline") {
      const event = screen.getByTestId("prompt-session-event-reply")
      expect(event).toHaveAccessibleName(/How should the library be organized/)
      expect(event.getAttribute("aria-label")).not.toMatch(/request_user_input_async|send_user_message_question_reply|call_internal_only/)
      await user.click(event)
    } else if (view === "Project Browser") {
      const row = within(screen.getByTestId("prompt-usage-prompt")).getByRole("button")
      expect(row).toHaveAccessibleName(/How should the library be organized/)
      expect(row.getAttribute("aria-label")).not.toMatch(/request_user_input_async|send_user_message_question_reply|call_internal_only/)
    }
    const inspector = screen.getByTestId("prompt-usage-details-column")
    for (const { question, answer } of replies) {
      expect(inspector).toHaveTextContent(question)
      expect(inspector).toHaveTextContent(answer)
    }
    expect(inspector).not.toHaveTextContent(/request_user_input_async|send_user_message_question_reply|questionItemId|call_internal_only/)
    await user.click(screen.getByRole("button", { name: "Copy Prompt" }))
    expect(writeText).toHaveBeenCalledWith(readableReply)
  })

  it.each<View>(["Project Browser", "Timeline", "Lane Preview"])("preserves ordinary prompt copying in %s", async view => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const prompt = "Keep **this** formatting.\nSecond line."
    mount(view, prompt)
    if (view === "Timeline") await user.click(screen.getByTestId("prompt-session-event-reply"))
    await user.click(screen.getByRole("button", { name: "Copy Prompt" }))
    expect(writeText).toHaveBeenCalledWith(prompt)
  })

  it.each<View>(["Project Browser", "Timeline"])("searches question and answer text without internal metadata in %s", async view => {
    const user = userEvent.setup()
    mount(view, questionReply)
    const search = screen.getByRole("searchbox", { name: "Search Prompt Usage" })
    const result = () => view === "Project Browser" ? screen.queryByTestId("prompt-usage-prompt") : screen.queryByTestId("prompt-session-event-reply")
    for (const query of ["library", "Archive"]) {
      await user.clear(search)
      await user.type(search, query)
      expect(result()).toBeInTheDocument()
    }
    for (const query of ["request_user_input_async", "send_user_message_question_reply", "call_internal_only"]) {
      await user.clear(search)
      await user.type(search, query)
      expect(result()).not.toBeInTheDocument()
    }
  })
})
