import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const root = "~/.codex/sessions/2026/09/07"
const at = (second) => `2026-09-07T09:03:${String(second).padStart(2, "0")}.000Z`
const event = (second, type, payload) => JSON.stringify({ timestamp: at(second), type, payload })
const meta = (session = "session") => event(39, "session_meta", { id: session, cwd: "/tmp/project" })
const start = (second, id) => event(second, "event_msg", { type: "task_started", turn_id: id })
const abort = (second, id) => event(second, "event_msg", { type: "turn_aborted", turn_id: id, reason: "interrupted" })
const prompt = (second, text) => event(second, "response_item", { type: "message", role: "user", content: [{ type: "input_text", text }] })
const tokens = (second, total) => event(second, "event_msg", { type: "token_count", info: { last_token_usage: { input_tokens: total, output_tokens: 0, total_tokens: total } } })
async function probe(ctx) {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines.filter((line) => line.label === "Prompt").map((line) => ({ text: line.value, ...JSON.parse(line.subtitle) }))
}

beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("Prompt interruption and recorded token metadata", () => {
  it("exports original session creation and recursive descendants without other visible roots", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": { project: { id: "project", name: "Project", rootPaths: ["/tmp/project"] } },
      "sidebar-project-thread-orders": { project: { threadIds: ["parent", "listed-root"] } },
    }))
    ctx.host.fs.writeText(`${root}/parent.jsonl`, [meta("parent"), start(40, "parent-turn"), prompt(41, "Parent work"), event(42, "event_msg", { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" })].join("\n"))
    for (const [id, parentId] of [["child", "parent"], ["grandchild", "child"], ["listed-root", "parent"]]) {
      ctx.host.fs.writeText(`${root}/${id}.jsonl`, [event(43, "session_meta", { id, cwd: "/tmp/project", parent_thread_id: parentId, thread_source: "subagent" }), start(44, `${id}-turn`), prompt(45, `${id} work`), tokens(46, 7)].join("\n"))
    }
    await import("./plugin.js")
    const sessionMeta = () => globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines
      .filter((line) => line.label === "Session").map((line) => JSON.parse(line.subtitle))
    expect(sessionMeta().find((session) => session.id === "parent")).toMatchObject({
      createdAt: at(39), descendantThreadIds: ["child", "grandchild"],
    })
    expect(sessionMeta().find((session) => session.id === "listed-root")).toMatchObject({
      createdAt: at(43), descendantThreadIds: [],
    })
    // Cache-backed probes preserve the same source metadata, not first-prompt timestamps.
    expect(sessionMeta().find((session) => session.id === "parent").createdAt).toBe(at(39))
  })

  it.each([false, true])("keeps known creation metadata when duplicate session files lack timestamps (reverse=%s)", async (reverse) => {
    const ctx = makeCtx()
    const files = [
      [meta(), start(40, "first"), prompt(41, "Original work")].join("\n"),
      [JSON.stringify({ type: "session_meta", payload: { id: "session", cwd: "/tmp/project" } }), start(44, "second"), prompt(45, "Continued work")].join("\n"),
    ]
    if (reverse) files.reverse()
    files.forEach((contents, index) => ctx.host.fs.writeText(`${root}/${index}.jsonl`, contents))
    await import("./plugin.js")
    for (let attempt = 0; attempt < 2; attempt++) {
      const sessions = globalThis.__one_more_prompt_plugin.probePromptUsage(ctx).lines.filter((line) => line.label === "Session")
      expect(sessions).toHaveLength(1)
      expect(JSON.parse(sessions[0].subtitle)).toMatchObject({ createdAt: at(39), promptCount: 2 })
    }
  })

  it("preserves an interrupted attempt and edited retry in separate files for one session", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/first.jsonl`, [meta(), start(40, "interrupted"), abort(41, "interrupted"), prompt(42, "Inspect this branch. Also recover the earlier environment.")].join("\n"))
    ctx.host.fs.writeText(`${root}/retry.jsonl`, [meta(), start(46, "retry"), event(49, "turn_context", { turn_id: "retry", model: "gpt-6-astra" }), prompt(50, "Inspect this branch."), tokens(51, 282860)].join("\n"))
    const results = await probe(ctx)
    expect(results).toHaveLength(2)
    expect(results.find((turn) => turn.id === "interrupted")).toMatchObject({ interrupted: true, tokenUsageRecorded: false, model: null, usage: { totalTokens: 0 } })
    expect(results.find((turn) => turn.id === "retry")).toMatchObject({ interrupted: false, tokenUsageRecorded: true, model: "gpt-6-astra", usage: { totalTokens: 282860 } })
    expect(await probe(ctx)).toEqual(results) // Metadata survives the index-cache path.
  })

  it("distinguishes missing token data, quota-only events, explicit zero and positive usage", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/measurements.jsonl`, [meta(),
      start(40, "missing"), prompt(41, "Still waiting"),
      event(42, "event_msg", { type: "token_count", info: null, rate_limits: {} }),
      start(43, "zero"), prompt(44, "Explicit measurement"), tokens(45, 0),
      start(46, "positive"), prompt(47, "Measured work"), tokens(48, 12), abort(49, "positive"),
    ].join("\n"))
    const results = await probe(ctx)
    expect(results.find((turn) => turn.id === "missing")).toMatchObject({ interrupted: false, tokenUsageRecorded: false })
    expect(results.find((turn) => turn.id === "zero")).toMatchObject({ interrupted: false, tokenUsageRecorded: true, usage: { totalTokens: 0 } })
    expect(results.find((turn) => turn.id === "positive")).toMatchObject({ interrupted: true, tokenUsageRecorded: true, usage: { totalTokens: 12 } })
  })

  it.each([0, 17])("recognizes cumulative-only token measurements of %i", async (total) => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/cumulative.jsonl`, [meta(), start(40, "turn"), prompt(41, "Cumulative usage"), event(42, "event_msg", { type: "token_count", info: { total_token_usage: { total_tokens: total } } })].join("\n"))
    expect(await probe(ctx)).toEqual([expect.objectContaining({ tokenUsageRecorded: true, usage: expect.objectContaining({ totalTokens: total }) })])
  })

  it.each([null, {}, { total_token_usage: {} }, { total_token_usage: { total_tokens: null } }, { total_token_usage: { total_tokens: false } }, { last_token_usage: { total_tokens: "invalid" } }, { total_token_usage: { total_tokens: -1 } }])("does not mark malformed or missing token info as recorded: %j", async (info) => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/missing.jsonl`, [meta(), start(40, "turn"), prompt(41, "Waiting"), event(42, "event_msg", { type: "token_count", info })].join("\n"))
    expect(await probe(ctx)).toEqual([expect.objectContaining({ tokenUsageRecorded: false, interrupted: false })])
  })

  it.each([0, 7])("merges a promptless resumed turn after a cumulative measurement of %i", async (total) => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/promptless-resume.jsonl`, [meta(), start(40, "original"), prompt(41, "Resume this request"), abort(42, "original"), start(43, "resumed"), event(44, "event_msg", { type: "token_count", info: { total_token_usage: { total_tokens: total } } }), event(45, "event_msg", { type: "task_complete", turn_id: "resumed" })].join("\n"))
    expect(await probe(ctx)).toEqual([expect.objectContaining({ id: "resumed", interrupted: false, tokenUsageRecorded: true, text: "Resume this request" })])
  })

  it("marks only the current prompt active, including promptless resume and stale expiry", async () => {
    const ctx = makeCtx()
    ctx.nowIso = at(59)
    const path = `${root}/active.jsonl`
    const rows = [meta(), start(40, "old"), prompt(41, "Older request"), event(42, "event_msg", { type: "task_complete", turn_id: "old" }), start(43, "current"), prompt(44, "Current request")]
    ctx.host.fs.writeText(path, rows.join("\n"))
    let results = await probe(ctx)
    expect(results.find((turn) => turn.id === "old").isActive).toBe(false)
    expect(results.find((turn) => turn.id === "current").isActive).toBe(true)
    rows.push(abort(45, "current"))
    ctx.host.fs.writeText(path, rows.join("\n"))
    expect((await probe(ctx)).every((turn) => !turn.isActive)).toBe(true)
    rows.push(start(46, "resumed"))
    ctx.host.fs.writeText(path, rows.join("\n"))
    expect((await probe(ctx)).find((turn) => turn.id === "current")).toMatchObject({ isActive: true, interrupted: false })
    rows.push(tokens(47, 2))
    ctx.host.fs.writeText(path, rows.join("\n"))
    expect((await probe(ctx)).find((turn) => turn.id === "resumed")).toMatchObject({ isActive: true })
    ctx.nowIso = "2026-09-08T09:00:00Z"
    expect((await probe(ctx)).every((turn) => !turn.isActive)).toBe(true)
    rows.push(event(48, "event_msg", { type: "task_complete", turn_id: "resumed" }))
    ctx.nowIso = at(59)
    ctx.host.fs.writeText(path, rows.join("\n"))
    expect((await probe(ctx)).every((turn) => !turn.isActive)).toBe(true)
  })

  it("uses the latest session-file lifecycle rather than stale active records", async () => {
    const ctx = makeCtx()
    ctx.nowIso = at(59)
    ctx.host.fs.writeText(`${root}/z-old.jsonl`, [meta(), start(40, "old"), prompt(41, "Old active log")].join("\n"))
    ctx.host.fs.writeText(`${root}/a-new.jsonl`, [meta(), start(43, "current"), prompt(44, "Current log")].join("\n"))
    const results = await probe(ctx)
    expect(results.find((turn) => turn.id === "old").isActive).toBe(false)
    expect(results.find((turn) => turn.id === "current").isActive).toBe(true)
  })

  it("clears interruption after the same durable turn resumes and completes", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/resume.jsonl`, [meta(), start(40, "turn"), prompt(41, "Continue work"), abort(42, "turn"), start(43, "turn"), tokens(44, 10), event(45, "event_msg", { type: "task_complete", turn_id: "turn" })].join("\n"))
    expect(await probe(ctx)).toEqual([expect.objectContaining({ id: "turn", interrupted: false, tokenUsageRecorded: true })])
  })

  it("recognizes recorded child usage even when the main prompt has no token event", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/parent.jsonl`, [meta("parent"), start(40, "parent-turn"), prompt(41, "Delegate work"), event(42, "event_msg", { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" })].join("\n"))
    ctx.host.fs.writeText(`${root}/child.jsonl`, [event(43, "session_meta", { id: "child", cwd: "/tmp/project", parent_thread_id: "parent", thread_source: "subagent" }), start(44, "child-turn"), prompt(45, "Child work"), tokens(46, 7)].join("\n"))
    expect(await probe(ctx)).toEqual([expect.objectContaining({ id: "parent-turn", tokenUsageRecorded: true, usage: { inputTokens: 7, outputTokens: 0, totalTokens: 7, cachedInputTokens: 0, cacheWriteInputTokensComplete: false, reasoningOutputTokens: 0 } })])
  })

  it("keeps non-interrupted identical submissions distinct instead of dropping zero-token turns", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/repeat.jsonl`, [meta(), start(40, "first"), prompt(41, "Repeat this"), start(43, "second"), prompt(44, "Repeat this"), tokens(45, 5)].join("\n"))
    const results = await probe(ctx)
    expect(results).toHaveLength(2)
    expect(results.map((turn) => turn.id).sort()).toEqual(["first", "second"])
  })
})


describe("Exact interrupted retries", () => {
  it.each([false, true])("merges an adjacent empty interruption across files (recorded zero: %s)", async (recorded) => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/z-first.jsonl`, [meta(), start(40, "interrupted"), prompt(41, "  Retry this exact request.  "), ...(recorded ? [tokens(42, 0)] : []), abort(43, "interrupted")].join("\n"))
    ctx.host.fs.writeText(`${root}/a-retry.jsonl`, [meta(), start(46, "retry"), prompt(47, "Retry this exact request."), tokens(48, 17), event(49, "event_msg", { type: "task_complete", turn_id: "retry" })].join("\n"))
    const results = await probe(ctx)
    expect(results).toEqual([expect.objectContaining({ id: "retry", startedAt: at(46), retriedFromStartedAt: at(40), interrupted: false, tokenUsageRecorded: true, usage: expect.objectContaining({ totalTokens: 17 }) })])
    expect(await probe(ctx)).toEqual(results)
  })

  it.each(["edited", "distant", "intervening", "different session", "positive original", "zero retry"])("preserves %s attempts", async (scenario) => {
    const ctx = makeCtx()
    const rows = [meta(), start(40, "first"), prompt(41, "Retry request"), ...(scenario === "positive original" ? [tokens(42, 3)] : []), abort(43, "first")]
    if (scenario === "intervening") rows.push(start(44, "other"), prompt(45, "Other request"))
    const retryRows = [start(46, "retry"), prompt(47, scenario === "edited" ? "Retry request with edits" : "Retry request"), tokens(48, scenario === "zero retry" ? 0 : 17)]
    if (scenario === "distant") retryRows.forEach((row, i) => { retryRows[i] = row.replace("09:03:", "09:05:") })
    if (scenario === "different session") ctx.host.fs.writeText(`${root}/other.jsonl`, [meta("other"), ...retryRows].join("\n"))
    else rows.push(...retryRows)
    ctx.host.fs.writeText(`${root}/first.jsonl`, rows.join("\n"))
    const results = await probe(ctx)
    expect(results).toHaveLength(scenario === "intervening" ? 3 : 2)
    expect(results.every((turn) => turn.retriedFromStartedAt === null)).toBe(true)
    expect(results.reduce((total, turn) => total + turn.usage.totalTokens, 0)).toBe(scenario === "positive original" ? 20 : scenario === "zero retry" ? 0 : 17)
  })

  it("does not drop an interrupted zero main-agent turn with measured child usage", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/parent.jsonl`, [meta("parent"), start(40, "first"), prompt(41, "Retry request"), event(42, "event_msg", { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" }), abort(43, "first"), start(46, "retry"), prompt(47, "Retry request"), tokens(48, 17)].join("\n"))
    ctx.host.fs.writeText(`${root}/child.jsonl`, [event(42, "session_meta", { id: "child", cwd: "/tmp/project", parent_thread_id: "parent", thread_source: "subagent" }), start(43, "child-turn"), prompt(44, "Child work"), tokens(45, 7)].join("\n"))
    const results = await probe(ctx)
    expect(results).toHaveLength(2)
    expect(results.reduce((total, turn) => total + turn.usage.totalTokens, 0)).toBe(24)
  })
})
