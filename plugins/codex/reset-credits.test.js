import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const credit = (id, fields = {}) => ({ id, status: "available", granted_at: "2026-09-01T00:00:00Z", expires_at: "2026-10-01T00:00:00Z", ...fields })
const event = (id, kind = "granted", occurred_at = "2026-09-12T00:00:00Z") => ({ id, kind, occurred_at })
const page = (events, next_cursor = null) => ({ events, next_cursor, window_start: "2026-08-14T00:00:00Z", as_of: "2026-09-13T00:00:00Z" })
const response = (data, status = 200) => ({ status, headers: {}, bodyText: JSON.stringify(data) })

async function probe(list, pages = [], usage = {}) {
  const ctx = makeCtx()
  ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "test-token" }, last_refresh: new Date().toISOString() }))
  ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })
  let historyIndex = 0
  ctx.host.http.request.mockImplementation(({ url, method }) => {
    expect(method).toBe("GET")
    if (url.includes("/rate-limit-reset-credits/history")) {
      const result = pages[historyIndex++]
      return typeof result === "function" ? result() : result ?? response({}, 500)
    }
    if (url.endsWith("/rate-limit-reset-credits")) return list
    return response(usage)
  })
  await import("./plugin.js")
  const output = globalThis.__one_more_prompt_plugin.probe(ctx)
  const line = output.lines.find(line => line.label === "Rate Limit Resets")
  return { ctx, line, normalized: line?.resetCredits, requests: ctx.host.http.request.mock.calls.map(([request]) => request) }
}

describe("Codex reset credit details and official history", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  it("keeps official event dates independent from incomplete credit details", async () => {
    const { normalized, line } = await probe(response({ available_count: 2, history_enabled: true, credits: [
      credit("later", { profile_user_id: "private-profile", profile_image_url: "https://example.com/private.png", title: "Private title", description: "Private description" }),
      credit("earlier", { expires_at: "2026-09-20T00:00:00Z" }),
      credit("used-credit", { status: "redeemed", redeemed_at: "2026-09-10T00:00:00Z" }),
      credit("no-status", { status: undefined }),
    ] }), [response(page([event("usage-event", "used", "2026-09-11T12:34:00+08:00"), event("grant-event")]))])
    // A malformed list row cannot silently become an available credit or a complete list.
    expect(normalized.credits).toBeNull()
    expect(normalized.availableCount).toBe(2)
    expect(normalized.history).toEqual([
      { id: "usage-event", kind: "used", occurredAt: "2026-09-11T04:34:00.000Z" },
      { id: "grant-event", kind: "granted", occurredAt: "2026-09-12T00:00:00.000Z" },
    ])
    expect(normalized.historyState).toBe("ready")
    expect(normalized.historyWindowStart).toBe("2026-08-14T00:00:00.000Z")
    expect(normalized.historyAsOf).toBe("2026-09-13T00:00:00.000Z")
    expect(line.resetExpiry).toEqual(["2026-09-20T00:00:00.000Z", "2026-10-01T00:00:00.000Z"])
    expect(JSON.stringify(normalized)).not.toMatch(/private|Private|used-credit|no-status/)
  })

  it("keeps identical expiry credits separate and places unknown expiry last", async () => {
    const { normalized } = await probe(response({ available_count: 3, history_enabled: false, credits: [
      credit("b"), credit("a"), credit("unknown", { granted_at: "2026-02-30T00:00:00Z", expires_at: "not a date" }),
    ] }))
    expect(normalized.credits).toEqual([
      { id: "a", grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" },
      { id: "unknown", grantedAt: null, expiresAt: null },
    ])
  })

  it.each([false, undefined])("does not request or invent history when history_enabled is %s", async enabled => {
    const { normalized, requests } = await probe(response({ available_count: 0, credits: [], history_enabled: enabled }))
    expect(normalized).toEqual({ availableCount: 0, credits: [], history: [], historyState: enabled === false ? "disabled" : "unavailable", historyWindowStart: null, historyAsOf: null })
    expect(requests.some(request => request.url.includes("/history"))).toBe(false)
  })

  it("keeps count-only fallback explicit when the list endpoint fails", async () => {
    const { normalized } = await probe(response({}, 503), [], { rate_limit_reset_credits: { available_count: 2 } })
    expect(normalized).toEqual({ availableCount: 2, credits: null, history: [], historyState: "unavailable", historyWindowStart: null, historyAsOf: null })
  })

  it("follows the official cursor and deduplicates overlapping events without changing dates", async () => {
    const { normalized, requests } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      response(page([event("latest", "used")], "opaque/+?cursor")),
      response(page([event("latest", "used"), event("older", "granted", "2026-09-01T00:00:00Z")])),
    ])
    expect(requests.filter(request => request.url.includes("/history")).map(request => request.url)).toEqual([
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/history",
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/history?cursor=opaque%2F%2B%3Fcursor",
    ])
    expect(normalized.history.map(item => item.id)).toEqual(["latest", "older"])
    expect(normalized.historyState).toBe("ready")
  })

  it("omits unknown kinds and malformed dates with visible partial state and warning", async () => {
    const { normalized, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      response(page([event("good", "used"), event("unknown", "redeemed"), event("bad-date", "granted", "yesterday")])),
    ])
    expect(normalized.history).toHaveLength(1)
    expect(normalized.history[0].kind).toBe("used")
    expect(normalized.historyState).toBe("partial")
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("entry omitted"))
  })

  it.each([0, 1])("reports a failed history page after %s successful pages without losing valid entries", async successfulPages => {
    const { normalized, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      ...(successfulPages ? [response(page([event("good")], "next"))] : []), response({}, 503),
    ])
    expect(normalized.historyState).toBe(successfulPages ? "partial" : "unavailable")
    expect(normalized.history).toHaveLength(successfulPages)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("history request failed"))
  })

  it("stops repeated cursors with partial state instead of looping", async () => {
    const { normalized, requests, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      response(page([event("one")], "repeat")), response(page([event("two")], "repeat")),
    ])
    expect(normalized.historyState).toBe("partial")
    expect(normalized.history).toHaveLength(2)
    expect(requests.filter(request => request.url.includes("/history"))).toHaveLength(2)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("repeated history cursor"))
  })

  it("caps pagination at ten pages and reports the uncollected remainder", async () => {
    const { normalized, requests, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }),
      Array.from({ length: 11 }, (_, index) => response(page([event(`event-${index}`)], `page-${index + 1}`))))
    expect(normalized.historyState).toBe("partial")
    expect(normalized.history).toHaveLength(10)
    expect(requests.filter(request => request.url.includes("/history"))).toHaveLength(10)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("10-page limit"))
  })

  it("bounds all history requests to eight seconds and shrinks the next request timeout", async () => {
    let now = Date.now()
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const { normalized, requests, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      () => { now += 5000; return response(page([event("one")], "page-two")) },
      () => { now += 3000; return response(page([event("two")], "page-three")) },
    ])
    expect(requests.filter(request => request.url.includes("/history")).map(request => request.timeoutMs)).toEqual([5000, 3000])
    expect(normalized.historyState).toBe("partial")
    expect(normalized.history).toHaveLength(2)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(expect.stringContaining("8-second budget"))
  })

  it("does not leak cursors or transport error details into plugin warnings", async () => {
    const { normalized, ctx } = await probe(response({ available_count: 0, credits: [], history_enabled: true }), [
      () => { throw new Error("GET https://chatgpt.com/path?cursor=private-opaque-cursor Authorization: private-token") },
    ])
    expect(normalized.historyState).toBe("unavailable")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("rate limit reset history request failed: transport failure")
    expect(JSON.stringify(ctx.host.log.warn.mock.calls)).not.toMatch(/private-opaque-cursor|private-token/)
  })
})
