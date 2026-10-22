import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const event = (second, type, payload) => JSON.stringify({ timestamp: `2026-10-22T09:00:${String(second).padStart(2, "0")}.000Z`, type, payload })
const measured = { input_tokens: 100_000_000, cached_input_tokens: 30_000_000, cache_write_input_tokens: 20_000_000, output_tokens: 10_000_000, total_tokens: 110_000_000 }
async function prompt(rates, measurement = measured) {
  const ctx = makeCtx()
  ctx.host.pricing = { lookup: () => rates }
  ctx.host.fs.writeText("~/.codex/sessions/priced.jsonl", [
    event(0, "session_meta", { id: "thread", cwd: "/tmp/synthetic-project" }),
    event(1, "event_msg", { type: "task_started", turn_id: "turn" }),
    event(1, "event_msg", { type: "user_message", message: "Synthetic pricing work" }),
    event(1, "turn_context", { turn_id: "turn", model: "synthetic-priced-model" }),
    event(2, "token_usage_record", { thread_id: "thread", turn_id: "turn", response_id: "request", usage: measurement }),
  ].join("\n"))
  await import("./plugin.js")
  return JSON.parse(globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines.find(line => line.label === "Prompt").subtitle)
}
beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Per-category pricing availability", () => {
  it("retains missing cache read/write prices as null and a partial known subtotal", async () => {
    const result = await prompt({ input: 2, output: 10, cacheRead: null, cacheWrite: null })
    expect(result.costUsd).toBe(200)
    expect(result.estimationStatus).toBe("partial_rate")
    expect(result.costLines[0]).toMatchObject({ rates: { input: 2, cacheRead: null, cacheWrite: null, output: 10 }, issues: ["missing_cache_read_price", "missing_cache_write_price"] })
  })

  it("preserves explicit zero cache prices as measured free categories", async () => {
    const result = await prompt({ input: 2, output: 10, cacheRead: 0, cacheWrite: 0 })
    expect(result.costUsd).toBe(200)
    expect(result.estimationStatus).toBe("current_rate")
    expect(result.costLines[0].issues).toEqual([])
  })

  it("does not mark an unused missing rate as an unpriced fee", async () => {
    const result = await prompt({ input: 2, output: 10, cacheRead: null, cacheWrite: null }, { ...measured, cached_input_tokens: 0, cache_write_input_tokens: 0 })
    expect(result.costUsd).toBe(300)
    expect(result.estimationStatus).toBe("current_rate")
    expect(result.costLines[0].issues).toEqual([])
  })
})
