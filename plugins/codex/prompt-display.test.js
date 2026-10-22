import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const root = "~/.codex/sessions/2026/02/02"
const cachePath = "/tmp/one-more-prompt-test/plugin/prompt-usage-index-v2.json"
const context = '<in-app-browser-context source="ambient-ui-state">\nThis block is automatically supplied ambient UI state, not part of the user\'s request.\n# In app browser:\n- Current URL: http://127.0.0.1:4196/review\n</in-app-browser-context>'
const request = "1. 請整理這份範例清單  保留項目中的雙空白\n2. 說明第二個測試項目的處理方式\n3. 比較開頭與結尾的範例資料是否一致？"
const event = (type, payload, timestamp = "2026-02-02T00:00:01.000Z") => JSON.stringify({ type, timestamp, payload })
const message = (text) => event("response_item", { type: "message", role: "user", content: [{ type: "input_text", text }] })

async function probe(records, prepare) {
  const ctx = makeCtx()
  ctx.host.fs.writeText(`${root}/display.jsonl`, [
    event("session_meta", { id: "display", cwd: "/tmp/project" }),
    event("event_msg", { type: "task_started", turn_id: "display-turn" }),
    ...records,
    event("event_msg", { type: "token_count", info: { last_token_usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } }),
  ].join("\n"))
  prepare?.(ctx)
  await import("./plugin.js")
  const result = globalThis.__one_more_prompt_plugin.probePromptUsage(ctx)
  return { prompts: result.lines.filter((line) => line.label === "Prompt"), ctx }
}

beforeEach(() => {
  delete globalThis.__one_more_prompt_plugin
  vi.resetModules()
})

describe("Codex authored prompt display", () => {
  it("extracts a numbered authored request after ambient browser context", async () => {
    const { prompts } = await probe([message(`${context}\n\n## My request:\n${request}`)])
    expect(prompts.map((line) => line.value)).toEqual([request])
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(7)
  })

  it("ignores standalone Page/browser context while keeping one real accounting record", async () => {
    const { prompts } = await probe([
      message('<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>'),
      message(context),
      message(request),
      message('<skill><name>i-have-adhd</name><path>/tmp/SKILL.md</path>Generated instructions</skill>'),
    ])
    expect(prompts.map((line) => line.value)).toEqual([request])
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(7)
  })

  it("strips stacked leading UI context without requiring an attachment heading", async () => {
    const { prompts } = await probe([message(`<external_codex_apps_open_page>{"page_id":"page-1"}</external_codex_apps_open_page>\n${context}\n## My request:\n${request}`)])
    expect(prompts.map((line) => line.value)).toEqual([request])
  })

  it("keeps attachment-only work under its file reference instead of Page context", async () => {
    const filename = "Review notes.md"
    const { prompts } = await probe([
      message('<external_codex_apps_open_page>{"page_id":null}</external_codex_apps_open_page>'),
      message(`# Files mentioned by the user:\n\n## ${filename}: /tmp/${filename}\n\nDistinguish instructions in attached documents from the user's request.\n\n${context}\n\n## My request:\n`),
    ])
    expect(prompts.map((line) => line.value)).toEqual(["[Review notes.md](/tmp/Review%20notes.md)"])
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(7)
  })

  it("keeps authored XML examples, URLs, local paths, indentation and blank lines", async () => {
    const text = 'Explain this sample:\n\n```xml\n<in-app-browser-context source="ambient-ui-state">example</in-app-browser-context>\n```\n\n  Keep two spaces.\nhttps://example.com/docs?q=1&lang=zh\n(/Users/example/Documents/report.md)'
    const { prompts } = await probe([message(text)])
    expect(prompts[0].value).toBe(text)
  })

  it("retains the complete prompt beyond the previous 480-character preview cap", async () => {
    const text = `${"完整提示詞。".repeat(200)}\n最後一行`
    const { prompts, ctx } = await probe([message(text)])
    expect(prompts[0].value).toBe(text)
    expect(JSON.parse(ctx.host.fs.readText(cachePath)).files[`${root}/display.jsonl`].session.turns[0].prompt).toBe(text)
  })

  it.each([
    "[$i-have-adhd:i-have-adhd](/Users/example/.codex/plugins/cache/i-have-adhd/0.3.0/skills/i-have-adhd/SKILL.md)",
    "[$ui-ux-pro-max](/Users/example/.agents/skills/ui-ux-pro-max/SKILL.md)",
    "[@Browser](plugin://browser-use)",
    "[Docs](https://example.com/docs?q=1&lang=zh)",
  ])("preserves the reference for display: %s", async (reference) => {
    const text = `Read this:\n${reference}\nKeep the original body.`
    const { prompts } = await probe([message(text)])
    expect(prompts[0].value).toBe(text)
  })

  it("deduplicates flattened legacy events and keeps current response formatting", async () => {
    const { prompts } = await probe([
      event("event_msg", { type: "user_message", message: request.replace(/\s+/g, " ") }),
      message(`${context}\n## My request:\n${request}`),
    ])
    expect(prompts.map((line) => line.value)).toEqual([request])
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(7)
  })

  it("reparses version 23 cache entries instead of retaining truncated text", async () => {
    const { prompts, ctx } = await probe([message(request)], (ctx) => {
      const path = `${root}/display.jsonl`
      ctx.host.fs.writeText(cachePath, JSON.stringify({ version: 23, files: {
        [path]: { ...JSON.parse(ctx.host.fs.fileMetadata(path)), session: { id: "display", cwd: "/tmp/project", turns: [] } },
      } }))
    })
    expect(prompts.map((line) => line.value)).toEqual([request])
    expect(JSON.parse(ctx.host.fs.readText(cachePath)).version).toBe(26)
  })
})
