import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { scopeProjects } from "@/components/prompt-usage-project-scope"
import { dominantPromptUsageModel, parsePromptUsageSuffix } from "@/lib/prompt-usage"

function text(label: string, value: string, subtitle: string | null = null): MetricLine {
  return { type: "text", label, value, color: null, subtitle, resetExpiry: null }
}

const tokens = (totalTokens: number, inputTokens = totalTokens, cachedInputTokens = 0, outputTokens = 0, reasoningOutputTokens = 0) => ({
  totalTokens,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
})

const groupedLines = (): MetricLine[] => [
  { type: "progress", label: "Session", used: 24, limit: 100, format: { kind: "percent" }, resetsAt: null, periodDurationMs: null, color: null },
  text("Prompt Usage", "2 prompts · 1 session", "Attributed from local Codex session logs"),
  text("Project Group", "Example Project", JSON.stringify({ id: "project-1", kind: "project", latestAt: "2026-08-04T09:10:00Z", sessionCount: 1, promptCount: 2, isActive: true, codexOrder: 2 })),
  text("Session", "Continue Codex內容顯示原理", JSON.stringify({ id: "parent-session", latestAt: "2026-08-04T09:10:00Z", promptCount: 2, isActive: true, codexOrder: 4 })),
  text("Prompt", "Newest parent prompt", JSON.stringify({ id: "turn-1", startedAt: "2026-08-04T09:10:00Z", timeLabel: "17:10", usage: tokens(16_000, 11_000, 2_000, 5_000, 1_000), agentCount: 2 })),
  text("Agent", "Main Agent", JSON.stringify({ id: "parent-session", kind: "main", role: null, usage: tokens(12_000, 8_000, 2_000, 4_000, 1_000), models: [{ name: "GPT-5.6 Sol", usage: tokens(12_000, 8_000, 2_000, 4_000, 1_000) }] })),
  text("Agent", "Schrodinger", JSON.stringify({ id: "child-session", kind: "subagent", role: "subagent_Luna_max", usage: tokens(4_000, 3_000, 0, 1_000, 0), models: [{ name: "GPT-5.6 Luna", usage: tokens(4_000, 3_000, 0, 1_000, 0) }] })),
  text("Prompt", "Older parent prompt", JSON.stringify({ id: "turn-2", startedAt: "2026-08-04T09:00:00Z", timeLabel: "17:00", usage: tokens(2_000), agentCount: 1 })),
  text("Agent", "Main Agent", JSON.stringify({ id: "parent-session", kind: "main", role: null, usage: tokens(2_000), models: [{ name: "GPT-5", usage: tokens(2_000) }] })),
]

describe("parsePromptUsageSuffix", () => {
  it("preserves recorded completion timestamps and missing values", () => {
    const lines = groupedLines()
    const meta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[4] = text("Prompt", "Completed", JSON.stringify({ ...meta, completedAt: "2026-08-04T09:12:18Z" }))
    const turns = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns
    expect(turns[0].completedAt).toBe("2026-08-04T09:12:18Z")
    expect(turns[1].completedAt).toBeNull()
  })

  it("preserves Session quota query identity through date scoping without guessing missing creation time", () => {
    const lines = groupedLines()
    const meta = JSON.parse((lines[3] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[3] = text("Session", "Session", JSON.stringify({ ...meta, createdAt: "2026-07-01T08:00:00Z", descendantThreadIds: ["child", "grandchild", "child", "parent-session", null, 12] }))
    const olderMeta = JSON.parse((lines[7] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[7] = text("Prompt", "Older prompt", JSON.stringify({ ...olderMeta, startedAt: "2026-07-01T09:00:00Z" }))
    const parsed = parsePromptUsageSuffix(lines)
    const session = parsed.projects[0].sessions[0]
    expect(session.createdAt).toBe("2026-07-01T08:00:00Z")
    expect(session.descendantThreadIds).toEqual(["child", "grandchild"])
    const scoped = scopeProjects(parsed.projects, { type: "day", dateKey: "2026-08-04" }, [])
    expect(scoped[0].sessions[0].turns).toHaveLength(1)
    expect(scoped[0].sessions[0]).toMatchObject({ createdAt: session.createdAt, descendantThreadIds: session.descendantThreadIds })
    expect(parsePromptUsageSuffix(groupedLines()).projects[0].sessions[0].createdAt).toBeNull()
  })

  it("reads backend fee subtotals without deriving allocations from the total", () => {
    const lines = groupedLines()
    const meta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle!)
    const costBreakdown = { inputUsd: 0.2, cacheReadUsd: 0.02, cacheWriteUsd: 0, outputUsd: 0.1 }
    lines[4] = text("Prompt", "Partial price", JSON.stringify({ ...meta, costUsd: 0.32, estimationStatus: "partial_rate", costBreakdown }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]).toMatchObject({ costBreakdown, estimationStatus: "partial_rate" })
    lines[4] = text("Prompt", "Unknown price", JSON.stringify({ ...meta, costUsd: null, estimationStatus: "unknown", costBreakdown }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0].costBreakdown).toBeNull()
    lines[4] = text("Prompt", "Malformed breakdown", JSON.stringify({ ...meta, costUsd: 0.32, costBreakdown: { ...costBreakdown, inputUsd: null } }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0].costBreakdown).toBeNull()
    expect(parsePromptUsageSuffix(groupedLines()).projects[0].sessions[0].turns[0].costBreakdown).toBeUndefined()
  })

  it("preserves reported cache writes and distinct allowlisted reasoning settings", () => {
    const lines = groupedLines()
    const promptMeta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle!)
    const agentMeta = JSON.parse((lines[5] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[4] = text("Prompt", "Mixed effort", JSON.stringify({ ...promptMeta, reasoningEfforts: ["high", "xhigh", "high", "secret text"], usage: { ...promptMeta.usage, cacheWriteInputTokens: 400 } }))
    agentMeta.models[0].reasoningEfforts = ["high", "xhigh"]
    agentMeta.models[0].usage.cacheWriteInputTokens = 400
    lines[5] = text("Agent", "Main Agent", JSON.stringify(agentMeta))
    const turn = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]
    expect(turn.reasoningEfforts).toEqual(["high", "xhigh"])
    expect(turn.tokens.cacheWriteInputTokens).toBe(400)
    expect(turn.agents[0].models[0]).toMatchObject({ reasoningEfforts: ["high", "xhigh"], cacheWriteInputTokens: 400 })
    expect(turn.agents[1].models[0].reasoningEfforts).toEqual([])
    expect(turn.agents[1].tokens).not.toHaveProperty("cacheWriteInputTokens")
  })

  it("uses only explicit prompt activity, never session activity or list order", () => {
    const lines = groupedLines()
    const meta = JSON.parse((lines[7] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[7] = text("Prompt", "Running older-position prompt", JSON.stringify({ ...meta, isActive: true }))
    let turns = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns
    expect(turns.map((turn) => turn.isActive)).toEqual([false, true])
    lines[7] = text("Prompt", "Malformed status", JSON.stringify({ ...meta, isActive: "true" }))
    turns = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns
    expect(turns.every((turn) => !turn.isActive)).toBe(true)
  })

  it("preserves explicit interruption and usage evidence without coercing unknown metadata", () => {
    const lines = groupedLines()
    const meta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle!)
    lines[4] = text("Prompt", "Interrupted request", JSON.stringify({ ...meta, interrupted: true, tokenUsageRecorded: false, retriedFromStartedAt: "2026-08-30T01:32:02Z" }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]).toMatchObject({ interrupted: true, tokenUsageRecorded: false, retriedFromStartedAt: "2026-08-30T01:32:02Z" })
    lines[4] = text("Prompt", "Measured zero request", JSON.stringify({ ...meta, interrupted: false, tokenUsageRecorded: true, usage: tokens(0) }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]).toMatchObject({ interrupted: false, tokenUsageRecorded: true, tokens: tokens(0) })
    lines[4] = text("Prompt", "Invalid evidence", JSON.stringify({ ...meta, interrupted: "true", tokenUsageRecorded: "false" }))
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]).toMatchObject({ interrupted: undefined, tokenUsageRecorded: undefined })
  })

  it("parses Codex projects, named sessions, combined prompts, and agent token details", () => {
    const lines = groupedLines()
    const result = parsePromptUsageSuffix(lines)
    expect(result).toMatchObject({ hasPromptUsage: true, promptCount: 2, sessionCount: 1, error: null })
    expect(result.usageLines).toEqual([lines[0]])
    expect(result.projects[0]).toMatchObject({ id: "project-1", kind: "project", name: "Example Project", promptCount: 2, sessionCount: 1 })
    const session = result.projects[0].sessions[0]
    expect(result.projects[0].isActive).toBe(true)
    expect(result.projects[0].codexOrder).toBe(2)
    expect(session.isActive).toBe(true)
    expect(session.codexOrder).toBe(4)
    expect(session.title).toBe("Continue Codex內容顯示原理")
    expect(session.turns.map((turn) => turn.prompt)).toEqual(["Newest parent prompt", "Older parent prompt"])
    expect(session.turns[0].tokens.totalTokens).toBe(16_000)
    expect(session.turns[0].agents.map((agent) => agent.name)).toEqual(["Main Agent", "Schrodinger"])
    expect(session.turns[0].agents[0].models[0].cachedInputTokens).toBe(2_000)
  })

  it("preserves session, prompt, and agent pricing status without turning unknown into zero", () => {
    const lines = groupedLines()
    const sessionMeta = JSON.parse((lines[3] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    lines[3] = text("Session", "Continue Codex內容顯示原理", JSON.stringify({ ...sessionMeta, costUsd: 1.25, estimationStatus: "partial_rate" }))
    const promptMeta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    lines[4] = text("Prompt", "Newest parent prompt", JSON.stringify({ ...promptMeta, costUsd: null, estimationStatus: "unknown" }))
    const agentMeta = JSON.parse((lines[5] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    lines[5] = text("Agent", "Main Agent", JSON.stringify({ ...agentMeta, costUsd: 0.75, estimationStatus: "historical_rate" }))

    const session = parsePromptUsageSuffix(lines).projects[0].sessions[0]
    expect(session).toMatchObject({ costUsd: 1.25, estimationStatus: "partial_rate" })
    expect(session.turns[0]).toMatchObject({ costUsd: null, estimationStatus: "unknown" })
    expect(session.turns[0].agents[0]).toMatchObject({ costUsd: 0.75, estimationStatus: "historical_rate" })
  })

  it("keeps outgoing links on their prompt and incoming links on delegated prompts", () => {
    const lines = groupedLines()
    const outgoingMeta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    outgoingMeta.outgoingTasks = [{ id: "luna-1", title: "Luna Task" }, { id: "luna-2", title: "Second Luna Task" }]
    lines[4] = text("Prompt", "Newest parent prompt", JSON.stringify(outgoingMeta))
    const incomingMeta = JSON.parse((lines[7] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    incomingMeta.sourceThreadId = "source-session"
    incomingMeta.isDelegated = true
    lines[7] = text("Prompt", "Older parent prompt", JSON.stringify(incomingMeta))

    const result = parsePromptUsageSuffix(lines)
    const turns = result.projects[0].sessions[0].turns
    expect(turns[0].outgoingTasks).toEqual([
      { id: "luna-1", title: "Luna Task" },
      { id: "luna-2", title: "Second Luna Task" },
    ])
    expect(turns[1].outgoingTasks).toEqual([])
    expect(turns[1]).toMatchObject({ sourceThreadId: "source-session", isDelegated: true })
  })

  it("parses weekly quota observations while retaining decimal strings", () => {
    const lines = groupedLines()
    const promptMeta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    promptMeta.quotaObservation = {
      status: "measured",
      usedBefore: "0",
      usedAfter: "4.25",
      delta: "4.25",
      precision: 0.25,
      resetAt: "2026-08-11T00:00:00Z",
      subagentCount: "2",
      reason: null,
    }
    lines[4] = text("Prompt", "Newest parent prompt", JSON.stringify(promptMeta))

    const observation = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0].quotaObservation
    expect(observation).toEqual({
      status: "measured",
      usedBefore: "0",
      usedAfter: "4.25",
      delta: "4.25",
      precision: 0.25,
      resetAt: "2026-08-11T00:00:00Z",
      subagentCount: "2",
      reason: null,
    })
  })

  it("ignores malformed quota observations without invalidating Prompt Usage", () => {
    const lines = groupedLines()
    const promptMeta = JSON.parse((lines[4] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    promptMeta.quotaObservation = { status: "measured", usedBefore: { bad: true }, delta: "not-a-number" }
    lines[4] = text("Prompt", "Newest parent prompt", JSON.stringify(promptMeta))

    const result = parsePromptUsageSuffix(lines)
    expect(result.error).toBeNull()
    expect(result.projects[0].sessions[0].turns[0].quotaObservation).toBeNull()
  })

  it("accepts zero-token prompts and preserves explicit turn model identity", () => {
    const zero = tokens(0, 0, 0, 0, 0)
    const lines = [
      text("Prompt Usage", "1 prompt · 1 session"),
      text("Project Group", "Standalone Sessions", JSON.stringify({ id: "__standalone__", kind: "standalone", latestAt: "2026-08-04T09:10:00Z", sessionCount: 1, promptCount: 1 })),
      text("Session", "Untitled task", JSON.stringify({ id: "session-1", latestAt: "2026-08-04T09:10:00Z", promptCount: 1 })),
      text("Prompt", "Prompt before token accounting", JSON.stringify({ id: "turn-1", startedAt: "2026-08-04T09:10:00Z", timeLabel: "17:10", model: "gpt-5.6-sol", usage: zero, agentCount: 1 })),
      text("Agent", "Main Agent", JSON.stringify({ id: "session-1", kind: "main", role: null, usage: zero, models: [] })),
    ]
    const turn = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]
    expect(turn.tokens.totalTokens).toBe(0)
    expect(turn.model).toBe("gpt-5.6-sol")
    expect(turn.agents[0].name).toBe("Main Agent")
    expect(dominantPromptUsageModel(turn)).toEqual({
      name: "gpt-5.6-sol",
      canonicalName: "GPT-5.6 Sol",
      totalTokens: 0,
    })
  })

  it("keeps truly missing model identity unknown instead of using the agent name", () => {
    const zero = tokens(0, 0, 0, 0, 0)
    const lines = [
      text("Prompt Usage", "1 prompt · 1 session"),
      text("Project Group", "Standalone Sessions", JSON.stringify({ id: "__standalone__", kind: "standalone", latestAt: "2026-08-04T09:10:00Z", sessionCount: 1, promptCount: 1 })),
      text("Session", "Untitled task", JSON.stringify({ id: "session-1", latestAt: "2026-08-04T09:10:00Z", promptCount: 1 })),
      text("Prompt", "Prompt with no model metadata", JSON.stringify({ id: "turn-1", startedAt: "2026-08-04T09:10:00Z", timeLabel: "17:10", usage: zero, agentCount: 1 })),
      text("Agent", "Main Agent", JSON.stringify({ id: "session-1", kind: "main", role: null, usage: zero, models: [] })),
    ]
    const turn = parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0]
    expect(turn.model).toBeNull()
    expect(turn.agents[0].name).toBe("Main Agent")
    expect(dominantPromptUsageModel(turn)).toBeNull()
  })

  it("prefers token-backed dominant model attribution over the turn identity fallback", () => {
    const result = parsePromptUsageSuffix(groupedLines())
    const turn = result.projects[0].sessions[0].turns[0]
    turn.model = "gpt-5.6-terra"

    expect(dominantPromptUsageModel(turn)).toEqual({
      name: "GPT-5.6 Sol",
      canonicalName: "GPT-5.6 Sol",
      totalTokens: 12_000,
    })
  })

  it("rejects duplicate turn IDs within one session", () => {
    const lines = groupedLines()
    const duplicateMeta = JSON.parse((lines[7] as Extract<MetricLine, { type: "text" }>).subtitle ?? "{}")
    lines[7] = text("Prompt", "Duplicate turn", JSON.stringify({ ...duplicateMeta, id: "turn-1" }))

    const result = parsePromptUsageSuffix(lines)

    expect(result.projects).toEqual([])
    expect(result.promptCount).toBe(0)
    expect(result.error).toMatch(/could not be parsed/i)
    expect(result.usageLines).toEqual([lines[0]])
  })

  it("keeps same-text prompts with distinct turn IDs", () => {
    const lines = groupedLines()
    const distinctMeta = (lines[7] as Extract<MetricLine, { type: "text" }>).subtitle
    lines[7] = text("Prompt", "Newest parent prompt", distinctMeta)

    const result = parsePromptUsageSuffix(lines)
    const turns = result.projects[0].sessions[0].turns

    expect(result.error).toBeNull()
    expect(turns.map((turn) => turn.id)).toEqual(["turn-1", "turn-2"])
    expect(turns.map((turn) => turn.prompt)).toEqual(["Newest parent prompt", "Newest parent prompt"])
  })

  it("isolates malformed Prompt Usage data from the normal Usage tab", () => {
    const lines = groupedLines()
    lines[1] = text("Prompt Usage", "4 prompts · 2 sessions")
    const result = parsePromptUsageSuffix(lines)
    expect(result.hasPromptUsage).toBe(true)
    expect(result.usageLines).toEqual([lines[0]])
    expect(result.projects).toEqual([])
    expect(result.error).toMatch(/could not be parsed/i)
  })

  it("leaves lines unchanged when no Prompt Usage suffix exists", () => {
    const lines = [text("Today", "12K tokens")]
    expect(parsePromptUsageSuffix(lines)).toMatchObject({ hasPromptUsage: false, usageLines: lines, error: null })
  })
})
