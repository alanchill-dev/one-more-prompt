import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PromptUsageProjectBrowser } from "./prompt-usage-project-browser"
import type { PromptUsageProject, PromptUsageSession, PromptUsageTurn } from "@/lib/prompt-usage"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"

const prompt = (id: string, text: string): PromptUsageTurn => ({
  id, prompt: text, startedAt: "2026-10-16T09:00:00Z", timeLabel: "09:00", agents: [], quotaObservation: null,
  tokens: { totalTokens: 100, inputTokens: 80, cachedInputTokens: 0, outputTokens: 20, reasoningOutputTokens: 0 },
  costUsd: null, estimationStatus: "unknown",
})
const session = (id: string, title: string, turns: PromptUsageTurn[]): PromptUsageSession => ({
  id, title, turns, promptCount: turns.length, updatedAt: "2026-10-16T10:00:00Z", isActive: false, codexOrder: 0,
  costUsd: null, estimationStatus: "unknown",
})
const codex = session("codex-session", "Codex Conversation", [prompt("codex-first", "Codex First Prompt"), prompt("codex-second", "Codex Selected Prompt")])
const notionFirst = session("notion-first", "Notion First Conversation", [prompt("notion-first-prompt", "Notion First Prompt")])
const notionSecond = session("notion-second", "Notion Other Conversation", [prompt("notion-second-prompt", "Notion Other Prompt")])
const standalone = session("standalone-session", "Independent Conversation", [prompt("standalone-prompt", "Independent Prompt")])
const project = (id: string, name: string, sessions: PromptUsageSession[], kind: PromptUsageProject["kind"] = "project"): PromptUsageProject => ({
  id, name, sessions, kind, updatedAt: "2026-10-16T10:00:00Z", promptCount: sessions.reduce((sum, entry) => sum + entry.promptCount, 0),
  sessionCount: sessions.length, isActive: false, codexOrder: 0,
})
const projects = [project("codex", "Codex", [codex]), project("notion", "Notion", [notionFirst, notionSecond]), project("solo", "Independent Conversation", [standalone], "standalone")]
const renderSelected = () => render(<PromptUsageProjectBrowser projects={projects} promptCount={5} sessionCount={4}
  initialProjectId="codex" initialSessionId="codex-session" initialTurnId="codex-second" />)

beforeEach(() => {
  useAppPreferencesStore.setState({ language: "en", displayCurrency: "USD" })
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"))
})
afterEach(() => vi.useRealTimers())

it("only expands or collapses any Project folder while preserving the selected Project, Session, Prompt and Inspector", async () => {
  const user = userEvent.setup()
  renderSelected()
  const inspector = screen.getByTestId("prompt-usage-details-column")
  const assertSelection = () => {
    expect(screen.getByTestId("prompt-usage-entry-codex")).toHaveAttribute("aria-current", "page")
    expect(screen.getByTestId("prompt-usage-entry-notion")).not.toHaveAttribute("aria-current")
    expect(within(screen.getByTestId("prompt-usage-project-summary")).getByRole("heading")).toHaveTextContent("Codex")
    expect(within(screen.getByTestId("prompt-usage-session-summary")).getByRole("heading")).toHaveTextContent("Codex Conversation")
    expect(screen.getByRole("button", { name: "Collapse Prompt: Codex Selected Prompt" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("prompt-usage-details-column")).toBe(inspector)
    expect(inspector).toHaveTextContent("Codex Selected Prompt")
  }
  assertSelection()
  const other = screen.getByRole("button", { name: "Open Project Notion" })
  await user.click(other)
  expect(other).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByRole("button", { name: "Open Session Notion First Conversation" })).not.toHaveAttribute("aria-current")
  assertSelection()
  await user.click(other)
  expect(other).toHaveAttribute("aria-expanded", "false")
  assertSelection()
  const current = screen.getByRole("button", { name: "Open Project Codex" })
  await user.click(current)
  expect(current).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByRole("button", { name: "Open Session Codex Conversation" })).toHaveAttribute("aria-current", "page")
  assertSelection()
  await user.click(current)
  expect(current).toHaveAttribute("aria-expanded", "false")
  assertSelection()
})

it("switches to the exact child Session only when that Session is explicitly selected", async () => {
  const user = userEvent.setup()
  renderSelected()
  await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
  await user.click(screen.getByRole("button", { name: "Open Session Notion Other Conversation" }))
  expect(screen.getByTestId("prompt-usage-entry-notion")).toHaveAttribute("aria-current", "page")
  expect(screen.getByTestId("prompt-usage-entry-codex")).not.toHaveAttribute("aria-current")
  expect(screen.getByRole("button", { name: "Open Session Notion Other Conversation" })).toHaveAttribute("aria-current", "page")
  expect(within(screen.getByTestId("prompt-usage-session-summary")).getByRole("heading")).toHaveTextContent("Notion Other Conversation")
  expect(screen.getByRole("button", { name: "Open Prompt: Notion Other Prompt" })).toBeVisible()
  expect(screen.queryByRole("button", { name: "Open Prompt: Notion First Prompt" })).toBeNull()
  expect(screen.queryByTestId("prompt-usage-details-column")).toBeNull()
  await user.click(screen.getByRole("button", { name: "Open Prompt: Notion Other Prompt" }))
  expect(screen.getByTestId("prompt-usage-details-column")).toHaveTextContent("Notion Other Prompt")
})

it("preserves direct standalone selection and keeps its selected Prompt while a Project is expanded", async () => {
  const user = userEvent.setup()
  renderSelected()
  await user.click(screen.getByRole("button", { name: "Open Standalone Session Independent Conversation" }))
  expect(screen.getByTestId("prompt-usage-entry-solo")).toHaveAttribute("aria-current", "page")
  expect(screen.queryByTestId("prompt-usage-project-summary")).toBeNull()
  expect(screen.queryByTestId("prompt-usage-details-column")).toBeNull()
  await user.click(screen.getByRole("button", { name: "Open Prompt: Independent Prompt" }))
  const inspector = screen.getByTestId("prompt-usage-details-column")
  await user.click(screen.getByRole("button", { name: "Open Project Notion" }))
  expect(screen.getByTestId("prompt-usage-entry-solo")).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("button", { name: "Collapse Prompt: Independent Prompt" })).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByTestId("prompt-usage-details-column")).toBe(inspector)
})
