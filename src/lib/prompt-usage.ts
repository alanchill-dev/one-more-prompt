import type { MetricLine } from "@/lib/plugin-types"
import { canonicalModelName } from "@/lib/model-colors"
import type { PricingEstimationStatus } from "@/bindings"
import { parseCostLines, type PromptUsageCostLine } from "@/lib/prompt-usage-cost"
import { findPromptUsageHeaderIndex } from "@/lib/prompt-usage-summary"

export interface PromptUsageCostEstimate {
  costUsd: number | null
  costLines?: PromptUsageCostLine[] | null
  costBreakdown?: { inputUsd: number; cacheReadUsd: number; cacheWriteUsd: number; outputUsd: number } | null
  estimationStatus: PricingEstimationStatus
}

export interface PromptUsageTokens {
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  /** Sum of explicitly reported cache writes; missing means unreported. */
  cacheWriteInputTokens?: number | null
  cacheWriteInputTokensComplete?: boolean
  outputTokens: number
  reasoningOutputTokens: number
}

export interface PromptUsageModel extends PromptUsageTokens {
  name: string
  reasoningEfforts?: string[]
}

export interface PromptUsageAgent extends PromptUsageCostEstimate {
  id: string
  kind: "main" | "subagent"
  name: string
  role: string | null
  tokens: PromptUsageTokens
  models: PromptUsageModel[]
}

export type PromptUsageQuotaObservationStatus =
  | "measured"
  | "belowPrecision"
  | "pending"
  | "ambiguous"
  | "unavailable"

/**
 * Values in the plugin metadata intentionally retain their original string
 * form. The plugin may provide a decimal as a string, and the Prompt Usage UI
 * must not turn that into a made-up integer or trailing zeroes.
 */
export type PromptUsageQuotaValue = number | string | null

export interface PromptUsageQuotaObservation {
  status: PromptUsageQuotaObservationStatus
  usedBefore: PromptUsageQuotaValue
  usedAfter: PromptUsageQuotaValue
  delta: PromptUsageQuotaValue
  precision: PromptUsageQuotaValue
  resetAt: PromptUsageQuotaValue
  subagentCount: PromptUsageQuotaValue
  reason: string | null
}

export interface PromptUsageTurn extends PromptUsageCostEstimate {
  id: string
  timeLabel: string
  startedAt: string | null
  completedAt?: string | null
  prompt: string
  /** Explicit model identity reported by the Codex turn context/token event. */
  model?: string | null
  reasoningEfforts?: string[]
  /** Lifecycle and usage evidence from the local turn records. */
  isActive?: boolean
  retriedFromStartedAt?: string | null
  interrupted?: boolean
  tokenUsageRecorded?: boolean
  sourceThreadId?: string | null
  isDelegated?: boolean
  outgoingTasks?: PromptUsageRelatedTask[]
  tokens: PromptUsageTokens
  agents: PromptUsageAgent[]
  quotaObservation: PromptUsageQuotaObservation | null
}

export type PromptUsageDominantModel = {
  name: string
  canonicalName: string
  totalTokens: number
}

/**
 * Resolve the prompt's model identity without inventing one. Token-backed model
 * metadata wins because it can identify a dominant model by observed usage. If
 * no model has observed token usage, fall back to the explicit turn-level model
 * identity captured from Codex. Agent names/roles are execution structure and
 * are never valid model fallbacks.
 */
export function dominantPromptUsageModel(turn: PromptUsageTurn): PromptUsageDominantModel | null {
  const totals = new Map<string, PromptUsageDominantModel>()
  for (const agent of turn.agents) {
    for (const model of agent.models) {
      const canonicalName = canonicalModelName(model.name)
      if (!canonicalName) continue
      const previous = totals.get(canonicalName)
      totals.set(canonicalName, {
        name: previous?.name ?? model.name.trim(),
        canonicalName,
        totalTokens: (previous?.totalTokens ?? 0) + model.totalTokens,
      })
    }
  }

  const rankedModels = [...totals.values()].sort((left, right) => (
    right.totalTokens - left.totalTokens || left.canonicalName.localeCompare(right.canonicalName)
  ))
  const tokenBacked = rankedModels.find((model) => model.totalTokens > 0)
  if (tokenBacked) return tokenBacked

  const explicitModel = turn.model?.trim() ?? ""
  const explicitCanonicalName = canonicalModelName(explicitModel)
  if (explicitModel && explicitCanonicalName) {
    return { name: explicitModel, canonicalName: explicitCanonicalName, totalTokens: 0 }
  }

  return rankedModels[0] ?? null
}

export interface PromptUsageRelatedTask {
  id: string
  title: string
}

export interface PromptUsageSession extends PromptUsageCostEstimate {
  id: string
  createdAt?: string | null
  descendantThreadIds?: string[]
  title: string
  updatedAt: string | null
  promptCount: number
  isActive: boolean
  codexOrder: number | null
  isDelegated?: boolean
  relatedSourceId?: string | null
  relatedSourceTitle?: string | null
  relatedTaskCount?: number
  relatedTasks?: PromptUsageRelatedTask[]
  turns: PromptUsageTurn[]
}

export interface PromptUsageProject {
  id: string
  kind: "project" | "standalone"
  name: string
  updatedAt: string | null
  promptCount: number
  sessionCount: number
  isActive: boolean
  codexOrder: number | null
  sessions: PromptUsageSession[]
}

export interface PromptUsageParseResult {
  usageLines: MetricLine[]
  projects: PromptUsageProject[]
  promptCount: number
  sessionCount: number
  hasPromptUsage: boolean
  privacyNote: string | null
  error: string | null
}

function isTextLine(line: MetricLine | undefined): line is Extract<MetricLine, { type: "text" }> {
  return line?.type === "text"
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function countValue(value: unknown): number | null {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : null
}

function parseCostEstimate(source: Record<string, unknown>): PromptUsageCostEstimate {
  const rawCost = source.costUsd
  const costUsd = rawCost == null ? null : countValue(rawCost)
  const estimationStatus = source.estimationStatus === "historical_rate"
    || source.estimationStatus === "current_rate"
    || source.estimationStatus === "partial_rate"
    || source.estimationStatus === "unknown"
    ? source.estimationStatus
    : costUsd == null ? "unknown" : "current_rate"
  const breakdown = objectValue(source.costBreakdown)
  const fees = breakdown && ["inputUsd", "cacheReadUsd", "cacheWriteUsd", "outputUsd"].map((key) => breakdown[key])
  const costBreakdown = estimationStatus !== "unknown" && costUsd != null && fees?.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? { inputUsd: fees[0] as number, cacheReadUsd: fees[1] as number, cacheWriteUsd: fees[2] as number, outputUsd: fees[3] as number }
    : null
  return {
    costUsd: estimationStatus === "unknown" ? null : costUsd,
    estimationStatus,
    ...(source.costBreakdown !== undefined ? { costBreakdown } : {}),
    costLines: parseCostLines(source.costLines, estimationStatus === "unknown" ? null : costUsd),
  }
}

const QUOTA_OBSERVATION_STATUSES = new Set<PromptUsageQuotaObservationStatus>([
  "measured",
  "belowPrecision",
  "pending",
  "ambiguous",
  "unavailable",
])

const INVALID_QUOTA_VALUE = Symbol("invalid quota observation value")

function quotaValue(value: unknown): PromptUsageQuotaValue | typeof INVALID_QUOTA_VALUE {
  if (value == null) return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_QUOTA_VALUE
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || !Number.isFinite(Number(trimmed))) return INVALID_QUOTA_VALUE
    return trimmed
  }
  return INVALID_QUOTA_VALUE
}

function quotaResetValue(value: unknown): PromptUsageQuotaValue | typeof INVALID_QUOTA_VALUE {
  if (value == null) return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_QUOTA_VALUE
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : INVALID_QUOTA_VALUE
  }
  return INVALID_QUOTA_VALUE
}

function nonNegativeQuotaValue(value: PromptUsageQuotaValue): boolean {
  if (value == null) return true
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0
}

function nonNegativeIntegerQuotaValue(value: PromptUsageQuotaValue): boolean {
  if (value == null) return true
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 0
}

function parseQuotaObservation(value: unknown): PromptUsageQuotaObservation | null {
  const source = objectValue(value)
  if (!source || !QUOTA_OBSERVATION_STATUSES.has(source.status as PromptUsageQuotaObservationStatus)) return null

  const usedBefore = quotaValue(source.usedBefore)
  const usedAfter = quotaValue(source.usedAfter)
  const delta = quotaValue(source.delta)
  const precision = quotaValue(source.precision)
  const resetAt = quotaResetValue(source.resetAt)
  const subagentCount = quotaValue(source.subagentCount)
  if (
    usedBefore === INVALID_QUOTA_VALUE || usedAfter === INVALID_QUOTA_VALUE ||
    delta === INVALID_QUOTA_VALUE || precision === INVALID_QUOTA_VALUE ||
    resetAt === INVALID_QUOTA_VALUE || subagentCount === INVALID_QUOTA_VALUE
  ) return null
  if (
    !nonNegativeQuotaValue(usedBefore) || !nonNegativeQuotaValue(usedAfter) ||
    !nonNegativeQuotaValue(delta) || !nonNegativeQuotaValue(precision) ||
    !nonNegativeIntegerQuotaValue(subagentCount)
  ) return null

  const reason = source.reason == null
    ? null
    : typeof source.reason === "string" && source.reason.trim()
      ? source.reason.trim()
      : null
  if (source.reason != null && reason == null) return null

  return {
    status: source.status as PromptUsageQuotaObservationStatus,
    usedBefore,
    usedAfter,
    delta,
    precision,
    resetAt,
    subagentCount,
    reason,
  }
}

function parseTokens(value: unknown): PromptUsageTokens | null {
  const source = objectValue(value)
  if (!source) return null
  const totalTokens = countValue(source.totalTokens)
  const inputTokens = countValue(source.inputTokens)
  const cachedInputTokens = countValue(source.cachedInputTokens)
  const outputTokens = countValue(source.outputTokens)
  const reasoningOutputTokens = countValue(source.reasoningOutputTokens)
  if (
    totalTokens == null || inputTokens == null || cachedInputTokens == null ||
    outputTokens == null || reasoningOutputTokens == null
  ) return null
  return { totalTokens, inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, ...(typeof source.cacheWriteInputTokensComplete === "boolean" ? { cacheWriteInputTokensComplete: source.cacheWriteInputTokensComplete } : {}), ...(source.cacheWriteInputTokens != null ? { cacheWriteInputTokens: countValue(source.cacheWriteInputTokens) } : {}) }
}

function parseReasoningEfforts(value: unknown): string[] {
  const allowed = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]
  return Array.isArray(value) ? [...new Set(value.filter((effort): effort is string => typeof effort === "string" && allowed.includes(effort)))] : []
}

function parseModels(value: unknown): PromptUsageModel[] | null {
  if (!Array.isArray(value)) return null
  const models: PromptUsageModel[] = []
  for (const entry of value) {
    const source = objectValue(entry)
    const name = textValue(source?.name)
    const tokens = parseTokens(source?.usage)
    if (!name || !tokens) return null
    models.push({ name, ...tokens, reasoningEfforts: parseReasoningEfforts(source?.reasoningEfforts) })
  }
  return models
}

function parseRelatedTasks(value: unknown): PromptUsageRelatedTask[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const source = objectValue(entry)
    const id = textValue(source?.id)
    const title = textValue(source?.title)
    return id && title ? [{ id, title }] : []
  })
}

function parseHeaderValue(value: string): { prompts: number; sessions: number } | null {
  const match = value.trim().match(/^(\d+)\s+prompts?\s+·\s+(\d+)\s+sessions?$/i)
  return match ? { prompts: Number(match[1]), sessions: Number(match[2]) } : null
}

export function parsePromptUsageSuffix(lines: MetricLine[]): PromptUsageParseResult {
  const headerIndex = findPromptUsageHeaderIndex(lines)

  const base: PromptUsageParseResult = {
    usageLines: headerIndex >= 0 ? lines.slice(0, headerIndex) : lines,
    projects: [],
    promptCount: 0,
    sessionCount: 0,
    hasPromptUsage: headerIndex >= 0,
    privacyNote: null,
    error: null,
  }
  if (headerIndex < 0) return base

  const header = lines[headerIndex]
  const fail = (): PromptUsageParseResult => ({
    ...base,
    privacyNote: isTextLine(header) ? header.subtitle?.trim() || null : null,
    error: "Prompt Usage data could not be parsed. Usage data is still available.",
  })
  if (!isTextLine(header)) return fail()
  const headerCounts = parseHeaderValue(header.value)
  if (!headerCounts) return fail()

  const projects: PromptUsageProject[] = []
  let currentProject: PromptUsageProject | null = null
  let currentSession: PromptUsageSession | null = null
  let currentTurn: PromptUsageTurn | null = null

  for (const line of lines.slice(headerIndex + 1)) {
    if (!isTextLine(line)) return fail()

    if (line.label === "Project Group") {
      const meta = objectValue(parseJson(line.subtitle))
      const id = textValue(meta?.id)
      const kind = meta?.kind === "project" || meta?.kind === "standalone" ? meta.kind : null
      const sessionCount = countValue(meta?.sessionCount)
      const promptCount = countValue(meta?.promptCount)
      if (!id || !kind || sessionCount == null || promptCount == null || !line.value.trim()) return fail()
      currentProject = {
        id,
        kind,
        name: line.value.trim(),
        updatedAt: textValue(meta?.latestAt),
        promptCount,
        sessionCount,
        isActive: meta?.isActive === true,
        codexOrder: countValue(meta?.codexOrder),
        sessions: [],
      }
      projects.push(currentProject)
      currentSession = null
      currentTurn = null
      continue
    }

    if (line.label === "Session") {
      const meta = objectValue(parseJson(line.subtitle))
      const id = textValue(meta?.id)
      const promptCount = countValue(meta?.promptCount)
      if (!currentProject || !id || promptCount == null || !line.value.trim()) return fail()
      currentSession = {
        id,
        title: line.value.trim(),
        createdAt: textValue(meta?.createdAt),
        descendantThreadIds: Array.isArray(meta?.descendantThreadIds)
          ? [...new Set(meta.descendantThreadIds.map(textValue).filter((value): value is string => value !== null && value !== id))]
          : [],
        updatedAt: textValue(meta?.latestAt),
        promptCount,
        isActive: meta?.isActive === true,
        codexOrder: countValue(meta?.codexOrder),
        isDelegated: meta?.isDelegated === true,
        relatedSourceId: textValue(meta?.relatedSourceId),
        relatedSourceTitle: textValue(meta?.relatedSourceTitle),
        relatedTaskCount: countValue(meta?.relatedTaskCount) ?? 0,
        relatedTasks: parseRelatedTasks(meta?.relatedTasks),
        ...parseCostEstimate(meta ?? {}),
        turns: [],
      }
      currentProject.sessions.push(currentSession)
      currentTurn = null
      continue
    }

    if (line.label === "Prompt") {
      const meta = objectValue(parseJson(line.subtitle))
      const id = textValue(meta?.id)
      const tokens = parseTokens(meta?.usage)
      if (!currentSession || !id || !tokens || !line.value.trim() || currentSession.turns.some((turn) => turn.id === id)) return fail()
      currentTurn = {
        id,
        prompt: line.value.trim(),
        sourceThreadId: textValue(meta?.sourceThreadId),
        isDelegated: meta?.isDelegated === true,
        outgoingTasks: parseRelatedTasks(meta?.outgoingTasks),
        startedAt: textValue(meta?.startedAt),
        completedAt: textValue(meta?.completedAt),
        timeLabel: textValue(meta?.timeLabel) || "Recent",
        model: textValue(meta?.model),
        reasoningEfforts: parseReasoningEfforts(meta?.reasoningEfforts),
        isActive: meta?.isActive === true,
        retriedFromStartedAt: textValue(meta?.retriedFromStartedAt),
        interrupted: typeof meta?.interrupted === "boolean" ? meta.interrupted : undefined,
        tokenUsageRecorded: typeof meta?.tokenUsageRecorded === "boolean" ? meta.tokenUsageRecorded : undefined,
        tokens,
        ...parseCostEstimate(meta ?? {}),
        agents: [],
        quotaObservation: parseQuotaObservation(meta?.quotaObservation),
      }
      currentSession.turns.push(currentTurn)
      if (currentTurn.isDelegated) currentSession.isDelegated = true
      if (!currentSession.relatedSourceId && currentTurn.sourceThreadId) {
        currentSession.relatedSourceId = currentTurn.sourceThreadId
      }
      continue
    }

    if (line.label === "Agent") {
      const meta = objectValue(parseJson(line.subtitle))
      const id = textValue(meta?.id)
      const kind = meta?.kind === "main" || meta?.kind === "subagent" ? meta.kind : null
      const tokens = parseTokens(meta?.usage)
      const models = parseModels(meta?.models)
      if (!currentTurn || !id || !kind || !tokens || !models || !line.value.trim()) return fail()
      currentTurn.agents.push({
        id,
        kind,
        name: line.value.trim(),
        role: textValue(meta?.role),
        tokens,
        models,
        ...parseCostEstimate(meta ?? {}),
      })
      continue
    }

    return fail()
  }

  const sessions = projects.flatMap((project) => project.sessions)
  const promptCount = sessions.reduce((sum, session) => sum + session.turns.length, 0)
  const projectCountsMatch = projects.every((project) => (
    project.sessions.length === project.sessionCount &&
    project.sessions.reduce((sum, session) => sum + session.turns.length, 0) === project.promptCount
  ))
  if (
    projects.length === 0 || sessions.length !== headerCounts.sessions ||
    promptCount !== headerCounts.prompts || !projectCountsMatch ||
    sessions.some((session) => session.turns.length !== session.promptCount) ||
    sessions.some((session) => session.turns.some((turn) => turn.agents.length === 0))
  ) return fail()

  return {
    ...base,
    projects,
    promptCount,
    sessionCount: sessions.length,
    privacyNote: header.subtitle?.trim() || null,
  }
}
