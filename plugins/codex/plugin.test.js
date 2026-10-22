import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin
}

const makeJwt = (payload) => [
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
  Buffer.from(JSON.stringify(payload)).toString("base64url"),
  "signature",
].join(".")

const dayKey = (daysAgo) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

describe("codex plugin", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  const writePromptUsageSession = (ctx, path, { id, prompt, timestamp, cwd = "/tmp/Notion" }) => {
    ctx.host.fs.writeText(path, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd, thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: `${id}-turn`, model: "gpt-5.6-sol", cwd } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, cache_write_input_tokens: 0, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n"))
  }

  const provisionalPromptUsageSession = ({ id, prompt, timestamp, cwd = "/tmp/example-project" }) => [
    JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd, thread_source: "user" } }),
    JSON.stringify({
      type: "response_item",
      timestamp,
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp,
      payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    }),
  ].join("\n")

  const writeQuotaSession = (ctx, path, { id, turns, cwd = "/tmp/Notion" }) => {
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp: turns[0].startedAt, payload: { id, cwd, thread_source: "user" } }),
    ]
    for (const turn of turns) {
      lines.push(JSON.stringify({
        type: "turn_context",
        timestamp: turn.startedAt,
        payload: { turn_id: turn.turnId, model: "gpt-5.6-sol", cwd },
      }))
      lines.push(JSON.stringify({
        type: "event_msg",
        timestamp: turn.startedAt,
        payload: { type: "task_started", turn_id: turn.turnId },
      }))
      lines.push(JSON.stringify({
        type: "event_msg",
        timestamp: turn.startedAt,
        payload: { type: "user_message", message: turn.prompt },
      }))
      lines.push(JSON.stringify({
        type: "event_msg",
        timestamp: turn.completedAt || turn.startedAt,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } } },
      }))
      if (turn.completedAt) {
        lines.push(JSON.stringify({
          type: "event_msg",
          timestamp: turn.completedAt,
          payload: { type: "task_complete", turn_id: turn.turnId },
        }))
      }
    }
    ctx.host.fs.writeText(path, lines.join("\n"))
  }

  const quotaApi = (ctx, samples) => {
    let index = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return { status: 500, headers: {}, bodyText: "" }
      }
      const sample = samples[Math.min(index++, samples.length - 1)]
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          rate_limit: {
            primary_window: {
              used_percent: 20,
              limit_window_seconds: 18000,
              reset_at: 1_800_000_000,
            },
            secondary_window: {
              used_percent: sample.used,
              limit_window_seconds: 604800,
              reset_at: sample.resetAt || 1_800_604_800,
            },
          },
        }),
      }
    })
  }

  const probeDisplayedPrompt = async (prompt, id = "prompt-cleaning") => {
    const ctx = makeCtx()
    const timestamp = ctx.nowIso
    const root = "~/.codex/sessions/2026/02/02"
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: timestamp,
    }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/${id}.jsonl`, { id, prompt, timestamp })

    const result = (await loadPlugin()).probe(ctx)
    return result.lines.find((line) => line.label === "Prompt").value
  }

  it("adds date-aware cost metadata to prompt usage without pricing unknown models at zero", async () => {
    const ctx = makeCtx()
    const timestamp = ctx.nowIso
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: timestamp,
    }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, "~/.codex/sessions/2026/02/02/priced.jsonl", {
      id: "priced",
      prompt: "Estimate this prompt",
      timestamp,
    })
    ctx.host.pricing = {
      lookup: vi.fn(() => ({
        input: 2,
        output: 10,
        cacheRead: 0.2,
        estimationStatus: "current_rate",
      })),
    }

    const known = (await loadPlugin()).probe(ctx)
    const promptMeta = JSON.parse(known.lines.find((line) => line.label === "Prompt").subtitle)
    const sessionMeta = JSON.parse(known.lines.find((line) => line.label === "Session").subtitle)
    const agentMeta = JSON.parse(known.lines.find((line) => line.label === "Agent").subtitle)
    expect(promptMeta).toMatchObject({ costUsd: 0.000012, estimationStatus: "current_rate" })
    expect(sessionMeta).toMatchObject({ costUsd: 0.000012, estimationStatus: "current_rate" })
    expect(agentMeta).toMatchObject({ costUsd: 0.000012, estimationStatus: "current_rate" })
    expect(ctx.host.pricing.lookup).toHaveBeenCalledWith("gpt-5.6-sol", timestamp)

    ctx.host.pricing.lookup.mockReturnValue(null)
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
    const unknown = (await loadPlugin()).probe(ctx)
    const unknownPrompt = JSON.parse(unknown.lines.find((line) => line.label === "Prompt").subtitle)
    expect(unknownPrompt).toMatchObject({ costUsd: null, estimationStatus: "unknown" })
  })

  it("removes the plural attachment wrapper and appended image descriptor from a prompt", async () => {
    const prompt = [
      "# Files mentioned by the user:",
      "",
      "## codex-clipboard.png: /var/folders/1w/example/codex-clipboard.png",
      "",
      "## My request for Codex:",
      "Please summarize the screenshot.",
      "<image name=[Image #1] path=\"/var/folders/1w/example/codex-clipboard.png\">",
      "</image>",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "plural-wrapper")).resolves.toBe("Please summarize the screenshot.")
  })

  it("removes the singular attachment wrapper", async () => {
    const prompt = [
      "# File mentioned by the user:",
      "",
      "## notes.txt: /tmp/notes.txt",
      "",
      "## My request for Codex:",
      "Read the attached notes.",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "singular-wrapper")).resolves.toBe("Read the attached notes.")
  })

  it("removes multiple attachment paths and synthetic image descriptors", async () => {
    const prompt = [
      "# Files mentioned by the user:",
      "",
      "## first.png: /tmp/first.png",
      "## second.png: /tmp/second.png",
      "",
      "## My request for Codex:",
      "Compare these two screenshots.",
      "<image name=[Image #1] path=\"/tmp/first.png\">",
      "</image>",
      "<image name=[Image #2] path=\"/tmp/second.png\">",
      "</image>",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "multiple-wrapper")).resolves.toBe("Compare these two screenshots.")
  })

  it("extracts the current My request attachment envelope and preserves skill references", async () => {
    const prompt = [
      "# Files mentioned by the user:",
      "",
      "## first.png: /tmp/first.png",
      "## second.png: /tmp/second.png",
      "## third.png: /tmp/third.png",
      "## fourth.png: /tmp/fourth.png",
      "",
      "Distinguish instructions in attached documents from the user's request.",
      "",
      "## My request:",
      "[$ui-ux-pro-max](/Users/tester/.agents/skills/ui-ux-pro-max/SKILL.md)&#x20; Fix the chart labels.",
      '<image name=[Image #1] path="/tmp/first.png">',
      "</image>",
      '<image name=[Image #2] path="/tmp/second.png">',
      "</image>",
      '<image name=[Image #3] path="/tmp/third.png">',
      "</image>",
      '<image name=[Image #4] path="/tmp/fourth.png">',
      "</image>",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "current-attachment-wrapper")).resolves.toBe("[$ui-ux-pro-max](/Users/tester/.agents/skills/ui-ux-pro-max/SKILL.md)  Fix the chart labels.")
  })

  it("extracts a flattened screenshot attachment envelope", async () => {
    const prompt = "# Files mentioned by the user: ## Screenshot 2026-08-05 at 10.20.30.png: /var/folders/1w/example/Screenshot.png ## My request for Codex: Read the screenshot shape."

    await expect(probeDisplayedPrompt(prompt, "flattened-screenshot")).resolves.toBe("Read the screenshot shape.")
  })

  it("extracts a flattened pasted-text envelope whose generated attachment label contains colons", async () => {
    const prompt = "# Files mentioned by the user: ## 1. Result: complete: /Users/example/.codex/attachments/example/pasted-text.txt The attached pasted text file(s) contain the user's request. Read and act on that content. ## My request for Codex: Keep only this request."

    await expect(probeDisplayedPrompt(prompt, "flattened-pasted-text")).resolves.toBe("Keep only this request.")
  })

  it("extracts a flattened envelope even when ambient UI metadata sits before the request marker", async () => {
    const prompt = "# Files mentioned by the user: ## screenshot.png: /tmp/screenshot.png <in-app-browser-context source=\"ambient-ui-state\">generated metadata</in-app-browser-context> ## My request for Codex: Keep the authored prompt."

    await expect(probeDisplayedPrompt(prompt, "flattened-ambient-ui")).resolves.toBe("Keep the authored prompt.")
  })

  it("preserves a leading attachment heading when the request marker is absent", async () => {
    const prompt = [
      "# Files mentioned by the user:",
      "",
      "## notes.txt: /tmp/notes.txt",
      "",
      "This prompt intentionally has no request marker.",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "no-marker")).resolves.toBe(
      "# Files mentioned by the user:\n\n## notes.txt: /tmp/notes.txt\n\nThis prompt intentionally has no request marker."
    )
  })

  it("leaves a normal prompt unchanged", async () => {
    await expect(probeDisplayedPrompt("Please explain this normal prompt.", "normal-prompt")).resolves.toBe("Please explain this normal prompt.")
  })

  it("strips a safe trailing image descriptor without changing the request text", async () => {
    const prompt = [
      "## My request for Codex:",
      "Keep this request text.",
      "<image name=[Image #1] path=\"/tmp/screenshot.png\">",
      "</image>",
    ].join("\n")

    await expect(probeDisplayedPrompt(prompt, "image-only-wrapper")).resolves.toBe("Keep this request text.")
  })

  it("preserves plugin and bare skill labels for the prompt renderer", async () => {
    const prompt = "[@i-have-adhd](plugin://i-have-adhd) [$swiftui-expert-skill] [@subagent] Please keep this body."

    await expect(probeDisplayedPrompt(prompt, "ui-only-references")).resolves.toBe(prompt)
  })

  it("does not count Codex-injected skill or AGENTS context as prompts", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    const root = `~/.codex/sessions/${timestamp.slice(0, 10).replaceAll("-", "/")}`
    ctx.host.fs.writeText(`${root}/context.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "context-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "response_item", timestamp, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<skill><name>ui-ux-pro-max</name><path>/tmp/SKILL.md</path>instructions</skill>" }] } }),
      JSON.stringify({ type: "response_item", timestamp, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /tmp/example-project\n\n<INSTRUCTIONS>generated context</INSTRUCTIONS>" }] } }),
      JSON.stringify({ type: "response_item", timestamp, payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Keep only this authored prompt." }] } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } } }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")

    expect(prompts).toHaveLength(1)
    expect(prompts[0].value).toBe("Keep only this authored prompt.")
  })

  it("keeps the named reference when a prompt contains only a skill link", async () => {
    const prompt = "[$swiftui-expert-skill](/Users/example/.codex/skills/swiftui-expert-skill/SKILL.md)"

    await expect(probeDisplayedPrompt(prompt, "strict-skill-link")).resolves.toBe(prompt)
  })

  it("preserves ASCII and full-width parenthesized authored paths", async () => {
    const prompt = "Please summarize this. (/Users/example/.codex/skills/one/SKILL.md) （/Users/example/.codex/skills/two/SKILL.md）"

    await expect(probeDisplayedPrompt(prompt, "parenthesized-skill-paths")).resolves.toBe(prompt)
  })

  it("keeps token accounting for a prompt containing only a parenthesized UI path", async () => {
    const prompt = "（/Users/example/.codex/skills/only/SKILL.md）"

    await expect(probeDisplayedPrompt(prompt, "parenthesized-only-skill-path")).resolves.toBe(prompt)
  })

  it("derives Session and Weekly labels and durations from either window position", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) return { status: 500, headers: {}, bodyText: "" }
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          rate_limit: {
            primary_window: { used_percent: 4, limit_window_seconds: 604800 },
            secondary_window: { used_percent: 1, limit_window_seconds: 18000 },
          },
        }),
      }
    })

    const result = (await loadPlugin()).probe(ctx)
    expect(result.lines.find((line) => line.label === "Weekly")).toMatchObject({
      used: 4,
      periodDurationMs: 604800000,
    })
    expect(result.lines.find((line) => line.label === "Session")).toMatchObject({
      used: 1,
      periodDurationMs: 18000000,
    })
  })

  it("keeps the active probe lightweight and skips history and reset-credit requests", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 31, limit_window_seconds: 18000 },
          secondary_window: { used_percent: 12, limit_window_seconds: 604800 },
        },
      }),
    })

    const result = (await loadPlugin()).probeActive(ctx)

    expect(result.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "progress", label: "Session", used: 31 }),
      expect.objectContaining({ type: "progress", label: "Weekly", used: 12 }),
    ]))
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.http.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://chatgpt.com/backend-api/wham/usage",
    }))
    expect(ctx.host.ccusage.query).not.toHaveBeenCalled()
  })

  it("uses a first-run weekly sample only as baseline, then measures one completed prompt after a stable repeat", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const root = "~/.codex/sessions/2026/08/05"
    const sessionPath = `${root}/quota.jsonl`
    const baselineAt = new Date(Date.now() + 1000).toISOString()
    const completedAt = new Date(Date.now() + 2000).toISOString()
    const secondAt = new Date(Date.now() + 3000).toISOString()
    const secondCompletedAt = new Date(Date.now() + 4000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token", account_id: "acct-sensitive-123" }, last_refresh: baselineAt }))
    writeQuotaSession(ctx, sessionPath, {
      id: "quota-session",
      turns: [{ turnId: "turn-1", prompt: "Baseline prompt", startedAt: baselineAt, completedAt }],
    })
    quotaApi(ctx, [{ used: 0 }, { used: 4 }, { used: 4 }])

    const first = plugin.probe(ctx)
    const firstPrompt = first.lines.find((line) => line.label === "Prompt")
    expect(JSON.parse(firstPrompt.subtitle)).toMatchObject({ completedAt })
    expect(JSON.parse(firstPrompt.subtitle).quotaObservation).toBeUndefined()

    writeQuotaSession(ctx, sessionPath, {
      id: "quota-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline prompt", startedAt: baselineAt, completedAt },
        { turnId: "turn-2", prompt: "Measured prompt", startedAt: secondAt, completedAt: secondCompletedAt },
      ],
    })
    const pending = plugin.probe(ctx)
    const pendingPrompt = pending.lines.find((line) => line.value === "Measured prompt")
    expect(JSON.parse(pendingPrompt.subtitle).quotaObservation).toMatchObject({
      status: "pending",
      usedBefore: 0,
      usedAfter: 4,
      precision: 1,
      subagentCount: 0,
    })
    expect(JSON.parse(pendingPrompt.subtitle).quotaObservation).not.toHaveProperty("_stableCount")

    const settled = plugin.probe(ctx)
    const settledPrompt = settled.lines.find((line) => line.value === "Measured prompt")
    expect(JSON.parse(settledPrompt.subtitle).quotaObservation).toMatchObject({
      status: "measured",
      usedBefore: 0,
      usedAfter: 4,
      delta: 4,
      precision: 1,
    })
    const statePath = "/tmp/one-more-prompt-test/plugin/codex-weekly-quota-observations-v1.json"
    const state = JSON.parse(ctx.host.fs.readText(statePath))
    expect(state.accountKey).toMatch(/^sha256:/)
    expect(JSON.stringify(state)).not.toContain("acct-sensitive-123")
    expect(state.observations["quota-session:turn-2"].status).toBe("measured")
  })

  it("migrates quota state while preserving stable turns and suppressing renamed provisional history", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const base = Date.now()
    const baselineAt = new Date(base - 10_000).toISOString()
    const stableAt = new Date(base - 5_000).toISOString()
    const stableDone = new Date(base - 4_500).toISOString()
    const provisionalAt = new Date(base - 4_000).toISOString()
    const seenAt = new Date(base - 1_000).toISOString()
    const root = "~/.codex/sessions/2026/08/27"
    const stablePath = `${root}/quota-stable.jsonl`
    const provisionalPath = `${root}/quota-provisional.jsonl`
    const statePath = "/tmp/one-more-prompt-test/plugin/codex-weekly-quota-observations-v1.json"
    const stableKey = "stable-session:stable-turn"
    const legacyPendingKey = "pending-session:pending-session#pending-1"
    const migratedPendingKey = `pending-session:${provisionalPath}#pending-1`
    const sample = {
      used: 4,
      precision: 1,
      resetAt: "2027-01-21T16:00:00.000Z",
      resetKey: "1800604800",
      sampledAt: seenAt,
    }

    writeQuotaSession(ctx, stablePath, {
      id: "stable-session",
      turns: [{ turnId: "stable-turn", prompt: "Stable prompt", startedAt: stableAt, completedAt: stableDone }],
    })
    ctx.host.fs.writeText(provisionalPath, provisionalPromptUsageSession({
      id: "pending-session",
      prompt: "Historical provisional prompt",
      timestamp: provisionalAt,
    }))
    ctx.host.fs.writeText(statePath, JSON.stringify({
      version: 2,
      accountKey: "unknown",
      baseline: { ...sample, sampledAt: baselineAt },
      lastSample: sample,
      trackingStartedAt: baselineAt,
      watermark: { sessionId: "pending-session", turnId: "pending-session#pending-1", startedAt: provisionalAt },
      seen: {
        [stableKey]: {
          sessionId: "stable-session",
          turnId: "stable-turn",
          startedAt: stableAt,
          completedAt: stableDone,
          seenAt,
          subagentCount: 0,
        },
        [legacyPendingKey]: {
          sessionId: "pending-session",
          turnId: "pending-session#pending-1",
          startedAt: provisionalAt,
          completedAt: null,
          seenAt,
          subagentCount: 0,
        },
      },
      observations: {
        [stableKey]: {
          status: "measured",
          usedBefore: 0,
          usedAfter: 4,
          delta: 4,
          precision: 1,
          resetAt: sample.resetAt,
          subagentCount: 0,
          reason: "single_root_prompt",
        },
        [legacyPendingKey]: {
          status: "ambiguous",
          usedBefore: null,
          usedAfter: null,
          delta: null,
          precision: null,
          resetAt: sample.resetAt,
          subagentCount: 0,
          reason: "multiple_prompts_between_samples",
        },
      },
    }))

    const beforeFullProbe = plugin.probePromptUsage(ctx)
    expect(JSON.parse(beforeFullProbe.lines.find((line) => line.label === "Prompt" && line.value === "Stable prompt").subtitle)).toMatchObject({
      id: "stable-turn",
      quotaObservation: { status: "measured" },
    })
    expect(JSON.parse(beforeFullProbe.lines.find((line) => line.label === "Prompt" && line.value === "Historical provisional prompt").subtitle).quotaObservation)
      .toBeUndefined()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: seenAt,
    }))
    quotaApi(ctx, [{ used: 4 }])
    const migrated = plugin.probe(ctx)
    const state = JSON.parse(ctx.host.fs.readText(statePath))

    expect(JSON.parse(migrated.lines.find((line) => line.label === "Prompt" && line.value === "Stable prompt").subtitle).quotaObservation.status)
      .toBe("measured")
    expect(JSON.parse(migrated.lines.find((line) => line.label === "Prompt" && line.value === "Historical provisional prompt").subtitle).quotaObservation)
      .toBeUndefined()
    expect(state.version).toBe(3)
    expect(Date.parse(state.baseline.sampledAt)).toBeGreaterThan(Date.parse(seenAt))
    expect(state.trackingStartedAt).toBe(state.baseline.sampledAt)
    expect(state.watermark).toEqual({ startedAt: provisionalAt, keys: [migratedPendingKey] })
    expect(state.observations[stableKey].status).toBe("measured")
    expect(state.seen[legacyPendingKey]).toBeUndefined()
    expect(state.observations[legacyPendingKey]).toBeUndefined()
    expect(state.seen[migratedPendingKey]).toBeUndefined()
    expect(state.observations[migratedPendingKey]).toBeUndefined()
    expect(ctx.host.log.info).toHaveBeenCalledWith("weekly quota state migrated from version 2 to 3")

    const nextProbe = plugin.probe(ctx)
    const nextState = JSON.parse(ctx.host.fs.readText(statePath))
    expect(JSON.parse(nextProbe.lines.find((line) => line.label === "Prompt" && line.value === "Stable prompt").subtitle).quotaObservation.status)
      .toBe("measured")
    expect(JSON.parse(nextProbe.lines.find((line) => line.label === "Prompt" && line.value === "Historical provisional prompt").subtitle).quotaObservation)
      .toBeUndefined()
    expect(Object.keys(nextState.seen)).toEqual([stableKey])
    expect(Object.keys(nextState.observations)).toEqual([stableKey])
  })

  it("uses the quota watermark to prevent post-baseline cache churn", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const base = Date.now()
    const sessionPath = "~/.codex/sessions/2026/08/27/quota-watermark.jsonl"
    const statePath = "/tmp/one-more-prompt-test/plugin/codex-weekly-quota-observations-v1.json"
    const baselineTurn = {
      turnId: "baseline-turn",
      prompt: "Watermark baseline",
      startedAt: new Date(base + 1_000).toISOString(),
      completedAt: new Date(base + 1_500).toISOString(),
    }
    const bulkTurns = Array.from({ length: 520 }, (_, index) => {
      const startedAtMs = base + 2_000 + index * 10
      return {
        turnId: `bulk-${index}`,
        prompt: `Bulk prompt ${index}`,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date(startedAtMs + 1).toISOString(),
      }
    })
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: baselineTurn.startedAt,
    }))
    quotaApi(ctx, [{ used: 0 }, { used: 10 }, { used: 10 }, { used: 10 }])
    writeQuotaSession(ctx, sessionPath, { id: "watermark-session", turns: [baselineTurn] })
    plugin.probe(ctx)

    writeQuotaSession(ctx, sessionPath, { id: "watermark-session", turns: [baselineTurn].concat(bulkTurns) })
    plugin.probe(ctx)
    const firstState = JSON.parse(ctx.host.fs.readText(statePath))
    const firstSeenKeys = Object.keys(firstState.seen).sort()
    const firstObservationKeys = Object.keys(firstState.observations).sort()
    const allBulkKeys = bulkTurns.map((turn) => `watermark-session:${turn.turnId}`)
    const evictedKey = allBulkKeys.find((key) => !firstState.seen[key])

    expect(firstSeenKeys).toHaveLength(500)
    expect(firstObservationKeys).toHaveLength(250)
    expect(evictedKey).toBeTruthy()
    expect(firstState.watermark).toEqual({
      startedAt: bulkTurns[bulkTurns.length - 1].startedAt,
      keys: [allBulkKeys[allBulkKeys.length - 1]],
    })

    const secondProbe = plugin.probe(ctx)
    const secondState = JSON.parse(ctx.host.fs.readText(statePath))
    const evictedPrompt = bulkTurns[Number(evictedKey.split("bulk-")[1])].prompt

    expect(Object.keys(secondState.seen).sort()).toEqual(firstSeenKeys)
    expect(Object.keys(secondState.observations).sort()).toEqual(firstObservationKeys)
    expect(secondState.seen[evictedKey]).toBeUndefined()
    expect(JSON.parse(secondProbe.lines.find((line) => line.label === "Prompt" && line.value === evictedPrompt).subtitle).quotaObservation)
      .toBeUndefined()

    const latestStartedAt = bulkTurns[bulkTurns.length - 1].startedAt
    const tiedTurn = {
      turnId: "same-timestamp-new-root",
      prompt: "Same timestamp new root",
      startedAt: latestStartedAt,
      completedAt: new Date(Date.parse(latestStartedAt) + 2).toISOString(),
    }
    writeQuotaSession(ctx, sessionPath, {
      id: "watermark-session",
      turns: [baselineTurn].concat(bulkTurns, tiedTurn),
    })
    const tiedProbe = plugin.probe(ctx)
    const tiedState = JSON.parse(ctx.host.fs.readText(statePath))
    const tiedKey = `watermark-session:${tiedTurn.turnId}`

    expect(JSON.parse(tiedProbe.lines.find((line) => line.label === "Prompt" && line.value === tiedTurn.prompt).subtitle).quotaObservation)
      .toBeTruthy()
    expect(tiedState.seen[tiedKey]).toBeTruthy()
    expect(tiedState.observations[tiedKey]).toBeTruthy()
    expect(tiedState.watermark).toEqual({
      startedAt: latestStartedAt,
      keys: expect.arrayContaining([allBulkKeys[allBulkKeys.length - 1], tiedKey]),
    })
    expect(tiedState.watermark.keys.length).toBeLessThanOrEqual(500)
    expect(Object.keys(tiedState.seen)).toHaveLength(500)
    expect(Object.keys(tiedState.observations)).toHaveLength(250)
  })

  it("never rediscovers evicted historical prompts as new concurrent work", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const sessionPath = "~/.codex/sessions/2026/08/05/history.jsonl"
    const historicalTurns = Array.from({ length: 520 }, (_, index) => ({
      turnId: `history-${index}`,
      prompt: `Historical ${index}`,
      startedAt: new Date(Date.now() - 2_000_000 + index * 1000).toISOString(),
      completedAt: new Date(Date.now() - 1_999_500 + index * 1000).toISOString(),
    }))
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    writeQuotaSession(ctx, sessionPath, { id: "history-session", turns: historicalTurns })
    quotaApi(ctx, [{ used: 10 }, { used: 10 }])

    plugin.probe(ctx)
    const second = plugin.probe(ctx)
    const prompts = second.lines.filter((line) => line.label === "Prompt")
    expect(prompts).toHaveLength(520)
    expect(prompts.every((line) => JSON.parse(line.subtitle).quotaObservation == null)).toBe(true)

    const state = JSON.parse(ctx.host.fs.readText("/tmp/one-more-prompt-test/plugin/codex-weekly-quota-observations-v1.json"))
    expect(state.version).toBe(3)
    expect(Object.keys(state.seen)).toHaveLength(0)
    expect(Object.keys(state.observations)).toHaveLength(0)
  })

  it("reports decimal precision and belowPrecision for a zero observable delta", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const root = "~/.codex/sessions/2026/08/05"
    const sessionPath = `${root}/decimal.jsonl`
    const firstAt = new Date(Date.now() + 1000).toISOString()
    const firstCompletedAt = new Date(Date.now() + 2000).toISOString()
    const secondAt = new Date(Date.now() + 3000).toISOString()
    const secondCompletedAt = new Date(Date.now() + 4000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: firstAt }))
    writeQuotaSession(ctx, sessionPath, {
      id: "decimal-session",
      turns: [{ turnId: "turn-1", prompt: "First", startedAt: firstAt, completedAt: firstCompletedAt }],
    })
    quotaApi(ctx, [{ used: 4.25 }, { used: 4.25 }, { used: 4.25 }])
    plugin.probe(ctx)
    writeQuotaSession(ctx, sessionPath, {
      id: "decimal-session",
      turns: [
        { turnId: "turn-1", prompt: "First", startedAt: firstAt, completedAt: firstCompletedAt },
        { turnId: "turn-2", prompt: "No visible change", startedAt: secondAt, completedAt: secondCompletedAt },
      ],
    })
    plugin.probe(ctx)
    const result = plugin.probe(ctx)
    const observation = JSON.parse(result.lines.find((line) => line.value === "No visible change").subtitle).quotaObservation
    expect(observation).toMatchObject({
      status: "belowPrecision",
      usedBefore: 4.25,
      usedAfter: 4.25,
      delta: 0,
      precision: 0.01,
    })
  })

  it("waits for a post-completion repeat when the prompt was first observed active", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const sessionPath = "~/.codex/sessions/2026/08/05/active.jsonl"
    const firstAt = new Date(Date.now() + 1000).toISOString()
    const firstDone = new Date(Date.now() + 2000).toISOString()
    const secondAt = new Date(Date.now() + 3000).toISOString()
    const secondDone = new Date(Date.now() + 4000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: firstAt }))
    writeQuotaSession(ctx, sessionPath, {
      id: "active-session",
      turns: [{ turnId: "turn-1", prompt: "Baseline", startedAt: firstAt, completedAt: firstDone }],
    })
    quotaApi(ctx, [{ used: 0 }, { used: 4 }, { used: 4 }, { used: 4 }])
    plugin.probe(ctx)

    writeQuotaSession(ctx, sessionPath, {
      id: "active-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: firstAt, completedAt: firstDone },
        { turnId: "turn-2", prompt: "Active prompt", startedAt: secondAt },
      ],
    })
    plugin.probe(ctx)

    writeQuotaSession(ctx, sessionPath, {
      id: "active-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: firstAt, completedAt: firstDone },
        { turnId: "turn-2", prompt: "Active prompt", startedAt: secondAt, completedAt: secondDone },
      ],
    })
    const firstPostCompletion = plugin.probe(ctx)
    expect(JSON.parse(firstPostCompletion.lines.find((line) => line.value === "Active prompt").subtitle).quotaObservation.status)
      .toBe("pending")
    const settled = plugin.probe(ctx)
    expect(JSON.parse(settled.lines.find((line) => line.value === "Active prompt").subtitle).quotaObservation).toMatchObject({
      status: "measured",
      delta: 4,
    })
  })

  it("marks multiple prompts between samples and overlapping roots ambiguous", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const root = "~/.codex/sessions/2026/08/05"
    const sessionPath = `${root}/ambiguous.jsonl`
    const t1 = new Date(Date.now() + 1000).toISOString()
    const c1 = new Date(Date.now() + 2000).toISOString()
    const t2 = new Date(Date.now() + 3000).toISOString()
    const c2 = new Date(Date.now() + 4000).toISOString()
    const t3 = new Date(Date.now() + 5000).toISOString()
    const c3 = new Date(Date.now() + 6000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: t1 }))
    writeQuotaSession(ctx, sessionPath, { id: "ambiguous-session", turns: [{ turnId: "turn-1", prompt: "Baseline", startedAt: t1, completedAt: c1 }] })
    quotaApi(ctx, [{ used: 0 }, { used: 4 }])
    plugin.probe(ctx)
    writeQuotaSession(ctx, sessionPath, {
      id: "ambiguous-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: t1, completedAt: c1 },
        { turnId: "turn-2", prompt: "Concurrent A", startedAt: t2, completedAt: c2 },
        { turnId: "turn-3", prompt: "Concurrent B", startedAt: t3, completedAt: c3 },
      ],
    })
    const result = plugin.probe(ctx)
    for (const label of ["Concurrent A", "Concurrent B"]) {
      expect(JSON.parse(result.lines.find((line) => line.value === label).subtitle).quotaObservation).toMatchObject({
        status: "ambiguous",
        reason: "multiple_prompts_between_samples",
      })
    }

    const overlapCtx = makeCtx()
    const overlapPlugin = await loadPlugin()
    const overlapPath = `${root}/overlap.jsonl`
    const o1 = new Date(Date.now() + 1000).toISOString()
    const o1Done = new Date(Date.now() + 2000).toISOString()
    const o2 = new Date(Date.now() + 3000).toISOString()
    const o3 = new Date(Date.now() + 4000).toISOString()
    const o3Done = new Date(Date.now() + 5000).toISOString()
    overlapCtx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: o1 }))
    writeQuotaSession(overlapCtx, overlapPath, { id: "overlap-session", turns: [{ turnId: "turn-1", prompt: "Baseline", startedAt: o1, completedAt: o1Done }] })
    quotaApi(overlapCtx, [{ used: 0 }, { used: 2 }, { used: 4 }])
    overlapPlugin.probe(overlapCtx)
    writeQuotaSession(overlapCtx, overlapPath, {
      id: "overlap-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: o1, completedAt: o1Done },
        { turnId: "turn-2", prompt: "Still running", startedAt: o2 },
      ],
    })
    overlapPlugin.probe(overlapCtx)
    writeQuotaSession(overlapCtx, overlapPath, {
      id: "overlap-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: o1, completedAt: o1Done },
        { turnId: "turn-2", prompt: "Still running", startedAt: o2 },
        { turnId: "turn-3", prompt: "Overlapping", startedAt: o3, completedAt: o3Done },
      ],
    })
    const overlapResult = overlapPlugin.probe(overlapCtx)
    expect(JSON.parse(overlapResult.lines.find((line) => line.value === "Overlapping").subtitle).quotaObservation).toMatchObject({
      status: "ambiguous",
      reason: "overlapping_root_tasks",
    })
  })

  it("marks a weekly reset or decrease unavailable", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    const root = "~/.codex/sessions/2026/08/05"
    const sessionPath = `${root}/reset.jsonl`
    const firstAt = new Date(Date.now() + 1000).toISOString()
    const firstCompletedAt = new Date(Date.now() + 2000).toISOString()
    const secondAt = new Date(Date.now() + 3000).toISOString()
    const secondCompletedAt = new Date(Date.now() + 4000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: firstAt }))
    writeQuotaSession(ctx, sessionPath, { id: "reset-session", turns: [{ turnId: "turn-1", prompt: "Baseline", startedAt: firstAt, completedAt: firstCompletedAt }] })
    let sampleIndex = 0
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) return { status: 500, headers: {}, bodyText: "" }
      const values = [{ used: 4, resetAt: 1_800_000_000 }, { used: 2, resetAt: 1_900_000_000 }]
      const sample = values[Math.min(sampleIndex++, values.length - 1)]
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({ rate_limit: { secondary_window: { used_percent: sample.used, limit_window_seconds: 604800, reset_at: sample.resetAt } } }),
      }
    })
    plugin.probe(ctx)
    writeQuotaSession(ctx, sessionPath, {
      id: "reset-session",
      turns: [
        { turnId: "turn-1", prompt: "Baseline", startedAt: firstAt, completedAt: firstCompletedAt },
        { turnId: "turn-2", prompt: "After reset", startedAt: secondAt, completedAt: secondCompletedAt },
      ],
    })
    const result = plugin.probe(ctx)
    expect(JSON.parse(result.lines.find((line) => line.value === "After reset").subtitle).quotaObservation).toMatchObject({
      status: "unavailable",
      reason: "weekly_reset_changed",
    })
  })

  it("preserves a meaningful inline local path", async () => {
    const prompt = "Please inspect /Users/example/project/src/main.swift and keep the code path in the request."

    await expect(probeDisplayedPrompt(prompt, "meaningful-inline-path")).resolves.toBe(prompt)
  })

  it("declares weekly fallback and monthly credit limit as overview primary metrics", () => {
    const manifest = JSON.parse(readFileSync("plugins/codex/plugin.json", "utf8"))
    expect(manifest.lines.find((line) => line.label === "Weekly")).toMatchObject({
      type: "progress",
      scope: "overview",
      period: "weekly",
      primaryOrder: 2,
    })
    expect(manifest.lines.find((line) => line.label === "Monthly Credit Limit")).toMatchObject({
      type: "progress",
      scope: "overview",
      primaryOrder: 3,
    })
  })

  it("throws when auth missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("loads auth from keychain when auth file is missing", async () => {
    const ctx = makeCtx()
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer keychain-token")
      expect(opts.headers["User-Agent"]).toBe("One-More-Prompt")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
  })

  it("appends all prompt usage grouped by project and session", async () => {
    const ctx = makeCtx()
    const sessionDate = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const sessionPath = `~/.codex/sessions/${sessionDate.getFullYear()}/${pad(sessionDate.getMonth() + 1)}/${pad(sessionDate.getDate())}/prompt-usage.jsonl`
    const turnTimestamp = new Date(sessionDate.getTime() - 60_000).toISOString()
    const promptTimestamp = new Date(sessionDate.getTime() - 59_000).toISOString()
    const usageTimestamp = new Date(sessionDate.getTime() - 55_000).toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        "project-1": { id: "project-1", name: "Example Project", rootPaths: ["/tmp/example-project"] },
      },
      "thread-project-assignments": {
        "session-1": { projectKind: "local", projectId: "project-1", cwd: "/tmp/example-project" },
      },
      "projectless-thread-ids": [],
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "session-1", title: "Prompt Usage redesign" },
    ]))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.fs.writeText(sessionPath, [
      JSON.stringify({
        type: "session_meta",
        timestamp: turnTimestamp,
        payload: { id: "session-1", cwd: "/tmp/example-project", thread_source: "user" },
      }),
      JSON.stringify({
        type: "turn_context",
        timestamp: turnTimestamp,
        payload: { turn_id: "turn-1", model: "gpt-5.6-sol", cwd: "/tmp/example-project" },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: promptTimestamp,
        payload: { type: "user_message", message: "## My request for Codex:\nInspect the prompt usage tab" },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: usageTimestamp,
        payload: {
          type: "token_count",
          info: {
            last_token_usage: {
              input_tokens: 800,
              cached_input_tokens: 200,
              output_tokens: 300,
              reasoning_output_tokens: 100,
              total_tokens: 1200,
            },
          },
        },
      }),
    ].join("\n"))

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines).toContainEqual(expect.objectContaining({
      label: "Prompt Usage",
      value: "1 prompt · 1 session",
      subtitle: "Attributed from local Codex session logs",
    }))
    expect(result.lines).toContainEqual(expect.objectContaining({
      label: "Project Group",
      value: "Example Project",
    }))
    expect(result.lines).toContainEqual(expect.objectContaining({
      label: "Session",
      value: "Prompt Usage redesign",
    }))
    expect(result.lines).toContainEqual(expect.objectContaining({
      label: "Prompt",
      value: "Inspect the prompt usage tab",
    }))
    expect(result.lines).toContainEqual(expect.objectContaining({
      label: "Agent",
      value: "Main Agent",
      subtitle: expect.stringContaining('"totalTokens":1200'),
    }))
  })

  it("preserves explicit turn model identity even when no token_count exists", async () => {
    const ctx = makeCtx()
    const now = new Date()
    const timestamp = now.toISOString()
    const pad = (value) => String(value).padStart(2, "0")
    const id = "identity-only-session"
    const path = `~/.codex/sessions/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}/identity-only.jsonl`
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {},
      "thread-project-assignments": {},
      "projectless-thread-ids": [id],
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ id, title: "Identity Only" }]))
    ctx.host.fs.writeText(path, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd: "/tmp/identity", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "identity-turn", model: "gpt-5.6-sol", cwd: "/tmp/identity" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Prompt without token event" } }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const promptMeta = JSON.parse(result.lines.find((line) => line.label === "Prompt").subtitle)
    const agentMeta = JSON.parse(result.lines.find((line) => line.label === "Agent").subtitle)

    expect(promptMeta.model).toBe("gpt-5.6-sol")
    expect(promptMeta.usage.totalTokens).toBe(0)
    expect(agentMeta.models).toEqual([])
  })

  it("keeps the explicit model context for follow-up prompts inside the same active Codex task", async () => {
    const ctx = makeCtx()
    const now = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`
    const path = `${root}/same-active-task.jsonl`
    const id = "same-active-task"
    const at = (seconds) => new Date(now.getTime() + seconds * 1000).toISOString()
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {},
      "thread-project-assignments": {},
      "projectless-thread-ids": [id],
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ id, title: "Same Active Task" }]))
    ctx.host.fs.writeText(path, [
      JSON.stringify({ type: "session_meta", timestamp: at(0), payload: { id, cwd: "/tmp/same-task", thread_source: "user" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(1), payload: { type: "task_started", turn_id: "durable-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp: at(2), payload: { turn_id: "durable-turn", model: "gpt-5.6-sol", cwd: "/tmp/same-task" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(3), payload: { type: "user_message", message: "First prompt" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(4), payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } } }),
      // Codex can accept another user message while the durable task remains active
      // without emitting another task_started / turn_context pair.
      JSON.stringify({ type: "response_item", timestamp: at(5), payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Follow-up prompt" }] } }),
      JSON.stringify({ type: "event_msg", timestamp: at(6), payload: { type: "token_count", info: { last_token_usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 } } } }),
      JSON.stringify({ type: "event_msg", timestamp: at(7), payload: { type: "task_complete", turn_id: "durable-turn" } }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const promptLines = result.lines.filter((line) => line.label === "Prompt")
    const agentLines = result.lines.filter((line) => line.label === "Agent")
    const followUpMeta = JSON.parse(promptLines.find((line) => line.value === "Follow-up prompt").subtitle)
    const followUpAgent = JSON.parse(agentLines[1].subtitle)

    expect(promptLines.map((line) => line.value)).toContain("Follow-up prompt")
    expect(followUpMeta.model).toBe("gpt-5.6-sol")
    expect(followUpMeta.usage.totalTokens).toBe(23)
    expect(followUpAgent.models).toEqual([expect.objectContaining({ name: "gpt-5.6-sol" })])
  })

  it("counts unattributed token usage without inventing a gpt-5 model", async () => {
    const ctx = makeCtx()
    const now = new Date()
    const timestamp = now.toISOString()
    const pad = (value) => String(value).padStart(2, "0")
    const id = "unattributed-token-session"
    const path = `~/.codex/sessions/${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}/unattributed-token.jsonl`
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {},
      "thread-project-assignments": {},
      "projectless-thread-ids": [id],
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ id, title: "Unattributed Tokens" }]))
    ctx.host.fs.writeText(path, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd: "/tmp/unattributed", thread_source: "user" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Prompt with unattributed tokens" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } } }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const promptMeta = JSON.parse(result.lines.find((line) => line.label === "Prompt").subtitle)
    const agentMeta = JSON.parse(result.lines.find((line) => line.label === "Agent").subtitle)

    expect(promptMeta.model).toBeNull()
    expect(promptMeta.usage.totalTokens).toBe(3)
    expect(agentMeta.models).toEqual([])
    expect(agentMeta.models.some((model) => model.name === "gpt-5")).toBe(false)
  })

  it("parses response-item user prompts and keeps assigned sessions in their project", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {
        "current-session": { projectKind: "local", projectId: "notion" },
      },
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["older-session"] },
      },
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "current-session", title: "Continue Project Development" },
    ]))
    const sessionPath = `${root}/current.jsonl`
    const sessionLines = [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "current-session", cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "<recommended_plugins>injected context</recommended_plugins>" },
            { type: "input_text", text: "<environment_context>injected context</environment_context>" },
          ],
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Continue the project" }],
        },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "current-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "current-turn", model: "gpt-5.6-sol", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } } } }),
    ]
    ctx.host.fs.writeText(sessionPath, sessionLines.join("\n"))

    const plugin = await loadPlugin()
    const result = plugin.probePromptUsage(ctx)

    expect(ctx.host.http.request).not.toHaveBeenCalled()
    const projectLine = result.lines.find((line) => line.label === "Project Group")
    const sessionLine = result.lines.find((line) => line.label === "Session")
    expect(projectLine).toMatchObject({ value: "Notion" })
    expect(sessionLine).toMatchObject({ value: "Continue Project Development" })
    expect(JSON.parse(projectLine.subtitle).isActive).toBe(true)
    expect(JSON.parse(sessionLine.subtitle).isActive).toBe(true)
    expect(result.lines.find((line) => line.label === "Prompt")).toMatchObject({ value: "Continue the project" })
    expect(result.lines.some((line) => String(line.value).includes("injected context"))).toBe(false)

    sessionLines.push(JSON.stringify({ type: "event_msg", timestamp, payload: { type: "turn_aborted" } }))
    ctx.host.fs.writeText(sessionPath, sessionLines.join("\n"))
    const stopped = plugin.probePromptUsage(ctx)
    expect(JSON.parse(stopped.lines.find((line) => line.label === "Project Group").subtitle).isActive).toBe(false)
    expect(JSON.parse(stopped.lines.find((line) => line.label === "Session").subtitle).isActive).toBe(false)
  })

  it("deduplicates equivalent response-item and event-message prompts", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    const root = "~/.codex/sessions/2026/02/02"
    const prompt = "Keep one prompt record"
    ctx.host.fs.writeText(`${root}/duplicate-prompt.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "duplicate-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "duplicate-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "duplicate-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } } },
      }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")
    const agents = result.lines.filter((line) => line.label === "Agent")

    expect(prompts).toHaveLength(1)
    expect(prompts[0].value).toBe(prompt)
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(6)
    expect(agents).toHaveLength(1)
    expect(JSON.parse(agents[0].subtitle).usage.totalTokens).toBe(6)
  })

  it("ignores writing-block edit metadata and keeps the real prompt on the durable turn", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    const sessionPath = "~/.codex/sessions/2026/02/02/writing-block-edit.jsonl"
    const prompt = "Continue with the edited first version"
    ctx.host.fs.writeText(sessionPath, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "writing-edit-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "writing-edit-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "writing-edit-turn", model: "gpt-5.6-sol" } }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: '<external_codex_apps_writing_block_edits>[{"id":"73146"}]</external_codex_apps_writing_block_edits>',
          }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } } },
      }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")

    expect(prompts).toHaveLength(1)
    expect(prompts[0].value).toBe(prompt)
    expect(JSON.parse(prompts[0].subtitle)).toMatchObject({
      id: "writing-edit-turn",
      usage: { totalTokens: 6 },
    })
  })

  it("carries an aborted prompt into the immediately resumed turn", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    const root = "~/.codex/sessions/2026/02/02"
    const prompt = "Continue the interrupted work"
    ctx.host.fs.writeText(`${root}/resumed-prompt.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "resumed-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "first-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "first-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "turn_aborted" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "resumed-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "resumed-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_complete", turn_id: "resumed-turn" } }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")

    expect(prompts).toHaveLength(1)
    expect(prompts[0].value).toBe(prompt)
    expect(JSON.parse(prompts[0].subtitle)).toMatchObject({
      id: "resumed-turn",
      usage: { totalTokens: 10 },
    })
  })

  it("keeps intentional repeats and new prompts after an abort separate", async () => {
    const ctx = makeCtx()
    const base = Date.parse("2026-02-02T00:00:00.000Z")
    const at = (seconds) => new Date(base + seconds * 1000).toISOString()
    const root = "~/.codex/sessions/2026/02/02"
    const repeatedPrompt = "Repeat this prompt"
    const newPrompt = "Start a different prompt"
    ctx.host.fs.writeText(`${root}/distinct-prompts.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp: at(0), payload: { id: "distinct-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(0), payload: { type: "task_started", turn_id: "first-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp: at(0), payload: { turn_id: "first-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(0), payload: { type: "user_message", message: repeatedPrompt } }),
      JSON.stringify({
        type: "event_msg",
        timestamp: at(0.1),
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      }),
      JSON.stringify({ type: "event_msg", timestamp: at(0.2), payload: { type: "task_complete", turn_id: "first-turn" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(2), payload: { type: "task_started", turn_id: "second-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp: at(2), payload: { turn_id: "second-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({
        type: "response_item",
        timestamp: at(2),
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: repeatedPrompt }] },
      }),
      JSON.stringify({ type: "event_msg", timestamp: at(2), payload: { type: "user_message", message: repeatedPrompt } }),
      JSON.stringify({
        type: "event_msg",
        timestamp: at(2.1),
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
      }),
      JSON.stringify({ type: "event_msg", timestamp: at(3), payload: { type: "turn_aborted" } }),
      JSON.stringify({ type: "event_msg", timestamp: at(4), payload: { type: "task_started", turn_id: "third-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp: at(4), payload: { turn_id: "third-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({
        type: "response_item",
        timestamp: at(4.1),
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: newPrompt }] },
      }),
      JSON.stringify({ type: "event_msg", timestamp: at(4.1), payload: { type: "user_message", message: newPrompt } }),
      JSON.stringify({
        type: "event_msg",
        timestamp: at(4.2),
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
      }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")
    const metadata = prompts.map((line) => JSON.parse(line.subtitle))

    expect(prompts).toHaveLength(3)
    expect(prompts.map((line) => line.value)).toEqual([newPrompt, repeatedPrompt, repeatedPrompt])
    expect(metadata.map((item) => item.usage.totalTokens)).toEqual([4, 3, 2])
  })

  it("keeps pending task-action ownership when an aborted turn is merged", async () => {
    const ctx = makeCtx()
    const timestamp = new Date().toISOString()
    const root = "~/.codex/sessions/2026/02/02"
    const prompt = "Delegate from this interrupted prompt"
    ctx.host.fs.writeText(`${root}/source.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "source-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "first-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "first-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: {
          type: "custom_tool_call",
          name: "exec",
          call_id: "create-target",
          input: 'const result = await tools.codex_app__create_thread({ title: "Target" }); text(result);',
        },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "turn_aborted" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "resumed-turn" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "resumed-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: {
          type: "custom_tool_call_output",
          call_id: "create-target",
          output: [{ type: "input_text", text: 'Script completed\nOutput:\n{"threadId":"target-session"}' }],
        },
      }),
    ].join("\n"))
    ctx.host.fs.writeText(`${root}/target.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "target-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "target-turn", model: "gpt-5.6-sol", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Target prompt" } }),
      JSON.stringify({
        type: "event_msg",
        timestamp,
        payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      }),
    ].join("\n"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const sourcePrompt = result.lines.find((line) => line.label === "Prompt" && line.value === prompt)

    expect(sourcePrompt).toBeTruthy()
    expect(JSON.parse(sourcePrompt.subtitle)).toMatchObject({
      id: "resumed-turn",
      outgoingTasks: [{ id: "target-session", title: "Target prompt" }],
    })
  })

  it("attaches paired top-level task actions to only the prompt that sent them", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const sourceId = "prompt-link-source"
    const targetIds = ["prompt-link-one", "prompt-link-two"]
    const action = (callId, input, output) => [
      JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: callId, input } }),
      JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call_output", call_id: callId, output: [{ type: "input_text", text: `Script completed\nOutput:\n${output}` }] } }),
    ]
    const lines = [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: sourceId, cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "source-turn-one", model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Send Work From This Prompt" } }),
      ...action(
        "source-call-create",
        'const r = await tools.codex_app__create_thread({title:"Luna One"}); text(r);',
        JSON.stringify({ threadId: targetIds[0], hostId: "local" }),
      ),
      ...action(
        "source-call-send",
        `const r = await tools.codex_app__send_message_to_thread({threadId:"${targetIds[1]}"}); text(r);`,
        JSON.stringify({ threadId: targetIds[1], hostId: "local" }),
      ),
      ...action(
        "source-call-send-duplicate",
        `const r = await tools.codex_app__send_message_to_thread({threadId:"${targetIds[1]}"}); text(r);`,
        JSON.stringify({ threadId: targetIds[1], hostId: "local" }),
      ),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "source-turn-two", model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Do Not Link This Prompt" } }),
      ...action(
        "source-call-list",
        'const r = await tools.codex_app__list_threads({}); text(r);',
        JSON.stringify({ threadId: "prompt-link-ignored" }),
      ),
      ...action(
        "source-call-mixed",
        'const created = await tools.codex_app__create_thread({title:"Ambiguous Luna"}); const read = await tools.codex_app__read_thread({threadId:"prompt-link-ignored"}); const waited = await tools.codex_app__wait_threads({}); text(JSON.stringify({ created, read, waited }));',
        JSON.stringify({
          created: { threadId: targetIds[0], hostId: "local" },
          read: { threadId: "prompt-link-ignored" },
          waited: { threadId: "prompt-link-ignored" },
        }),
      ),
      ...action(
        "source-call-read",
        'const r = await tools.codex_app__read_thread({threadId:"prompt-link-ignored"}); text(r);',
        JSON.stringify({ threadId: "prompt-link-ignored" }),
      ),
      ...action(
        "source-call-wait",
        'const r = await tools.codex_app__wait_threads({}); text(r);',
        JSON.stringify({ threadId: "prompt-link-ignored" }),
      ),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } } }),
    ]

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) {
        return JSON.stringify([
          { id: sourceId, title: "Source Prompt Session" },
          { id: targetIds[0], title: "Luna One" },
          { id: targetIds[1], title: "Luna Two" },
        ])
      }
      return "[]"
    })
    ctx.host.fs.writeText(`${root}/source.jsonl`, lines.join("\n"))
    writePromptUsageSession(ctx, `${root}/one.jsonl`, { id: targetIds[0], prompt: "Luna One Prompt", timestamp })
    writePromptUsageSession(ctx, `${root}/two.jsonl`, { id: targetIds[1], prompt: "Luna Two Prompt", timestamp })

    const result = (await loadPlugin()).probe(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")
    const sentPrompt = prompts.find((line) => line.value === "Send Work From This Prompt")
    const unrelatedPrompt = prompts.find((line) => line.value === "Do Not Link This Prompt")

    expect(JSON.parse(sentPrompt.subtitle).outgoingTasks).toEqual([
      { id: targetIds[0], title: "Luna One" },
      { id: targetIds[1], title: "Luna Two" },
    ])
    expect(JSON.parse(unrelatedPrompt.subtitle).outgoingTasks).toEqual([])
  })

  it("expires unfinished activity from abandoned session logs", async () => {
    const ctx = makeCtx()
    const root = "~/.codex/sessions/2026/01/01"
    const timestamp = "2026-01-01T00:00:00.000Z"
    ctx.host.fs.writeText(`${root}/abandoned.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "abandoned", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Abandoned task" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: "abandoned-turn" } }),
    ].join("\n"))

    const plugin = await loadPlugin()
    const result = plugin.probePromptUsage(ctx)

    expect(JSON.parse(result.lines.find((line) => line.label === "Session").subtitle).isActive).toBe(false)
  })

  it("orders sessions by their newest prompt", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const makeSession = (id, prompt, timestamp) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: `${id}-turn`, model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n")
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: date.toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "older-session", title: "Older session title" },
      { id: "newer-session", title: "Newer session title" },
    ]))
    ctx.host.fs.writeText(`${root}/older.jsonl`, makeSession("older-session", "Older prompt", new Date(date.getTime() - 60_000).toISOString()))
    ctx.host.fs.writeText(`${root}/newer.jsonl`, makeSession("newer-session", "Newer prompt", date.toISOString()))

    const result = (await loadPlugin()).probe(ctx)
    const sessionIds = result.lines
      .filter((line) => line.label === "Session")
      .map((line) => line.value)

    expect(sessionIds).toEqual(["Newer session title", "Older session title"])
  })

  it("interleaves projects and projectless sessions by newest prompt", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const makeSession = (id, cwd, prompt, timestamp) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd, thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: `${id}-turn`, model: "gpt-5.6-sol", cwd } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n")
    const newestAt = date.toISOString()
    const notionAt = new Date(date.getTime() - 60_000).toISOString()
    const oldestAt = new Date(date.getTime() - 120_000).toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: newestAt }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {
        "notion-session": { projectKind: "local", projectId: "notion", cwd: "/tmp/Notion" },
      },
      "pinned-project-ids": ["notion"],
      "projectless-thread-ids": ["newest-session", "oldest-session"],
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "newest-session", title: "Newest standalone" },
      { id: "notion-session", title: "Recent Notion task" },
      { id: "oldest-session", title: "Older standalone" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(`${root}/newest.jsonl`, makeSession("newest-session", "/tmp/Other", "Newest prompt", newestAt))
    ctx.host.fs.writeText(`${root}/notion.jsonl`, makeSession("notion-session", "/tmp/Notion", "Notion prompt", notionAt))
    ctx.host.fs.writeText(`${root}/oldest.jsonl`, makeSession("oldest-session", "/tmp/Other", "Oldest prompt", oldestAt))

    const result = (await loadPlugin()).probe(ctx)
    const topLevelItems = result.lines
      .filter((line) => line.label === "Project Group")
      .map((line) => line.value)

    expect(topLevelItems).toEqual(["Newest standalone", "Notion", "Older standalone"])
    const notion = result.lines.find((line) => line.label === "Project Group" && line.value === "Notion")
    expect(JSON.parse(notion.subtitle).codexOrder).toBe(0)
  })

  it("uses the Codex sidebar list as authoritative project membership", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const makeSession = (id, prompt) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: `${id}-turn`, model: "gpt-5.6-sol", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n")

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {
        "listed-session": { projectKind: "local", projectId: "notion", cwd: "/tmp/Notion" },
      },
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["listed-session"] },
      },
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "listed-session", title: "Listed task" },
      { id: "same-cwd-session", title: "Same folder, not listed" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(`${root}/listed.jsonl`, makeSession("listed-session", "Listed prompt"))
    ctx.host.fs.writeText(`${root}/same-cwd.jsonl`, makeSession("same-cwd-session", "Unlisted prompt"))

    const result = (await loadPlugin()).probe(ctx)
    const notion = result.lines.find((line) => line.label === "Project Group" && line.value === "Notion")
    const unlisted = result.lines.find((line) => line.label === "Project Group" && line.value === "Same folder, not listed")

    expect(JSON.parse(notion.subtitle).sessionCount).toBe(1)
    expect(JSON.parse(unlisted.subtitle).kind).toBe("standalone")
  })

  it("keeps an explicitly listed orchestration root visible when Codex marks it as a subagent", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {},
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["parent", "listed-subagent-root"] },
      },
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "parent", title: "Parent task" },
      { id: "listed-subagent-root", title: "Explicit Codex task" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(`${root}/parent.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "parent", cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "parent-turn", model: "gpt-5.6-sol", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Parent prompt" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "sub_agent_activity", kind: "started", agent_thread_id: "listed-subagent-root" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 } } } }),
    ].join("\n"))
    ctx.host.fs.writeText(`${root}/listed-subagent.jsonl`, [
      JSON.stringify({
        type: "session_meta",
        timestamp,
        payload: {
          id: "listed-subagent-root",
          cwd: "/tmp/Notion",
          parent_thread_id: "parent",
          thread_source: "subagent",
          source: { subagent: { thread_spawn: { parent_thread_id: "parent", agent_nickname: "Visible child" } } },
        },
      }),
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "parent", cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "listed-turn", model: "gpt-5.6-sol", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "You are the orchestration parent. Delegate to agent_type \"subagent_Luna_max\"." } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n"))

    const result = (await loadPlugin()).probe(ctx)
    const notion = result.lines.find((line) => line.label === "Project Group" && line.value === "Notion")
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)
    const parentPrompt = result.lines.find((line) => line.label === "Prompt" && line.value === "Parent prompt")

    expect(JSON.parse(notion.subtitle).sessionCount).toBe(2)
    expect(sessions).toEqual(expect.arrayContaining(["Parent task", "Explicit Codex task"]))
    expect(JSON.parse(parentPrompt.subtitle).usage.totalTokens).toBe(10)
    expect(result.lines.some((line) => line.label === "Agent" && line.value === "Visible child")).toBe(false)
  })

  it("uses the latest Codex session index name instead of the stale SQLite title", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {},
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["renamed-session"] },
      },
    }))
    ctx.host.fs.writeText("~/.codex/session_index.jsonl", [
      JSON.stringify({ id: "renamed-session", thread_name: "Earlier name", updated_at: "2026-08-01T00:00:00Z" }),
      JSON.stringify({ id: "renamed-session", thread_name: "  Codex\n sidebar   name  ", updated_at: "2026-08-02T00:00:00Z" }),
      JSON.stringify({ id: "renamed-session", thread_name: "<codex_delegation><input>Internal metadata", updated_at: "2026-08-03T00:00:00Z" }),
      JSON.stringify({ id: "renamed-session", thread_name: "   ", updated_at: "2026-08-03T00:00:00Z" }),
      "{not-json",
    ].join("\n"))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "renamed-session", title: "Original first prompt that SQLite still exposes" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/renamed.jsonl`, {
      id: "renamed-session",
      prompt: "Original first prompt",
      timestamp,
    })

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)

    expect(sessions).toEqual(["Codex sidebar name"])
  })

  it("uses the optional SQLite name when the legacy title column is unavailable", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["named-session"] },
      },
    }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) throw new Error("no such column: title")
      if (/SELECT id, name/.test(sql)) return JSON.stringify([{ id: "named-session", name: "Current Codex Name" }])
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/named.jsonl`, {
      id: "named-session",
      prompt: "Original prompt",
      timestamp,
    })

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)

    expect(sessions).toEqual(["Current Codex Name"])
  })

  it("extracts and decodes a delegation input without exposing its XML envelope", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const input = "Act as   an R&D independent read-only acceptance auditor for the complete Notion project and verify every public release requirement"
    const normalized = input.replace(/\s+/g, " ").trim()
    const expected = normalized.slice(0, 79).replace(/\s+$/, "") + "…"
    const wrapped = "&lt;codex_delegation&gt;&lt;source_thread_id&gt;parent&lt;/source_thread_id&gt;&lt;input&gt;" +
      input.replace("R&D", "R&amp;D") +
      "&lt;/input&gt;&lt;/codex_delegation&gt;"

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) return JSON.stringify([{ id: "delegated-session", title: wrapped }])
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/delegated.jsonl`, {
      id: "delegated-session",
      prompt: "Safe fallback prompt",
      timestamp,
    })

    const result = (await loadPlugin()).probe(ctx)
    const title = result.lines.find((line) => line.label === "Session").value

    expect(title).toBe(expected)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith("…")).toBe(true)
    expect(title).not.toContain("codex_delegation")
    expect(title).not.toContain("source_thread_id")
  })

  it("keeps delegated tasks beside their source and exposes only a safe relationship", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const sourceId = "source-thread"
    const delegatedId = "delegated-thread"
    const secondDelegatedId = "second-delegated-thread"
    const delegatedPrompt = "<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Review the accepted implementation</input></codex_delegation>"
    const secondDelegatedPrompt = "<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Follow up on the accepted implementation</input></codex_delegation>"

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": { notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] } },
      "thread-project-assignments": {},
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": { notion: { threadIds: [sourceId, delegatedId, secondDelegatedId] } },
    }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) {
        return JSON.stringify([
          { id: sourceId, title: "Source Task" },
          { id: delegatedId, title: delegatedPrompt },
          { id: secondDelegatedId, title: secondDelegatedPrompt },
        ])
      }
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/source.jsonl`, { id: sourceId, prompt: "Source prompt", timestamp })
    writePromptUsageSession(ctx, `${root}/delegated.jsonl`, { id: delegatedId, prompt: delegatedPrompt, timestamp })
    writePromptUsageSession(ctx, `${root}/second-delegated.jsonl`, { id: secondDelegatedId, prompt: secondDelegatedPrompt, timestamp })

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session")
    const prompts = result.lines.filter((line) => line.label === "Prompt")
    const source = sessions.find((line) => line.value === "Source Task")
    const delegated = sessions.find((line) => line.value === "Review the accepted implementation")

    expect(sessions.map((line) => line.value)).toEqual(["Source Task", "Review the accepted implementation", "Follow up on the accepted implementation"])
    expect(JSON.parse(source.subtitle).relatedTaskCount).toBe(2)
    expect(JSON.parse(source.subtitle).relatedTasks).toEqual([
      { id: delegatedId, title: "Review the accepted implementation" },
      { id: secondDelegatedId, title: "Follow up on the accepted implementation" },
    ])
    expect(JSON.parse(delegated.subtitle)).toMatchObject({
      isDelegated: true,
      relatedSourceId: sourceId,
      relatedSourceTitle: "Source Task",
    })
    expect(JSON.parse(prompts[1].subtitle)).toMatchObject({
      sourceThreadId: sourceId,
      isDelegated: true,
    })
    expect(prompts[1].value).toBe("Review the accepted implementation")
    expect(JSON.stringify(result.lines)).not.toContain("codex_delegation")
    expect(JSON.stringify(result.lines)).toContain(sourceId)
  })

  it("hides routing-only delegation metadata while preserving its source relationship", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const sourceId = "source-thread"
    const delegatedId = "routing-only-thread"
    const routingInput = "Use $example-workflow. Role: Worker Handoff: /Users/example/project/.codex/handoffs/milestone-4-1/state.md Target: READY_FOR_REVIEW"
    const delegatedPrompt = `<codex_delegation><source_thread_id>${sourceId}</source_thread_id><input>${routingInput}</input></codex_delegation>`

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": { notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] } },
      "thread-project-assignments": {},
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": { notion: { threadIds: [sourceId, delegatedId] } },
    }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) {
        return JSON.stringify([
          { id: sourceId, title: "Source Task" },
          { id: delegatedId, title: delegatedPrompt },
        ])
      }
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/source.jsonl`, { id: sourceId, prompt: "Source prompt", timestamp })
    writePromptUsageSession(ctx, `${root}/delegated.jsonl`, { id: delegatedId, prompt: delegatedPrompt, timestamp })

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session")
    const delegatedSession = sessions.find((line) => line.value === "Delegated Task")
    const delegatedPromptLine = result.lines.find((line) => line.label === "Prompt" && line.value === "Delegated Task")
    const serialized = JSON.stringify(result.lines)

    expect(delegatedSession).toBeTruthy()
    expect(JSON.parse(delegatedSession.subtitle)).toMatchObject({
      isDelegated: true,
      relatedSourceId: sourceId,
      relatedSourceTitle: "Source Task",
    })
    expect(JSON.parse(delegatedPromptLine.subtitle)).toMatchObject({
      sourceThreadId: sourceId,
      isDelegated: true,
    })
    expect(serialized).not.toContain("$example-workflow")
    expect(serialized).not.toContain("Handoff:")
    expect(serialized).not.toContain("/Users/example")
    expect(serialized).not.toContain("READY_FOR_REVIEW")
  })

  it("falls back to the first prompt when a delegation envelope is malformed", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) {
        return JSON.stringify([{ id: "malformed-session", title: "<codex_delegation><input>Internal metadata" }])
      }
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/malformed.jsonl`, {
      id: "malformed-session",
      prompt: "Safe fallback prompt",
      timestamp,
    })

    const result = (await loadPlugin()).probe(ctx)
    const title = result.lines.find((line) => line.label === "Session").value

    expect(title).toBe("Safe fallback prompt")
    expect(title).not.toContain("<")
  })

  it("preserves the Codex sidebar order instead of re-sorting listed sessions by activity", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const newerTimestamp = date.toISOString()
    const olderTimestamp = new Date(date.getTime() - 120_000).toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: newerTimestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["older-session", "newer-session"] },
      },
    }))
    ctx.host.sqlite.query.mockImplementation((_path, sql) => {
      if (/SELECT id, title/.test(sql)) {
        return JSON.stringify([
          { id: "older-session", title: "Pinned First" },
          { id: "newer-session", title: "Recently Active" },
        ])
      }
      return "[]"
    })
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, `${root}/older.jsonl`, {
      id: "older-session",
      prompt: "Older prompt",
      timestamp: olderTimestamp,
    })
    writePromptUsageSession(ctx, `${root}/newer.jsonl`, {
      id: "newer-session",
      prompt: "Newer prompt",
      timestamp: newerTimestamp,
    })

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)

    expect(sessions).toEqual(["Pinned First", "Recently Active"])
  })

  it("invalidates stale prompt caches after parser identity fixes", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const sessionPath = `${root}/child.jsonl`
    const cachePath = "/tmp/one-more-prompt-test/plugin/prompt-usage-index-v2.json"
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.fs.writeText("~/.codex/.codex-global-state.json", JSON.stringify({
      "local-projects": {
        notion: { id: "notion", name: "Notion", rootPaths: ["/tmp/Notion"] },
      },
      "thread-project-assignments": {},
      "projectless-thread-ids": [],
      "sidebar-project-thread-orders": {
        notion: { threadIds: ["real-child"] },
      },
    }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "real-child", title: "Real child task" },
      { id: "wrong-parent", title: "Wrong cached parent" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(sessionPath, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "real-child", cwd: "/tmp/Notion", thread_source: "user" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "real-turn", model: "gpt-5.6-sol", cwd: "/tmp/Notion" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Real prompt" } }),
    ].join("\n"))
    const metadata = JSON.parse(ctx.host.fs.fileMetadata(sessionPath))
    ctx.host.fs.writeText(cachePath, JSON.stringify({
      version: 20,
      files: {
        [sessionPath]: {
          size: metadata.size,
          modifiedMs: metadata.modifiedMs,
          session: { id: "wrong-parent", cwd: "/tmp/Notion", turns: [] },
        },
      },
    }))

    const result = (await loadPlugin()).probe(ctx)
    const cache = JSON.parse(ctx.host.fs.readText(cachePath))
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)
    const promptMeta = JSON.parse(result.lines.find((line) => line.label === "Prompt").subtitle)

    expect(cache.version).toBe(26)
    expect(cache.files[sessionPath].session.id).toBe("real-child")
    expect(cache.files[sessionPath].session.turns[0].model).toBe("gpt-5.6-sol")
    expect(promptMeta.model).toBe("gpt-5.6-sol")
    expect(promptMeta.usage.totalTokens).toBe(0)
    expect(sessions).toEqual(["Real child task"])
  })

  it("sanitizes a valid cached prompt before displaying or rewriting it", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const sessionPath = `${root}/cached.jsonl`
    const cachePath = "/tmp/one-more-prompt-test/plugin/prompt-usage-index-v2.json"
    const timestamp = date.toISOString()

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    writePromptUsageSession(ctx, sessionPath, {
      id: "cached-session",
      prompt: "Clean source prompt",
      timestamp,
    })
    const metadata = JSON.parse(ctx.host.fs.fileMetadata(sessionPath))
    ctx.host.fs.writeText(cachePath, JSON.stringify({
      version: 26,
      files: {
        [sessionPath]: {
          size: metadata.size,
          modifiedMs: metadata.modifiedMs,
          session: {
            id: "cached-session",
            cwd: "/tmp/Notion",
            latestAt: timestamp,
            turns: [{
              id: "cached-turn",
              prompt: '<in-app-browser-context source="ambient-ui-state">Generated browser state</in-app-browser-context>\n\n## My request:\nClean source prompt',
              cwd: "/tmp/Notion",
              startedAt: timestamp,
              lastAt: timestamp,
              usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0, totalTokens: 2 },
              models: [],
              subagentSessionIds: [],
            }],
          },
        },
      },
    }))

    const read = vi.spyOn(ctx.host.fs, "readCodexSessionEvents")
    const result = (await loadPlugin()).probe(ctx)
    const cache = JSON.parse(ctx.host.fs.readText(cachePath))
    const prompt = result.lines.find((line) => line.label === "Prompt")

    expect(prompt.value).toBe("Clean source prompt")
    expect(read).not.toHaveBeenCalled()
    expect(cache.files[sessionPath].session.turns[0].prompt).toBe("Clean source prompt")
  })

  it("keeps legacy internal orchestration sessions out of top-level navigation", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    const makeUsage = (id, prompt, metadata) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id, cwd: "/tmp/example-project", ...metadata } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: `${id}-turn`, model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
    ].join("\n")

    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: timestamp }))
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([
      { id: "visible-root", title: "Visible user task" },
      { id: "orphan-agent", title: "You are the orchestration parent for one bounded implementation" },
    ]))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(`${root}/root.jsonl`, makeUsage("visible-root", "User request", { thread_source: "user" }))
    ctx.host.fs.writeText(`${root}/agent.jsonl`, makeUsage(
      "orphan-agent",
      "You are the orchestration parent. Delegate to agent_type \"subagent_Luna_max\".",
      { thread_source: "user" },
    ))

    const result = (await loadPlugin()).probe(ctx)
    const sessions = result.lines.filter((line) => line.label === "Session").map((line) => line.value)
    const prompts = result.lines.filter((line) => line.label === "Prompt").map((line) => line.value)

    expect(sessions).toEqual(["Visible user task"])
    expect(prompts).toEqual(["User request"])
  })

  it("merges continued log files that belong to the same Codex session", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const makePart = (turnId, prompt, timestamp) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "continued-session", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: turnId, model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: prompt } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } } }),
    ].join("\n")
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: { access_token: "token" }, last_refresh: date.toISOString() }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.sqlite.query.mockReturnValue(JSON.stringify([{ id: "continued-session", title: "Continued task" }]))
    ctx.host.fs.writeText(`${root}/part-1.jsonl`, makePart("turn-1", "First prompt", new Date(date.getTime() - 60_000).toISOString()))
    ctx.host.fs.writeText(`${root}/part-2.jsonl`, makePart("turn-2", "Second prompt", date.toISOString()))

    const result = (await loadPlugin()).probe(ctx)
    const header = result.lines.find((line) => line.label === "Prompt Usage")
    const sessions = result.lines.filter((line) => line.label === "Session")
    const prompts = result.lines.filter((line) => line.label === "Prompt").map((line) => line.value)

    expect(header.value).toBe("2 prompts · 1 session")
    expect(sessions).toHaveLength(1)
    expect(sessions[0].value).toBe("Continued task")
    expect(prompts).toEqual(["Second prompt", "First prompt"])
  })

  it("namespaces provisional turn IDs by continued-file path", async () => {
    const ctx = makeCtx()
    const root = "~/.codex/sessions/2026/08/27"
    const firstPath = `${root}/provisional-part-1.jsonl`
    const secondPath = `${root}/provisional-part-2.jsonl`
    const compactedPart = (turnId, prompt, timestamp) => [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "continued-provisional-session", cwd: "/tmp/example-project", thread_source: "user" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "task_started", turn_id: turnId } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: turnId, model: "gpt-5.6-sol" } }),
      JSON.stringify({
        type: "response_item",
        timestamp,
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
      }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } } }),
    ].join("\n")
    ctx.host.fs.writeText(firstPath, compactedPart("first-durable-turn", "First provisional prompt", "2026-08-27T08:00:00.000Z"))
    ctx.host.fs.writeText(secondPath, compactedPart("second-durable-turn", "Second provisional prompt", "2026-08-27T09:00:00.000Z"))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt" && /provisional prompt$/.test(line.value))
    const ids = prompts.map((line) => JSON.parse(line.subtitle).id)

    expect(prompts.map((line) => line.value)).toEqual(["Second provisional prompt", "First provisional prompt"])
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(expect.arrayContaining([
      `${firstPath}#pending-1`,
      `${secondPath}#pending-1`,
    ]))
  })

  it("deduplicates the same provisional prompt replayed across continued files", async () => {
    const ctx = makeCtx()
    const root = "~/.codex/sessions/2026/08/27"
    const timestamp = "2026-08-27T09:00:00.000Z"
    const replay = {
      id: "continued-replay-session",
      prompt: "Replayed provisional prompt",
      timestamp,
    }
    ctx.host.fs.writeText(`${root}/replay-part-1.jsonl`, provisionalPromptUsageSession(replay))
    ctx.host.fs.writeText(`${root}/replay-part-2.jsonl`, provisionalPromptUsageSession(replay))

    const result = (await loadPlugin()).probePromptUsage(ctx)
    const prompts = result.lines.filter((line) => line.label === "Prompt")

    expect(prompts).toHaveLength(1)
    expect(prompts[0].value).toBe(replay.prompt)
    expect(JSON.parse(prompts[0].subtitle).usage.totalTokens).toBe(3)
  })

  it("aggregates a spawned subagent into the parent prompt", async () => {
    const ctx = makeCtx()
    const date = new Date()
    const pad = (value) => String(value).padStart(2, "0")
    const root = `~/.codex/sessions/${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const timestamp = date.toISOString()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: timestamp,
    }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "{}" })
    ctx.host.fs.writeText(`${root}/parent.jsonl`, [
      JSON.stringify({ type: "session_meta", timestamp, payload: { id: "parent", cwd: "/tmp/example-project" } }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "parent-turn", model: "gpt-5.6-sol" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Build grouped usage" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Continue the parent task" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "sub_agent_activity", kind: "started", agent_thread_id: "child" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 12, output_tokens: 3, total_tokens: 15 } } } }),
    ].join("\n"))
    ctx.host.fs.writeText(`${root}/child.jsonl`, [
      JSON.stringify({
        type: "session_meta",
        timestamp,
        payload: {
          id: "child",
          cwd: "/tmp/example-project",
          parent_thread_id: "parent",
          thread_source: "subagent",
          source: { subagent: { thread_spawn: { parent_thread_id: "parent", agent_nickname: "Schrodinger", agent_role: "subagent_Luna_max" } } },
        },
      }),
      JSON.stringify({ type: "turn_context", timestamp, payload: { turn_id: "child-turn", model: "gpt-5.6-luna" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "user_message", message: "Implement the parser" } }),
      JSON.stringify({ type: "event_msg", timestamp, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 } } } }),
    ].join("\n"))

    const result = (await loadPlugin()).probe(ctx)

    const prompts = result.lines.filter((line) => line.label === "Prompt")
    const parentPrompt = prompts.find((line) => line.value === "Build grouped usage")
    const subagents = result.lines.filter((line) => line.label === "Agent" && line.value === "Schrodinger")
    expect(parentPrompt).toBeTruthy()
    expect(JSON.parse(parentPrompt.subtitle).usage.totalTokens).toBe(22)
    expect(subagents).toHaveLength(1)
    expect(JSON.parse(subagents[0].subtitle)).toMatchObject({
      id: "child",
      kind: "subagent",
      role: "subagent_Luna_max",
      usage: { totalTokens: 10 },
    })
    expect(result.lines.some((line) => line.value === "Implement the parser")).toBe(false)
  })

  it("does not read keychain when file auth succeeds", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "file-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockImplementation(() => {
      throw new Error("keychain should not be read")
    })
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer file-token")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "10" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("uses CODEX_HOME auth path when env var is set", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "CODEX_HOME" ? "/tmp/codex-home" : null))
    ctx.host.fs.writeText("/tmp/codex-home/auth.json", JSON.stringify({
      tokens: { access_token: "env-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "config-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer env-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("uses ~/.config/codex/auth.json before ~/.codex/auth.json when env is not set", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "config-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "legacy-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer config-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("does not fall back when CODEX_HOME is set but missing auth file", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "CODEX_HOME" ? "/tmp/missing-codex-home" : null))
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "config-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "legacy-token" },
      last_refresh: new Date().toISOString(),
    }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("throws when auth json is invalid", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", "{bad")
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("falls back to keychain when auth file is invalid", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", "{bad")
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer keychain-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
  })

  it("supports hex-encoded keychain auth payload", async () => {
    const ctx = makeCtx()
    const raw = JSON.stringify({
      tokens: { access_token: "hex-token" },
      last_refresh: new Date().toISOString(),
    })
    const hex = Buffer.from(raw, "utf8").toString("hex")
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer hex-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
  })

  it("throws when auth lacks tokens and api key", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({ tokens: {} }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("uses existing Codex credentials and formats usage", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    ctx.host.fs.writeText(authPath, JSON.stringify({
      tokens: { access_token: "old", refresh_token: "refresh", account_id: "acc" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(opts.headers.Authorization).toBe("Bearer old")
      return {
        status: 200,
        headers: {
          "x-codex-primary-used-percent": "25",
          "x-codex-secondary-used-percent": "50",
          "x-codex-credits-balance": "100",
        },
        bodyText: JSON.stringify({
          plan_type: "pro",
          rate_limit: {
            primary_window: { reset_after_seconds: 60, used_percent: 10 },
            secondary_window: { reset_after_seconds: 120, used_percent: 20 },
          },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Pro 20x")
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Weekly")).toBeTruthy()
    const credits = result.lines.find((line) => line.label === "Credits")
    expect(credits).toBeTruthy()
    expect(credits).toEqual({
      type: "text",
      label: "Credits",
      value: "$4.00 · 100 credits",
    })
    expect(credits).not.toHaveProperty("used")
    expect(credits).not.toHaveProperty("limit")
  })

  it("maps prolite plan to Pro 5x", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {
        "x-codex-primary-used-percent": "25",
        "x-codex-secondary-used-percent": "50",
        "x-codex-credits-balance": "100",
      },
      bodyText: JSON.stringify({
        plan_type: "prolite",
        rate_limit: {
          primary_window: { reset_after_seconds: 60, used_percent: 10 },
          secondary_window: { reset_after_seconds: 120, used_percent: 20 },
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("Pro 5x")
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Weekly")).toBeTruthy()
    const credits = result.lines.find((line) => line.label === "Credits")
    expect(credits).toBeTruthy()
    expect(credits.value).toBe("$4.00 · 100 credits")
  })

  it("uses zero credits from the response body when the account has no credits", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {
        "x-codex-credits-balance": "1000",
      },
      bodyText: JSON.stringify({
        plan_type: "plus",
        rate_limit: {
          primary_window: { used_percent: 46, limit_window_seconds: 18000, reset_after_seconds: 6699 },
          secondary_window: { used_percent: 15, limit_window_seconds: 604800, reset_after_seconds: 505326 },
        },
        code_review_rate_limit: null,
        additional_rate_limits: null,
        credits: {
          has_credits: false,
          unlimited: false,
          overage_limit_reached: false,
          balance: "0",
          approx_local_messages: [0, 0],
          approx_cloud_messages: [0, 0],
        },
        spend_control: {
          reached: false,
          individual_limit: null,
        },
        rate_limit_reached_type: null,
        promo: null,
        referral_beacon: null,
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const credits = result.lines.find((line) => line.label === "Credits")
    expect(credits).toBeTruthy()
    expect(credits.value).toBe("$0.00 · 0 credits")
  })

  it("shows the monthly credit limit for business accounts with a hidden balance", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-credits-balance": "" },
      bodyText: JSON.stringify({
        plan_type: "business",
        credits: {
          has_credits: true,
          unlimited: false,
          balance: null,
        },
        spend_control: {
          reached: false,
          individual_limit: {
            source: "workspace_spend_controls",
            limit: "15000",
            used: "3831.746052503586",
            remaining: "11168.253947496414",
            used_percent: 26,
            remaining_percent: 74,
            reset_after_seconds: 920777,
            reset_at: 1785542400,
          },
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Business")
    expect(result.lines.find((line) => line.label === "Credits")).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Monthly Credit Limit")).toEqual({
      type: "progress",
      label: "Monthly Credit Limit",
      used: 3832,
      limit: 15000,
      format: { kind: "count", suffix: "credits" },
      resetsAt: new Date(1785542400 * 1000).toISOString(),
    })
  })

  it("shows credit balances above 1000 without a fake cap", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {
        "x-codex-credits-balance": "1250",
      },
      bodyText: JSON.stringify({}),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const credits = result.lines.find((line) => line.label === "Credits")
    expect(credits).toEqual({
      type: "text",
      label: "Credits",
      value: "$50.00 · 1250 credits",
    })
  })

  it("uses stale-dated keychain credentials without refreshing or writing them", async () => {
    const ctx = makeCtx()
    const authText = JSON.stringify({
      tokens: { access_token: "old", refresh_token: "refresh", account_id: "acc" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.keychain.readGenericPassword.mockReturnValue(authText)
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer old")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.keychain.readGenericPassword("Codex Auth")).toBe(authText)
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
    expect(ctx.host.keychain.writeGenericPasswordForCurrentUser).not.toHaveBeenCalled()
    expect(ctx.host.fs.writeText.mock.calls.filter(([path]) => path.endsWith("auth.json"))).toEqual([])
  })

  it("omits token lines when ccusage reports no_runner", async () => {
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
    ctx.host.ccusage.query.mockReturnValue({ status: "no_runner" })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Today")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Yesterday")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Session")).toBeTruthy()
  })

  it("adds token lines from codex ccusage format and passes codex provider", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-02-20T16:00:00.000Z"))

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
    const now = new Date()
    const month = now.toLocaleString("en-US", { month: "short" })
    const day = String(now.getDate()).padStart(2, "0")
    const year = now.getFullYear()
    const todayKey = month + " " + day + ", " + year
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
        { date: todayKey, totalTokens: 150, costUSD: 0.75 },
        { date: "Feb 01, 2026", totalTokens: 300, costUSD: 1.0 },
        ],
      },
    })

    try {
      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)

      const today = result.lines.find((l) => l.label === "Today")
      expect(today).toBeTruthy()
      expect(today.value).toContain("150")
      expect(today.value).toContain("$0.75")

      const last30 = result.lines.find((l) => l.label === "Last 30 Days")
      expect(last30).toBeTruthy()
      expect(last30.value).toContain("450")
      expect(last30.value).toContain("$1.75")

      expect(ctx.host.ccusage.query).toHaveBeenCalled()
      const firstCall = ctx.host.ccusage.query.mock.calls[0][0]
      expect(firstCall.provider).toBe("codex")
      const since = new Date()
      since.setDate(since.getDate() - 365)
      const sinceYear = String(since.getFullYear())
      const sinceMonth = String(since.getMonth() + 1).padStart(2, "0")
      const sinceDay = String(since.getDate()).padStart(2, "0")
      expect(firstCall.since).toBe(sinceYear + sinceMonth + sinceDay)
    } finally {
      vi.useRealTimers()
    }
  })

  it("passes CODEX_HOME to ccusage via homePath", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "CODEX_HOME" ? "/tmp/codex-home" : null))
    ctx.host.fs.writeText("/tmp/codex-home/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.ccusage.query).toHaveBeenCalled()
    const firstCall = ctx.host.ccusage.query.mock.calls[0][0]
    expect(firstCall.homePath).toBe("/tmp/codex-home")
  })

  it("queries ccusage on each probe", async () => {
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
      data: { daily: [{ date: "2026-02-01", totalTokens: 100, totalCost: 0.5 }] },
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
    plugin.probe(ctx)

    expect(ctx.host.ccusage.query).toHaveBeenCalledTimes(4)
  })

  it("shows empty Today state when ccusage returns ok with empty daily array", async () => {
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
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const todayLine = result.lines.find((l) => l.label === "Today")
    expect(todayLine).toBeTruthy()
    expect(todayLine.value).toContain("$0.00")
    const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
    expect(yesterdayLine).toBeTruthy()
    expect(yesterdayLine.value).toContain("$0.00")
    expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
  })

  it("shows empty Yesterday state when yesterday's totals are zero (regression)", async () => {
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
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const month = yesterday.toLocaleString("en-US", { month: "short" })
    const day = String(yesterday.getDate()).padStart(2, "0")
    const year = yesterday.getFullYear()
    const yesterdayKey = month + " " + day + ", " + year
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
        { date: yesterdayKey, totalTokens: 0, costUSD: 0 },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
    expect(yesterdayLine).toBeTruthy()
    expect(yesterdayLine.value).toContain("$0.00")
  })

  it("shows empty Today when history exists but today is missing (regression)", async () => {
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
        { date: dayKey(10), totalTokens: 300, costUSD: 1.0 },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const todayLine = result.lines.find((l) => l.label === "Today")
    expect(todayLine).toBeTruthy()
    expect(todayLine.value).toContain("$0.00")
    const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
    expect(yesterdayLine).toBeTruthy()
    expect(yesterdayLine.value).toContain("$0.00")

    const last30 = result.lines.find((l) => l.label === "Last 30 Days")
    expect(last30).toBeTruthy()
    expect(last30.value).toContain("300")
    expect(last30.value).toContain("$1.00")
  })

  it("adds Yesterday line from codex ccusage format", async () => {
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
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const month = yesterday.toLocaleString("en-US", { month: "short" })
    const day = String(yesterday.getDate()).padStart(2, "0")
    const year = yesterday.getFullYear()
    const yesterdayKey = month + " " + day + ", " + year
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
        { date: yesterdayKey, totalTokens: 220, costUSD: 1.1 },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const yesterdayLine = result.lines.find((l) => l.label === "Yesterday")
    expect(yesterdayLine).toBeTruthy()
    expect(yesterdayLine.value).toContain("220")
    expect(yesterdayLine.value).toContain("$1.10")
  })

  it("matches UTC timestamp day keys at month boundary (regression)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
    try {
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
        data: { daily: [{ date: "2026-03-01T12:00:00Z", totalTokens: 10, costUSD: 0.1 }] },
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((line) => line.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("10")
    } finally {
      vi.useRealTimers()
    }
  })

  it("matches UTC+9 timestamp day keys at month boundary (regression)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
    try {
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
        data: { daily: [{ date: "2026-03-01T00:30:00+09:00", totalTokens: 20, costUSD: 0.2 }] },
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((line) => line.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("20")
    } finally {
      vi.useRealTimers()
    }
  })

  it("matches UTC-8 timestamp day keys at day boundary (regression)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 12, 0, 0))
    try {
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
        data: { daily: [{ date: "2026-03-01T23:30:00-08:00", totalTokens: 30, costUSD: 0.3 }] },
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const todayLine = result.lines.find((line) => line.label === "Today")
      expect(todayLine).toBeTruthy()
      expect(todayLine.value).toContain("30")
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports expired sign-in when unauthorized credentials have not changed", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "old" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockReturnValue({ status: 401, headers: {}, bodyText: "{}" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.http.request.mock.calls[0][0].method).toBe("GET")
  })

  it("uses an unexpired JWT without attempting OAuth", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"))
    try {
      const ctx = makeCtx()
      const accessToken = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 6 * 60,
      })
      ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
        tokens: { access_token: accessToken, refresh_token: "refresh" },
        last_refresh: "2000-01-01T00:00:00.000Z",
      }))
      ctx.host.http.request.mockImplementation((opts) => {
        expect(opts.method).toBe("GET")
        expect(String(opts.url)).not.toContain("oauth/token")
        expect(opts.headers.Authorization).toBe("Bearer " + accessToken)
        return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
      })

      const plugin = await loadPlugin()
      plugin.probe(ctx)

      expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses opaque credentials without expiry or last-refresh metadata", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "opaque-token", refresh_token: "refresh" },
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer opaque-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
  })

  it("uses a near-expiry JWT without rotating Codex credentials", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"))
    try {
      const ctx = makeCtx()
      const accessToken = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 4 * 60,
      })
      const authText = JSON.stringify({
        tokens: { access_token: accessToken, refresh_token: "refresh" },
        last_refresh: new Date().toISOString(),
      })
      ctx.host.fs.writeText("~/.codex/auth.json", authText)
      ctx.host.fs.writeText.mockClear()
      ctx.host.http.request.mockImplementation((opts) => {
        expect(opts.method).toBe("GET")
        expect(String(opts.url)).not.toContain("oauth/token")
        expect(opts.headers.Authorization).toBe("Bearer " + accessToken)
        return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
      })

      const plugin = await loadPlugin()
      plugin.probe(ctx)

      expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
      expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(authText)
      expect(ctx.host.fs.writeText.mock.calls.filter(([path]) => path === "~/.codex/auth.json")).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("reloads newer same-account credentials before querying", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-08T00:00:00.000Z"))
    try {
      const ctx = makeCtx()
      const authPath = "~/.codex/auth.json"
      const staleAuth = JSON.stringify({
        tokens: {
          access_token: makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 }),
          refresh_token: "stale-refresh",
          account_id: "account",
        },
        last_refresh: "2000-01-01T00:00:00.000Z",
      })
      const freshToken = makeJwt({
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      })
      const freshAuth = JSON.stringify({
        tokens: {
          access_token: freshToken,
          refresh_token: "fresh-refresh",
          account_id: "account",
        },
        last_refresh: new Date().toISOString(),
      })
      ctx.host.fs.writeText(authPath, staleAuth)
      ctx.host.fs.readText = vi.fn()
        .mockReturnValueOnce(staleAuth)
        .mockReturnValue(freshAuth)
      ctx.host.http.request.mockImplementation((opts) => {
        expect(String(opts.url)).not.toContain("oauth/token")
        expect(opts.headers.Authorization).toBe("Bearer " + freshToken)
        return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
      })

      const plugin = await loadPlugin()
      plugin.probe(ctx)

      expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("retries an unauthorized request with newer same-account Codex credentials", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    const staleAuth = {
      tokens: {
        access_token: "stale-access",
        refresh_token: "used-refresh",
        account_id: "account",
      },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }
    const freshAuth = {
      tokens: {
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        account_id: "account",
      },
      last_refresh: new Date().toISOString(),
    }
    ctx.host.fs.writeText(authPath, JSON.stringify(staleAuth))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      if (opts.headers.Authorization === "Bearer stale-access") {
        ctx.host.fs.writeText(authPath, JSON.stringify(freshAuth))
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer fresh-access")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "17" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.http.request.mock.calls.map(([opts]) => opts.headers.Authorization))
      .toEqual(["Bearer stale-access", "Bearer fresh-access", "Bearer fresh-access"])
    expect(ctx.host.fs.readText(authPath)).toBe(JSON.stringify(freshAuth))
    expect(ctx.host.fs.writeText.mock.calls.filter(([path]) => path === authPath)).toHaveLength(2)
  })

  it("reports expired sign-in when the newer token is also unauthorized", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    const staleAuth = {
      tokens: {
        access_token: "stale-access",
        refresh_token: "used-refresh",
        account_id: "account",
      },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }
    const freshAuth = {
      tokens: {
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        account_id: "account",
      },
      last_refresh: new Date().toISOString(),
    }
    ctx.host.fs.writeText(authPath, JSON.stringify(staleAuth))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      if (opts.headers.Authorization === "Bearer stale-access") {
        ctx.host.fs.writeText(authPath, JSON.stringify(freshAuth))
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer fresh-access")
      return { status: 401, headers: {}, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.http.request.mock.calls.map(([opts]) => opts.headers.Authorization))
      .toEqual(["Bearer stale-access", "Bearer fresh-access"])
    expect(ctx.host.fs.readText(authPath)).toBe(JSON.stringify(freshAuth))
    expect(ctx.host.fs.writeText).toHaveBeenCalledTimes(2)
  })

  it("fails cleanly when guarded reload switches to API-key auth", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    const staleAuth = JSON.stringify({
      tokens: {
        access_token: "stale-access",
        refresh_token: "stale-refresh",
        account_id: "account",
      },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText(authPath, staleAuth)
    ctx.host.fs.readText = vi.fn()
      .mockReturnValueOnce(staleAuth)
      .mockReturnValue(JSON.stringify({ OPENAI_API_KEY: "sk-test" }))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("fails cleanly when guarded reload switches accounts", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    const staleAuth = JSON.stringify({
      tokens: {
        access_token: "stale-access",
        refresh_token: "stale-refresh",
        account_id: "account",
      },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText(authPath, staleAuth)
    ctx.host.fs.readText = vi.fn()
      .mockReturnValueOnce(staleAuth)
      .mockReturnValue(JSON.stringify({
        tokens: {
          access_token: "other-access",
          refresh_token: "other-refresh",
          account_id: "other-account",
        },
        last_refresh: new Date().toISOString(),
      }))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("never submits a stale refresh token when usage returns unauthorized", async () => {
    const ctx = makeCtx()
    const authText = JSON.stringify({
      tokens: { access_token: "old", refresh_token: "used-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText("~/.codex/auth.json", authText)
    ctx.host.fs.writeText.mockClear()
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.bodyText).toBeUndefined()
      return { status: 401, headers: {}, bodyText: "" }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(authText)
    expect(ctx.host.fs.writeText).not.toHaveBeenCalled()
  })

  it("uses a valid access token despite stale refresh metadata", async () => {
    const ctx = makeCtx()
    const authText = JSON.stringify({
      tokens: { access_token: "still-valid", refresh_token: "used-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText("~/.codex/auth.json", authText)
    ctx.host.fs.writeText.mockClear()
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer still-valid")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "14" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(authText)
    expect(ctx.host.fs.writeText.mock.calls.filter(([path]) => path === "~/.codex/auth.json")).toEqual([])
  })

  it("uses the first valid file access token before later auth candidates", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "still-valid", refresh_token: "used-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "expired", refresh_token: "expired-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer still-valid")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "15" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
  })

  it("uses existing file token before checking keychain", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "still-valid", refresh_token: "used-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token", refresh_token: "expired-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer still-valid")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "16" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("preserves server errors without falling back or refreshing", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "still-valid", refresh_token: "used-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      return { status: 500, headers: {}, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed (HTTP 500)")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("falls back to keychain after an unchanged file token is unauthorized", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "old-file-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      if (opts.headers.Authorization === "Bearer old-file-token") {
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer keychain-token")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "9" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("Codex Auth")
    expect(ctx.host.http.request.mock.calls.map(([opts]) => opts.headers.Authorization))
      .toEqual(["Bearer old-file-token", "Bearer keychain-token", "Bearer keychain-token"])
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("reports expired sign-in when file and keychain credentials are unauthorized", async () => {
    const ctx = makeCtx()
    const fileAuth = JSON.stringify({
      tokens: { access_token: "file-token", refresh_token: "file-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    const keychainAuth = JSON.stringify({
      tokens: { access_token: "keychain-token", refresh_token: "keychain-refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText("~/.codex/auth.json", fileAuth)
    ctx.host.fs.writeText.mockClear()
    ctx.host.keychain.readGenericPassword.mockReturnValue(keychainAuth)
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      return { status: 401, headers: {}, bodyText: "" }
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.keychain.readGenericPassword).toHaveBeenCalledWith("Codex Auth")
    expect(ctx.host.http.request.mock.calls.map(([opts]) => opts.headers.Authorization))
      .toEqual(["Bearer file-token", "Bearer keychain-token"])
    expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(fileAuth)
    expect(ctx.host.keychain.readGenericPassword("Codex Auth")).toBe(keychainAuth)
    expect(ctx.host.fs.writeText).not.toHaveBeenCalled()
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("tries next file auth before keychain when earlier file auth is stale", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "old-config-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "legacy-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (opts.headers.Authorization === "Bearer old-config-token") {
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer legacy-token")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "7" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("does not fall back to keychain when file usage request returns server error", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "file-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({ status: 500, headers: {}, bodyText: "" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed (HTTP 500)")
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("does not fall back to keychain when file usage response is invalid", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "file-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({ status: 200, headers: {}, bodyText: "bad" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("does not fall back to keychain when file usage request throws", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "file-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("offline")
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("throws for api key auth", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      OPENAI_API_KEY: "key",
    }))
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage not available for API key")
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
  })

  it("falls back to rate_limit data and review window", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 10, reset_after_seconds: 60 },
          secondary_window: { used_percent: 20, reset_after_seconds: 120 },
        },
        code_review_rate_limit: {
          primary_window: { used_percent: 15, reset_after_seconds: 90 },
        },
        credits: { balance: 820.6969075 },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Reviews")).toBeTruthy()
    const credits = result.lines.find((line) => line.label === "Credits")
    expect(credits).toBeTruthy()
    expect(credits.value).toBe("$32.80 · 820 credits")
  })

  it("shows available rate limit resets as the first text line", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    const expiresAt = "2026-08-01T12:00:00.000Z"
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            available_count: 1,
            credits: [{
              id: "RateLimitResetCredit_1",
              status: "available",
              expires_at: expiresAt,
            }],
          }),
        }
      }
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          credits: { balance: 100 },
        }),
      }
    })
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: { daily: [] },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const resetIndex = result.lines.findIndex((line) => line.label === "Rate Limit Resets")
    const creditsIndex = result.lines.findIndex((line) => line.label === "Credits")
    const firstTextIndex = result.lines.findIndex((line) => line.type === "text")

    expect(result.lines[resetIndex]).toMatchObject({
      type: "text",
      label: "Rate Limit Resets",
      value: "1 available",
      resetExpiry: [expiresAt],
    })
    expect(resetIndex).toBeGreaterThanOrEqual(0)
    expect(resetIndex).toBe(firstTextIndex)
    expect(creditsIndex).toBe(resetIndex + 1)
  })

  it("shows zero available rate limit resets and omits malformed counts", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    const plugin = await loadPlugin()

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ available_count: 0, credits: [] }),
        }
      }
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })
    const zeroResult = plugin.probe(ctx)
    expect(zeroResult.lines.find((line) => line.label === "Rate Limit Resets")?.value)
      .toBe("0 available")

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ available_count: null }),
        }
      }
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })
    const malformedResult = plugin.probe(ctx)
    expect(malformedResult.lines.find((line) => line.label === "Rate Limit Resets"))
      .toBeUndefined()
  })

  it("uses expires_at from rate-limit-reset-credits for resetExpiry", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))

    const sooner = "2026-07-20T00:00:00.000Z"
    const later = "2026-08-01T00:00:00.000Z"
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            available_count: 2,
            credits: [
              {
                id: "RateLimitResetCredit_later",
                status: "available",
                expires_at: later,
              },
              {
                id: "RateLimitResetCredit_sooner",
                status: "available",
                expires_at: sooner,
              },
              {
                id: "RateLimitResetCredit_used",
                status: "redeemed",
                expires_at: "2026-07-01T00:00:00.000Z",
              },
            ],
          }),
        }
      }
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const line = result.lines.find((l) => l.label === "Rate Limit Resets")
    expect(line.value).toBe("2 available")
    expect(line.resetExpiry).toEqual([sooner, later])
    expect(ctx.host.fs.writeText.mock.calls.find(([p]) =>
      String(p).endsWith("grants.json"),
    )).toBeUndefined()
  })

  it("omits resetExpiry when available count is zero", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ available_count: 0, credits: [] }),
        }
      }
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const line = result.lines.find((l) => l.label === "Rate Limit Resets")
    expect(line).toBeTruthy()
    expect(line.value).toBe("0 available")
    expect(line.resetExpiry).toBeUndefined()
  })

  it("falls back to usage available_count without expiry when reset-credits endpoint fails", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("rate-limit-reset-credits")) {
        return { status: 500, headers: {}, bodyText: "error" }
      }
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          rate_limit_reset_credits: { available_count: 2 },
        }),
      }
    })
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: { daily: [] } })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const line = result.lines.find((l) => l.label === "Rate Limit Resets")
    expect(line.value).toBe("2 available")
    expect(line.resetExpiry).toBeUndefined()
  })

  it("omits resetsAt when window lacks reset info", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 10 },
        },
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const sessionLine = result.lines.find((line) => line.label === "Session")
    expect(sessionLine).toBeTruthy()
    expect(sessionLine.resetsAt).toBeUndefined()
  })

  it("uses reset_at when present for resetsAt", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    const nowSec = Math.floor(now / 1000)
    const resetsAtExpected = new Date((nowSec + 60) * 1000).toISOString()

    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 10, reset_at: nowSec + 60 },
        },
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const session = result.lines.find((line) => line.label === "Session")
    expect(session).toBeTruthy()
    expect(session.resetsAt).toBe(resetsAtExpected)
    nowSpy.mockRestore()
  })

  it("throws on http and parse errors", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValueOnce({ status: 500, headers: {}, bodyText: "" })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("HTTP 500")

    ctx.host.http.request.mockReturnValueOnce({ status: 200, headers: {}, bodyText: "bad" })
    expect(() => plugin.probe(ctx)).toThrow("Usage response invalid")
  })

  it("shows status badge when no usage data and ccusage failed", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({}),
    })
    ctx.host.ccusage.query.mockReturnValue({ status: "runner_failed" })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((l) => l.label === "Today")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Yesterday")).toBeUndefined()
    expect(result.lines.find((l) => l.label === "Last 30 Days")).toBeUndefined()
    const statusLine = result.lines.find((l) => l.label === "Status")
    expect(statusLine).toBeTruthy()
    expect(statusLine.text).toBe("No usage data")
    expect(ctx.host.log.error).toHaveBeenCalledWith("ccusage daily query failed: status=runner_failed")
  })

  it("throws on usage request failures", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("boom")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed")
  })

  it("shows a friendly connection error if the newer-credential retry fails", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    ctx.host.fs.writeText(authPath, JSON.stringify({
      tokens: { access_token: "token", refresh_token: "refresh", account_id: "account" },
      last_refresh: new Date().toISOString(),
    }))
    const newerAuth = JSON.stringify({
      tokens: { access_token: "new", refresh_token: "new-refresh", account_id: "account" },
    })
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      if (opts.headers.Authorization === "Bearer token") {
        ctx.host.fs.writeText(authPath, newerAuth)
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer new")
      throw new Error("boom")
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.fs.readText(authPath)).toBe(newerAuth)
    expect(ctx.host.fs.writeText).toHaveBeenCalledTimes(2)
  })

  it("surfaces additional_rate_limits as Spark lines", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    const now = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    const nowSec = Math.floor(now / 1000)

    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 5, reset_after_seconds: 60 },
          secondary_window: { used_percent: 10, reset_after_seconds: 120 },
        },
        additional_rate_limits: [
          {
            limit_name: "GPT-5.3-Codex-Spark",
            metered_feature: "codex_bengalfox",
            rate_limit: {
              primary_window: {
                used_percent: 25,
                limit_window_seconds: 18000,
                reset_after_seconds: 3600,
                reset_at: nowSec + 3600,
              },
              secondary_window: {
                used_percent: 40,
                limit_window_seconds: 604800,
                reset_after_seconds: 86400,
                reset_at: nowSec + 86400,
              },
            },
          },
        ],
      }),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    const spark = result.lines.find((l) => l.label === "Spark")
    expect(spark).toBeTruthy()
    expect(spark.used).toBe(25)
    expect(spark.limit).toBe(100)
    expect(spark.periodDurationMs).toBe(18000000)
    expect(spark.resetsAt).toBe(new Date((nowSec + 3600) * 1000).toISOString())

    const sparkWeekly = result.lines.find((l) => l.label === "Spark Weekly")
    expect(sparkWeekly).toBeTruthy()
    expect(sparkWeekly.used).toBe(40)
    expect(sparkWeekly.limit).toBe(100)
    expect(sparkWeekly.periodDurationMs).toBe(604800000)
    expect(sparkWeekly.resetsAt).toBe(new Date((nowSec + 86400) * 1000).toISOString())

    nowSpy.mockRestore()
  })

  it("handles additional_rate_limits with missing fields and fallback labels", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        additional_rate_limits: [
          // Entry with no limit_name, no limit_window_seconds, no secondary
          {
            limit_name: "",
            rate_limit: {
              primary_window: { used_percent: 10, reset_after_seconds: 60 },
              secondary_window: null,
            },
          },
          // Malformed entry (no rate_limit)
          { limit_name: "Bad" },
          // Null entry
          null,
        ],
      }),
    })
    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    const modelLine = result.lines.find((l) => l.label === "Model")
    expect(modelLine).toBeTruthy()
    expect(modelLine.used).toBe(10)
    expect(modelLine.periodDurationMs).toBe(5 * 60 * 60 * 1000) // fallback PERIOD_SESSION_MS
    // No weekly line for this entry since secondary_window is null
    expect(result.lines.find((l) => l.label === "Model Weekly")).toBeUndefined()
    // Malformed and null entries should be skipped
    expect(result.lines.find((l) => l.label === "Bad")).toBeUndefined()
  })

  it("handles missing or empty additional_rate_limits gracefully", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))

    // Missing field
    ctx.host.http.request.mockReturnValueOnce({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 5, reset_after_seconds: 60 },
        },
      }),
    })
    const plugin = await loadPlugin()
    const result1 = plugin.probe(ctx)
    expect(result1.lines.find((l) => l.label === "Spark")).toBeUndefined()

    // Empty array
    ctx.host.http.request.mockReturnValueOnce({
      status: 200,
      headers: {},
      bodyText: JSON.stringify({
        rate_limit: {
          primary_window: { used_percent: 5, reset_after_seconds: 60 },
        },
        additional_rate_limits: [],
      }),
    })
    const result2 = plugin.probe(ctx)
    expect(result2.lines.find((l) => l.label === "Spark")).toBeUndefined()
  })

  it("reports expired sign-in if a newer-credential retry returns forbidden", async () => {
    const ctx = makeCtx()
    const authPath = "~/.codex/auth.json"
    ctx.host.fs.writeText(authPath, JSON.stringify({
      tokens: { access_token: "token", refresh_token: "refresh", account_id: "account" },
      last_refresh: new Date().toISOString(),
    }))
    const newerAuth = JSON.stringify({
      tokens: { access_token: "new", refresh_token: "new-refresh", account_id: "account" },
    })
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      if (opts.headers.Authorization === "Bearer token") {
        ctx.host.fs.writeText(authPath, newerAuth)
        return { status: 401, headers: {}, bodyText: "" }
      }
      expect(opts.headers.Authorization).toBe("Bearer new")
      return { status: 403, headers: {}, bodyText: "" }
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.fs.readText(authPath)).toBe(newerAuth)
    expect(ctx.host.fs.writeText).toHaveBeenCalledTimes(2)
  })

  it("loads keychain auth when env object is unavailable", async () => {
    const ctx = makeCtx()
    ctx.host.env = null
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({
      tokens: { access_token: "keychain-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer keychain-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
  })

  it("ignores blank CODEX_HOME and uses default auth file paths", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => (name === "CODEX_HOME" ? "   " : null))
    ctx.host.fs.writeText("~/.config/codex/auth.json", JSON.stringify({
      tokens: { access_token: "config-token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.headers.Authorization).toBe("Bearer config-token")
      return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)
  })

  it("supports uppercase 0X-prefixed keychain hex payload", async () => {
    const ctx = makeCtx()
    const raw = JSON.stringify({
      tokens: { access_token: "hex-token" },
      last_refresh: new Date().toISOString(),
    })
    const hex = "0X" + Buffer.from(raw, "utf8").toString("hex").toUpperCase()
    ctx.host.keychain.readGenericPassword.mockReturnValue(hex)
    const originalTextDecoder = globalThis.TextDecoder
    // Force fallback decode path used in hosts without TextDecoder.
    globalThis.TextDecoder = undefined
    try {
      ctx.host.http.request.mockImplementation((opts) => {
        expect(opts.headers.Authorization).toBe("Bearer hex-token")
        return { status: 200, headers: {}, bodyText: JSON.stringify({}) }
      })
      const plugin = await loadPlugin()
      plugin.probe(ctx)
    } finally {
      globalThis.TextDecoder = originalTextDecoder
    }
  })

  it("handles an unauthorized usage response with a malformed body", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "old", refresh_token: "refresh" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    }))
    ctx.host.http.request.mockReturnValue({
      status: 401,
      headers: {},
      bodyText: "{bad",
    })
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in expired")
  })

  it("uses no_runner when ccusage host API is unavailable", async () => {
    const ctx = makeCtx()
    ctx.host.ccusage = null
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.host.http.request.mockReturnValue({
      status: 200,
      headers: { "x-codex-primary-used-percent": "10" },
      bodyText: JSON.stringify({}),
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Today")).toBeUndefined()
  })

  it("handles malformed ccusage result payload as runner_failed", async () => {
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
    ctx.host.ccusage.query.mockReturnValue({ status: "ok", data: {} })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.lines.find((line) => line.label === "Session")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Today")).toBeUndefined()
  })

  it("formats large token totals using compact units", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-12-15T12:00:00.000Z"))
    try {
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

      const now = new Date()
      const month = now.toLocaleString("en-US", { month: "short" })
      const day = String(now.getDate()).padStart(2, "0")
      const year = now.getFullYear()
      const todayKey = month + " " + day + ", " + year
      ctx.host.ccusage.query.mockReturnValue({
        status: "ok",
        data: {
          daily: [
            { date: todayKey, totalTokens: 1_250_000, totalCost: 12.5 },
            { date: "20261214", totalTokens: 25_000_000, costUSD: 50.0 },
            { date: "bad-date", totalTokens: "n/a", costUSD: "n/a" },
          ],
        },
      })

      const plugin = await loadPlugin()
      const result = plugin.probe(ctx)
      const today = result.lines.find((line) => line.label === "Today")
      const last30 = result.lines.find((line) => line.label === "Last 30 Days")
      expect(today && today.value).toContain("1.3M")
      expect(last30 && last30.value).toContain("26M")
    } finally {
      vi.useRealTimers()
    }
  })

  it("handles non-string retry wrapper exceptions", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", JSON.stringify({
      tokens: { access_token: "token" },
      last_refresh: new Date().toISOString(),
    }))
    ctx.util.retryOnceOnAuth = () => {
      throw new Error("boom")
    }

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Usage request failed. Check your connection.")
  })

  it("treats empty auth file payload as not logged in", async () => {
    const ctx = makeCtx()
    ctx.host.fs.writeText("~/.codex/auth.json", "")
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("handles missing keychain read API", async () => {
    const ctx = makeCtx()
    ctx.host.keychain = {}
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("ignores keychain payloads that are present but missing token-like auth", async () => {
    const ctx = makeCtx()
    ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify({ user: "me" }))
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Codex and sign in to continue")
  })

  it("leaves Codex refresh and ID tokens unchanged", async () => {
    const ctx = makeCtx()
    const authText = JSON.stringify({
      tokens: { access_token: "old", refresh_token: "refresh", id_token: "header.payload.signature" },
      last_refresh: "2000-01-01T00:00:00.000Z",
    })
    ctx.host.fs.writeText("~/.codex/auth.json", authText)
    ctx.host.fs.writeText.mockClear()

    ctx.host.http.request.mockImplementation((opts) => {
      expect(opts.method).toBe("GET")
      expect(String(opts.url)).not.toContain("oauth/token")
      expect(opts.headers.Authorization).toBe("Bearer old")
      return {
        status: 200,
        headers: { "x-codex-primary-used-percent": "1" },
        bodyText: JSON.stringify({}),
      }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.fs.readText("~/.codex/auth.json")).toBe(authText)
    expect(ctx.host.fs.writeText.mock.calls.filter(([path]) => path === "~/.codex/auth.json")).toEqual([])
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })
})
