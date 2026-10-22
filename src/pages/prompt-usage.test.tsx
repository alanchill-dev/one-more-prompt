import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PromptUsagePage } from "@/pages/prompt-usage"
import type { MetricLine, PluginDisplayState } from "@/lib/plugin-types"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

const signInRequired = "Open Codex and sign in to continue."

function historyLines(): MetricLine[] {
  const now = new Date().toISOString()
  const usage = { totalTokens: 10, inputTokens: 8, cachedInputTokens: 0, outputTokens: 2, reasoningOutputTokens: 0 }
  return [
    { type: "text", label: "Prompt Usage", value: "1 prompt · 1 session" },
    { type: "text", label: "Project Group", value: "Existing Project", subtitle: JSON.stringify({ id: "project-1", kind: "project", sessionCount: 1, promptCount: 1, latestAt: now }) },
    { type: "text", label: "Session", value: "Existing Session", subtitle: JSON.stringify({ id: "session-1", promptCount: 1, latestAt: now }) },
    { type: "text", label: "Prompt", value: "Existing prompt", subtitle: JSON.stringify({ id: "turn-1", startedAt: now, usage }) },
    { type: "text", label: "Agent", value: "Main Agent", subtitle: JSON.stringify({ id: "agent-1", kind: "main", usage, models: [{ name: "GPT-5.6 Sol", usage }] }) },
  ]
}

beforeEach(() => {
  useAppPreferencesStore.getState().resetState()
  useAppUiStore.getState().resetState()
})

describe("PromptUsagePage first use", () => {
  it.each(["hierarchy", "timeline"] as const)("guides preparation for the expected initial sign-in state in %s", (mode) => {
    useAppUiStore.getState().setPromptUsageViewMode(mode)
    const onRetryPlugin = vi.fn()
    const plugin = { data: null, loading: false, error: signInRequired } as PluginDisplayState
    const { rerender } = render(<PromptUsagePage plugin={plugin} onRetryPlugin={onRetryPlugin} />)
    expect(screen.getByTestId("codex-empty-state")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onRetryPlugin).toHaveBeenCalledWith("codex")

    rerender(<PromptUsagePage plugin={{ ...plugin, loading: true }} onRetryPlugin={onRetryPlugin} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Loading Prompt Usage")
  })

  it.each(["hierarchy", "timeline"] as const)("preserves actual errors, parser errors, and existing history in %s", (mode) => {
    useAppUiStore.getState().setPromptUsageViewMode(mode)
    const plugin = { data: null, loading: false, error: "Network request failed." } as PluginDisplayState
    const { rerender } = render(<PromptUsagePage plugin={plugin} />)
    for (const error of ["Network request failed.", "Session expired. Sign in again.", "Cannot read local records."]) {
      rerender(<PromptUsagePage plugin={{ ...plugin, error }} />)
      expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
      expect(screen.getByRole("alert")).toHaveTextContent(error)
    }

    const data = { providerId: "codex", displayName: "Codex", iconUrl: "", lines: [{ type: "text", label: "Prompt Usage", value: "Invalid counts" } as MetricLine] }
    rerender(<PromptUsagePage plugin={{ ...plugin, error: signInRequired, data }} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Prompt Usage data could not be parsed.")

    rerender(<PromptUsagePage plugin={{ ...plugin, error: signInRequired, data: { ...data, lines: historyLines() } }} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(signInRequired)
    expect(screen.getByTestId("prompt-usage-panel")).toBeInTheDocument()
  })

  it("passes the real Codex retry action through both project and Timeline browsers", () => {
    const onRetryPlugin = vi.fn()
    render(<PromptUsagePage plugin={null} onRetryPlugin={onRetryPlugin} />)

    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onRetryPlugin).toHaveBeenLastCalledWith("codex")

    act(() => useAppUiStore.getState().setPromptUsageViewMode("timeline"))
    fireEvent.click(screen.getByRole("button", { name: "Check For Records" }))
    expect(onRetryPlugin).toHaveBeenCalledTimes(2)
    expect(onRetryPlugin).toHaveBeenLastCalledWith("codex")
  })

  it.each(["hierarchy", "timeline"] as const)("preserves loading and errors before first use in %s", (mode) => {
    useAppUiStore.getState().setPromptUsageViewMode(mode)
    const plugin = { data: null, loading: true, error: null } as PluginDisplayState
    const { rerender } = render(<PromptUsagePage plugin={plugin} onRetryPlugin={vi.fn()} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Loading Prompt Usage")

    rerender(<PromptUsagePage plugin={{ ...plugin, loading: false, error: "Local records could not be read." }} onRetryPlugin={vi.fn()} />)
    expect(screen.queryByTestId("codex-empty-state")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Local records could not be read.")
  })
})
