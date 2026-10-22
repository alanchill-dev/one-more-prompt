import type { PricingEstimationStatus } from "@/bindings"

export interface PromptUsageCostLine {
  model: string
  tokens: { input: number; cacheRead: number; cacheWrite: number; output: number }
  rates: { input: number | null; cacheRead: number | null; cacheWrite: number | null; output: number | null }
  fees: { inputUsd: number; cacheReadUsd: number; cacheWriteUsd: number; outputUsd: number }
  costUsd: number | null
  estimationStatus: PricingEstimationStatus
  observedAt: string | null
  issues: ("missing_price" | "missing_cache_read_price" | "missing_cache_write_price" | "incomplete_cache_write_usage" | "excluded_internal_model")[]
}

const categories = ["input", "cacheRead", "cacheWrite", "output"] as const
const statuses = ["historical_rate", "current_rate", "partial_rate", "unknown"]
const issues = ["missing_price", "missing_cache_read_price", "missing_cache_write_price", "incomplete_cache_write_usage", "excluded_internal_model"]
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const amount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0
const close = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, left, right) * 1e-10

/** Reject an incomplete ledger instead of presenting it as an explanation of the total. */
export function parseCostLines(value: unknown, costUsd: number | null): PromptUsageCostLine[] | null {
  if (!Array.isArray(value)) return null
  for (const line of value) {
    if (!object(line) || typeof line.model !== "string" || !line.model.trim()
      || !object(line.tokens) || !object(line.rates) || !object(line.fees)) return null
    const { tokens, rates, fees } = line
    if (!categories.every(key => amount(tokens[key]))
      || !categories.every(key => rates[key] === null || amount(rates[key]))
      || !categories.every(key => amount(fees[`${key}Usd`]))
      || !(line.costUsd === null || amount(line.costUsd))
      || !statuses.includes(line.estimationStatus as string)
      || !(line.observedAt === null || (typeof line.observedAt === "string" && Number.isFinite(Date.parse(line.observedAt))))
      || !Array.isArray(line.issues) || !line.issues.every(issue => issues.includes(issue))) return null
    if (!categories.every(key => rates[key] === null
      ? fees[`${key}Usd`] === 0
      : close((tokens[key] as number) / 1_000_000 * (rates[key] as number), fees[`${key}Usd`] as number))) return null
    const feeTotal = categories.reduce((sum, key) => sum + (fees[`${key}Usd`] as number), 0)
    if (line.costUsd !== null && !close(feeTotal, line.costUsd as number)) return null
    if (line.costUsd === null && feeTotal !== 0) return null
  }
  const lines = value as PromptUsageCostLine[]
  const priced = lines.filter(line => line.costUsd !== null)
  if (costUsd !== null && (!priced.length || !close(priced.reduce((sum, line) => sum + line.costUsd!, 0), costUsd))) return null
  if (costUsd === null && priced.some(line => line.costUsd !== 0 || !line.issues.includes("excluded_internal_model"))) return null
  return mergeCostLines([{ costLines: lines }])
}

/** Keep distinct rate snapshots separate, even when they share a model name. */
export function mergeCostLines(estimates: readonly { costLines?: PromptUsageCostLine[] | null }[]): PromptUsageCostLine[] | null {
  if (estimates.some(estimate => !Array.isArray(estimate.costLines))) return null
  const grouped = new Map<string, PromptUsageCostLine>()
  for (const estimate of estimates) {
    for (const line of estimate.costLines!) {
      const key = JSON.stringify([line.model, categories.map(category => line.rates[category]), line.estimationStatus, line.observedAt, line.issues])
      const previous = grouped.get(key)
      if (!previous) {
        grouped.set(key, { ...line, tokens: { ...line.tokens }, rates: { ...line.rates }, fees: { ...line.fees }, issues: [...line.issues] })
        continue
      }
      for (const category of categories) {
        previous.tokens[category] += line.tokens[category]
        previous.fees[`${category}Usd`] += line.fees[`${category}Usd`]
      }
      previous.costUsd = previous.costUsd === null || line.costUsd === null ? null : previous.costUsd + line.costUsd
    }
  }
  return [...grouped.values()]
}
