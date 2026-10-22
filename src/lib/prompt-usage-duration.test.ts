import { describe, expect, it } from "vitest"
import { formatExecutionTime, promptDuration, sumPromptDurations } from "./prompt-usage-duration"
import type { PromptUsageTurn } from "./prompt-usage"

const prompt = (id: string, values: Partial<PromptUsageTurn> = {}): PromptUsageTurn => ({
  id, prompt: id, timeLabel: "10:00", startedAt: "2026-10-14T10:00:00Z", completedAt: "2026-10-14T10:02:18Z",
  tokens: { totalTokens: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 },
  agents: [], quotaObservation: null, costUsd: null, estimationStatus: "unknown", ...values,
})
const now = Date.parse("2026-10-14T10:05:00Z")

describe("Recorded execution time", () => {
  it("uses a recorded completion and keeps active elapsed time separate from missing endpoints", () => {
    expect(promptDuration(prompt("complete"), now)).toBe(138_000)
    expect(promptDuration(prompt("running", { isActive: true, completedAt: null }), now)).toBe(300_000)
    for (const values of [{ completedAt: null }, { interrupted: true }, { startedAt: null },
      { completedAt: "invalid" }, { completedAt: "2026-10-14T09:59:00Z" }, { startedAt: "2026-10-14T11:00:00Z", isActive: true }]) {
      expect(promptDuration(prompt("missing", values), now)).toBeNull()
    }
    expect(promptDuration(prompt("zero", { completedAt: "2026-10-14T10:00:00Z" }), now)).toBe(0)
  })
  it("sums each prompt once without counting time between prompts or multiplying agent elapsed time", () => {
    const first = prompt("first")
    const running = prompt("running", { isActive: true })
    const missing = prompt("missing", { completedAt: null })
    expect(sumPromptDurations([first, first, running, missing], now)).toEqual({ elapsed: 438_000, recorded: 2, total: 3, running: 1 })
    expect(sumPromptDurations([missing], now).elapsed).toBeNull()
  })
  it("formats zero and elapsed durations without losing small values", () => {
    expect(formatExecutionTime(0, "en-US")).toBe("0 sec")
    expect(formatExecutionTime(138_000, "en-US")).toBe("2 min 18 sec")
    expect(formatExecutionTime(3_900_000, "en-US")).toBe("1 hr 5 min")
    expect(formatExecutionTime(180_000_000, "en-US")).toBe("50 hr")
  })
})
