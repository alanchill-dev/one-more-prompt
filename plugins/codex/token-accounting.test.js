import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const event = (second, type, payload) => JSON.stringify({ timestamp: `2026-09-07T09:03:${String(second).padStart(2, "0")}.000Z`, type, payload })
const context = (second, effort, model = "gpt-6-astra") => event(second, "turn_context", { turn_id: "turn", model, ...(effort ? { effort } : {}) })
const usage = (input, cached, written, output = 10) => ({ input_tokens: input, cached_input_tokens: cached, ...(written == null ? {} : { cache_write_input_tokens: written }), output_tokens: output, reasoning_output_tokens: 5 })
const measurement = (second, last, total) => event(second, "event_msg", { type: "token_count", info: { last_token_usage: last, total_token_usage: total } })
async function probe(events, rates = { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 }, childEvents = []) {
  const ctx = makeCtx()
  ctx.host.pricing = { lookup: vi.fn((model) => typeof rates === "function" ? rates(model) : rates) }
  ctx.host.fs.writeText("~/.codex/sessions/2026/09/07/accounting.jsonl", [
    event(0, "session_meta", { id: "session", cwd: "/tmp/project" }),
    event(1, "event_msg", { type: "task_started", turn_id: "turn" }),
    event(2, "event_msg", { type: "user_message", message: "Measure this work" }),
    ...events,
  ].join("\n"))
  if (childEvents.length) ctx.host.fs.writeText("~/.codex/sessions/2026/09/07/child.jsonl", childEvents.join("\n"))
  await import("./plugin.js")
  const read = () => globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
  const lines = read()
  expect(read()).toEqual(lines) // Historical index round-trip preserves metadata.
  return {
    prompt: JSON.parse(lines.find((line) => line.label === "Prompt").subtitle),
    session: JSON.parse(lines.find((line) => line.label === "Session").subtitle),
    agents: lines.filter((line) => line.label === "Agent").map((line) => JSON.parse(line.subtitle)),
    agent: JSON.parse(lines.find((line) => line.label === "Agent").subtitle),
  }
}
beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Codex request accounting", () => {
  it("combines known fees across models and child agents while retaining partial status", async () => {
    const { prompt, session, agents } = await probe([
      context(3, "high"), measurement(4, usage(100, 20, 40)),
      context(5, "medium", "unknown-model"), measurement(6, usage(100, 0, 0)),
      event(7, "event_msg", { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" }),
    ], (model) => model === "unknown-model" ? null : { input: model === "gpt-5.6-luna" ? 4 : 2, cacheRead: model === "gpt-5.6-luna" ? 0.4 : 0.2, cacheWrite: 2.5, output: model === "gpt-5.6-luna" ? 20 : 10 }, [
      event(8, "session_meta", { id: "child", cwd: "/tmp/project", parent_thread_id: "session", thread_source: "subagent" }),
      event(9, "event_msg", { type: "task_started", turn_id: "child-turn" }),
      event(10, "turn_context", { turn_id: "child-turn", model: "gpt-5.6-luna", effort: "low" }),
      event(11, "event_msg", { type: "user_message", message: "Child work" }),
      measurement(12, usage(50, 10, 0, 5)),
    ])
    expect(agents).toHaveLength(2)
    expect(prompt.estimationStatus).toBe("partial_rate")
    expect(prompt.costBreakdown.inputUsd).toBeCloseTo(0.00024, 10)
    expect(prompt.costBreakdown.cacheReadUsd).toBeCloseTo(0.000008, 10)
    expect(prompt.costBreakdown.cacheWriteUsd).toBe(0.0001)
    expect(prompt.costBreakdown.outputUsd).toBe(0.0002)
    expect(Object.values(prompt.costBreakdown).reduce((sum, fee) => sum + fee, 0)).toBe(prompt.costUsd)
    for (const key of Object.keys(prompt.costBreakdown)) expect(prompt.costBreakdown[key]).toBeCloseTo(agents.reduce((sum, agent) => sum + agent.costBreakdown[key], 0), 10)
    expect(session.costBreakdown).toEqual(prompt.costBreakdown)
  })

  it.each(["unknown-model", "codex-auto-review"])("distinguishes unknown pricing from ignored internal usage: %s", async (model) => {
    const { prompt } = await probe([context(3, "low", model), measurement(4, usage(100, 0, 0))], null)
    if (model === "unknown-model") {
      expect(prompt.costUsd).toBeNull()
      expect(prompt.costBreakdown).toBeNull()
    } else {
      expect(prompt.costUsd).toBe(0)
      expect(prompt.costBreakdown).toEqual({ inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 })
    }
  })

  it("does not recount an unchanged snapshot when write metadata first becomes available", async () => {
    const { prompt } = await probe([context(3, "low"), measurement(4, usage(100, 0), usage(100, 0)), measurement(5, usage(100, 0, 0), usage(100, 0, 0))])
    expect(prompt.usage.totalTokens).toBe(110)
  })

  it("marks a write sum incomplete when requests mix reported and missing writes", async () => {
    const { prompt } = await probe([context(3, "high"), measurement(4, usage(100, 0, 20)), measurement(5, usage(100, 0))])
    expect(prompt.usage).toMatchObject({ cacheWriteInputTokens: 20, cacheWriteInputTokensComplete: false })
    expect(prompt.estimationStatus).toBe("partial_rate")
  })

  it("retains zero measurement evidence on a new turn with unchanged cumulative totals", async () => {
    const a = usage(100, 0, 0)
    const { prompt } = await probe([context(3, "low"), measurement(4, a, a),
      event(5, "event_msg", { type: "task_started", turn_id: "next" }),
      event(6, "event_msg", { type: "user_message", message: "Zero usage" }),
      measurement(7, { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, a),
    ])
    expect(prompt).toMatchObject({ id: "next", tokenUsageRecorded: true, usage: { totalTokens: 0 } })
  })

  it("charges first input, cache reads and post-compaction writes inside one prompt", async () => {
    const { prompt, agent } = await probe([
      context(3, "high"),
      measurement(4, usage(100, 0, 0)),
      measurement(5, usage(100, 100, 0)),
      context(6, "xhigh"),
      measurement(7, usage(80, 20, 40)),
    ])
    expect(prompt.usage).toMatchObject({ inputTokens: 280, cachedInputTokens: 120, cacheWriteInputTokens: 40, outputTokens: 30, reasoningOutputTokens: 15, totalTokens: 310 })
    expect(prompt.costUsd).toBeCloseTo((120 * 2 + 120 * 0.2 + 40 * 2.5 + 30 * 10) / 1e6, 10)
    expect(prompt.reasoningEfforts).toEqual(["high", "xhigh"])
    expect(agent.models).toHaveLength(1)
    expect(agent.models[0].reasoningEfforts).toEqual(["high", "xhigh"])
  })

  it("counts changed cumulative snapshots once and restarts a decreased counter", async () => {
    const a = usage(100, 0, 0)
    const b = usage(30, 20, 0)
    const { prompt } = await probe([context(3, "low"), measurement(4, a, a), measurement(5, a, a), measurement(6, null, b), measurement(7, null, usage(60, 40, 0, 20))])
    expect(prompt.usage).toMatchObject({ inputTokens: 160, cachedInputTokens: 40, outputTokens: 30, totalTokens: 190 })
  })

  it("does not infer a missing effort or transfer it to a different model", async () => {
    const { prompt, agent } = await probe([context(3, "high"), measurement(4, usage(10, 0)), context(5, null, "gpt-5.6-luna"), measurement(6, usage(10, 0))])
    expect(prompt.reasoningEfforts).toEqual(["high"])
    expect(agent.models.find((model) => model.name === "gpt-5.6-luna").reasoningEfforts).toEqual([])
    expect(prompt.usage).not.toHaveProperty("cacheWriteInputTokens")
  })

  it("does not claim a complete price when a nonzero write has no write rate", async () => {
    const { prompt } = await probe([context(3, "low"), measurement(4, usage(100, 20, 40))], { input: 2, cacheRead: 0.2, output: 10 })
    expect(prompt.costUsd).toBeCloseTo((40 * 2 + 20 * 0.2 + 10 * 10) / 1e6, 10)
    expect(prompt.estimationStatus).toBe("partial_rate")
    expect(prompt.costBreakdown).toEqual({ inputUsd: 0.00008, cacheReadUsd: 0.000004, cacheWriteUsd: 0, outputUsd: 0.0001 })
    expect(Object.values(prompt.costBreakdown).reduce((sum, fee) => sum + fee, 0)).toBe(prompt.costUsd)
  })
})
