import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const event = (second, type, payload) => JSON.stringify({ timestamp: `2026-09-07T09:03:${String(second).padStart(2, "0")}.000Z`, type, payload })
const usage = (written = 40) => ({ input_tokens: 100, cached_input_tokens: 20, ...(written == null ? {} : { cache_write_input_tokens: written }), output_tokens: 10, reasoning_output_tokens: 5 })
const context = (second, model) => event(second, "turn_context", { turn_id: "turn", model })
const measurement = (second, tokens = usage()) => event(second, "event_msg", { type: "token_count", info: { last_token_usage: tokens } })
const rates = { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10, estimationStatus: "historical_rate", observedAt: "2026-09-01T00:00:00Z" }
async function probe(events, lookup = () => rates, childEvents = []) {
  const ctx = makeCtx()
  ctx.host.pricing = { lookup: vi.fn(lookup) }
  ctx.host.fs.writeText("~/.codex/sessions/2026/09/07/cost-lines.jsonl", [
    event(0, "session_meta", { id: "session", cwd: "/tmp/project" }),
    event(1, "event_msg", { type: "task_started", turn_id: "turn" }),
    event(2, "event_msg", { type: "user_message", message: "Measure" }), ...events,
  ].join("\n"))
  if (childEvents.length) ctx.host.fs.writeText("~/.codex/sessions/2026/09/07/child.jsonl", childEvents.join("\n"))
  await import("./plugin.js")
  const read = () => globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
  const lines = read()
  expect(read()).toEqual(lines)
  return Object.fromEntries(["Session", "Prompt", "Agent"].map(label => [label.toLowerCase(), lines.filter(line => line.label === label).map(line => JSON.parse(line.subtitle))]))
}
const lineTotal = lines => lines.reduce((sum, line) => sum + (line.costUsd ?? 0), 0)
beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Codex model cost calculation ledger", () => {
  it("retains the exact lookup and four billed categories without recounting reasoning", async () => {
    const result = await probe([context(3, "gpt-6-astra"), measurement(4)])
    const line = result.prompt[0].costLines[0]
    expect(line).toEqual({ model: "gpt-6-astra", tokens: { input: 40, cacheRead: 20, cacheWrite: 40, output: 10 }, rates: { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 }, fees: { inputUsd: 0.00008, cacheReadUsd: 0.000004, cacheWriteUsd: 0.0001, outputUsd: 0.0001 }, costUsd: 0.000284, estimationStatus: "historical_rate", observedAt: rates.observedAt, issues: [] })
    for (const level of Object.values(result)) for (const estimate of level) expect(lineTotal(estimate.costLines)).toBeCloseTo(estimate.costUsd, 12)
  })

  it("retains unknown and excluded models instead of fabricating zero-price items", async () => {
    const result = await probe([context(3, "gpt-6-astra"), measurement(4), context(5, "unknown-model"), measurement(6), context(7, "codex-auto-review"), measurement(8)], model => model === "gpt-6-astra" ? rates : null)
    expect(result.prompt[0].estimationStatus).toBe("partial_rate")
    expect(result.prompt[0].costLines).toHaveLength(3)
    expect(result.prompt[0].costLines[1]).toMatchObject({ model: "unknown-model", tokens: { input: 40, cacheRead: 20, cacheWrite: 40, output: 10 }, costUsd: null, estimationStatus: "unknown", rates: { input: null, cacheRead: null, cacheWrite: null, output: null }, issues: ["missing_price"] })
    expect(result.prompt[0].costLines[2]).toMatchObject({ model: "codex-auto-review", costUsd: 0, issues: ["excluded_internal_model"] })
    expect(result.session[0].costLines).toEqual(result.prompt[0].costLines)
    expect(lineTotal(result.prompt[0].costLines)).toBeCloseTo(result.prompt[0].costUsd, 12)
  })

  it("preserves missing write price and incomplete write metadata as distinct issues", async () => {
    const result = await probe([context(3, "gpt-6-astra"), measurement(4), measurement(5, usage(null))], () => ({ ...rates, cacheWrite: null }))
    const line = result.prompt[0].costLines[0]
    expect(line).toMatchObject({ tokens: { input: 120, cacheRead: 40, cacheWrite: 40, output: 20 }, rates: { cacheWrite: null }, fees: { cacheWriteUsd: 0 }, estimationStatus: "partial_rate", issues: ["missing_cache_write_price", "incomplete_cache_write_usage"] })
    expect(lineTotal(result.prompt[0].costLines)).toBeCloseTo(result.prompt[0].costUsd, 12)
  })

  it("merges a delegated child's identical rates once into its parent ledger", async () => {
    const result = await probe([context(3, "gpt-6-astra"), measurement(4), event(7, "event_msg", { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" })], () => rates, [
      event(8, "session_meta", { id: "child", cwd: "/tmp/project", parent_thread_id: "session", thread_source: "subagent" }),
      event(9, "event_msg", { type: "task_started", turn_id: "child-turn" }),
      event(10, "turn_context", { turn_id: "child-turn", model: "gpt-6-astra" }),
      event(11, "event_msg", { type: "user_message", message: "Child work" }), measurement(12),
    ])
    expect(result.agent).toHaveLength(2)
    expect(result.prompt[0].costLines).toHaveLength(1)
    expect(result.prompt[0].costLines[0].tokens).toEqual({ input: 80, cacheRead: 40, cacheWrite: 80, output: 20 })
    expect(result.prompt[0].costUsd).toBeCloseTo(result.agent.reduce((sum, agent) => sum + agent.costUsd, 0), 12)
    expect(result.session[0].costLines).toEqual(result.prompt[0].costLines)
  })

  it("regenerates lookup details even when the historical log index is unchanged", async () => {
    let currentRates = rates
    const ctx = makeCtx()
    ctx.host.pricing = { lookup: () => currentRates }
    ctx.host.fs.writeText("~/.codex/sessions/2026/09/07/fresh.jsonl", [event(0, "session_meta", { id: "session", cwd: "/tmp/project" }), event(1, "event_msg", { type: "task_started", turn_id: "turn" }), event(2, "event_msg", { type: "user_message", message: "Measure" }), context(3, "gpt-6-astra"), measurement(4)].join("\n"))
    await import("./plugin.js")
    const read = () => JSON.parse(globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines.find(line => line.label === "Prompt").subtitle)
    expect(read().costLines[0].rates.input).toBe(2)
    currentRates = { ...rates, input: 4, observedAt: "2026-10-16T00:00:00Z" }
    expect(read().costLines[0]).toMatchObject({ rates: { input: 4 }, observedAt: currentRates.observedAt })
  })
})
