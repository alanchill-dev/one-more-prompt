import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin
}

// Relative local day key so fixtures stay inside the rolling trend window.
function dayKey(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return year + "-" + month + "-" + day
}

function usageLabel(daysAgo) {
  const key = dayKey(daysAgo)
  return Number(key.slice(5, 7)) + "/" + Number(key.slice(8, 10))
}

describe("codex plugin ccusage usage trend", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  it("adds model percentage text lines and a usage chart from codex ccusage", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 300,
            models: {
              "gpt-5.5": { totalTokens: 200 },
              "gpt-5": { totalTokens: 100 },
            },
          },
          {
            date: dayKey(1),
            totalTokens: 150,
            models: {
              "gpt-5": { inputTokens: 30, cachedInputTokens: 20, outputTokens: 50 },
            },
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const chart = result.lines.find((line) => line.label === "Usage Trend")
    expect(chart).toMatchObject({
      type: "barChart",
      granularity: "daily",
      note: "Estimated from local Codex logs for the selected account.",
    })
    expect(chart.points.map((point) => point.value)).toEqual([150, 300])
    expect(chart.points.map((point) => point.modelUsage)).toEqual([
      [{ name: "GPT-5", tokens: 100, costUsd: null, estimationStatus: "unknown" }],
      [
        { name: "GPT-5.5", tokens: 200, costUsd: null, estimationStatus: "unknown" },
        { name: "GPT-5", tokens: 100, costUsd: null, estimationStatus: "unknown" },
      ],
    ])

    const gpt55 = result.lines.find((line) => line.label === "GPT-5.5")
    const gpt5 = result.lines.find((line) => line.label === "GPT-5")
    expect(gpt55).toMatchObject({
      type: "text",
      value: "50%",
    })
    expect(gpt5).toMatchObject({
      type: "text",
      value: "50%",
    })
  })

  it("keeps the priced portion when a daily point also contains an unpriced model", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.pricing = {
      lookup: vi.fn((model) => model === "gpt-known" ? {
        input: 2,
        output: 10,
        cacheRead: 0.2,
        estimationStatus: "current_rate",
        observedAt: "2026-08-31T00:00:00Z",
      } : null),
    }
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [{
          date: dayKey(1),
          totalTokens: 135,
          models: {
            "gpt-known": { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, totalTokens: 130 },
            "codex-auto-review": { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
          },
        }, {
          date: dayKey(0),
          totalTokens: 15,
          models: {
            "gpt-known": { inputTokens: 4, outputTokens: 1, totalTokens: 10 },
            "gpt-unknown": { inputTokens: 4, outputTokens: 1, totalTokens: 5 },
          },
        }],
      },
    })

    const result = (await loadPlugin()).probe(ctx)
    const chart = result.lines.find((line) => line.label === "Usage Trend")
    const known = chart.points.find((point) => point.label === usageLabel(1))
    const partial = chart.points.find((point) => point.label === usageLabel(0))

    expect(known).toMatchObject({
      costUsd: 0.000304,
      estimationStatus: "current_rate",
    })
    expect(partial).toMatchObject({
      costUsd: 0.000018,
      estimationStatus: "partial_rate",
    })
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-known", dayKey(1))
    expect(ctx.host.pricing.lookup).not.toHaveBeenCalledWith("codex-auto-review", dayKey(1))
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-known", dayKey(0))
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-unknown", dayKey(0))
    expect(result.lines.find((line) => line.label === "Today").value).toBe("$0.00 · 15")
  })

  it("bounds the daily history to 366 days and queries only today's hours separately", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockImplementation((opts) => opts.granularity === "hourly"
      ? { status: "ok", data: { hourly: [] } }
      : { status: "ok", data: { daily: [{ date: dayKey(0), totalTokens: 1 }] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const calls = ctx.host.ccusage.query.mock.calls.map(([opts]) => opts)
    const today = dayKey(0).replace(/-/g, "")
    const expectedDailySince = dayKey(365).replace(/-/g, "")

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ provider: "codex", granularity: "daily", since: expectedDailySince })
    expect(calls[1]).toMatchObject({ provider: "codex", granularity: "hourly", since: today, until: today })
    expect(result.lines.find((line) => line.granularity === "hourly")).toMatchObject({ points: [] })
  })

  it("keeps daily history when the explicit hourly query fails and logs the failure", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockImplementation((opts) => opts.granularity === "hourly"
      ? { status: "runner_failed" }
      : { status: "ok", data: { daily: [{ date: dayKey(0), totalTokens: 1 }] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Usage Trend")).toBeTruthy()
    expect(result.lines.find((line) => line.granularity === "hourly")).toBeUndefined()
    expect(ctx.host.log.error).toHaveBeenCalledWith("ccusage hourly query failed: status=runner_failed")
  })

  it("emits a real Today hourly series and offset-aware daily starts", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.pricing = {
      lookup: vi.fn(() => ({
        input: 2,
        output: 10,
        cacheRead: 0.2,
        estimationStatus: "current_rate",
        observedAt: "2026-08-31T00:00:00Z",
      })),
    }
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [{
          date: dayKey(0),
          totalTokens: 300,
          models: { "gpt-5.5": { totalTokens: 300 } },
        }],
        hourly: [{
          startAt: dayKey(0) + "T09:00:00+08:00",
          totalTokens: 200,
          models: {
            "gpt-5.5": { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, totalTokens: 150 },
            "gpt-5": { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
          },
        }, {
          startAt: dayKey(0) + "T10:00:00+08:00",
          totalTokens: 100,
          models: { "gpt-5.5": { inputTokens: 80, outputTokens: 20, totalTokens: 100 } },
        }],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const daily = result.lines.find((line) => line.label === "Usage Trend")
    const hourly = result.lines.find((line) => line.granularity === "hourly")

    expect(daily).toMatchObject({ type: "barChart", granularity: "daily" })
    expect(daily.points[0].startAt).toMatch(
      new RegExp("^" + dayKey(0) + "T00:00:00[+-]\\d{2}:\\d{2}$")
    )
    expect(hourly).toMatchObject({ type: "barChart", granularity: "hourly" })
    expect(hourly.points.map((point) => point.value)).toEqual([200, 100])
    expect(hourly.points[0].startAt).toBe(dayKey(0) + "T09:00:00+08:00")
    expect(hourly.points[0].modelUsage).toEqual([
      { name: "GPT-5.5", tokens: 150, costUsd: 0.000504, estimationStatus: "current_rate" },
      { name: "GPT-5", tokens: 50, costUsd: 0.00018, estimationStatus: "current_rate" },
    ])
    expect(hourly.points[0].costUsd).toBeCloseTo(0.000684, 12)
    expect(hourly.points[0].estimationStatus).toBe("current_rate")
    expect(hourly.points[1]).toMatchObject({
      costUsd: 0.00036,
      estimationStatus: "current_rate",
    })
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-5.5", dayKey(0))
  })

  it("keeps an explicit empty hourly line when Today has no events", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: { daily: [], hourly: [] },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.granularity === "hourly")).toMatchObject({
      type: "barChart",
      granularity: "hourly",
      points: [],
    })
  })

  it("splits day costUSD across models by token share when modelBreakdowns are absent", async () => {
    // Real Codex ccusage shape: day-level costUSD + models token map, no
    // modelBreakdowns[].cost. Share/overview need per-model $ on the % line.
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 100,
            costUSD: 10,
            models: {
              "gpt-5.6-sol": { totalTokens: 80 },
              "gpt-5.6-terra": { totalTokens: 20 },
            },
          },
          {
            date: dayKey(3),
            totalTokens: 50,
            costUSD: 5,
            models: {
              "gpt-5.6-sol": { totalTokens: 50 },
            },
          },
          {
            date: dayKey(10),
            totalTokens: 50,
            costUSD: 5,
            models: {
              "gpt-5.6-terra": { totalTokens: 50 },
            },
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    // Tokens: sol=80+50=130, terra=20+50=70, total=200 → 65% / 35%.
    // Sol cost: Today=8, 7d=8+5=13, 30d=13. Terra: Today=2, 7d=2, 30d=2+5=7.
    const sol = result.lines.find((line) => line.label === "GPT-5.6 Sol")
    const terra = result.lines.find((line) => line.label === "GPT-5.6 Terra")
    expect(sol).toMatchObject({
      type: "text",
      value: "65% · Today $8.00 · 7d $13.00 · 30d $13.00",
    })
    expect(terra).toMatchObject({
      type: "text",
      value: "35% · Today $2.00 · 7d $2.00 · 30d $7.00",
    })
  })

  it("merges Today/7d/30d cost into each model's existing % line", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 100,
            totalCost: 5,
            modelBreakdowns: [
              { modelName: "gpt-5.5", cost: 3, totalTokens: 60 },
              { modelName: "gpt-5", cost: 2, totalTokens: 40 },
            ],
          },
          {
            date: dayKey(3),
            totalTokens: 100,
            totalCost: 4,
            modelBreakdowns: [
              { modelName: "gpt-5.5", cost: 4, totalTokens: 100 },
            ],
          },
          {
            date: dayKey(10),
            totalTokens: 100,
            totalCost: 2,
            modelBreakdowns: [
              { modelName: "gpt-5.5", cost: 2, totalTokens: 100 },
            ],
          },
          {
            // No modelBreakdowns at all: must be skipped without throwing.
            date: dayKey(1),
            totalTokens: 50,
            totalCost: 1,
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const chart = result.lines.find((line) => line.label === "Usage Trend")
    expect(chart.points.find((point) => point.label === usageLabel(0)).modelUsage).toEqual([
      { name: "GPT-5.5", tokens: 60, costUsd: null, estimationStatus: "unknown" },
      { name: "GPT-5", tokens: 40, costUsd: null, estimationStatus: "unknown" },
    ])
    expect(chart.points.find((point) => point.label === usageLabel(1)).modelUsage).toEqual([])

    // gpt-5.5 tokens: 60 + 100 + 100 = 260. gpt-5 tokens: 40 (today only). Total = 300.
    // gpt-5.5 = 260/300 = 86.7%, gpt-5 = 40/300 = 13.3%.
    // gpt-5.5 cost: Today=3, 7d=3+4=7, 30d=3+4+2=9. gpt-5 cost: Today=7d=30d=2 (today only).
    const gpt55 = result.lines.find((line) => line.label === "GPT-5.5")
    const gpt5 = result.lines.find((line) => line.label === "GPT-5")
    expect(gpt55).toMatchObject({ type: "text", value: "86.7% · Today $3.00 · 7d $7.00 · 30d $9.00" })
    expect(gpt5).toMatchObject({ type: "text", value: "13.3% · Today $2.00 · 7d $2.00 · 30d $2.00" })

    expect(result.lines.find((line) => line.label === "gpt-5.5 · Today")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "gpt-5.5 · 7d")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "gpt-5.5 · 30d")).toBeUndefined()
  })

  it("prefers models over modelBreakdowns and omits invalid daily model usage", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 100,
            models: {
              "gpt-z": { totalTokens: 25 },
              "gpt-a": { totalTokens: 25 },
              "gpt-invalid": { totalTokens: -1 },
            },
            modelBreakdowns: [
              { modelName: "gpt-z", totalTokens: 999 },
            ],
          },
          {
            date: dayKey(1),
            totalTokens: 40,
            models: {},
            modelBreakdowns: [
              { modelName: "gpt-fallback", totalTokens: 40 },
              { modelName: "", totalTokens: 10 },
            ],
          },
          {
            date: dayKey(2),
            totalTokens: 10,
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const chart = result.lines.find((line) => line.label === "Usage Trend")

    expect(chart.points.find((point) => point.label === usageLabel(0)).modelUsage).toEqual([
      { name: "gpt-a", tokens: 25, costUsd: null, estimationStatus: "unknown" },
      { name: "gpt-z", tokens: 25, costUsd: null, estimationStatus: "unknown" },
    ])
    expect(chart.points.find((point) => point.label === usageLabel(1)).modelUsage).toEqual([
      { name: "gpt-fallback", tokens: 40, costUsd: null, estimationStatus: "unknown" },
    ])
    expect(chart.points.find((point) => point.label === usageLabel(2)).modelUsage).toEqual([])
  })

  it("omits Today/7d segments for a model with cost only outside those windows", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(10),
            totalTokens: 100,
            totalCost: 5,
            modelBreakdowns: [
              { modelName: "gpt-legacy", cost: 5, totalTokens: 100 },
            ],
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const legacy = result.lines.find((line) => line.label === "gpt-legacy")
    expect(legacy).toMatchObject({ type: "text", value: "100% · 30d $5.00" })
  })

  it("abbreviates cost amounts of $1,000 or more", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 100,
            totalCost: 1234.5,
            modelBreakdowns: [
              { modelName: "gpt-big-spender", cost: 1234.5, totalTokens: 100 },
            ],
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const big = result.lines.find((line) => line.label === "gpt-big-spender")
    expect(big).toMatchObject({
      type: "text",
      value: "100% · Today $1,235 · 7d $1,235 · 30d $1,235",
    })
  })

  it("leaves an unrecognized model id unchanged", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: dayKey(0),
            totalTokens: 100,
            totalCost: 1,
            modelBreakdowns: [
              { modelName: "some-custom-model", cost: 1, totalTokens: 100 },
            ],
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const custom = result.lines.find((line) => line.label === "some-custom-model")
    expect(custom).toMatchObject({
      type: "text",
      value: "100% · Today $1.00 · 7d $1.00 · 30d $1.00",
    })
  })
})
