import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const root = "~/.codex/sessions"
const at = second => `2026-10-22T09:00:${String(second).padStart(2, "0")}.000Z`
const event = (second, type, payload) => JSON.stringify({ timestamp: at(second), type, payload })
const usage = total => ({ input_tokens: total, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, total_tokens: total })
const start = (turn = "turn") => [
  event(0, "session_meta", { id: "thread", cwd: "/tmp/synthetic-project" }),
  event(1, "event_msg", { type: "task_started", turn_id: turn }),
  event(1, "event_msg", { type: "user_message", message: "Continue this synthetic work" }),
  event(1, "turn_context", { turn_id: turn, model: "gpt-5.5" }),
]
const request = (second, total, response, turn = "turn", model = "gpt-5.5") =>
  event(second, "token_usage_record", { thread_id: "thread", turn_id: turn, response_id: response, model, usage: usage(total) })

async function read(ctx) {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
    .filter(line => line.label === "Prompt").map(line => JSON.parse(line.subtitle))
}
function write(ctx, mode, name, records) {
  for (const suffix of mode === "both" ? [".jsonl", ".jsonl.zst"] : [mode]) {
    ctx.host.fs.writeText(`${root}/${name}${suffix}`, records.join("\n"))
  }
}
beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Same-turn continuation request reconciliation", () => {
  it.each([".jsonl", ".jsonl.zst", "both"])("unions disjoint requests and preserves index reread parity: %s", async mode => {
    const ctx = makeCtx()
    write(ctx, mode, "archive", [...start(), request(2, 7, "request-a")])
    write(ctx, mode, "continued", [...start(), request(3, 11, "request-b")])
    const prompts = await read(ctx)
    expect(prompts).toHaveLength(1)
    expect(prompts[0].usage.totalTokens).toBe(18)
    expect(await read(ctx)).toEqual(prompts)
  })

  it.each([".jsonl", ".jsonl.zst", "both"])("counts partial overlap once across models: %s", async mode => {
    const ctx = makeCtx()
    write(ctx, mode, "archive", [...start(), request(2, 7, "request-a"), request(3, 11, "request-b")])
    write(ctx, mode, "continued", [...start(), request(2, 7, "request-a"), request(4, 13, "request-c", "turn", "gpt-6-sol")])
    ctx.host.pricing = { lookup: model => ({ input: model === "gpt-5.5" ? 1 : 2, cacheRead: 0, cacheWrite: 0, output: 0 }) }
    const [prompt] = await read(ctx)
    expect(prompt.usage.totalTokens).toBe(31)
    expect(prompt.costLines.map(line => [line.model, line.tokens.input]).sort()).toEqual([["gpt-5.5", 18], ["gpt-6-sol", 13]])
    expect(prompt.costUsd).toBeCloseTo(44 / 1_000_000, 12)
    expect(await read(ctx)).toEqual([prompt])
  })

  it("preserves independent same-sized requests and copied-source deduplication", async () => {
    const ctx = makeCtx()
    const records = [...start(), request(2, 7, "request-a"), request(2, 7, "request-b")]
    write(ctx, "both", "same", records)
    expect((await read(ctx))[0].usage.totalTokens).toBe(14)
  })

  it("does not merge distinct durable turns with the same prompt", async () => {
    const ctx = makeCtx()
    write(ctx, ".jsonl", "first", [...start("first"), request(2, 7, "request-a", "first")])
    write(ctx, ".jsonl.zst", "second", [...start("second"), request(3, 11, "request-b", "second")])
    expect((await read(ctx)).map(prompt => prompt.usage.totalTokens).sort((a, b) => a - b)).toEqual([7, 11])
  })
})
