import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const writeSession = (ctx, name) => {
  const path = `~/.codex/sessions/2026/02/02/${name}.jsonl`
  const timestamp = "2026-02-02T00:00:00.000Z"
  ctx.host.fs.writeText(path, [
    { type: "session_meta", timestamp, payload: { id: name, cwd: "/tmp/project", thread_source: "user" } },
    { type: "turn_context", timestamp, payload: { turn_id: `${name}-turn`, model: "gpt-5.6-sol" } },
    { type: "event_msg", timestamp, payload: { type: "user_message", message: "Check the project" } },
  ].map(JSON.stringify).join("\n"))
  return path
}

const load = async () => {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin
}

describe("local scan file progress", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  it("reports actual file completions and completes cache hits without rereading", async () => {
    const ctx = makeCtx()
    writeSession(ctx, "a")
    writeSession(ctx, "b")
    ctx.host.scanProgress = vi.fn()
    const read = vi.spyOn(ctx.host.fs, "readCodexSessionEvents")
    const plugin = await load()
    plugin.probePromptUsage(ctx)
    const expected = [["reading", 0, 2], ["reading", 1, 2], ["reading", 2, 2], ["summarizing", 2, 2]]
    expect(ctx.host.scanProgress.mock.calls).toEqual(expected)
    expect(read).toHaveBeenCalledTimes(2)
    ctx.host.scanProgress.mockClear()
    read.mockClear()
    plugin.probePromptUsage(ctx)
    expect(ctx.host.scanProgress.mock.calls).toEqual(expected)
    expect(read).not.toHaveBeenCalled()
  })

  it("reports a read failure instead of completing a partial history scan", async () => {
    const ctx = makeCtx()
    const failed = writeSession(ctx, "a")
    writeSession(ctx, "b")
    ctx.host.scanProgress = vi.fn()
    const read = ctx.host.fs.readCodexSessionEvents
    ctx.host.fs.readCodexSessionEvents = (path) => {
      if (path === failed) throw new Error("Read failed")
      return read(path)
    }
    const plugin = await load()
    expect(() => plugin.probePromptUsage(ctx)).toThrow("Unable to read Codex session history (a.jsonl)")
    expect(ctx.host.scanProgress.mock.calls).toEqual([
      ["reading", 0, 2], ["reading", 1, 2],
    ])
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("prompt usage read failed"))
  })

  it("reports an empty inventory without inventing work", async () => {
    const ctx = makeCtx()
    ctx.host.scanProgress = vi.fn()
    const plugin = await load()
    plugin.probePromptUsage(ctx)
    expect(ctx.host.scanProgress.mock.calls).toEqual([["reading", 0, 0], ["summarizing", 0, 0]])
  })

  it("keeps ordinary local probes compatible without a progress callback", async () => {
    const ctx = makeCtx()
    writeSession(ctx, "a")
    const plugin = await load()
    expect(plugin.probePromptUsage(ctx).lines.find((line) => line.label === "Prompt Usage")?.value).toBe("1 prompt · 1 session")
  })
})
