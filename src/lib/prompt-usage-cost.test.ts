import { describe, expect, it } from "vitest"
import type { MetricLine } from "@/lib/plugin-types"
import { parsePromptUsageSuffix } from "./prompt-usage"
import { mergeCostLines, parseCostLines, type PromptUsageCostLine } from "./prompt-usage-cost"

const line = (overrides: Partial<PromptUsageCostLine> = {}): PromptUsageCostLine => ({
  model: "gpt-6-astra", tokens: { input: 40, cacheRead: 20, cacheWrite: 40, output: 10 },
  rates: { input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10 },
  fees: { inputUsd: 0.00008, cacheReadUsd: 0.000004, cacheWriteUsd: 0.0001, outputUsd: 0.0001 },
  costUsd: 0.000284, estimationStatus: "historical_rate", observedAt: "2026-09-01T00:00:00Z", issues: [], ...overrides,
})

describe("Prompt Usage cost line boundary", () => {
  it("parses reconciled known totals and preserves omitted model explanations", () => {
    const unknown = line({ model: "unknown", rates: { input: null, cacheRead: null, cacheWrite: null, output: null }, fees: { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }, costUsd: null, estimationStatus: "unknown", observedAt: null, issues: ["missing_price"] })
    expect(parseCostLines([line(), unknown], 0.000284)).toEqual([line(), unknown])
    expect(parseCostLines([unknown], null)).toEqual([unknown])
  })

  it.each([
    undefined, null, {}, [{ ...line(), model: "" }], [{ ...line(), tokens: { ...line().tokens, input: -1 } }],
    [{ ...line(), rates: { ...line().rates, input: "2" } }], [{ ...line(), costUsd: Infinity }],
    [{ ...line(), fees: { ...line().fees, outputUsd: null } }], [{ ...line(), estimationStatus: "made_up" }],
    [{ ...line(), observedAt: {} }], [{ ...line(), issues: ["private_message"] }], [{ ...line(), costUsd: 1 }],
  ])("rejects malformed cost metadata: %j", value => {
    expect(parseCostLines(value, 0.000284)).toBeNull()
  })

  it("retains unknown pricing plus excluded zero-cost rows when the headline remains unknown", () => {
    const unpriced = line({ model: "unknown-model", rates: { input: null, cacheRead: null, cacheWrite: null, output: null }, fees: { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }, costUsd: null, estimationStatus: "unknown", observedAt: null, issues: ["missing_price"] })
    const excluded = { ...unpriced, model: "codex-auto-review", costUsd: 0, estimationStatus: "current_rate" as const, issues: ["excluded_internal_model" as const] }
    expect(parseCostLines([unpriced, excluded], null)).toEqual([unpriced, excluded])
    const freePriced = { ...excluded, issues: [], rates: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } }
    expect(parseCostLines([unpriced, freePriced], null)).toBeNull()
  })

  it("rejects operand mismatches and invalid observation dates even when fee totals reconcile", () => {
    expect(parseCostLines([line({ tokens: { ...line().tokens, input: 80 } })], 0.000284)).toBeNull()
    expect(parseCostLines([line({ rates: { ...line().rates, input: 4 } })], 0.000284)).toBeNull()
    expect(parseCostLines([line({ rates: { ...line().rates, input: null } })], 0.000284)).toBeNull()
    expect(parseCostLines([line({ observedAt: "not-a-date" })], 0.000284)).toBeNull()
    expect(parseCostLines([line({ observedAt: "" })], 0.000284)).toBeNull()
    const excluded = line({ costUsd: 0, rates: { input: null, cacheRead: null, cacheWrite: null, output: null }, fees: { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }, issues: ["excluded_internal_model"], estimationStatus: "current_rate", observedAt: null })
    expect(parseCostLines([excluded], 0)).toEqual([excluded])
  })

  it("carries validated model costs through Session, Prompt and Agent metadata", () => {
    const text = (label: string, metadata: object): MetricLine => ({ type: "text", label, value: label === "Prompt Usage" ? "1 prompt · 1 session" : label, subtitle: JSON.stringify(metadata), color: null, resetExpiry: null })
    const usage = { totalTokens: 110, inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, reasoningOutputTokens: 0 }
    const cost = { usage, models: [], promptCount: 1, costUsd: 0.000284, estimationStatus: "historical_rate", costLines: [line()] }
    const lines = [text("Prompt Usage", {}), text("Project Group", { id: "project", kind: "project", promptCount: 1, sessionCount: 1 }), text("Session", { id: "session", ...cost }), text("Prompt", { id: "turn", ...cost }), text("Agent", { id: "agent", kind: "main", ...cost })]
    const session = parsePromptUsageSuffix(lines).projects[0].sessions[0]
    expect(session.costLines).toEqual([line()])
    expect(session.turns[0].costLines).toEqual([line()])
    expect(session.turns[0].agents[0].costLines).toEqual([line()])
    lines[3] = text("Prompt", { id: "turn", ...cost, costLines: [{ ...line(), costUsd: 234 }] })
    expect(parsePromptUsageSuffix(lines).projects[0].sessions[0].turns[0].costLines).toBeNull()
  })

  it("rejects valid-looking ledgers that do not explain the headline", () => {
    expect(parseCostLines([line()], 1)).toBeNull()
    expect(parseCostLines([line()], null)).toBeNull()
    expect(parseCostLines([], 0)).toBeNull()
    expect(parseCostLines([], null)).toEqual([])
  })

  it("merges copies with matching model and rate snapshot without modifying inputs", () => {
    const original = line()
    const merged = mergeCostLines([{ costLines: [original] }, { costLines: [line()] }])!
    expect(merged).toHaveLength(1)
    expect(merged[0].tokens).toEqual({ input: 80, cacheRead: 40, cacheWrite: 80, output: 20 })
    expect(merged[0].costUsd).toBeCloseTo(0.000568, 12)
    expect(original).toEqual(line())
    expect(mergeCostLines([{ costLines: [line()] }, {}])).toBeNull()
    expect(mergeCostLines([{ costLines: [] }, { costLines: null }])).toBeNull()
  })

  it("never combines different rates, dates, estimation states or issue sets", () => {
    expect(mergeCostLines([{ costLines: [line(), line({ rates: { ...line().rates, input: 4 } }), line({ observedAt: "2026-10-01" }), line({ estimationStatus: "current_rate" }), line({ issues: ["incomplete_cache_write_usage"] })] }])).toHaveLength(5)
  })
})
