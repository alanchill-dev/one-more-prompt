import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

function dateKey() {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-")
}

function chartContext(models, lookup) {
  const ctx = makeCtx()
  const date = dateKey()
  ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
    tokens: { access_token: "test-token" }, last_refresh: new Date().toISOString(),
  }))
  ctx.host.http.request.mockReturnValue({
    status: 200, headers: { "x-codex-primary-used-percent": "10" }, bodyText: "{}",
  })
  ctx.host.pricing = { lookup: vi.fn(lookup) }
  ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: {
    daily: [{ date, totalTokens: 320, costUSD: 999, models }],
    hourly: [{ startAt: date + "T09:00:00+08:00", totalTokens: 320, costUSD: 999, models }],
  } })
  return ctx
}

async function charts(ctx) {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin.probe(ctx).lines.filter((line) => line.type === "barChart")
}

describe("Codex chart per-model API estimates", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  it("prices source input, cache and output exactly, identically for daily and hourly charts", async () => {
    const usage = { totalTokens: 160, inputTokens: 100, cachedInputTokens: 50, outputTokens: 10 }
    const ctx = chartContext({ "gpt-cheap": usage, "gpt-expensive": usage }, (model) => ({
      input: model === "gpt-cheap" ? 1 : 5,
      cacheRead: model === "gpt-cheap" ? 0.04 : 0.5,
      output: model === "gpt-cheap" ? 2 : 20,
      estimationStatus: "current_rate",
    }))
    const [daily, hourly] = await charts(ctx)
    const models = daily.points[0].modelUsage
    expect(models).toEqual(hourly.points[0].modelUsage)
    expect(models[0]).toMatchObject({ name: "gpt-cheap", tokens: 160, estimationStatus: "current_rate" })
    expect(models[0].costUsd).toBeCloseTo(0.000122, 12)
    expect(models[1].costUsd).toBeCloseTo(0.000725, 12)
    expect(daily.points[0].costUsd).toBeCloseTo(0.000847, 12)
    expect(hourly.points[0].costUsd).toBeCloseTo(0.000847, 12)
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-cheap", dateKey())
  })

  it("keeps unknown costs null and auto-review at zero without inventing a share", async () => {
    const usage = { totalTokens: 10, inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 }
    const ctx = chartContext({ "gpt-known": usage, "gpt-unknown": usage, "codex-auto-review": usage }, (model) => model === "gpt-known" ? {
      input: 2, cacheRead: 0.2, output: 10, estimationStatus: "historical_rate",
    } : null)
    const [daily, hourly] = await charts(ctx)
    expect(daily.points[0].modelUsage).toEqual(hourly.points[0].modelUsage)
    expect(daily.points[0].modelUsage).toEqual([
      { name: "codex-auto-review", tokens: 10, costUsd: 0, estimationStatus: "current_rate" },
      { name: "gpt-known", tokens: 10, costUsd: 0.00006, estimationStatus: "historical_rate" },
      { name: "gpt-unknown", tokens: 10, costUsd: null, estimationStatus: "unknown" },
    ])
    expect(daily.points[0].estimationStatus).toBe("partial_rate")
    expect(ctx.host.pricing.lookup).not.toHaveBeenCalledWith("codex-auto-review", dateKey())
  })

  it("merges display aliases while retaining an unknown source as a partial estimate", async () => {
    const usage = { totalTokens: 10, inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 }
    const ctx = chartContext({ "gpt-5.5": usage, "GPT-5.5": usage }, (model) => model === "gpt-5.5" ? {
      input: 2, cacheRead: 0.2, output: 10, estimationStatus: "current_rate",
    } : null)
    const [daily, hourly] = await charts(ctx)
    expect(daily.points[0].modelUsage).toEqual([
      { name: "GPT-5.5", tokens: 20, costUsd: 0.00006, estimationStatus: "partial_rate" },
    ])
    expect(daily.points[0].modelUsage).toEqual(hourly.points[0].modelUsage)
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-5.5", dateKey())
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("GPT-5.5", dateKey())
  })

  it("sums duplicate breakdown estimates before showing one model", async () => {
    const usage = { totalTokens: 10, inputTokens: 5, cachedInputTokens: 0, outputTokens: 5 }
    const ctx = chartContext({}, () => ({ input: 2, cacheRead: 0.2, output: 10, estimationStatus: "current_rate" }))
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [{
      date: dateKey(), totalTokens: 20,
      modelBreakdowns: [{ ...usage, modelName: "gpt-5.5" }, { ...usage, modelName: "gpt-5.5" }],
    }], hourly: [] } })
    const [daily] = await charts(ctx)
    expect(daily.points[0].modelUsage).toEqual([
      { name: "GPT-5.5", tokens: 20, costUsd: 0.00012, estimationStatus: "current_rate" },
    ])
  })
})
