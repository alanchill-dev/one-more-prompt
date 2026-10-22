import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const root = "~/.codex/sessions"
const cachePath = "/tmp/one-more-prompt-test/plugin/prompt-usage-index-v2.json"
const records = id => [
  { type: "session_meta", payload: { id, cwd: "/tmp/synthetic-project" } },
  { type: "event_msg", payload: { type: "user_message", message: `Synthetic request ${id}` } },
].map((record, index) => JSON.stringify({ timestamp: `2026-10-21T00:00:0${index}Z`, ...record })).join("\n")
const probe = async ctx => {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin.probePromptUsage(ctx)
}

beforeEach(() => { delete globalThis.__one_more_prompt_plugin; vi.resetModules() })

describe("History Directory Enumeration", () => {
  it("keeps missing initial history as a successful empty result", async () => {
    const result = await probe(makeCtx())
    expect(result.lines.find(line => line.label === "Prompt Usage").value).toBe("0 prompts · 0 sessions")
  })

  it.each([root, `${root}/2026/10/21`])("rejects a failed directory scan at %s without publishing a reduced index", async deniedPath => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/2026/10/21/one.jsonl`, records("one"))
    ctx.host.fs.writeText(`${root}/2026/10/20/two.jsonl.zst`, records("two"))
    expect((await probe(ctx)).lines.find(line => line.label === "Prompt Usage").value).toBe("2 prompts · 2 sessions")
    const previous = ctx.host.fs.readText(cachePath)
    const original = ctx.host.fs.listDir
    ctx.host.fs.listDir = dir => {
      if (dir === deniedPath) throw new Error("Permission denied")
      return original(dir)
    }
    await expect(probe(ctx)).rejects.toThrow("Permission denied")
    expect(ctx.host.fs.readText(cachePath)).toBe(previous)
    expect(ctx.host.fs.readText(`${root}/2026/10/21/one.jsonl`)).toBe(records("one"))
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("prompt usage parse failed"))
  })

  it("does not bypass listing with exists, which can hide a permission failure", async () => {
    const ctx = makeCtx()
    const exists = ctx.host.fs.exists
    ctx.host.fs.exists = path => path === root ? false : exists(path)
    ctx.host.fs.listDir = () => { throw new Error("Directory I/O error") }
    await expect(probe(ctx)).rejects.toThrow("Directory I/O error")
    expect(ctx.host.fs.exists(cachePath)).toBe(false)
  })

  it("preserves the index when native enumeration reports an entry error", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText(`${root}/one.jsonl`, records("one"))
    await probe(ctx)
    const previous = ctx.host.fs.readText(cachePath)
    ctx.host.fs.listDir = () => { throw new Error("Could not read a directory entry") }
    await expect(probe(ctx)).rejects.toThrow("Could not read a directory entry")
    expect(ctx.host.fs.readText(cachePath)).toBe(previous)
  })
})
