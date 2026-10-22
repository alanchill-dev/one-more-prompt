import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const root = "~/.codex/sessions/2026/10/03"
const cachePath = "/tmp/one-more-prompt-test/plugin/prompt-usage-index-v2.json"
const at = (second) => `2026-10-03T15:55:${String(second).padStart(2, "0")}.000Z`
const event = (second, type, payload) => JSON.stringify({ timestamp: at(second), type, payload })
const usage = (total) => ({ input_tokens: total, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: total })
const start = (id = "turn", second = 1, text = "Audit this work") => [
  event(second, "event_msg", { type: "task_started", turn_id: id }),
  event(second, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text }] }),
  event(second, "turn_context", { turn_id: id, model: "gpt-6-sol" }),
]
const meta = event(0, "session_meta", { id: "thread", cwd: "/tmp/project" })
const legacy = (second, last, total = last) => event(second, "event_msg", { type: "token_count", info: { last_token_usage: usage(last), total_token_usage: usage(total) } })
const request = (second, total, response = "response", thread = "thread", turn = "turn") => event(second, "token_usage_record", { thread_id: thread, turn_id: turn, response_id: response, usage: usage(total) })
const write = (ctx, file, events) => ctx.host.fs.writeText(`${root}/${file}`, [meta, ...events].join("\n"))
async function load(ctx) {
  await import("./plugin.js")
  const lines = globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
  return { lines, prompts: lines.filter((line) => line.label === "Prompt").map((line) => ({ text: line.value, ...JSON.parse(line.subtitle) })) }
}

beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Compressed Codex history", () => {
  it("collects both formats and keeps provisional IDs stable after compression", async () => {
    const ctx = makeCtx()
    const records = [event(1, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Legacy prompt" }] }), legacy(2, 7)]
    write(ctx, "original.jsonl", records)
    const before = await load(ctx)
    write(ctx, "original.jsonl.zst", records)
    const list = ctx.host.fs.listDir
    ctx.host.fs.listDir = (dir) => list(dir).filter((name) => name !== "original.jsonl")
    const after = await load(ctx)
    expect(after).toEqual(before)
    expect(Object.keys(JSON.parse(ctx.host.fs.readText(cachePath)).files)).toEqual([`${root}/original.jsonl.zst`])
  })

  it("deduplicates identical coexisting formats while retaining distinct continuation files", async () => {
    const ctx = makeCtx()
    const original = [...start("first"), legacy(2, 7)]
    write(ctx, "original.jsonl", original)
    write(ctx, "original.jsonl.zst", original)
    write(ctx, "continuation.jsonl.zst", [...start("next", 3, "Continue the work"), legacy(4, 11)])
    const result = await load(ctx)
    expect(result.prompts.map((prompt) => [prompt.id, prompt.usage.totalTokens])).toEqual([["next", 11], ["first", 7]])
    expect(result.lines.find((line) => line.label === "Prompt Usage").value).toBe("2 prompts · 1 session")
    expect(await load(ctx)).toEqual(result)
  })

  it("counts all source files and reports compressed read failures without hiding progress", async () => {
    const ctx = makeCtx()
    write(ctx, "plain.jsonl", start("first"))
    write(ctx, "broken.jsonl.zst", start("broken"))
    ctx.host.scanProgress = vi.fn()
    const read = ctx.host.fs.readCodexSessionEvents
    ctx.host.fs.readCodexSessionEvents = (file) => {
      if (file.endsWith("broken.jsonl.zst")) throw new Error("Invalid Zstandard stream")
      return read(file)
    }
    await expect(load(ctx)).rejects.toThrow("Unable to read Codex session history (broken.jsonl.zst)")
    expect(ctx.host.scanProgress.mock.calls).toEqual([["reading", 0, 2], ["reading", 1, 2]])
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("broken.jsonl.zst: Error: Invalid Zstandard stream"))
  })

  it("invalidates the old index and drops removed sources when rebuilding", async () => {
    const ctx = makeCtx()
    write(ctx, "current.jsonl", [...start(), legacy(2, 9)])
    await load(ctx)
    const old = JSON.parse(ctx.host.fs.readText(cachePath))
    old.version = 24
    old.files[`${root}/current.jsonl`].session.turns[0].usage.totalTokens = 123456
    old.files[`${root}/removed.jsonl.zst`] = old.files[`${root}/current.jsonl`]
    ctx.host.fs.writeText(cachePath, JSON.stringify(old))
    expect((await load(ctx)).prompts[0].usage.totalTokens).toBe(9)
    const rebuilt = JSON.parse(ctx.host.fs.readText(cachePath))
    expect(rebuilt.version).toBe(26)
    expect(Object.keys(rebuilt.files)).toEqual([`${root}/current.jsonl`])
  })

  it("does not fall back to reading compressed bytes as text without a native decoder", async () => {
    const ctx = makeCtx()
    write(ctx, "compressed.jsonl.zst", start())
    delete ctx.host.fs.readCodexSessionEvents
    await expect(load(ctx)).rejects.toThrow("Compressed Codex history requires the native session reader")
  })

  it("does not present an older cached source as a successful scan after a failed reread", async () => {
    const ctx = makeCtx()
    write(ctx, "cached.jsonl.zst", [...start(), legacy(2, 7)])
    await load(ctx)
    const previousIndex = ctx.host.fs.readText(cachePath)
    write(ctx, "cached.jsonl.zst", [...start(), legacy(3, 11)])
    ctx.host.fs.readCodexSessionEvents = () => { throw new Error("Truncated frame") }
    ctx.host.scanProgress = vi.fn()
    await expect(load(ctx)).rejects.toThrow("Truncated frame")
    expect(ctx.host.scanProgress.mock.calls).toEqual([["reading", 0, 1]])
    expect(ctx.host.fs.readText(cachePath)).toBe(previousIndex)
  })
})

describe("Request record and legacy accounting compatibility", () => {
  it("retains real request usage when its paired legacy counter is stale", async () => {
    const ctx = makeCtx()
    write(ctx, "requests.jsonl.zst", [...start(), request(2, 4669274, "prior"), legacy(2, 4669274),
      event(3, "token_usage_record", { thread_id: "thread", turn_id: "turn", response_id: "new", usage: { ...usage(261420), input_tokens: 252649, output_tokens: 8771 } }),
      event(3, "event_msg", { type: "token_count", info: { last_token_usage: { ...usage(27489), input_tokens: 0 }, total_token_usage: usage(4669274) } }),
    ])
    const result = await load(ctx)
    expect(result.prompts[0]).toMatchObject({ tokenUsageRecorded: true, usage: { inputTokens: 4921923, outputTokens: 8771, totalTokens: 4930694 } })
    expect(await load(ctx)).toEqual(result)
  })

  it("keeps legacy-only segments before and after new records without double counting their partners", async () => {
    const ctx = makeCtx()
    write(ctx, "mixed.jsonl", [...start(), legacy(2, 10), request(3, 20), legacy(3, 20, 30), legacy(4, 5, 35)])
    expect((await load(ctx)).prompts[0].usage.totalTokens).toBe(35)
  })

  it("keeps paired accounting across intervening tool output", async () => {
    const ctx = makeCtx()
    write(ctx, "tool-output.jsonl", [...start(), request(2, 7),
      event(2, "response_item", { type: "custom_tool_call_output", call_id: "other-tool", output: "Tool result" }), legacy(2, 7),
    ])
    expect((await load(ctx)).prompts[0].usage.totalTokens).toBe(7)
  })

  it.each([".jsonl", ".jsonl.zst"])("keeps a request partner across quota-only records and preserves later cumulative growth: %s", async (suffix) => {
    for (const info of [null, {}, { last_token_usage: { input_tokens: "unavailable" } }]) {
      const ctx = makeCtx()
      const records = [...start(), request(2, 7),
        event(2, "event_msg", { type: "token_count", info, rate_limits: { primary: { used_percent: 8 } } }),
        legacy(3, 7),
      ]
      write(ctx, `quota-partner${suffix}`, records)
      const first = await load(ctx)
      expect(first.prompts[0].usage.totalTokens).toBe(7)
      expect(await load(ctx)).toEqual(first)

      // The skipped measured counterpart must still establish the cumulative
      // baseline, so a later total of 12 adds only the five new tokens.
      write(ctx, `quota-partner${suffix}`, [...records,
        event(4, "event_msg", { type: "token_count", info: { total_token_usage: usage(12) } }),
      ])
      const grown = await load(ctx)
      expect(grown.prompts[0].usage.totalTokens).toBe(12)
      expect(await load(ctx)).toEqual(grown)
    }
  })

  it("deduplicates response identity but counts distinct equal requests at one timestamp", async () => {
    const ctx = makeCtx()
    write(ctx, "duplicates.jsonl", [...start(), request(2, 7, "a"), legacy(2, 7), request(2, 7, "a"), legacy(2, 7), request(2, 7, "b"), legacy(2, 7, 14)])
    expect((await load(ctx)).prompts[0].usage.totalTokens).toBe(14)
  })

  it("excludes foreign request records and their legacy partner without corrupting the local cumulative baseline", async () => {
    const ctx = makeCtx()
    write(ctx, "foreign.jsonl.zst", [...start(), legacy(2, 10), request(3, 100, "foreign", "other-thread"), legacy(3, 100),
      event(4, "event_msg", { type: "token_count", info: { total_token_usage: usage(15) } }),
    ])
    expect((await load(ctx)).prompts[0].usage.totalTokens).toBe(15)
  })

  it("does not suppress a new turn's legacy-only measurement when a request has no legacy partner", async () => {
    const ctx = makeCtx()
    write(ctx, "unpaired.jsonl", [...start("first"), request(2, 7, "a", "thread", "first"), ...start("next", 3), legacy(4, 11)])
    expect((await load(ctx)).prompts.map((prompt) => [prompt.id, prompt.usage.totalTokens])).toEqual([["next", 11], ["first", 7]])
  })

  it("routes delayed requests to their own turn and model", async () => {
    const ctx = makeCtx()
    write(ctx, "delayed.jsonl", [...start("first"), ...start("next", 2), event(2, "turn_context", { turn_id: "next", model: "gpt-6-luna" }),
      request(3, 7, "late", "thread", "first"), legacy(3, 7), request(4, 11, "current", "thread", "next"), legacy(4, 11, 18),
    ])
    const prompts = (await load(ctx)).prompts
    expect(prompts.find((prompt) => prompt.id === "first")).toMatchObject({ model: "gpt-6-sol", usage: { totalTokens: 7 } })
    expect(prompts.find((prompt) => prompt.id === "next")).toMatchObject({ model: "gpt-6-luna", usage: { totalTokens: 11 } })
  })

  it("keeps the current model context when an earlier turn's request arrives late", async () => {
    const ctx = makeCtx()
    write(ctx, "late-context.jsonl", [...start("first"), ...start("next", 2), event(2, "turn_context", { turn_id: "next", model: "gpt-6-luna" }),
      request(3, 7, "late", "thread", "first"), legacy(3, 7), legacy(4, 11, 18),
    ])
    const result = await load(ctx)
    const agents = result.lines.filter((line) => line.label === "Agent").map((line) => JSON.parse(line.subtitle))
    expect(agents[0].models.map((model) => model.name)).toEqual(["gpt-6-luna"])
  })

  it("preserves request cache fields, reasoning and API fee arithmetic", async () => {
    const ctx = makeCtx()
    ctx.host.pricing = { lookup: vi.fn(() => ({ input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 })) }
    const measured = { input_tokens: 100, cached_input_tokens: 30, cache_write_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 }
    write(ctx, "priced.jsonl.zst", [...start(), event(2, "turn_context", { turn_id: "turn", model: "gpt-6-sol", effort: "high" }),
      event(3, "token_usage_record", { thread_id: "thread", turn_id: "turn", response_id: "priced", usage: measured }), legacy(3, 110),
    ])
    const result = await load(ctx)
    expect(result.prompts[0]).toMatchObject({ reasoningEfforts: ["high"], usage: { inputTokens: 100, cachedInputTokens: 30, cacheWriteInputTokens: 20, cacheWriteInputTokensComplete: true, outputTokens: 10, reasoningOutputTokens: 5, totalTokens: 110 } })
    expect(result.prompts[0].costUsd).toBeCloseTo(0.000256, 12)
    expect(result.prompts[0].costBreakdown).toEqual({ inputUsd: 0.0001, cacheReadUsd: 0.000006, cacheWriteUsd: 0.00005, outputUsd: 0.0001 })
  })

  it("keeps a compressed child's own identity when the second metadata belongs to its parent", async () => {
    const ctx = makeCtx()
    write(ctx, "parent.jsonl", [...start(), legacy(2, 100)])
    ctx.host.fs.writeText(`${root}/child.jsonl.zst`, [
      event(0, "session_meta", { id: "child", cwd: "/tmp/project", parent_thread_id: "thread", thread_source: "subagent" }), meta,
      ...start("child-turn", 3), request(4, 5, "child-response", "child", "child-turn"), legacy(4, 5), request(5, 999, "foreign", "thread", "turn"), legacy(5, 999),
    ].join("\n"))
    const result = await load(ctx)
    expect(result.prompts).toHaveLength(1)
    expect(result.prompts[0]).toMatchObject({ agentCount: 2, usage: { totalTokens: 105 } })
    expect(result.lines.filter((line) => line.label === "Agent").map((line) => JSON.parse(line.subtitle))).toEqual([
      expect.objectContaining({ id: "thread", kind: "main", usage: expect.objectContaining({ totalTokens: 100 }) }),
      expect.objectContaining({ id: "child", kind: "subagent", usage: expect.objectContaining({ totalTokens: 5 }) }),
    ])
  })
})
