(function () {
  const AUTH_FILE = "auth.json"
  const CONFIG_AUTH_PATHS = ["~/.config/codex", "~/.codex"]
  const KEYCHAIN_SERVICE = "Codex Auth"
  const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
  const RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
  const CREDIT_USD_RATE = 0.04
  const ERR_NOT_LOGGED_IN = "Open Codex and sign in to continue."
  const ERR_TOKEN_CONFLICT = "Your Codex sign-in changed. Open Codex and sign in again."
  const ERR_TOKEN_EXPIRED = "Your Codex sign-in expired. Open Codex and sign in again."
  const ERR_USAGE_API_KEY = "Usage not available for API key."
  const ERR_USAGE_CONNECTION = "Usage request failed. Check your connection."

  function joinPath(base, leaf) {
    return base.replace(/[\\/]+$/, "") + "/" + leaf
  }

  function readCodexHome(ctx) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") {
      return null
    }

    try {
      const value = ctx.host.env.get("CODEX_HOME")
      if (typeof value !== "string") return null
      const trimmed = value.trim()
      return trimmed || null
    } catch (e) {
      ctx.host.log.warn("CODEX_HOME read failed: " + String(e))
      return null
    }
  }

  function decodeHexUtf8(hex) {
    try {
      const bytes = []
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16))
      }

      if (typeof TextDecoder !== "undefined") {
        try {
          return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
        } catch {}
      }

      let escaped = ""
      for (const b of bytes) {
        const h = b.toString(16)
        escaped += "%" + (h.length === 1 ? "0" + h : h)
      }
      return decodeURIComponent(escaped)
    } catch {
      return null
    }
  }

  function tryParseAuthJson(ctx, text) {
    if (!text) return null
    const parsed = ctx.util.tryParseJson(text)
    if (parsed) return parsed

    // Some keychain payloads can be returned as hex-encoded UTF-8 bytes.
    let hex = String(text).trim()
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2)
    if (!hex || hex.length % 2 !== 0) return null
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null

    const decoded = decodeHexUtf8(hex)
    if (!decoded) return null
    return ctx.util.tryParseJson(decoded)
  }

  function resolveAuthPaths(ctx) {
    const codexHome = readCodexHome(ctx)

    // If CODEX_HOME is set, use it
    if (codexHome) {
      return [joinPath(codexHome, AUTH_FILE)]
    }

    return CONFIG_AUTH_PATHS.map((basePath) => joinPath(basePath, AUTH_FILE))
  }

  function hasTokenLikeAuth(auth) {
    if (!auth || typeof auth !== "object") return false
    if (auth.tokens && auth.tokens.access_token) return true
    if (auth.OPENAI_API_KEY) return true
    return false
  }

  function hasAccessTokenAuth(auth) {
    return !!(auth && auth.tokens && auth.tokens.access_token)
  }

  function isAuthFallbackError(e) {
    if (typeof e !== "string") return false
    return e === ERR_TOKEN_EXPIRED
  }

  function loadAuthFromKeychain(ctx, priorFiles = []) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return null
    }

    try {
      const value = ctx.host.keychain.readGenericPassword(KEYCHAIN_SERVICE)
      if (!value) return null
      const auth = tryParseAuthJson(ctx, value)
      if (!hasTokenLikeAuth(auth)) {
        ctx.host.log.warn("keychain has data but no codex auth payload")
        return null
      }
      ctx.host.log.info("auth loaded from keychain: " + KEYCHAIN_SERVICE)
      return { auth, authPath: null, source: "keychain", priorFiles }
    } catch (e) {
      ctx.host.log.info("keychain read failed (may not exist): " + String(e))
      return null
    }
  }

  function loadFileAuthCandidates(ctx) {
    const authPaths = resolveAuthPaths(ctx)
    const candidates = []
    const missingPaths = []
    const fileStates = []
    for (const authPath of authPaths) {
      if (!ctx.host.fs.exists(authPath)) {
        missingPaths.push(authPath)
        fileStates.push({ authPath, text: null })
        continue
      }
      try {
        const text = ctx.host.fs.readText(authPath)
        const priorFiles = fileStates.slice()
        fileStates.push({ authPath, text })
        const auth = tryParseAuthJson(ctx, text)
        if (!hasTokenLikeAuth(auth)) {
          ctx.host.log.warn("auth file exists but no valid codex auth payload: " + authPath)
          continue
        }
        ctx.host.log.info("auth loaded from file: " + authPath)
        candidates.push({ auth, authPath, source: "file", priorFiles })
      } catch (e) {
        fileStates.push({ authPath, unreadable: true })
        ctx.host.log.warn("auth file read failed: " + authPath + ": " + String(e))
      }
    }

    return { candidates, missingPaths, fileStates }
  }

  function reloadAuthState(ctx, authState) {
    // A newly preferred file invalidates a keychain or lower-priority result.
    for (const prior of authState.priorFiles || []) {
      try {
        const text = ctx.host.fs.exists(prior.authPath) ? ctx.host.fs.readText(prior.authPath) : null
        if (prior.unreadable || text !== prior.text) return { status: "error", error: ERR_TOKEN_CONFLICT }
      } catch {
        return { status: "error", error: ERR_TOKEN_CONFLICT }
      }
    }
    let reloaded = null
    if (authState.source === "file" && authState.authPath) {
      try {
        const auth = tryParseAuthJson(ctx, ctx.host.fs.readText(authState.authPath))
        if (hasTokenLikeAuth(auth)) {
          reloaded = { auth, authPath: authState.authPath, source: "file", priorFiles: authState.priorFiles }
        }
      } catch (e) {
        ctx.host.log.warn("auth reload failed for file " + authState.authPath + ": " + String(e))
      }
    } else if (authState.source === "keychain") {
      reloaded = loadAuthFromKeychain(ctx, authState.priorFiles)
    }

    if (!reloaded) return { status: "error", error: ERR_TOKEN_CONFLICT }
    if (!hasAccessTokenAuth(reloaded.auth)) {
      return { status: "error", error: ERR_TOKEN_CONFLICT }
    }

    const expectedAccountId = authState.auth.tokens && authState.auth.tokens.account_id
    const reloadedAccountId = reloaded.auth.tokens && reloaded.auth.tokens.account_id
    if (reloadedAccountId !== expectedAccountId) {
      return { status: "error", error: ERR_TOKEN_CONFLICT }
    }

    if (JSON.stringify(reloaded.auth) !== JSON.stringify(authState.auth)) {
      ctx.host.log.info("auth changed during guarded reload, using updated credentials")
      return { status: "changed", authState: reloaded }
    }
    return { status: "unchanged", authState }
  }

  function assertAuthUnchanged(ctx, authState) {
    if (reloadAuthState(ctx, authState).status !== "unchanged") throw ERR_TOKEN_CONFLICT
  }

  function chatgptHeaders(accessToken, accountId) {
    const headers = {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json",
      "User-Agent": "One-More-Prompt",
    }
    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId
    }
    return headers
  }

  function fetchUsage(ctx, accessToken, accountId) {
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers: chatgptHeaders(accessToken, accountId),
      timeoutMs: 10000,
    })
  }

  function fetchRateLimitResetCredits(ctx, accessToken, accountId) {
    return ctx.util.request({
      method: "GET",
      url: RESET_CREDITS_URL,
      headers: chatgptHeaders(accessToken, accountId),
      timeoutMs: 10000,
    })
  }

  function resetCreditDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return null
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10))
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
    return new Date(timestamp).toISOString()
  }

  function resetCreditsPayload(availableCount, credits, historyState) {
    return { availableCount: availableCount, credits: credits, history: [], historyState: historyState,
      historyWindowStart: null, historyAsOf: null }
  }

  function parseRateLimitResetCredits(ctx, data) {
    if (!data || typeof data !== "object") return null
    const reported = data.available_count == null ? null : readNumber(data.available_count)
    if (reported === null && !Array.isArray(data.credits)) return null
    const available = [], seenIds = new Set()
    let complete = Array.isArray(data.credits)
    for (const credit of Array.isArray(data.credits) ? data.credits : []) {
      if (!credit || typeof credit !== "object" || typeof credit.status !== "string") { complete = false; continue }
      if (credit.status !== "available") continue
      if (typeof credit.id !== "string" || !credit.id.trim() || seenIds.has(credit.id)) { complete = false; continue }
      seenIds.add(credit.id)
      available.push({ id: credit.id, grantedAt: resetCreditDate(credit.granted_at), expiresAt: resetCreditDate(credit.expires_at) })
    }
    const count = reported !== null ? Math.max(0, Math.floor(reported)) : available.length
    complete = complete && count === available.length
    if (!complete) ctx.host.log.warn("rate limit reset credit details incomplete")
    available.sort(function (a, b) {
      if (a.expiresAt === b.expiresAt) return a.id.localeCompare(b.id)
      if (a.expiresAt === null) return 1
      if (b.expiresAt === null) return -1
      return Date.parse(a.expiresAt) - Date.parse(b.expiresAt)
    })
    const normalized = resetCreditsPayload(count, complete ? available : null,
      data.history_enabled === false ? "disabled" : "unavailable")
    return { availableCount: count, expiryIsos: available.map(function (credit) { return credit.expiresAt }).filter(Boolean),
      resetCredits: normalized, historyEnabled: data.history_enabled === true }
  }

  function loadResetCreditHistory(ctx, accessToken, accountId, normalized) {
    let cursor = null, partial = false
    const deadline = Date.now() + 8000
    const seenCursors = new Set(), eventIds = new Set()
    for (let page = 0; page < 10; page++) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        normalized.historyState = page > 0 ? "partial" : "unavailable"
        ctx.host.log.warn("rate limit reset history stopped at the 8-second budget")
        return
      }
      try {
        const resp = ctx.util.request({ method: "GET", url: RESET_CREDITS_URL + "/history" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
          headers: chatgptHeaders(accessToken, accountId), timeoutMs: Math.min(5000, remainingMs) })
        if (resp.status < 200 || resp.status >= 300) throw new Error("HTTP " + resp.status)
        const data = ctx.util.tryParseJson(resp.bodyText)
        if (!data || !Array.isArray(data.events)) throw new Error("invalid events payload")
        if (page === 0) {
          normalized.historyWindowStart = resetCreditDate(data.window_start)
          normalized.historyAsOf = resetCreditDate(data.as_of)
        }
        for (const event of data.events) {
          const occurredAt = event && resetCreditDate(event.occurred_at)
          if (!event || typeof event.id !== "string" || !event.id.trim() || !occurredAt || (event.kind !== "granted" && event.kind !== "used")) {
            partial = true
            ctx.host.log.warn("rate limit reset history entry omitted: invalid identity, kind, or date")
            continue
          }
          if (eventIds.has(event.id)) continue
          eventIds.add(event.id)
          normalized.history.push({ id: event.id, kind: event.kind, occurredAt: occurredAt })
        }
        if (data.next_cursor === null || data.next_cursor === undefined) {
          normalized.historyState = partial ? "partial" : "ready"
          return
        }
        if (typeof data.next_cursor !== "string" || !data.next_cursor.trim() || seenCursors.has(data.next_cursor)) {
          throw new Error("invalid or repeated history cursor")
        }
        cursor = data.next_cursor
        seenCursors.add(cursor)
      } catch (error) {
        // Transport errors may embed the request URL, including an opaque history cursor.
        const reason = error && /^(HTTP \d{3}|invalid events payload|invalid or repeated history cursor)$/.test(error.message)
          ? error.message : "transport failure"
        ctx.host.log.warn("rate limit reset history request failed: " + reason)
        normalized.historyState = partial || page > 0 || normalized.history.length > 0 ? "partial" : "unavailable"
        return
      }
    }
    normalized.historyState = "partial"
    ctx.host.log.warn("rate limit reset history stopped at the 10-page limit")
  }

  function loadRateLimitResetCredits(ctx, accessToken, accountId, usageData) {
    try {
      const resp = fetchRateLimitResetCredits(ctx, accessToken, accountId)
      if (resp.status >= 200 && resp.status < 300) {
        const data = ctx.util.tryParseJson(resp.bodyText)
        const parsed = parseRateLimitResetCredits(ctx, data)
        if (parsed) {
          if (parsed.historyEnabled) loadResetCreditHistory(ctx, accessToken, accountId, parsed.resetCredits)
          return parsed
        }
        ctx.host.log.warn("rate limit reset credits response invalid")
      } else {
        ctx.host.log.warn("rate limit reset credits returned status=" + resp.status)
      }
    } catch (e) {
      ctx.host.log.warn("rate limit reset credits request failed: " + String(e))
    }

    const nestedRaw = usageData && usageData.rate_limit_reset_credits && typeof usageData.rate_limit_reset_credits === "object"
      ? usageData.rate_limit_reset_credits.available_count : null
    const nested = nestedRaw == null ? null : readNumber(nestedRaw)
    if (nested !== null && nested >= 0) {
      return { availableCount: Math.floor(nested), expiryIsos: [], resetCredits: resetCreditsPayload(Math.floor(nested), null, "unavailable") }
    }
    return null
  }

  function readPercent(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function readNumber(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function readMonthlyCreditLimit(data) {
    const individualLimit = data?.spend_control?.individual_limit
    if (!individualLimit || typeof individualLimit !== "object") return null

    const limit = readNumber(individualLimit.limit)
    const used = readNumber(individualLimit.used)
    if (limit === null || limit <= 0 || used === null || used < 0) return null

    return { limit: Math.round(limit), used: Math.round(used), window: individualLimit }
  }

  function readCreditsRemaining(resp, data) {
    const credits = data && data.credits && typeof data.credits === "object" ? data.credits : null
    if (credits) {
      const bodyBalance = readNumber(credits.balance)
      if (bodyBalance !== null) return bodyBalance
      if (credits.has_credits === false) return 0
    }

    return readNumber(resp.headers["x-codex-credits-balance"])
  }

  function formatCodexPlan(ctx, planType) {
    const rawPlan = typeof planType === "string" ? planType.trim() : ""
    if (!rawPlan) return null
    if (rawPlan.toLowerCase() === "prolite") return "Pro 5x"
    if (rawPlan.toLowerCase() === "pro") return "Pro 20x"
    return ctx.fmt.planLabel(rawPlan) || null
  }

  function getResetsAtIso(ctx, nowSec, window) {
    if (!window) return null
    const resetAt = readNumber(window.reset_at)
    if (resetAt !== null) {
      return ctx.util.toIso(resetAt)
    }
    if (typeof window.reset_at === "string" && window.reset_at.trim()) {
      return ctx.util.toIso(window.reset_at)
    }
    const resetAfter = readNumber(window.reset_after_seconds)
    if (resetAfter !== null && resetAfter >= 0) {
      return ctx.util.toIso(nowSec + resetAfter)
    }
    return null
  }

  // Period durations in milliseconds
  var PERIOD_SESSION_MS = 5 * 60 * 60 * 1000    // 5 hours
  var PERIOD_WEEKLY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

  function codexWindowSeconds(window) {
    if (!window || typeof window !== "object") return null
    const seconds = readNumber(window.limit_window_seconds)
    return seconds !== null && seconds > 0 ? seconds : null
  }

  function codexWindowMetric(window, fallbackLabel, fallbackDurationMs) {
    const seconds = codexWindowSeconds(window)
    let label = fallbackLabel
    if (seconds === 604800) label = "Weekly"
    else if (seconds === 18000) label = "Session"
    return {
      label: label,
      periodDurationMs: seconds === null ? fallbackDurationMs : seconds * 1000,
      seconds: seconds,
    }
  }

  function codexAdditionalWindowLabel(base, metric, fallbackSuffix) {
    if (metric.label === "Weekly") return base + " Weekly"
    if (metric.label === "Session") return base
    return base + (fallbackSuffix || "")
  }

  function ccusageDateString(date) {
    return dayKeyFromDate(date).replace(/-/g, "")
  }

  function queryCcusage(ctx, granularity, since, until, expectedField) {
    if (!ctx.host.ccusage || typeof ctx.host.ccusage.query !== "function") {
      return { status: "no_runner", data: null }
    }

    const queryOpts = {
      provider: "codex",
      granularity: granularity,
      since: ccusageDateString(since),
    }
    if (until) queryOpts.until = ccusageDateString(until)
    const codexHome = readCodexHome(ctx)
    if (codexHome) queryOpts.homePath = codexHome

    const result = ctx.host.ccusage.query(queryOpts)
    if (!result || typeof result !== "object" || typeof result.status !== "string") {
      return { status: "runner_failed", data: null }
    }
    if (result.status !== "ok") {
      return { status: result.status, data: null }
    }
    if (!result.data || !Array.isArray(result.data[expectedField])) {
      return { status: "runner_failed", data: null }
    }
    return { status: "ok", data: result.data }
  }

  function queryTokenUsage(ctx) {
    const now = new Date()
    const dailySince = new Date(now.getTime())
    dailySince.setDate(dailySince.getDate() - 365)
    const daily = queryCcusage(ctx, "daily", dailySince, null, "daily")
    const todayKey = dayKeyFromDate(now)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const hourly = queryCcusage(ctx, "hourly", todayStart, todayStart, "hourly")
    return { daily, hourly, todayKey }
  }

  function fmtTokens(n) {
    const abs = Math.abs(n)
    const sign = n < 0 ? "-" : ""
    const units = [
      { threshold: 1e9, divisor: 1e9, suffix: "B" },
      { threshold: 1e6, divisor: 1e6, suffix: "M" },
      { threshold: 1e3, divisor: 1e3, suffix: "K" },
    ]
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]
      if (abs >= unit.threshold) {
        const scaled = abs / unit.divisor
        const formatted = scaled >= 10
          ? Math.round(scaled).toString()
          : scaled.toFixed(1).replace(/\.0$/, "")
        return sign + formatted + unit.suffix
      }
    }
    return sign + Math.round(abs).toString()
  }

  function dayKeyFromDate(date) {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    return year + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day
  }

  function dayKeyFromUsageDate(rawDate) {
    if (typeof rawDate !== "string") return null
    const value = rawDate.trim()
    if (!value) return null

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) {
      return isoMatch[1] + "-" + isoMatch[2] + "-" + isoMatch[3]
    }

    const isoDatePrefixMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[Tt\s]|$)/)
    if (isoDatePrefixMatch) {
      return isoDatePrefixMatch[1] + "-" + isoDatePrefixMatch[2] + "-" + isoDatePrefixMatch[3]
    }

    const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/)
    if (compactMatch) {
      return compactMatch[1] + "-" + compactMatch[2] + "-" + compactMatch[3]
    }

    const ms = Date.parse(value)
    if (!Number.isFinite(ms)) return null
    return dayKeyFromDate(new Date(ms))
  }

  function usageCostUsd(day) {
    if (!day || typeof day !== "object") return null

    if (day.totalCost != null) {
      const totalCost = Number(day.totalCost)
      if (Number.isFinite(totalCost)) return totalCost
    }

    if (day.costUSD != null) {
      const costUSD = Number(day.costUSD)
      if (Number.isFinite(costUSD)) return costUSD
    }

    return null
  }

  function pricingLookup(ctx, model, usageAt) {
    if (!ctx.host.pricing || typeof ctx.host.pricing.lookup !== "function") return null
    try {
      const result = ctx.host.pricing.lookup(model, usageAt || null)
      if (!result || typeof result !== "object") return null
      const input = result.input == null ? null : Number(result.input)
      const output = result.output == null ? null : Number(result.output)
      const cacheRead = result.cacheRead == null ? null : Number(result.cacheRead)
      if (![input, output].every(Number.isFinite)) return null
      return {
        input: input,
        output: output,
        cacheRead: Number.isFinite(cacheRead) ? cacheRead : null,
        cacheWrite: result.cacheWrite == null ? null : Number(result.cacheWrite),
        estimationStatus: result.estimationStatus === "historical_rate"
          ? "historical_rate"
          : "current_rate",
        observedAt: typeof result.observedAt === "string" ? result.observedAt : null,
      }
    } catch (e) {
      ctx.host.log.warn("pricing lookup failed for " + model + ": " + String(e))
      return null
    }
  }

  function pricingModelEntries(models) {
    if (Array.isArray(models)) {
      return models.map(function (entry) {
        return {
          name: String(entry && (entry.name || entry.modelName || entry.model) || "").trim(),
          usage: entry && entry.usage ? entry.usage : entry,
        }
      }).filter(function (entry) { return !!entry.name })
    }
    if (!models || typeof models !== "object") return []
    return Object.keys(models).map(function (name) {
      return { name: name, usage: models[name] }
    })
  }

  function isIgnoredInternalPricingModel(model) {
    return String(model || "").trim().toLowerCase() === "codex-auto-review"
  }

  function estimateModelsCost(ctx, models, usageAt, inputIncludesCached) {
    const entries = pricingModelEntries(models)
    const costBreakdown = { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }
    const costLines = []
    let hasUsage = false
    let hasPricedUsage = false
    let hasUnpricedUsage = false
    let hasIgnoredUsage = false
    let estimationStatus = "historical_rate"
    let observedAt = null
    for (let i = 0; i < entries.length; i++) {
      const usage = entries[i].usage || {}
      const input = Math.max(0, Number(usage.inputTokens) || 0)
      const cached = Math.max(0, Number(usage.cachedInputTokens || usage.cacheReadTokens) || 0)
      const written = Math.max(0, Number(usage.cacheWriteInputTokens ?? usage.cacheCreationTokens) || 0)
      const output = Math.max(0, Number(usage.outputTokens) || 0)
      const total = Math.max(0, Number(usage.totalTokens) || 0)
      if (input === 0 && cached === 0 && output === 0 && total === 0) continue
      hasUsage = true
      const line = {
        model: entries[i].name,
        tokens: { input: Math.max(0, input - (inputIncludesCached ? cached : 0) - written), cacheRead: cached, cacheWrite: written, output: output },
        rates: { input: null, cacheRead: null, cacheWrite: null, output: null },
        fees: { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 },
        costUsd: null, estimationStatus: "unknown", observedAt: null, issues: [],
      }
      costLines.push(line)
      if (isIgnoredInternalPricingModel(entries[i].name)) {
        line.costUsd = 0
        line.estimationStatus = "current_rate"
        line.issues.push("excluded_internal_model")
        hasIgnoredUsage = true
        continue
      }
      const rates = pricingLookup(ctx, entries[i].name, usageAt)
      if (!rates) {
        line.issues.push("missing_price")
        hasUnpricedUsage = true
        continue
      }
      hasPricedUsage = true
      line.rates = { input: rates.input, cacheRead: rates.cacheRead, cacheWrite: Number.isFinite(rates.cacheWrite) ? rates.cacheWrite : null, output: rates.output }
      line.observedAt = rates.observedAt
      if (cached > 0 && !Number.isFinite(rates.cacheRead)) line.issues.push("missing_cache_read_price")
      if (written > 0 && !Number.isFinite(rates.cacheWrite)) line.issues.push("missing_cache_write_price")
      if (input > (inputIncludesCached ? cached : 0) && usage.cacheWriteInputTokensComplete === false) line.issues.push("incomplete_cache_write_usage")
      if (line.issues.length) hasUnpricedUsage = true
      line.estimationStatus = line.issues.length ? "partial_rate" : rates.estimationStatus
      line.fees.inputUsd = line.tokens.input * rates.input / 1000000
      line.fees.cacheReadUsd = cached * (Number.isFinite(rates.cacheRead) ? rates.cacheRead : 0) / 1000000
      line.fees.cacheWriteUsd = written * (Number.isFinite(rates.cacheWrite) ? rates.cacheWrite : 0) / 1000000
      line.fees.outputUsd = output * rates.output / 1000000
      line.costUsd = Object.values(line.fees).reduce(function (sum, value) { return sum + value }, 0)
      for (const key of Object.keys(costBreakdown)) costBreakdown[key] += line.fees[key]
      if (rates.estimationStatus === "current_rate") estimationStatus = "current_rate"
      observedAt = observedAt || rates.observedAt
    }
    if (!hasUsage) return { costUsd: null, costBreakdown: null, estimationStatus: "unknown", observedAt: null, costLines: costLines }
    if (!hasPricedUsage) {
      return hasIgnoredUsage && !hasUnpricedUsage
        ? { costUsd: 0, costBreakdown: costBreakdown, estimationStatus: "current_rate", observedAt: null, costLines: costLines }
        : { costUsd: null, costBreakdown: null, estimationStatus: "unknown", observedAt: null, costLines: costLines }
    }
    if (hasUnpricedUsage) estimationStatus = "partial_rate"
    return { costUsd: Object.values(costBreakdown).reduce(function (sum, value) { return sum + value }, 0), costBreakdown: costBreakdown, estimationStatus: estimationStatus, observedAt: observedAt, costLines: costLines }
  }

  function estimateDayCost(ctx, day) {
    if (!day || typeof day !== "object") {
      return { costUsd: 0, estimationStatus: "current_rate", observedAt: null }
    }
    if (!ctx.host.pricing || typeof ctx.host.pricing.lookup !== "function") {
      const legacy = usageCostUsd(day)
      return {
        costUsd: legacy,
        estimationStatus: legacy == null ? "unknown" : "current_rate",
        observedAt: null,
      }
    }
    const rawUsageAt = day.date || day.startAt || null
    const usageAt = dayKeyFromUsageDate(rawUsageAt) || rawUsageAt
    const models = day.models && typeof day.models === "object"
      ? day.models
      : day.modelBreakdowns
    return estimateModelsCost(ctx, models, usageAt, false)
  }

  function costAndTokensLabel(data, opts) {
    const includeZeroTokens = !!(opts && opts.includeZeroTokens)
    const parts = []
    if (data.costUSD != null) parts.push("$" + data.costUSD.toFixed(2))
    if (data.tokens > 0 || (includeZeroTokens && data.tokens === 0)) {
      parts.push(fmtTokens(data.tokens))
    }
    return parts.join(" · ")
  }

  function modelTokenCount(modelUsage) {
    if (!modelUsage || typeof modelUsage !== "object") return 0
    const total = Number(modelUsage.totalTokens)
    if (Number.isFinite(total) && total > 0) return total

    const fields = [
      "inputTokens",
      "cachedInputTokens",
      "cacheCreationTokens",
      "cacheReadTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ]
    let sum = 0
    for (let i = 0; i < fields.length; i++) {
      const n = Number(modelUsage[fields[i]])
      if (Number.isFinite(n) && n > 0) sum += n
    }
    return sum
  }

  function collectModelUsage(daily) {
    const totals = {}
    let totalTokens = 0
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i]
      const models = day && day.models
      if (models && typeof models === "object") {
        const names = Object.keys(models)
        for (let j = 0; j < names.length; j++) {
          const name = names[j]
          const tokens = modelTokenCount(models[name])
          if (tokens <= 0) continue
          totals[name] = (totals[name] || 0) + tokens
          totalTokens += tokens
        }
      }

      const breakdowns = day && day.modelBreakdowns
      if (Array.isArray(breakdowns)) {
        for (let j = 0; j < breakdowns.length; j++) {
          const breakdown = breakdowns[j]
          const name = String(
            (breakdown && (breakdown.modelName || breakdown.name || breakdown.model)) || ""
          ).trim()
          if (!name) continue
          const tokens = modelTokenCount(breakdown)
          if (tokens <= 0) continue
          totals[name] = (totals[name] || 0) + tokens
          totalTokens += tokens
        }
      }
    }

    if (totalTokens <= 0) return []
    return Object.keys(totals)
      .map((name) => ({ name, tokens: totals[name], percent: (totals[name] / totalTokens) * 100 }))
      .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
  }

  function percentLabel(value) {
    if (value > 0 && value < 0.1) return "<0.1%"
    const rounded = Math.round(value * 10) / 10
    return (rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded)) + "%"
  }

  function fmtModelCost(amount) {
    if (amount < 1000) return "$" + amount.toFixed(2)
    return "$" + Math.round(amount).toLocaleString("en-US")
  }

  function prettifyModelName(rawId) {
    if (typeof rawId !== "string" || !rawId.startsWith("gpt-")) return rawId
    const parts = rawId.slice("gpt-".length).split("-")
    const version = parts[0]
    if (!/^\d+(\.\d+)?$/.test(version)) return rawId
    const suffixWords = parts.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    return ["GPT-" + version].concat(suffixWords).join(" ")
  }

  function pushModelUsageLines(lines, ctx, daily, now) {
    const models = collectModelUsage(daily)
    const todayKey = dayKeyFromDate(now)
    const recentKeys = recentDayKeys(now, 7)
    const costTotals = collectModelCosts(ctx, daily, todayKey, recentKeys)
    for (let i = 0; i < models.length; i++) {
      const model = models[i]
      let value = percentLabel(model.percent)
      const segments = []
      if (costTotals.Today[model.name]) segments.push("Today " + fmtModelCost(costTotals.Today[model.name]))
      if (costTotals["7d"][model.name]) segments.push("7d " + fmtModelCost(costTotals["7d"][model.name]))
      if (costTotals["30d"][model.name]) segments.push("30d " + fmtModelCost(costTotals["30d"][model.name]))
      if (segments.length > 0) value += " · " + segments.join(" · ")
      lines.push(ctx.line.text({
        label: prettifyModelName(model.name),
        value: value,
      }))
    }
  }

  function recentDayKeys(now, count) {
    const keys = []
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getTime())
      d.setDate(d.getDate() - i)
      keys.push(dayKeyFromDate(d))
    }
    return keys
  }

  function addModelCost(totals, name, cost, inToday, in7d) {
    if (!Number.isFinite(cost) || cost <= 0) return
    totals["30d"][name] = (totals["30d"][name] || 0) + cost
    if (in7d) totals["7d"][name] = (totals["7d"][name] || 0) + cost
    if (inToday) totals.Today[name] = (totals.Today[name] || 0) + cost
  }

  // Per-model $ for Today/7d/30d. Use explicit breakdown costs when available;
  // otherwise split the Codex day total by that day's token share.
  function collectModelCosts(ctx, daily, todayKey, recentKeys) {
    const recentSet = new Set(recentKeys)
    const totals = { Today: {}, "7d": {}, "30d": {} }
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i]
      const dayKey = dayKeyFromUsageDate(day.date)
      const inToday = dayKey === todayKey
      const in7d = recentSet.has(dayKey)
      if (ctx.host.pricing && typeof ctx.host.pricing.lookup === "function") {
        const source = day && day.models && typeof day.models === "object"
          ? day.models
          : day && day.modelBreakdowns
        const entries = pricingModelEntries(source)
        for (let j = 0; j < entries.length; j++) {
          const estimate = estimateModelsCost(ctx, [entries[j]], dayKey || day.date, false)
          if (estimate.costUsd != null) {
            addModelCost(totals, entries[j].name, estimate.costUsd, inToday, in7d)
          }
        }
        continue
      }
      const breakdowns = day && day.modelBreakdowns
      let usedBreakdownCosts = false
      if (Array.isArray(breakdowns)) {
        for (let j = 0; j < breakdowns.length; j++) {
          const breakdown = breakdowns[j]
          const name = String(
            (breakdown && (breakdown.modelName || breakdown.name || breakdown.model)) || ""
          ).trim()
          if (!name) continue
          const cost = Number(breakdown && breakdown.cost)
          if (!Number.isFinite(cost) || cost <= 0) continue
          usedBreakdownCosts = true
          addModelCost(totals, name, cost, inToday, in7d)
        }
      }
      if (usedBreakdownCosts) continue

      const dayCost = usageCostUsd(day)
      if (dayCost == null || dayCost <= 0) continue
      const models = day && day.models
      if (!models || typeof models !== "object") continue
      const names = Object.keys(models)
      let dayTokens = 0
      const tokenByName = {}
      for (let j = 0; j < names.length; j++) {
        const name = names[j]
        const tokens = modelTokenCount(models[name])
        if (tokens <= 0) continue
        tokenByName[name] = tokens
        dayTokens += tokens
      }
      if (dayTokens <= 0) continue
      const modelNames = Object.keys(tokenByName)
      for (let j = 0; j < modelNames.length; j++) {
        const name = modelNames[j]
        addModelCost(totals, name, dayCost * (tokenByName[name] / dayTokens), inToday, in7d)
      }
    }
    return totals
  }

  function usageDayLabel(rawDate) {
    const key = dayKeyFromUsageDate(rawDate)
    if (!key) return String(rawDate || "").slice(0, 10) || "Usage"
    const month = Number(key.slice(5, 7))
    const day = Number(key.slice(8, 10))
    return month + "/" + day
  }

  function usageDayStartAt(rawDate) {
    const key = dayKeyFromUsageDate(rawDate)
    if (!key) return null
    const year = Number(key.slice(0, 4))
    const month = Number(key.slice(5, 7))
    const day = Number(key.slice(8, 10))
    const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0)
    if (!Number.isFinite(localMidnight.getTime())) return null
    const offsetMinutes = -localMidnight.getTimezoneOffset()
    const sign = offsetMinutes >= 0 ? "+" : "-"
    const absolute = Math.abs(offsetMinutes)
    const offsetHours = Math.floor(absolute / 60)
    const offsetRemainder = absolute % 60
    const pad = (value) => value < 10 ? "0" + value : String(value)
    return key + "T00:00:00" + sign + pad(offsetHours) + ":" + pad(offsetRemainder)
  }

  function collectDayModelUsage(ctx, day) {
    const totals = Object.create(null)
    const rawUsageAt = day && (day.date || day.startAt) || null
    const usageAt = dayKeyFromUsageDate(rawUsageAt) || rawUsageAt
    function addModel(rawName, usage) {
      const name = String(rawName || "").trim()
      if (!name) return
      const tokens = modelTokenCount(usage)
      if (tokens <= 0) return
      const prettyName = prettifyModelName(name)
      const estimate = estimateModelsCost(ctx, { [name]: usage }, usageAt, false)
      const total = totals[prettyName] || {
        tokens: 0, costUsd: 0, hasPricedUsage: false, hasUnpricedUsage: false,
        estimationStatus: "historical_rate",
      }
      total.tokens += tokens
      if (estimate.costUsd != null) {
        total.costUsd += estimate.costUsd
        total.hasPricedUsage = true
      } else {
        total.hasUnpricedUsage = true
      }
      if (estimate.estimationStatus === "partial_rate") total.hasUnpricedUsage = true
      if (estimate.estimationStatus === "current_rate") total.estimationStatus = "current_rate"
      totals[prettyName] = total
    }
    const models = day && day.models
    if (models && typeof models === "object" && !Array.isArray(models)) {
      const names = Object.keys(models)
      for (let i = 0; i < names.length; i++) {
        addModel(names[i], models[names[i]])
      }
    }

    // Some ccusage versions expose modelBreakdowns instead of the models map.
    // Prefer models when it supplied real usage so the same day is not counted
    // twice when a response happens to include both representations.
    if (Object.keys(totals).length === 0) {
      const breakdowns = day && day.modelBreakdowns
      if (Array.isArray(breakdowns)) {
        for (let i = 0; i < breakdowns.length; i++) {
          const breakdown = breakdowns[i]
          addModel(breakdown && (breakdown.modelName || breakdown.name || breakdown.model), breakdown)
        }
      }
    }

    return Object.keys(totals)
      .map((name) => ({
        name: name,
        tokens: totals[name].tokens,
        costUsd: totals[name].hasPricedUsage ? totals[name].costUsd : null,
        estimationStatus: !totals[name].hasPricedUsage ? "unknown"
          : totals[name].hasUnpricedUsage ? "partial_rate" : totals[name].estimationStatus,
      }))
      .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
  }

  function collectUsageChartPoints(ctx, daily) {
    const points = []
    for (let i = 0; i < daily.length; i++) {
      const day = daily[i]
      const tokens = Number(day && day.totalTokens)
      if (!Number.isFinite(tokens) || tokens < 0) continue
      const key = dayKeyFromUsageDate(day.date)
      if (!key) continue
      const estimate = estimateDayCost(ctx, day)
      points.push({
        key: key,
        label: usageDayLabel(day.date),
        value: tokens,
        valueLabel: fmtTokens(tokens),
        startAt: usageDayStartAt(day.date),
        modelUsage: collectDayModelUsage(ctx, day),
        costUsd: estimate.costUsd,
        estimationStatus: estimate.estimationStatus,
      })
    }
    return points
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-366)
      .map((point) => ({
        label: point.label,
        value: point.value,
        valueLabel: point.valueLabel,
        startAt: point.startAt,
        modelUsage: point.modelUsage,
        costUsd: point.costUsd,
        estimationStatus: point.estimationStatus,
      }))
  }

  function pushUsageChartLine(lines, ctx, daily) {
    const points = collectUsageChartPoints(ctx, daily)
    if (points.length === 0) return
    lines.push(ctx.line.barChart({
      label: "Usage Trend",
      granularity: "daily",
      points: points,
      note: "Estimated from local Codex logs for the selected account.",
      color: "#74AA9C",
    }))
  }

  function usageHourLabel(startAt) {
    if (typeof startAt !== "string") return "Hour"
    const match = startAt.match(/[Tt](\d{2}):\d{2}/)
    if (!match) return startAt.slice(0, 5) || "Hour"
    return Number(match[1]) + ":00"
  }

  function collectUsageHourlyPoints(ctx, hourly, now) {
    const points = []
    const todayKey = dayKeyFromDate(now)
    for (let i = 0; i < hourly.length; i++) {
      const hour = hourly[i]
      const startAt = typeof hour.startAt === "string" ? hour.startAt.trim() : ""
      if (!startAt) continue
      const hourDayKey = dayKeyFromUsageDate(startAt)
      if (hourDayKey && hourDayKey !== todayKey) continue
      const tokens = Number(hour && hour.totalTokens)
      if (!Number.isFinite(tokens) || tokens < 0) continue
      const estimate = estimateDayCost(ctx, hour)
      points.push({
        key: startAt,
        label: usageHourLabel(startAt),
        value: tokens,
        valueLabel: fmtTokens(tokens),
        startAt: startAt,
        modelUsage: collectDayModelUsage(ctx, hour),
        costUsd: estimate.costUsd,
        estimationStatus: estimate.estimationStatus,
      })
    }
    return points
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((point) => ({
        label: point.label,
        value: point.value,
        valueLabel: point.valueLabel,
        startAt: point.startAt,
        modelUsage: point.modelUsage,
        costUsd: point.costUsd,
        estimationStatus: point.estimationStatus,
      }))
  }

  function pushUsageHourlyChartLine(lines, ctx, hourly, now) {
    const points = collectUsageHourlyPoints(ctx, hourly, now)
    // Keep the empty series: it is a successful Today query with no activity,
    // which is distinct from a host that does not support the hourly contract.
    lines.push(ctx.line.barChart({
      label: "Today Activity",
      granularity: "hourly",
      points: points,
      note: "Recorded by local Codex usage events; the current hour may be incomplete.",
      color: "#F25F3A",
    }))
  }

  // ONE_MORE_PROMPT_TURN_USAGE_PATCH_BEGIN
  // Local-only prompt/turn attribution from Codex JSONL session logs.
  // This deliberately stays inside the existing Codex plugin so no external
  // parser, daemon, database, or OAuth flow is introduced.
  var TURN_USAGE_MAX_MODELS_PER_TURN = 4
  var TURN_USAGE_CACHE_VERSION = 26
  var TURN_USAGE_DUPLICATE_PROMPT_WINDOW_MS = 1000
  var TURN_USAGE_ACTIVE_STALE_MS = 6 * 60 * 60 * 1000

  function turnUsagePad2(value) {
    return value < 10 ? "0" + value : String(value)
  }

  function turnUsageSafeListDir(ctx, path) {
    try {
      const entries = ctx.host.fs.listDir(path)
      if (!Array.isArray(entries)) throw new Error("Invalid directory listing")
      return entries
    } catch (e) {
      throw new Error("Unable to list Codex session history (" + path + "): " + String(e))
    }
  }

  function turnUsageCollectFiles(ctx, dir, depth, out, seen) {
    if (depth < 0) return
    const names = turnUsageSafeListDir(ctx, dir).slice().sort().reverse()
    for (let i = 0; i < names.length; i++) {
      const name = names[i]
      const path = joinPath(dir, name)
      if (/\.jsonl(?:\.zst)?$/i.test(name)) {
        if (!seen.has(path)) {
          seen.add(path)
          out.push(path)
        }
        continue
      }
      if (depth > 0 && name !== "." && name !== "..") {
        turnUsageCollectFiles(ctx, path, depth - 1, out, seen)
      }
    }
  }

  function turnUsageCollectAllFiles(ctx) {
    const codexHome = readCodexHome(ctx) || "~/.codex"
    const sessionsRoot = joinPath(codexHome, "sessions")
    const files = []
    const seen = new Set()
    turnUsageCollectFiles(ctx, sessionsRoot, 4, files, seen)
    return files.sort(function (a, b) { return b.localeCompare(a) })
  }

  function turnUsageNumber(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return null
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  function turnUsageNormalizeUsage(value) {
    if (!value || typeof value !== "object") return null
    const input = turnUsageNumber(value.input_tokens) || 0
    const cachedRaw =
      turnUsageNumber(value.cached_input_tokens) ??
      turnUsageNumber(value.cache_read_input_tokens) ??
      0
    const cached = Math.min(input, cachedRaw)
    const output = turnUsageNumber(value.output_tokens) || 0
    const reasoning = turnUsageNumber(value.reasoning_output_tokens) || 0
    const reportedTotal = turnUsageNumber(value.total_tokens)
    const total = reportedTotal == null ? input + output : reportedTotal
    if (input === 0 && cached === 0 && output === 0 && reasoning === 0 && total === 0) {
      return null
    }
    return {
      inputTokens: input,
      cachedInputTokens: cached,
      cacheWriteInputTokensComplete: turnUsageNumber(value.cache_write_input_tokens) != null,
      ...(turnUsageNumber(value.cache_write_input_tokens) != null ? { cacheWriteInputTokens: Math.min(input - cached, turnUsageNumber(value.cache_write_input_tokens)) } : {}),
      outputTokens: output,
      reasoningOutputTokens: reasoning,
      totalTokens: total,
    }
  }

  function turnUsageSubtract(current, previous) {
    // A decreased cumulative counter starts a new accounting segment.
    if (previous && current.totalTokens < previous.totalTokens) return current
    const prev = previous || {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    }
    const input = Math.max(0, current.inputTokens - prev.inputTokens)
    const cached = Math.min(input, Math.max(0, current.cachedInputTokens - prev.cachedInputTokens))
    return {
      cacheWriteInputTokensComplete: current.cacheWriteInputTokensComplete && (!previous || prev.cacheWriteInputTokensComplete),
      ...(current.cacheWriteInputTokens != null ? { cacheWriteInputTokens: Math.min(input - cached, Math.max(0, current.cacheWriteInputTokens - (prev.cacheWriteInputTokens || 0))) } : {}),
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: Math.max(0, current.outputTokens - prev.outputTokens),
      reasoningOutputTokens: Math.max(0, current.reasoningOutputTokens - prev.reasoningOutputTokens),
      totalTokens: Math.max(0, current.totalTokens - prev.totalTokens),
    }
  }

  function turnUsageIsZero(usage) {
    return !usage || (
      usage.inputTokens === 0 &&
      usage.cachedInputTokens === 0 &&
      usage.outputTokens === 0 &&
      usage.reasoningOutputTokens === 0 &&
      usage.totalTokens === 0
    )
  }

  function turnUsageReadString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
  }

  function turnUsageReadEffort(value) {
    if (!value || typeof value !== "object") return null
    const effort = turnUsageReadString(value.effort) || turnUsageReadString(value.reasoning_effort) || (value.reasoning && turnUsageReadString(value.reasoning.effort))
    return ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].indexOf(effort) !== -1 ? effort : null
  }

  function turnUsageReadModel(value) {
    if (!value || typeof value !== "object") return null
    return (
      turnUsageReadString(value.model) ||
      turnUsageReadString(value.model_name) ||
      (value.metadata && turnUsageReadString(value.metadata.model)) ||
      null
    )
  }

  function turnUsageFindTaskActions(value) {
    const source = String(value || "")
    const outgoing = []
    let hasIgnored = false
    const pattern = /\btools\.codex_app__(create_thread|send_message_to_thread|handoff_thread|list_threads|read_thread|wait_threads)\s*\(/g
    let match
    while ((match = pattern.exec(source))) {
      const prefix = source.slice(Math.max(0, match.index - 80), match.index)
      if (!/\bawait\s+$/.test(prefix)) continue
      if (match[1] === "list_threads" || match[1] === "read_thread" || match[1] === "wait_threads") {
        hasIgnored = true
      } else {
        outgoing.push(match[1])
      }
    }
    return { outgoing: outgoing, hasIgnored: hasIgnored }
  }

  function turnUsageFindTaskIds(value) {
    const text = turnUsageExtractText(value)
    const ids = []
    const pattern = /["']threadId["']\s*:\s*["']([^"']+)["']/g
    let match
    while ((match = pattern.exec(text))) {
      const id = turnUsageReadString(match[1])
      if (id && ids.indexOf(id) === -1) ids.push(id)
    }
    return ids
  }

  function turnUsageExtractText(value) {
    if (typeof value === "string") return value
    if (Array.isArray(value)) {
      const parts = []
      for (let i = 0; i < value.length; i++) {
        const part = turnUsageExtractText(value[i])
        if (part) parts.push(part)
      }
      return parts.join("\n")
    }
    if (!value || typeof value !== "object") return ""
    if (typeof value.text === "string") return value.text
    if (typeof value.content === "string") return value.content
    if (Array.isArray(value.content)) return turnUsageExtractText(value.content)
    return ""
  }

  function turnUsageParseDelegation(value) {
    const decoded = turnUsageDecodeHtmlEntities(turnUsageExtractText(value).trim())
    if (!/^<codex_delegation(?:\s[^>]*)?>[\s\S]*<\/codex_delegation>$/i.test(decoded)) return null
    const input = decoded.match(/<input(?:\s[^>]*)?>([\s\S]*?)<\/input>/i)
    if (!input) return null
    const source = decoded.match(/<source_thread_id(?:\s[^>]*)?>([\s\S]*?)<\/source_thread_id>/i)
    const sourceThreadId = source ? turnUsageReadString(turnUsageDecodeHtmlEntities(source[1])) : null
    return {
      input: turnUsageDecodeHtmlEntities(input[1]),
      sourceThreadId: sourceThreadId,
    }
  }

  function turnUsageFindDelegation(value) {
    const direct = turnUsageParseDelegation(value)
    if (direct) return direct
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const nested = turnUsageFindDelegation(value[i])
        if (nested) return nested
      }
    } else if (value && typeof value === "object") {
      if (value.content) return turnUsageFindDelegation(value.content)
      if (value.message) return turnUsageFindDelegation(value.message)
    }
    return null
  }

  function turnUsageHasDelegationMarker(value) {
    return /<\/?codex_delegation(?:\s|>)/i.test(turnUsageDecodeHtmlEntities(turnUsageExtractText(value)))
  }

  function turnUsageIsRoutingOnlyDelegationInput(value) {
    return /^Use\s+\$[A-Za-z0-9._-]+\s*\.?\s+Role:\s*[^\r\n]+?\s+Handoff:\s*(?:\/Users\/|~\/)[\s\S]*?\/\.codex\/handoffs\/[\s\S]*?\/state\.md\s+Target:\s*[A-Z][A-Z0-9_]*\s*$/i.test(
      String(value || "").trim(),
    )
  }

  // Codex prefixes image/file prompts with a transport-only envelope. Keep
  // this deliberately strict: a leading file heading is only removed when
  // the intervening lines are attachment paths and the request heading is
  // present. User-authored text that merely resembles the envelope remains
  // visible in the prompt list.
  var TURN_USAGE_FILE_HEADING_RE = /^#\s*File(?:s|\(s\))?\s+mentioned\s+by\s+the\s+user:\s*$/i
  var TURN_USAGE_FILE_HEADING_PREFIX_RE = /^#\s*File(?:s|\(s\))?\s+mentioned\s+by\s+the\s+user:\s*/i
  var TURN_USAGE_REQUEST_HEADING_RE = /^##\s*My request(?: for Codex)?\s*[:：]\s*$/i
  var TURN_USAGE_REQUEST_PREFIX_RE = /^##\s*My request(?: for Codex)?\s*[:：]\s*/i

  function turnUsageIsAttachmentPathLine(value) {
    const line = String(value || "").trim()
    const match = line.match(/^##\s+[^\r\n:]+:\s*(\S.*)$/)
    if (!match) return false
    const path = match[1].trim()
    return /^(?:[/~]|[A-Za-z]:[\\/]|\\\\|file:\/\/|https?:\/\/)/.test(path)
  }

  function turnUsageExtractWrappedPrompt(source) {
    const lines = String(source || "").split(/\r?\n/)
    if (lines.length === 0 || !TURN_USAGE_FILE_HEADING_RE.test(lines[0].trim())) return null

    let requestIndex = -1
    for (let i = 1; i < lines.length; i++) {
      if (TURN_USAGE_REQUEST_HEADING_RE.test(lines[i].trim())) {
        requestIndex = i
        break
      }
    }
    if (requestIndex < 0) return null

    for (let i = 1; i < requestIndex; i++) {
      if (lines[i].trim() && !turnUsageIsAttachmentPathLine(lines[i])) return null
    }
    return lines.slice(requestIndex + 1).join("\n").trim()
  }

  function turnUsageExtractFlattenedWrappedPrompt(source) {
    const heading = String(source || "").match(TURN_USAGE_FILE_HEADING_PREFIX_RE)
    if (!heading) return null

    const remainder = String(source || "").slice(heading[0].length)
    const marker = remainder.match(/##\s*My request(?: for Codex)?\s*[:：]\s*/i)
    if (!marker) return null
    return remainder.slice(marker.index + marker[0].length).trim()
  }

  function turnUsageAttachmentPrompt(source) {
    if (!TURN_USAGE_FILE_HEADING_PREFIX_RE.test(source)) return null
    const header = source.split(/##\s*My request(?: for Codex)?\s*[:：]/i)[0]
    const references = []
    const lines = header.split(/\r?\n/)
    for (let i = 1; i < lines.length; i++) {
      const attachment = lines[i].match(/^##\s+(.+?):\s*((?:[/~]|[A-Za-z]:[\\/]|file:\/\/|https?:\/\/).+)$/)
      if (!attachment) continue
      const label = attachment[1].replace(/[\[\]\\]/g, "\\$&")
      const path = attachment[2].trim().replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
      references.push("[" + label + "](" + path + ")")
    }
    return references.join("\n") || null
  }

  function turnUsageStripTrailingImageDescriptors(value) {
    const imageDescriptor =
      /<image\b(?=[^>\r\n]*\bname\s*=\s*(?:\[[^\]\r\n]+\]|["'][^"'\r\n]+["']))(?=[^>\r\n]*\bpath\s*=\s*["'][^"'\r\n]+["'])[^>]*>(?:\s*<\/image>)?/i
    const trailingDescriptors = new RegExp("(?:\\s*" + imageDescriptor.source + ")+\\s*$", "i")
    return String(value || "").replace(trailingDescriptors, "").trim()
  }

  function turnUsageStripUiOnlyReferences(value) {
    // Session titles remain plain summaries; full prompts keep their references.
    return String(value || "")
      .replace(/\[@[^\]\r\n]+\]\s*\(\s*plugin:\/\/[^)\r\n]*\)/gi, "")
      .replace(/\[\$[^\]\r\n]+\]\s*\(\s*(?:file:\/\/)?\/Users\/[^)\r\n]*\/\.codex\/skills\/[^)\r\n]*\/SKILL\.md\s*\)/gi, "")
      .replace(/\[\$[^\]\r\n]+\]\s*\(\s*plugin:\/\/[^)\r\n]*\)/gi, "")
      .replace(/\[\$[^\]\r\n]+\]/g, "")
      .replace(/\[@[^\]\r\n]+\]/g, "")
      .replace(/\(\s*\/Users\/[^()\r\n]+\s*\)/g, "")
      .replace(/（\s*\/Users\/[^（）\r\n]+\s*）/g, "")
  }

  function turnUsageStripLeadingUiContext(value) {
    let text = String(value || "").trim()
    // These complete leading envelopes are supplied by Codex. Never strip
    // arbitrary XML or a matching example inside the user's prose/code.
    const browserContext = /^<in-app-browser-context\s+source=["']ambient-ui-state["']\s*>[\s\S]*?<\/in-app-browser-context>\s*/i
    const pageContext = /^<external_codex_apps_open_page>\s*\{\s*"page_id"\s*:\s*(?:null|"[^"\r\n]*")\s*\}\s*<\/external_codex_apps_open_page>\s*/i
    let previous
    do {
      previous = text
      text = text.replace(browserContext, "").replace(pageContext, "").trim()
    } while (text !== previous)
    return text
  }

  function turnUsageNormalizePrompt(value) {
    const rawSource = turnUsageExtractText(value).trim()
    const delegation = turnUsageFindDelegation(value)
    if (turnUsageHasDelegationMarker(rawSource) && !delegation) return "Delegated Task"
    if (delegation && turnUsageIsRoutingOnlyDelegationInput(delegation.input)) return "Delegated Task"
    const source = turnUsageStripLeadingUiContext(delegation ? delegation.input : rawSource)
    if (!source) return null
    if (TURN_USAGE_CONTEXT_ENVELOPE_RE.test(source) || TURN_USAGE_AGENTS_CONTEXT_RE.test(source)) return null

    const wrappedPrompt =
      turnUsageExtractWrappedPrompt(source) ??
      turnUsageExtractFlattenedWrappedPrompt(source)
    const hasLeadingRequestHeading = TURN_USAGE_REQUEST_PREFIX_RE.test(source)
    let text = wrappedPrompt === null ? source : wrappedPrompt
    if (!text) return wrappedPrompt !== null ? turnUsageAttachmentPrompt(source) : null

    // Only a recognized request envelope authorizes removing synthetic image
    // descriptors. Without that marker the original prompt is preserved.
    if (wrappedPrompt !== null || hasLeadingRequestHeading) {
      text = text.replace(TURN_USAGE_REQUEST_PREFIX_RE, "")
      text = turnUsageStripTrailingImageDescriptors(text)
    }
    // Keep full authored text, line breaks and reference labels. The view
    // renders references; flattening/truncating here loses the original prompt.
    text = text.replace(/(?:&#x20;|&nbsp;)/gi, " ").replace(/\r\n?/g, "\n").trim()
    return text || null
  }

  var TURN_USAGE_CONTEXT_ENVELOPE_RE = /^<(?:recommended_plugins|environment_context|app-context|skills_instructions|permissions instructions|collaboration_mode|apps_instructions|plugins_instructions|image_resize_notice|external_codex_apps_writing_block_edits|skill)>[\s\S]*<\/(?:recommended_plugins|environment_context|app-context|skills_instructions|permissions instructions|collaboration_mode|apps_instructions|plugins_instructions|image_resize_notice|external_codex_apps_writing_block_edits|skill)>$/i
  var TURN_USAGE_AGENTS_CONTEXT_RE = /^#\s*AGENTS\.md instructions for\s+[^\r\n]+\s*<INSTRUCTIONS>[\s\S]*<\/INSTRUCTIONS>\s*$/i

  function turnUsageNormalizeResponsePrompt(content) {
    if (!Array.isArray(content)) return turnUsageNormalizePrompt(content)
    const userParts = []
    for (let i = 0; i < content.length; i++) {
      const text = turnUsageExtractText(content[i]).trim()
      if (!text || TURN_USAGE_CONTEXT_ENVELOPE_RE.test(text) || TURN_USAGE_AGENTS_CONTEXT_RE.test(text)) continue
      userParts.push(text)
    }
    return turnUsageNormalizePrompt(userParts)
  }

  function turnUsageEmptyUsage() {
    return {
      cacheWriteInputTokensComplete: true,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    }
  }

  function turnUsageAddUsage(target, usage) {
    target.cacheWriteInputTokensComplete = target.cacheWriteInputTokensComplete !== false && usage.cacheWriteInputTokensComplete === true
    if (usage.cacheWriteInputTokens != null) target.cacheWriteInputTokens = (target.cacheWriteInputTokens || 0) + usage.cacheWriteInputTokens
    if (usage.reasoningEfforts) target.reasoningEfforts = Array.from(new Set([].concat(target.reasoningEfforts || [], usage.reasoningEfforts)))
    target.inputTokens += usage.inputTokens
    target.cachedInputTokens += usage.cachedInputTokens
    target.outputTokens += usage.outputTokens
    target.reasoningOutputTokens += usage.reasoningOutputTokens
    target.totalTokens += usage.totalTokens
  }

  function turnUsageMergeTurns(target, source, turns, byId, pendingTaskActions) {
    if (!target || !source || target === source) return target
    target.prompt = target.prompt || source.prompt
    target.sourceThreadId = target.sourceThreadId || source.sourceThreadId
    target.isDelegated = target.isDelegated || source.isDelegated
    target.outgoingTaskIds = Array.from(new Set([].concat(target.outgoingTaskIds || [], source.outgoingTaskIds || [])))
    target.cwd = target.cwd || source.cwd
    if (!target.startedAt || turnUsageTimestampMs(source.startedAt) < turnUsageTimestampMs(target.startedAt)) {
      target.startedAt = source.startedAt
    }
    if (turnUsageTimestampMs(source.lastAt) > turnUsageTimestampMs(target.lastAt)) {
      target.lastAt = source.lastAt
    }
    if (turnUsageTimestampMs(source.completedAt) > turnUsageTimestampMs(target.completedAt)) {
      target.completedAt = source.completedAt
    }
    if (source.models && typeof source.models.entries === "function") {
      for (const entry of source.models.entries()) {
        let modelUsage = target.models.get(entry[0])
        if (!modelUsage) {
          modelUsage = turnUsageEmptyUsage()
          target.models.set(entry[0], modelUsage)
        }
        turnUsageAddUsage(modelUsage, entry[1])
      }
    }
    target.reasoningEfforts = Array.from(new Set([].concat(target.reasoningEfforts || [], source.reasoningEfforts || [])))
    target.usageRecords = target.usageRecords.concat(source.usageRecords)
    target.model = target.model || source.model
    turnUsageAddUsage(target.usage, source.usage)
    target.hasUsage = target.hasUsage || source.hasUsage
    target.tokenUsageRecorded = target.tokenUsageRecorded || source.tokenUsageRecorded
    target.subagentSessionIds = Array.from(new Set([].concat(target.subagentSessionIds || [], source.subagentSessionIds || [])))
    if (pendingTaskActions && typeof pendingTaskActions.values === "function") {
      for (const pending of pendingTaskActions.values()) {
        if (pending.turn === source) pending.turn = target
      }
    }
    const sourceIndex = turns.indexOf(source)
    if (sourceIndex >= 0) turns.splice(sourceIndex, 1)
    if (byId.get(source.id) === source) byId.delete(source.id)
    return target
  }

  function turnUsageTimestampMs(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const numericMs = Math.abs(value) < 1e11 ? value * 1000 : value
      return Number.isFinite(numericMs) ? numericMs : 0
    }
    const raw = String(value || "")
    const numeric = Number(raw)
    if (raw && Number.isFinite(numeric)) {
      const numericMs = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric
      return Number.isFinite(numericMs) ? numericMs : 0
    }
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : 0
  }

  function turnUsageEventTime(value, fallback) {
    if (value == null || value === "") return fallback || null
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      const ms = Math.abs(numeric) < 1e11 ? numeric * 1000 : numeric
      try { return new Date(ms).toISOString() } catch (e) { return fallback || null }
    }
    return turnUsageReadString(value) || fallback || null
  }

  function turnUsageParseSessionText(text, sessionPath) {
    // Compression changes the physical source, never a legacy prompt's identity.
    sessionPath = sessionPath.replace(/\.zst$/i, "")
    const turns = []
    const byId = new Map()
    const dedupe = new Set()
    const requestIds = new Set()
    let pendingRequestPartner = null
    const linkedSubagentSessionIds = new Set()
    let provisionalCounter = 0
    let activeTurn = null
    let abortedTurn = null
    let pendingResumeTurn = null
    let recentPromptEvent = null
    let currentModel = null
    let currentEffort = null
    let previousTotals = null
    let sessionCwd = null
    let sessionId = sessionPath
    let parentSessionId = null
    let threadSource = null
    let agentName = null
    let agentRole = null
    let sessionStartedAt = null
    let sessionMetadataSeen = false
    let sessionIsActive = false
    let sessionActivityAt = null
    const pendingTaskActions = new Map()

    function createTurn(id, timestamp, provisional) {
      const turn = {
        id: id,
        provisional: !!provisional,
        prompt: null,
        sourceThreadId: null,
        isDelegated: false,
        outgoingTaskIds: [],
        cwd: sessionCwd,
        startedAt: timestamp || null,
        lastAt: timestamp || null,
        completedAt: null,
        model: null,
        reasoningEfforts: [],
        models: new Map(),
        usage: turnUsageEmptyUsage(),
        usageRecords: [],
        hasUsage: false,
        interrupted: false,
        tokenUsageRecorded: false,
        subagentSessionIds: [],
      }
      turns.push(turn)
      byId.set(id, turn)
      return turn
    }

    function provisionalTurn(timestamp) {
      provisionalCounter += 1
      return createTurn(sessionPath + "#pending-" + provisionalCounter, timestamp, true)
    }

    function adoptTurnId(turn, nextId) {
      if (!turn || !nextId || turn.id === nextId) return turn
      const existing = byId.get(nextId)
      if (existing && existing !== turn) {
        if (!existing.prompt && turn.prompt) existing.prompt = turn.prompt
        if (!existing.cwd && turn.cwd) existing.cwd = turn.cwd
        return existing
      }
      byId.delete(turn.id)
      turn.id = nextId
      turn.provisional = false
      byId.set(nextId, turn)
      return turn
    }

    function ensureActive(timestamp) {
      if (!activeTurn) activeTurn = provisionalTurn(timestamp)
      return activeTurn
    }

    function eventTurnId(payload) {
      if (!payload || typeof payload !== "object") return null
      return (
        turnUsageReadString(payload.turn_id) ||
        turnUsageReadString(payload.turnId) ||
        turnUsageReadString(payload.task_id) ||
        turnUsageReadString(payload.taskId) ||
        turnUsageReadString(payload.id) ||
        null
      )
    }

    function selectEventTurn(payload, timestamp) {
      const turnId = eventTurnId(payload)
      if (turnId) {
        const existing = byId.get(turnId)
        if (existing) {
          activeTurn = existing
          if (abortedTurn === activeTurn) {
            abortedTurn = null
            pendingResumeTurn = null
          }
          return existing
        }
        if (abortedTurn && activeTurn === abortedTurn) {
          const resumedTurn = createTurn(turnId, timestamp, false)
          pendingResumeTurn = { source: abortedTurn, target: resumedTurn }
          activeTurn = resumedTurn
          return activeTurn
        }
        if (activeTurn && activeTurn.provisional && !activeTurn.hasUsage) {
          activeTurn = adoptTurnId(activeTurn, turnId)
          return activeTurn
        }
        activeTurn = createTurn(turnId, timestamp, false)
        return activeTurn
      }
      const turn = ensureActive(timestamp)
      if (abortedTurn === turn) {
        abortedTurn = null
        pendingResumeTurn = null
      }
      return turn
    }

    const source = String(text || "")
    let cursor = 0
    let lineIndex = 0
    while (cursor <= source.length) {
      const newline = source.indexOf("\n", cursor)
      const end = newline === -1 ? source.length : newline
      let rawLine = source.slice(cursor, end)
      if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1)
      cursor = newline === -1 ? source.length + 1 : newline + 1
      lineIndex += 1
      if (!rawLine) continue
      // Avoid JSON.parse for the overwhelmingly common non-relevant lines.
      const isResponseUserMessage =
        rawLine.indexOf('"type":"response_item"') !== -1 &&
        rawLine.indexOf('"role":"user"') !== -1
      if (
        !isResponseUserMessage &&
        rawLine.indexOf("user_message") === -1 &&
        rawLine.indexOf("sub_agent_activity") === -1 &&
        rawLine.indexOf("turn_context") === -1 &&
        rawLine.indexOf("token_count") === -1 &&
        rawLine.indexOf("token_usage_record") === -1 &&
        rawLine.indexOf("task_started") === -1 &&
        rawLine.indexOf("task_complete") === -1 &&
        rawLine.indexOf("turn_aborted") === -1 &&
        rawLine.indexOf("session_meta") === -1 &&
        rawLine.indexOf("custom_tool_call") === -1
      ) {
        continue
      }

      let entry
      try {
        entry = JSON.parse(rawLine)
      } catch (e) {
        continue
      }
      if (!entry || typeof entry !== "object") continue

      const timestamp = turnUsageReadString(entry.timestamp)
      const payload = entry.payload && typeof entry.payload === "object" ? entry.payload : null
      const isRequestRecord = entry.type === "token_usage_record" && !!payload
      const isLegacyTokenCount = entry.type === "event_msg" && payload && payload.type === "token_count"
      const isTurnBoundary = entry.type === "session_meta" || entry.type === "turn_context" ||
        (entry.type === "response_item" && payload && payload.type === "message" && payload.role === "user") ||
        (entry.type === "event_msg" && payload && ["task_started", "task_complete", "turn_aborted", "user_message"].indexOf(payload.type) !== -1)
      if (isTurnBoundary) pendingRequestPartner = null
      if (sessionIsActive && timestamp) sessionActivityAt = timestamp

      if (entry.type === "session_meta") {
        if (payload) {
          const metadataId = turnUsageReadString(payload.id)
          if (!sessionMetadataSeen || metadataId === sessionId) {
            if (!sessionMetadataSeen) {
              sessionId = metadataId || sessionId
              sessionStartedAt = timestamp || sessionStartedAt
              sessionMetadataSeen = true
            }
            sessionCwd = turnUsageReadString(payload.cwd) || sessionCwd
            parentSessionId = turnUsageReadString(payload.parent_thread_id) || parentSessionId
            threadSource = turnUsageReadString(payload.thread_source) || threadSource
            const spawn =
              payload.source && payload.source.subagent && payload.source.subagent.thread_spawn
                ? payload.source.subagent.thread_spawn
                : null
            if (spawn) {
              parentSessionId = turnUsageReadString(spawn.parent_thread_id) || parentSessionId
              agentName = turnUsageReadString(spawn.agent_nickname) || turnUsageReadString(spawn.agent_path) || agentName
              agentRole = turnUsageReadString(spawn.agent_role) || agentRole
            }
            if (activeTurn && !activeTurn.cwd) activeTurn.cwd = sessionCwd
          }
        }
        continue
      }

      if (entry.type === "event_msg" && payload && payload.type === "sub_agent_activity") {
        if (payload.kind !== "started") continue
        const childSessionId = turnUsageReadString(payload.agent_thread_id)
        if (!childSessionId || linkedSubagentSessionIds.has(childSessionId)) continue
        const turn = ensureActive(timestamp)
        if (turn.subagentSessionIds.indexOf(childSessionId) === -1) {
          turn.subagentSessionIds.push(childSessionId)
        }
        linkedSubagentSessionIds.add(childSessionId)
        turn.lastAt = timestamp || turn.lastAt
        continue
      }

      if (entry.type === "response_item" && payload && payload.type === "custom_tool_call") {
        const actions = turnUsageFindTaskActions(payload.input)
        const callId = turnUsageReadString(payload.call_id)
        if (actions.outgoing.length > 0 && callId) {
          pendingTaskActions.set(callId, {
            turn: ensureActive(timestamp),
            outgoingCount: actions.outgoing.length,
            hasIgnored: actions.hasIgnored,
          })
        }
        continue
      }

      if (entry.type === "response_item" && payload && payload.type === "custom_tool_call_output") {
        const callId = turnUsageReadString(payload.call_id)
        const pending = callId ? pendingTaskActions.get(callId) : null
        if (pending) {
          const ids = turnUsageFindTaskIds(payload.output).filter(function (id) { return id !== sessionId })
          if (!pending.hasIgnored && ids.length <= pending.outgoingCount) {
            for (let i = 0; i < ids.length; i++) {
              if (pending.turn.outgoingTaskIds.indexOf(ids[i]) === -1) {
                pending.turn.outgoingTaskIds.push(ids[i])
              }
            }
          }
          pendingTaskActions.delete(callId)
        }
        continue
      }

      if ((entry.type === "event_msg" && payload && payload.type === "task_started") || entry.type === "task_started") {
        const turn = selectEventTurn(payload, timestamp)
        turn.interrupted = false
        // A durable task start establishes a new model-context boundary. Existing
        // turns retain their known model; brand-new turns wait for turn_context.
        currentModel = turn.model || null
        currentEffort = null
        turn.startedAt = turn.startedAt || turnUsageEventTime(payload.started_at || payload.startedAt, timestamp)
        turn.lastAt = timestamp || turn.lastAt
        sessionIsActive = true
        sessionActivityAt = timestamp || sessionActivityAt
        continue
      }

      if ((entry.type === "event_msg" && payload && payload.type === "task_complete") || entry.type === "task_complete") {
        const turn = selectEventTurn(payload, timestamp)
        const completedAt = turnUsageEventTime(
          payload.completed_at != null ? payload.completed_at : payload.completedAt,
          timestamp
        )
        turn.interrupted = false
        turn.completedAt = completedAt || turn.completedAt
        turn.lastAt = completedAt || turn.lastAt
        sessionIsActive = false
        currentModel = null
        currentEffort = null
        sessionActivityAt = completedAt || timestamp || sessionActivityAt
        continue
      }

      if ((entry.type === "event_msg" && payload && payload.type === "turn_aborted") || entry.type === "turn_aborted") {
        sessionIsActive = false
        currentModel = null
        currentEffort = null
        sessionActivityAt = timestamp || sessionActivityAt
        const interrupted = eventTurnId(payload) ? byId.get(eventTurnId(payload)) : activeTurn
        if (interrupted) interrupted.interrupted = true
        if (activeTurn) {
          activeTurn.lastAt = timestamp || activeTurn.lastAt
          abortedTurn = activeTurn.prompt ? activeTurn : null
        } else {
          abortedTurn = null
        }
        continue
      }

      let prompt = null
      let delegation = null
      let promptSource = null
      if (entry.type === "event_msg" && payload && payload.type === "user_message") {
        prompt = turnUsageNormalizePrompt(payload.message ?? payload.content)
        delegation = turnUsageFindDelegation(payload.message ?? payload.content)
        promptSource = "event_msg"
      } else if (entry.type === "response_item" && payload && payload.type === "message" && payload.role === "user") {
        prompt = turnUsageNormalizeResponsePrompt(payload.content)
        delegation = turnUsageFindDelegation(payload.content)
        promptSource = "response_item"
      }
      if (prompt) {
        const timestampMs = turnUsageTimestampMs(timestamp)
        const recentTimestampMs = recentPromptEvent ? turnUsageTimestampMs(recentPromptEvent.timestamp) : 0
        const isDuplicate = !!(
          recentPromptEvent &&
          recentPromptEvent.turn === activeTurn &&
          recentPromptEvent.source !== promptSource &&
          recentPromptEvent.prompt.replace(/\s+/g, " ") === prompt.replace(/\s+/g, " ") &&
          timestampMs > 0 &&
          recentTimestampMs > 0 &&
          Math.abs(timestampMs - recentTimestampMs) <= TURN_USAGE_DUPLICATE_PROMPT_WINDOW_MS
        )
        if (isDuplicate) {
          activeTurn = recentPromptEvent.turn
          if (promptSource === "response_item") activeTurn.prompt = prompt
          activeTurn.lastAt = timestamp || activeTurn.lastAt
          continue
        }
        // A genuinely new prompt ends an aborted-turn continuation candidate.
        abortedTurn = null
        pendingResumeTurn = null
        if (activeTurn && !activeTurn.prompt && !activeTurn.hasUsage) {
          activeTurn.prompt = prompt
          activeTurn.sourceThreadId = delegation ? delegation.sourceThreadId : activeTurn.sourceThreadId
          activeTurn.isDelegated = !!delegation || activeTurn.isDelegated
          activeTurn.startedAt = activeTurn.startedAt || timestamp
          activeTurn.lastAt = timestamp || activeTurn.lastAt
        } else {
          // Codex can accept another user prompt while the same durable task is
          // still active without emitting a fresh turn_context. In that case the
          // last explicit model context remains authoritative until Codex changes
          // it or the task completes/aborts. Preserve that identity for the new
          // provisional prompt instead of turning it into an Unknown Model.
          const inheritedModel = sessionIsActive
            ? ((activeTurn && activeTurn.model) || currentModel || null)
            : null
          activeTurn = provisionalTurn(timestamp)
          activeTurn.model = inheritedModel
          if (inheritedModel && currentEffort) activeTurn.reasoningEfforts = [currentEffort]
          activeTurn.prompt = prompt
          activeTurn.sourceThreadId = delegation ? delegation.sourceThreadId : null
          activeTurn.isDelegated = !!delegation
        }
        recentPromptEvent = { prompt: prompt, source: promptSource, timestamp: timestamp, turn: activeTurn }
        continue
      }

      if (entry.type === "turn_context" && payload) {
        activeTurn = selectEventTurn(payload, timestamp)

        const model = turnUsageReadModel(payload)
        if (model) {
          currentModel = model
          activeTurn.model = model
        }
        currentEffort = turnUsageReadEffort(payload)
        if (currentEffort && activeTurn.reasoningEfforts.indexOf(currentEffort) === -1) activeTurn.reasoningEfforts.push(currentEffort)
        const cwd = turnUsageReadString(payload.cwd)
        if (cwd) {
          activeTurn.cwd = cwd
          sessionCwd = sessionCwd || cwd
        }
        activeTurn.startedAt = activeTurn.startedAt || timestamp
        activeTurn.lastAt = timestamp || activeTurn.lastAt
        continue
      }

      if (isRequestRecord || isLegacyTokenCount) {
        const info = isRequestRecord
          ? { last_token_usage: payload.usage }
          : (payload.info && typeof payload.info === "object" ? payload.info : null)
        // Last-usage and cumulative measurements both count, including explicit zero.
        // Quota-only, empty and malformed token records do not establish a measurement.
        const recorded = !!(info && [info.last_token_usage, info.total_token_usage].some(function (record) {
          return record && typeof record === "object" && !Array.isArray(record) &&
            ["input_tokens", "cached_input_tokens", "cache_read_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"].some(function (key) {
              const value = record[key]
              return (typeof value === "number" || typeof value === "string") && turnUsageNumber(value) !== null
            })
        }))
        if (!recorded) continue

        const totalUsage = info ? turnUsageNormalizeUsage(info.total_token_usage) : null
        if (isLegacyTokenCount && pendingRequestPartner) {
          // Only a measured legacy snapshot consumes the authoritative request's partner.
          // Quota-only events above leave both the pending partner and baseline intact.
          if (pendingRequestPartner.owned && totalUsage) previousTotals = totalUsage
          pendingRequestPartner = null
          continue
        }
        let usage = info ? turnUsageNormalizeUsage(info.last_token_usage) : null
        // Codex repeats the last usage when publishing unchanged cumulative totals.
        if (totalUsage && previousTotals && ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"].every(function (key) { return totalUsage[key] === previousTotals[key] })) usage = turnUsageEmptyUsage()
        if (!usage && totalUsage) usage = turnUsageSubtract(totalUsage, previousTotals)
        if (totalUsage) previousTotals = totalUsage

        let turn
        let requestIdentity = null
        if (isRequestRecord) {
          const threadId = turnUsageReadString(payload.thread_id)
          const turnId = turnUsageReadString(payload.turn_id)
          const responseId = turnUsageReadString(payload.response_id)
          const owned = threadId === sessionId
          pendingRequestPartner = { owned: owned }
          if (!owned) continue
          const requestId = responseId ? JSON.stringify([threadId, turnId || "", responseId]) : null
          requestIdentity = requestId
          if (requestId && requestIds.has(requestId)) continue
          if (requestId) requestIds.add(requestId)
          turn = turnId ? (byId.get(turnId) || selectEventTurn(payload, timestamp)) : ensureActive(timestamp)
        } else {
          turn = ensureActive(timestamp)
        }
        if (pendingResumeTurn && pendingResumeTurn.target === turn && !turn.prompt) {
          turnUsageMergeTurns(turn, pendingResumeTurn.source, turns, byId, pendingTaskActions)
          pendingResumeTurn = null
          abortedTurn = null
        }
        if (turnUsageIsZero(usage)) {
          turn.tokenUsageRecorded = true
          continue
        }
        const model =
          turnUsageReadModel(payload) ||
          (info && turnUsageReadModel(info)) ||
          (isRequestRecord && turn.model) ||
          currentModel ||
          turn.model ||
          null
        if (model) {
          if (!isRequestRecord || turn === activeTurn) {
            if (model !== currentModel) currentEffort = null
            currentModel = model
          }
          turn.model = turn.model || model
        }

        const effort = turnUsageReadEffort(payload) || (info && turnUsageReadEffort(info)) ||
          (isRequestRecord && turn.reasoningEfforts[turn.reasoningEfforts.length - 1]) ||
          (model === currentModel ? currentEffort : null)
        if (effort) {
          usage.reasoningEfforts = [effort]
          if (turn.reasoningEfforts.indexOf(effort) === -1) turn.reasoningEfforts.push(effort)
        }
        const key = [
          timestamp || lineIndex,
          model || "",
          usage.inputTokens,
          usage.cachedInputTokens,
          usage.cacheWriteInputTokens,
          usage.outputTokens,
          usage.reasoningOutputTokens,
          usage.totalTokens,
        ].join("|")
        if (!isRequestRecord) {
          if (dedupe.has(key)) continue
          dedupe.add(key)
        }
        turn.tokenUsageRecorded = true
        turn.usageRecords.push({ id: requestIdentity ? "request:" + requestIdentity : "legacy:" + key, model: model, usage: usage })

        if (model) {
          let modelUsage = turn.models.get(model)
          if (!modelUsage) {
            modelUsage = turnUsageEmptyUsage()
            turn.models.set(model, modelUsage)
          }
          turnUsageAddUsage(modelUsage, usage)
        }
        turnUsageAddUsage(turn.usage, usage)
        turn.hasUsage = true
        turn.lastAt = timestamp || turn.lastAt
        turn.cwd = turn.cwd || sessionCwd
      }
    }

    const visibleTurns = turns.filter(function (turn) {
      return !!turn.prompt || (turn.hasUsage && turn.usage.totalTokens > 0) || turn.subagentSessionIds.length > 0
    })
    const latestTurn = visibleTurns.slice().sort(function (a, b) {
      return turnUsageTimestampMs(b.lastAt || b.startedAt) - turnUsageTimestampMs(a.lastAt || a.startedAt)
    })[0]
    return {
      id: sessionId,
      path: sessionPath,
      cwd: sessionCwd,
      parentSessionId: parentSessionId,
      threadSource: threadSource,
      agentName: agentName,
      agentRole: agentRole,
      isActive: sessionIsActive,
      activeTurnId: sessionIsActive && activeTurn
        ? (pendingResumeTurn && pendingResumeTurn.target === activeTurn && !activeTurn.prompt ? pendingResumeTurn.source.id : activeTurn.id)
        : null,
      activityAt: sessionActivityAt,
      latestAt: latestTurn ? (latestTurn.lastAt || latestTurn.startedAt) : null,
      startedAt: sessionStartedAt,
      turns: visibleTurns.map(function (turn) {
        return {
          id: turn.id,
          prompt: turn.prompt,
          sourceThreadId: turn.sourceThreadId,
          isDelegated: !!turn.isDelegated,
          outgoingTaskIds: Array.isArray(turn.outgoingTaskIds) ? turn.outgoingTaskIds.slice() : [],
          cwd: turn.cwd,
          startedAt: turn.startedAt,
          lastAt: turn.lastAt,
          completedAt: turn.completedAt,
          interrupted: !!turn.interrupted,
          tokenUsageRecorded: !!turn.tokenUsageRecorded,
          model: turn.model || null,
          reasoningEfforts: turn.reasoningEfforts || [],
          usage: turn.usage,
          usageRecords: turn.usageRecords,
          models: Array.from(turn.models.entries()).map(function (entry) {
            return { name: entry[0], reasoningEfforts: entry[1].reasoningEfforts || [], usage: entry[1] }
          }),
          subagentSessionIds: turn.subagentSessionIds,
        }
      }),
    }
  }

  function turnUsageFileMetadata(ctx, path) {
    if (!ctx.host.fs || typeof ctx.host.fs.fileMetadata !== "function") return null
    try {
      const value = JSON.parse(ctx.host.fs.fileMetadata(path))
      if (!value || !Number.isFinite(Number(value.size))) return null
      return { size: Number(value.size), modifiedMs: Number(value.modifiedMs) || 0 }
    } catch (e) {
      return null
    }
  }

  function turnUsageLoadIndexCache(ctx) {
    const path = joinPath(ctx.app.pluginDataDir, "prompt-usage-index-v2.json")
    try {
      if (!ctx.host.fs.exists(path)) return { path: path, files: {} }
      const parsed = JSON.parse(ctx.host.fs.readText(path))
      if (!parsed || parsed.version !== TURN_USAGE_CACHE_VERSION || !parsed.files) {
        return { path: path, files: {}, needsRewrite: true }
      }
      return { path: path, files: parsed.files }
    } catch (e) {
      return { path: path, files: {} }
    }
  }

  function turnUsageReadSessionText(ctx, path) {
    if (ctx.host.fs && typeof ctx.host.fs.readCodexSessionEvents === "function") {
      return ctx.host.fs.readCodexSessionEvents(path)
    }
    if (/\.jsonl\.zst$/i.test(path)) throw new Error("Compressed Codex history requires the native session reader")
    return ctx.host.fs.readText(path)
  }

  function turnUsageSanitizeCachedSession(session) {
    if (!session || !Array.isArray(session.turns)) return false
    let changed = false
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i]
      if (!turn || typeof turn.prompt !== "string") continue
      const prompt = turnUsageNormalizePrompt(turn.prompt)
      if (prompt !== turn.prompt) {
        turn.prompt = prompt
        changed = true
      }
      if (turn.sourceThreadId != null && typeof turn.sourceThreadId !== "string") {
        turn.sourceThreadId = null
        changed = true
      }
      const outgoingTaskIds = Array.isArray(turn.outgoingTaskIds)
        ? turn.outgoingTaskIds.filter(function (id) { return typeof id === "string" && id.trim() })
        : []
      if (
        !Array.isArray(turn.outgoingTaskIds) ||
        outgoingTaskIds.length !== turn.outgoingTaskIds.length ||
        outgoingTaskIds.some(function (id, index) { return id !== turn.outgoingTaskIds[index] })
      ) {
        turn.outgoingTaskIds = outgoingTaskIds
        changed = true
      }
    }
    return changed
  }

  function turnUsageExpireStaleActivity(session, nowIso) {
    if (!session || !session.isActive) return false
    const activityMs = turnUsageTimestampMs(session.activityAt)
    const nowMs = turnUsageTimestampMs(nowIso)
    if (!activityMs || !nowMs || nowMs - activityMs <= TURN_USAGE_ACTIVE_STALE_MS) return false
    session.isActive = false
    return true
  }

  function turnUsageLoadAllSessions(ctx) {
    const files = turnUsageCollectAllFiles(ctx)
    const cache = turnUsageLoadIndexCache(ctx)
    const nextFiles = {}
    const sessions = []
    let changed = !!cache.needsRewrite

    const reportProgress = typeof ctx.host.scanProgress === "function"
      ? ctx.host.scanProgress : null
    if (reportProgress) reportProgress("reading", 0, files.length)

    for (let i = 0; i < files.length; i++) {
      let completed = false
      try {
        const path = files[i]
        const metadata = turnUsageFileMetadata(ctx, path)
        const cached = cache.files[path]
        if (
          metadata && cached && cached.session &&
          cached.size === metadata.size && cached.modifiedMs === metadata.modifiedMs
        ) {
          const sanitized = turnUsageSanitizeCachedSession(cached.session)
          const expired = turnUsageExpireStaleActivity(cached.session, ctx.nowIso)
          if (sanitized || expired) changed = true
          nextFiles[path] = cached
          sessions.push(cached.session)
          completed = true
          continue
        }

        try {
          const session = turnUsageParseSessionText(turnUsageReadSessionText(ctx, path), path)
          turnUsageExpireStaleActivity(session, ctx.nowIso)
          const entry = {
            size: metadata ? metadata.size : null,
            modifiedMs: metadata ? metadata.modifiedMs : null,
            session: session,
          }
          nextFiles[path] = entry
          sessions.push(session)
          changed = true
          completed = true
        } catch (e) {
          ctx.host.log.warn("prompt usage read failed for " + path + ": " + String(e))
          throw new Error("Unable to read Codex session history (" + path.split("/").pop() + "): " + String(e))
        }
      } finally {
        if (reportProgress && completed) reportProgress("reading", i + 1, files.length)
      }
    }
    if (reportProgress) reportProgress("summarizing", files.length, files.length)

    if (Object.keys(cache.files).length !== Object.keys(nextFiles).length) changed = true
    if (changed && ctx.host.fs && typeof ctx.host.fs.writeText === "function") {
      try {
        ctx.host.fs.writeText(cache.path, JSON.stringify({
          version: TURN_USAGE_CACHE_VERSION,
          files: nextFiles,
        }))
      } catch (e) {
        ctx.host.log.warn("prompt usage index write failed: " + String(e))
      }
    }

    return sessions.filter(function (session) {
      return session && Array.isArray(session.turns) && session.turns.length > 0
    })
  }

  function turnUsageReadJsonFile(ctx, path) {
    try {
      if (!ctx.host.fs.exists(path)) return null
      const value = JSON.parse(ctx.host.fs.readText(path))
      return value && typeof value === "object" ? value : null
    } catch (e) {
      return null
    }
  }

  var TURN_USAGE_TITLE_CHAR_LIMIT = 80

  function turnUsageDecodeHtmlEntities(value) {
    let text = String(value || "")
    const named = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    }
    // Codex state can contain either literal XML or an HTML-escaped copy. Two
    // passes also cover state that escaped an already-escaped delegation value.
    for (let pass = 0; pass < 2; pass++) {
      const decoded = text.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|quot);/gi, function (match, entity) {
        const normalized = String(entity).toLowerCase()
        if (normalized.charAt(0) !== "#") return named[normalized] || match
        const hexadecimal = normalized.charAt(1) === "x"
        const codePoint = parseInt(normalized.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) return match
        try { return String.fromCodePoint(codePoint) } catch (e) { return match }
      })
      if (decoded === text) break
      text = decoded
    }
    return text
  }

  function turnUsageCleanDisplayTitle(value) {
    const source = turnUsageDecodeHtmlEntities(value)
    if (!source.trim()) return null

    let title = source
    if (turnUsageHasDelegationMarker(source)) {
      const delegation = turnUsageParseDelegation(source)
      // Never expose implementation XML when the persisted envelope is
      // incomplete. The caller will choose the first safe fallback instead.
      if (!delegation) return null
      if (turnUsageIsRoutingOnlyDelegationInput(delegation.input)) return null
      title = delegation.input
    }

    title = turnUsageStripUiOnlyReferences(title)
    title = String(title).replace(/\s+/g, " ").trim()
    if (!title || /<\/?codex_delegation(?:\s|>)/i.test(title)) return null
    if (title.length > TURN_USAGE_TITLE_CHAR_LIMIT) {
      title = title.slice(0, TURN_USAGE_TITLE_CHAR_LIMIT - 1).replace(/\s+$/, "") + "…"
    }
    return title || null
  }

  function turnUsageDisplayTitle(candidate, fallbackPrompt, cwd, sessionId) {
    return (
      turnUsageCleanDisplayTitle(candidate) ||
      turnUsageCleanDisplayTitle(fallbackPrompt) ||
      turnUsageCleanDisplayTitle(cwd) ||
      turnUsageCleanDisplayTitle(sessionId) ||
      "Untitled Session"
    )
  }

  function turnUsageReadThreadTitleColumn(ctx, databasePath, column, titles) {
    try {
      const raw = ctx.host.sqlite.query(
        databasePath,
        "SELECT id, " + column + " FROM threads WHERE " + column + " IS NOT NULL AND " + column + " <> ''"
      )
      const rows = JSON.parse(raw || "[]")
      if (!Array.isArray(rows)) return
      for (let i = 0; i < rows.length; i++) {
        const id = turnUsageReadString(rows[i] && rows[i].id)
        const title = turnUsageCleanDisplayTitle(rows[i] && rows[i][column])
        if (id && title) titles.set(id, title)
      }
    } catch (e) {
      // `name` was added after `title`; querying each column independently
      // keeps both old and new Codex state databases readable.
    }
  }

  function turnUsageReadThreadTitles(ctx, codexHome) {
    const titles = new Map()
    const databasePath = joinPath(codexHome, "state_5.sqlite")
    turnUsageReadThreadTitleColumn(ctx, databasePath, "title", titles)
    // A non-empty `name` is the current user-facing Codex task name and takes
    // precedence over the original first-prompt title when both are present.
    turnUsageReadThreadTitleColumn(ctx, databasePath, "name", titles)

    try {
      const indexPath = joinPath(codexHome, "session_index.jsonl")
      if (!ctx.host.fs.exists(indexPath)) return titles
      const text = String(ctx.host.fs.readText(indexPath) || "")
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) continue
        let row
        try { row = JSON.parse(lines[i]) } catch (e) { continue }
        const id = turnUsageReadString(row && row.id)
        const title = turnUsageCleanDisplayTitle(row && row.thread_name)
        // Codex writes its current user-facing task name to session_index.jsonl.
        // The SQLite `threads.title` column can remain the original first prompt
        // after a task is renamed, so the newest index entry must win. Repeated
        // entries are intentional: later rows represent later renames.
        if (id && title) titles.set(id, title)
      }
    } catch (e) {
      // A missing title must not prevent token attribution.
    }
    return titles
  }

  function turnUsageLoadCodexUiCatalog(ctx) {
    const codexHome = readCodexHome(ctx) || "~/.codex"
    const state = turnUsageReadJsonFile(ctx, joinPath(codexHome, ".codex-global-state.json")) || {}
    const projects = state["local-projects"] && typeof state["local-projects"] === "object"
      ? state["local-projects"]
      : {}
    const assignments = state["thread-project-assignments"] && typeof state["thread-project-assignments"] === "object"
      ? state["thread-project-assignments"]
      : {}
    const projectless = new Set(Array.isArray(state["projectless-thread-ids"])
      ? state["projectless-thread-ids"]
      : [])
    const sidebarOrders = state["sidebar-project-thread-orders"] && typeof state["sidebar-project-thread-orders"] === "object"
      ? state["sidebar-project-thread-orders"]
      : {}
    const projectOrderById = new Map()
    const projectOrder = [].concat(
      Array.isArray(state["pinned-project-ids"]) ? state["pinned-project-ids"] : [],
      Array.isArray(state["project-order"]) ? state["project-order"] : []
    )
    for (let i = 0; i < projectOrder.length; i++) {
      const projectId = turnUsageReadString(projectOrder[i])
      if (projectId && !projectOrderById.has(projectId)) projectOrderById.set(projectId, projectOrderById.size)
    }
    const orderedProjectIds = new Set()
    const explicitProjectBySession = new Map()
    const explicitOrderBySession = new Map()
    const orderedIds = Object.keys(sidebarOrders)
    for (let i = 0; i < orderedIds.length; i++) {
      const projectId = orderedIds[i]
      if (!projects[projectId]) continue
      const order = sidebarOrders[projectId]
      const threadIds = order && Array.isArray(order.threadIds) ? order.threadIds : []
      orderedProjectIds.add(projectId)
      for (let j = 0; j < threadIds.length; j++) {
        const threadId = turnUsageReadString(threadIds[j])
        if (threadId && !explicitProjectBySession.has(threadId)) {
          explicitProjectBySession.set(threadId, projectId)
          explicitOrderBySession.set(threadId, j)
        }
      }
    }
    return {
      projects: projects,
      assignments: assignments,
      projectless: projectless,
      orderedProjectIds: orderedProjectIds,
      explicitProjectBySession: explicitProjectBySession,
      explicitOrderBySession: explicitOrderBySession,
      projectOrderById: projectOrderById,
      titles: turnUsageReadThreadTitles(ctx, codexHome),
    }
  }

  function turnUsageAttachSubagents(sessions, explicitProjectBySession) {
    const explicitTopLevelIds = explicitProjectBySession || new Map()
    const byId = new Map()
    const attachedIds = new Set()
    const activityAttachedIds = new Set()
    for (let i = 0; i < sessions.length; i++) {
      const incoming = sessions[i]
      const existing = byId.get(incoming.id)
      if (!existing) {
        byId.set(incoming.id, incoming)
        continue
      }

      existing.cwd = existing.cwd || incoming.cwd
      existing.parentSessionId = existing.parentSessionId || incoming.parentSessionId
      existing.threadSource = existing.threadSource || incoming.threadSource
      existing.agentName = existing.agentName || incoming.agentName
      existing.agentRole = existing.agentRole || incoming.agentRole
      if (turnUsageTimestampMs(incoming.activityAt) > turnUsageTimestampMs(existing.activityAt)) {
        existing.isActive = !!incoming.isActive
        existing.activeTurnId = incoming.activeTurnId || null
        existing.activityAt = incoming.activityAt
      }
      const incomingStartedAtMs = turnUsageTimestampMs(incoming.startedAt)
      const existingStartedAtMs = turnUsageTimestampMs(existing.startedAt)
      if (incomingStartedAtMs && (!existingStartedAtMs || incomingStartedAtMs < existingStartedAtMs)) {
        existing.startedAt = incoming.startedAt
      }
      if (turnUsageTimestampMs(incoming.latestAt) > turnUsageTimestampMs(existing.latestAt)) {
        existing.latestAt = incoming.latestAt
      }

      const turnsByKey = new Map()
      for (let j = 0; j < existing.turns.length; j++) {
        const turn = existing.turns[j]
        const key = turn.id && turn.id.indexOf("#pending-") === -1
          ? "id:" + turn.id
          : "prompt:" + (turn.startedAt || turn.lastAt || "") + ":" + (turn.prompt || "")
        turnsByKey.set(key, turn)
      }
      for (let j = 0; j < incoming.turns.length; j++) {
        const turn = incoming.turns[j]
        const key = turn.id && turn.id.indexOf("#pending-") === -1
          ? "id:" + turn.id
          : "prompt:" + (turn.startedAt || turn.lastAt || "") + ":" + (turn.prompt || "")
        const duplicate = turnsByKey.get(key)
        if (!duplicate) {
          existing.turns.push(turn)
          turnsByKey.set(key, turn)
          continue
        }
        duplicate.tokenUsageRecorded = !!duplicate.tokenUsageRecorded || !!turn.tokenUsageRecorded
        if (turnUsageTimestampMs(turn.lastAt) >= turnUsageTimestampMs(duplicate.lastAt)) duplicate.interrupted = !!turn.interrupted
        duplicate.prompt = duplicate.prompt || turn.prompt
        duplicate.sourceThreadId = duplicate.sourceThreadId || turn.sourceThreadId
        duplicate.isDelegated = duplicate.isDelegated || turn.isDelegated
        duplicate.outgoingTaskIds = Array.from(new Set([].concat(duplicate.outgoingTaskIds || [], turn.outgoingTaskIds || [])))
        duplicate.cwd = duplicate.cwd || turn.cwd
        duplicate.reasoningEfforts = Array.from(new Set([].concat(duplicate.reasoningEfforts || [], turn.reasoningEfforts || [])))
        duplicate.model = duplicate.model || turn.model
        duplicate.completedAt = duplicate.completedAt || turn.completedAt
        if (turnUsageTimestampMs(turn.completedAt) > turnUsageTimestampMs(duplicate.completedAt)) {
          duplicate.completedAt = turn.completedAt
        }
        const childIds = new Set([].concat(duplicate.subagentSessionIds || [], turn.subagentSessionIds || []))
        duplicate.subagentSessionIds = Array.from(childIds)
        const records = new Map()
        for (const record of duplicate.usageRecords.concat(turn.usageRecords)) {
          if (!records.has(record.id)) records.set(record.id, record)
        }
        duplicate.usageRecords = Array.from(records.values())
        duplicate.usage = turnUsageEmptyUsage()
        const models = new Map()
        for (const record of records.values()) {
          turnUsageAddUsage(duplicate.usage, record.usage)
          if (!record.model) continue
          if (!models.has(record.model)) models.set(record.model, turnUsageEmptyUsage())
          turnUsageAddUsage(models.get(record.model), record.usage)
        }
        duplicate.models = Array.from(models.entries()).map(function (entry) {
          return { name: entry[0], reasoningEfforts: entry[1].reasoningEfforts || [], usage: entry[1] }
        })
        if (turnUsageTimestampMs(turn.lastAt) > turnUsageTimestampMs(duplicate.lastAt)) duplicate.lastAt = turn.lastAt
      }
    }

    function nearestPrompt(parent, child) {
      const candidates = parent.turns.filter(function (turn) { return !!turn.prompt }).sort(function (a, b) {
        return turnUsageTimestampMs(b.startedAt || b.lastAt) - turnUsageTimestampMs(a.startedAt || a.lastAt)
      })
      if (candidates.length === 0) return null
      const childStarted = turnUsageTimestampMs(child.startedAt || child.latestAt)
      let target = candidates[candidates.length - 1]
      for (let i = 0; i < candidates.length; i++) {
        if (turnUsageTimestampMs(candidates[i].startedAt || candidates[i].lastAt) <= childStarted) {
          target = candidates[i]
          break
        }
      }
      return target
    }

    for (const session of byId.values()) {
      for (let j = 0; j < session.turns.length; j++) {
        session.turns[j].subagents = []
      }
    }

    const metadataChildrenByParent = new Map()
    for (const child of byId.values()) {
      if (explicitTopLevelIds.has(child.id)) continue
      if (!child.parentSessionId || child.parentSessionId === child.id || !byId.has(child.parentSessionId)) continue
      const children = metadataChildrenByParent.get(child.parentSessionId) || []
      children.push(child)
      metadataChildrenByParent.set(child.parentSessionId, children)
    }
    const metadataReachable = new Set()
    const roots = Array.from(byId.values()).filter(function (session) {
      return explicitTopLevelIds.has(session.id) || !session.parentSessionId || session.parentSessionId === session.id || !byId.has(session.parentSessionId)
    })
    function visitMetadata(session) {
      const children = metadataChildrenByParent.get(session.id) || []
      for (let i = 0; i < children.length; i++) {
        if (metadataReachable.has(children[i].id)) continue
        metadataReachable.add(children[i].id)
        visitMetadata(children[i])
      }
    }
    for (let i = 0; i < roots.length; i++) visitMetadata(roots[i])

    // Activity events provide exact prompt attribution. For cyclic legacy
    // metadata they are also the authoritative way back to a visible root.
    for (const session of byId.values()) {
      for (let i = 0; i < session.turns.length; i++) {
        const source = session.turns[i]
        const ids = Array.isArray(source.subagentSessionIds) ? source.subagentSessionIds : []
        for (let j = 0; j < ids.length; j++) {
          const child = byId.get(ids[j])
          if (!child || attachedIds.has(child.id)) continue
          if (explicitTopLevelIds.has(child.id)) continue
          if (metadataReachable.has(child.id) && child.parentSessionId !== session.id) continue
          if (!metadataReachable.has(child.id) && child.threadSource !== "subagent") continue
          const target = source.prompt ? source : nearestPrompt(session, child)
          if (!target) continue
          target.subagents.push(child)
          attachedIds.add(child.id)
          activityAttachedIds.add(child.id)
        }
      }
    }

    // Valid parent metadata fills the older records that have no activity
    // event, but never overrides an exact activity-backed placement.
    for (const child of byId.values()) {
      if (!metadataReachable.has(child.id) || attachedIds.has(child.id)) continue
      const parent = byId.get(child.parentSessionId)
      if (!parent || parent.turns.length === 0) continue
      const target = nearestPrompt(parent, child)
      if (!target) continue
      target.subagents.push(child)
      attachedIds.add(child.id)
    }
    return {
      sessions: Array.from(byId.values()),
      attachedIds: attachedIds,
      activityAttachedIds: activityAttachedIds,
      metadataReachable: metadataReachable,
    }
  }

  function turnUsageAggregateAgent(session) {
    const usage = turnUsageEmptyUsage()
    const models = new Map()
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i]
      turnUsageAddUsage(usage, turn.usage)
      const turnModels = Array.isArray(turn.models) ? turn.models : []
      for (let j = 0; j < turnModels.length; j++) {
        const model = turnModels[j]
        let modelUsage = models.get(model.name)
        if (!modelUsage) {
          modelUsage = turnUsageEmptyUsage()
          models.set(model.name, modelUsage)
        }
        turnUsageAddUsage(modelUsage, model.usage)
      }
    }
    return {
      usage: usage,
      tokenUsageRecorded: session.turns.some(function (turn) { return !!turn.tokenUsageRecorded }),
      models: Array.from(models.entries()).map(function (entry) {
        return { name: entry[0], reasoningEfforts: entry[1].reasoningEfforts || [], usage: entry[1] }
      }).sort(function (a, b) { return b.usage.totalTokens - a.usage.totalTokens }),
    }
  }

  function turnUsageCollectSubagentRecords(session, out, visited, childrenByParent) {
    if (visited.has(session.id)) return
    visited.add(session.id)
    const aggregate = turnUsageAggregateAgent(session)
    out.push({
      id: session.id,
      kind: "subagent",
      name: session.agentName || "Subagent",
      role: session.agentRole,
      usage: aggregate.usage,
      tokenUsageRecorded: aggregate.tokenUsageRecorded,
      models: aggregate.models,
    })
    const children = new Map()
    const metadataChildren = childrenByParent.get(session.id) || []
    for (let i = 0; i < metadataChildren.length; i++) children.set(metadataChildren[i].id, metadataChildren[i])
    for (let i = 0; i < session.turns.length; i++) {
      const eventChildren = Array.isArray(session.turns[i].subagents) ? session.turns[i].subagents : []
      for (let j = 0; j < eventChildren.length; j++) children.set(eventChildren[j].id, eventChildren[j])
    }
    for (const child of children.values()) {
      turnUsageCollectSubagentRecords(child, out, visited, childrenByParent)
    }
  }

  function turnUsageProjectForSession(session, catalog) {
    const explicitProjectId = catalog.explicitProjectBySession.get(session.id)
    if (explicitProjectId && catalog.projects[explicitProjectId]) {
      return catalog.projects[explicitProjectId]
    }
    if (catalog.projectless.has(session.id)) return null
    const assignment = catalog.assignments[session.id]
    if (assignment && assignment.projectId && catalog.projects[assignment.projectId]) {
      return catalog.projects[assignment.projectId]
    }
    const cwd = turnUsageReadString(session.cwd)
    if (!cwd) return null
    const projectIds = Object.keys(catalog.projects)
    for (let i = 0; i < projectIds.length; i++) {
      if (catalog.orderedProjectIds.has(projectIds[i])) continue
      const project = catalog.projects[projectIds[i]]
      const roots = project && Array.isArray(project.rootPaths) ? project.rootPaths : []
      if (roots.indexOf(cwd) !== -1) return project
    }
    return null
  }

  function turnUsageIsInternalOrchestrationPrompt(value) {
    const prompt = turnUsageReadString(value)
    if (!prompt || !/^you are\s/i.test(prompt)) return false
    if (!/agent_type\s+["']subagent_/i.test(prompt)) return false
    return /(?:orchestration parent|parent orchestrator|outer coordinator|outer orchestrator)/i.test(prompt)
  }

  function turnUsageBuildDisplayGroups(sessions, catalog) {
    const linked = turnUsageAttachSubagents(sessions, catalog.explicitProjectBySession)
    const childrenByParent = new Map()
    for (let i = 0; i < linked.sessions.length; i++) {
      const child = linked.sessions[i]
      if (!child.parentSessionId || !linked.metadataReachable.has(child.id)) continue
      const children = childrenByParent.get(child.parentSessionId) || []
      children.push(child)
      childrenByParent.set(child.parentSessionId, children)
    }

    function childPrompt(parent, child) {
      for (let i = 0; i < parent.turns.length; i++) {
        const ids = Array.isArray(parent.turns[i].subagentSessionIds) ? parent.turns[i].subagentSessionIds : []
        if (parent.turns[i].prompt && ids.indexOf(child.id) !== -1) return parent.turns[i]
      }
      const promptTurns = parent.turns.filter(function (turn) { return !!turn.prompt }).sort(function (a, b) {
        return turnUsageTimestampMs(b.startedAt || b.lastAt) - turnUsageTimestampMs(a.startedAt || a.lastAt)
      })
      if (promptTurns.length === 0) return null
      const childStarted = turnUsageTimestampMs(child.startedAt || child.latestAt)
      let target = promptTurns[promptTurns.length - 1]
      for (let i = 0; i < promptTurns.length; i++) {
        if (turnUsageTimestampMs(promptTurns[i].startedAt || promptTurns[i].lastAt) <= childStarted) {
          target = promptTurns[i]
          break
        }
      }
      return target
    }

    function descendantThreadIds(root) {
      const visited = new Set([root.id])
      function visit(parent) {
        const children = (childrenByParent.get(parent.id) || []).concat(
          parent.turns.flatMap(function (turn) { return turn.subagents || [] })
        )
        for (const child of children) {
          if (visited.has(child.id) || catalog.explicitProjectBySession.has(child.id)) continue
          visited.add(child.id)
          visit(child)
        }
      }
      visit(root)
      visited.delete(root.id)
      return Array.from(visited).sort()
    }

    const groups = new Map()

    for (let i = 0; i < linked.sessions.length; i++) {
      const session = linked.sessions[i]
      const explicitlyListed = catalog.explicitProjectBySession.has(session.id)
      // Agent sessions belong inside the prompt that spawned them. Older logs
      // can have incomplete or cyclic parent metadata, so graph reachability
      // alone is not a safe test for whether a session is a visible root.
      if (session.parentSessionId && !explicitlyListed) continue
      if (!explicitlyListed && (session.threadSource === "subagent" || session.agentName || session.agentRole)) continue
      const turns = session.turns.filter(function (turn) { return !!turn.prompt })
      if (turns.length === 0) continue
      if (!explicitlyListed && turns.some(function (turn) { return turnUsageIsInternalOrchestrationPrompt(turn.prompt) })) continue
      turns.sort(function (a, b) {
        return turnUsageTimestampMs(b.startedAt || b.lastAt) - turnUsageTimestampMs(a.startedAt || a.lastAt)
      })

      let promptRecords = []
      for (let j = 0; j < turns.length; j++) {
        const turn = turns[j]
        const mainAgent = {
          id: session.id,
          kind: "main",
          name: "Main Agent",
          role: session.agentRole,
          usage: turn.usage,
          tokenUsageRecorded: !!turn.tokenUsageRecorded,
          models: Array.isArray(turn.models) ? turn.models : [],
        }
        const agents = [mainAgent]
        const children = new Map()
        const eventChildren = Array.isArray(turn.subagents) ? turn.subagents : []
        for (let k = 0; k < eventChildren.length; k++) children.set(eventChildren[k].id, eventChildren[k])
        const metadataChildren = childrenByParent.get(session.id) || []
        for (let k = 0; k < metadataChildren.length; k++) {
          if (linked.activityAttachedIds.has(metadataChildren[k].id)) continue
          const target = childPrompt(session, metadataChildren[k])
          if (target && target.id === turn.id) {
            children.set(metadataChildren[k].id, metadataChildren[k])
          }
        }
        const visitedAgents = new Set()
        for (const child of children.values()) {
          turnUsageCollectSubagentRecords(child, agents, visitedAgents, childrenByParent)
        }
        const combined = turnUsageEmptyUsage()
        for (let k = 0; k < agents.length; k++) turnUsageAddUsage(combined, agents[k].usage)
        promptRecords.push({
          id: turn.id,
          prompt: turn.prompt,
          sourceThreadId: turn.sourceThreadId || null,
          isDelegated: !!turn.isDelegated,
          outgoingTaskIds: Array.isArray(turn.outgoingTaskIds) ? turn.outgoingTaskIds.slice() : [],
          startedAt: turn.startedAt || turn.lastAt,
          completedAt: turn.completedAt || null,
          isActive: !!session.isActive && session.activeTurnId === turn.id,
          interrupted: !!turn.interrupted && !(session.isActive && session.activeTurnId === turn.id),
          tokenUsageRecorded: agents.some(function (agent) { return !!agent.tokenUsageRecorded }),
          model: turn.model || null,
          reasoningEfforts: turn.reasoningEfforts || [],
          usage: combined,
          agents: agents,
        })
      }

      // Collapse only an immediate, exact resubmission after an empty interruption.
      // Work from the original adjacent records, after child usage is included;
      // retain the retry timestamp so usage does not move across date boundaries.
      promptRecords = promptRecords.filter(function (attempt, index, records) {
        const retry = records[index - 1]
        if (!retry || !attempt.interrupted || attempt.isActive || !turnUsageIsZero(attempt.usage) ||
          (attempt.usage.cacheWriteInputTokens || 0) !== 0 || retry.usage.totalTokens <= 0 ||
          attempt.prompt.trim() !== retry.prompt.trim() ||
          attempt.sourceThreadId !== retry.sourceThreadId || attempt.isDelegated !== retry.isDelegated) return true
        const elapsed = turnUsageTimestampMs(retry.startedAt) - turnUsageTimestampMs(attempt.startedAt)
        if (elapsed <= 0 || elapsed > 60000) return true
        retry.retriedFromStartedAt = attempt.startedAt
        retry.outgoingTaskIds = Array.from(new Set(retry.outgoingTaskIds.concat(attempt.outgoingTaskIds)))
        return false
      })

      const latestAt = promptRecords[0].startedAt
      const fallbackPrompt = promptRecords[promptRecords.length - 1].prompt
      const delegatedPrompt = promptRecords.find(function (prompt) { return prompt.isDelegated }) || null
      const relatedSourceId = delegatedPrompt ? delegatedPrompt.sourceThreadId : null
      const displaySession = {
        id: session.id,
        createdAt: session.startedAt || null,
        descendantThreadIds: descendantThreadIds(session),
        title: turnUsageDisplayTitle(catalog.titles.get(session.id), fallbackPrompt, session.cwd, session.id),
        latestAt: latestAt,
        promptCount: promptRecords.length,
        prompts: promptRecords,
        isDelegated: !!delegatedPrompt,
        relatedSourceId: relatedSourceId,
        relatedSourceTitle: relatedSourceId ? (catalog.titles.get(relatedSourceId) || null) : null,
        relatedTaskCount: 0,
        relatedTasks: [],
        isActive: !!session.isActive,
        codexOrder: catalog.explicitOrderBySession.has(session.id)
          ? catalog.explicitOrderBySession.get(session.id)
          : null,
        explicitOrder: catalog.explicitOrderBySession.has(session.id)
          ? catalog.explicitOrderBySession.get(session.id)
          : null,
      }
      const project = turnUsageProjectForSession(session, catalog)
      let group
      if (project) {
        const projectId = turnUsageReadString(project.id) || "project:" + (turnUsageReadString(project.name) || session.cwd)
        group = groups.get(projectId)
        if (!group) {
          group = {
            id: projectId,
            kind: "project",
            name: turnUsageReadString(project.name) || "Untitled Project",
            latestAt: null,
            promptCount: 0,
            sessionCount: 0,
            isActive: false,
            codexOrder: catalog.projectOrderById.has(projectId)
              ? catalog.projectOrderById.get(projectId)
              : null,
            sessions: [],
          }
          groups.set(projectId, group)
        }
      } else {
        // Projectless sessions are first-class top-level navigation items.
        // Separate groups let them interleave with projects by newest prompt.
        group = {
          id: "standalone:" + session.id,
          kind: "standalone",
          name: displaySession.title,
          latestAt: latestAt,
          promptCount: 0,
          sessionCount: 0,
          isActive: !!displaySession.isActive,
          codexOrder: null,
          sessions: [],
        }
        groups.set(group.id, group)
      }
      group.sessions.push(displaySession)
      group.promptCount += displaySession.promptCount
      group.sessionCount += 1
      if (displaySession.isActive) group.isActive = true
      if (turnUsageTimestampMs(latestAt) > turnUsageTimestampMs(group.latestAt)) group.latestAt = latestAt
    }

    const result = Array.from(groups.values())
    const sessionsById = new Map()
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].sessions.length; j++) {
        result[i].sessions[j].relatedTaskCount = 0
        result[i].sessions[j].relatedTasks = []
        sessionsById.set(result[i].sessions[j].id, result[i].sessions[j])
      }
    }
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].sessions.length; j++) {
        const source = result[i].sessions[j]
        for (let k = 0; k < source.prompts.length; k++) {
          const prompt = source.prompts[k]
          const outgoingTaskIds = Array.isArray(prompt.outgoingTaskIds) ? prompt.outgoingTaskIds : []
          prompt.outgoingTasks = outgoingTaskIds.flatMap(function (id) {
            const target = sessionsById.get(id)
            return target ? [{ id: target.id, title: target.title }] : []
          })
          for (let m = 0; m < prompt.outgoingTasks.length; m++) {
            const task = prompt.outgoingTasks[m]
            if (!source.relatedTasks.some(function (related) { return related.id === task.id })) {
              source.relatedTasks.push(task)
            }
          }
        }
        source.relatedTaskCount = source.relatedTasks.length
      }
    }
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].sessions.length; j++) {
        const session = result[i].sessions[j]
        if (!session.isDelegated || !session.relatedSourceId) continue
        const source = sessionsById.get(session.relatedSourceId)
        if (!source) {
          session.relatedSourceTitle = null
          continue
        }
        session.relatedSourceTitle = session.relatedSourceTitle || source.title
        if (!source.relatedTasks.some(function (related) { return related.id === session.id })) {
          source.relatedTasks.push({ id: session.id, title: session.title })
          source.relatedTaskCount += 1
        }
      }
    }
    for (let i = 0; i < result.length; i++) {
      result[i].sessions.sort(function (a, b) {
        const aIsExplicit = Number.isFinite(a.explicitOrder)
        const bIsExplicit = Number.isFinite(b.explicitOrder)
        if (aIsExplicit && bIsExplicit) return a.explicitOrder - b.explicitOrder
        if (aIsExplicit !== bIsExplicit) return aIsExplicit ? -1 : 1
        return turnUsageTimestampMs(b.latestAt) - turnUsageTimestampMs(a.latestAt)
      })
    }
    const sessionOrder = new Map()
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].sessions.length; j++) {
        sessionOrder.set(result[i].sessions[j].id, j)
      }
    }
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].sessions.length; j++) {
        result[i].sessions[j].relatedTasks.sort(function (a, b) {
          return (sessionOrder.get(a.id) || 0) - (sessionOrder.get(b.id) || 0)
        })
      }
    }
    return result.sort(function (a, b) {
      return turnUsageTimestampMs(b.latestAt) - turnUsageTimestampMs(a.latestAt)
    })
  }

  function turnUsageDateLabel(value) {
    const ms = turnUsageTimestampMs(value)
    if (!ms) return "Recent"
    const date = new Date(ms)
    const now = new Date()
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    const time = turnUsagePad2(date.getHours()) + ":" + turnUsagePad2(date.getMinutes())
    if (sameDay) return time
    return turnUsagePad2(date.getMonth() + 1) + "/" + turnUsagePad2(date.getDate()) + " " + time
  }

  function turnUsageJson(value) {
    return JSON.stringify(value)
  }

  var TURN_USAGE_QUOTA_STATE_VERSION = 3
  var TURN_USAGE_QUOTA_MAX_SEEN = 500
  var TURN_USAGE_QUOTA_MAX_OBSERVATIONS = 250
  var TURN_USAGE_QUOTA_FILE = "codex-weekly-quota-observations-v1.json"
  var TURN_USAGE_QUOTA_STATUSES = {
    measured: true,
    belowPrecision: true,
    pending: true,
    ambiguous: true,
    unavailable: true,
  }

  function turnUsageQuotaPath(ctx) {
    const base = ctx.app && typeof ctx.app.pluginDataDir === "string"
      ? ctx.app.pluginDataDir
      : "."
    return joinPath(base, TURN_USAGE_QUOTA_FILE)
  }

  function turnUsageQuotaAccountKey(ctx, accountId) {
    const raw = typeof accountId === "string" ? accountId.trim() : ""
    if (!raw) return "unknown"
    try {
      if (ctx.host.crypto && typeof ctx.host.crypto.sha256Hex === "function") {
        return "sha256:" + String(ctx.host.crypto.sha256Hex(raw)).slice(0, 64)
      }
    } catch (e) {
      ctx.host.log.warn("weekly quota account hash failed: " + String(e))
    }
    // Deterministic non-reversible fallback for hosts without crypto support.
    let hash = 2166136261
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return "fnv1a:" + (hash >>> 0).toString(16)
  }

  function turnUsageQuotaNowIso() {
    try {
      return new Date(Date.now()).toISOString()
    } catch (e) {
      return null
    }
  }

  function turnUsageQuotaPrecision(value) {
    if (value == null) return null
    const raw = String(value).trim()
    if (!raw || !Number.isFinite(Number(raw))) return null
    const mantissa = raw.toLowerCase().split("e")[0]
    const dot = mantissa.indexOf(".")
    if (dot < 0) return 1
    const decimals = mantissa.length - dot - 1
    if (decimals <= 0) return 1
    return Math.pow(10, -Math.min(decimals, 6))
  }

  function turnUsageQuotaNumber(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }

  function turnUsageQuotaSample(data, resp, ctx, nowSec) {
    const rateLimit = data && data.rate_limit && typeof data.rate_limit === "object"
      ? data.rate_limit
      : null
    const primary = rateLimit && rateLimit.primary_window ? rateLimit.primary_window : null
    const secondary = rateLimit && rateLimit.secondary_window ? rateLimit.secondary_window : null
    const headers = resp && resp.headers && typeof resp.headers === "object" ? resp.headers : {}
    const headerSecondary = headers["x-codex-secondary-used-percent"]
    const windows = [primary, secondary]
    let weekly = null
    for (let i = 0; i < windows.length; i++) {
      if (codexWindowSeconds(windows[i]) === 604800) {
        weekly = windows[i]
        break
      }
    }
    // Older payloads omitted duration metadata but kept secondary as weekly.
    if (!weekly && secondary && codexWindowSeconds(secondary) !== 18000) weekly = secondary
    if (!weekly && headerSecondary != null && (!secondary || codexWindowSeconds(secondary) !== 18000)) {
      weekly = { used_percent: headerSecondary }
    }

    let rawUsed = weekly && weekly.used_percent != null ? weekly.used_percent : null
    if (rawUsed == null && weekly === secondary) rawUsed = headerSecondary
    const used = turnUsageQuotaNumber(rawUsed)
    if (used === null) {
      return {
        used: null,
        precision: null,
        resetAt: null,
        resetKey: null,
        sampledAt: turnUsageQuotaNowIso(),
      }
    }
    return {
      used: used,
      precision: turnUsageQuotaPrecision(rawUsed),
      resetAt: getResetsAtIso(ctx, nowSec, weekly),
      resetKey: weekly && weekly.reset_at != null ? String(weekly.reset_at) : null,
      sampledAt: turnUsageQuotaNowIso(),
    }
  }

  function turnUsageQuotaEmptyObservation(status, reason, subagentCount) {
    return {
      status: TURN_USAGE_QUOTA_STATUSES[status] ? status : "unavailable",
      usedBefore: null,
      usedAfter: null,
      delta: null,
      precision: null,
      resetAt: null,
      subagentCount: Number.isFinite(subagentCount) && subagentCount >= 0 ? Math.floor(subagentCount) : 0,
      reason: String(reason || "unavailable").slice(0, 160),
    }
  }

  function turnUsageQuotaObservation(raw, fallbackSubagentCount) {
    const source = raw && typeof raw === "object" ? raw : {}
    const status = TURN_USAGE_QUOTA_STATUSES[source.status] ? source.status : "unavailable"
    const subagentCount = Number.isFinite(Number(source.subagentCount)) && Number(source.subagentCount) >= 0
      ? Math.min(100, Math.floor(Number(source.subagentCount)))
      : (fallbackSubagentCount || 0)
    const result = {
      status: status,
      usedBefore: turnUsageQuotaNumber(source.usedBefore),
      usedAfter: turnUsageQuotaNumber(source.usedAfter),
      delta: source.delta == null ? null : Number(source.delta),
      precision: source.precision == null ? null : Number(source.precision),
      resetAt: typeof source.resetAt === "string" && source.resetAt ? source.resetAt.slice(0, 80) : null,
      subagentCount: subagentCount,
      reason: typeof source.reason === "string" && source.reason ? source.reason.slice(0, 160) : "unavailable",
    }
    if (!Number.isFinite(result.delta)) result.delta = null
    if (!Number.isFinite(result.precision) || result.precision <= 0) result.precision = null
    return result
  }

  function turnUsageQuotaDefaultState(accountKey) {
    return {
      version: TURN_USAGE_QUOTA_STATE_VERSION,
      accountKey: accountKey || "unknown",
      baseline: null,
      lastSample: null,
      trackingStartedAt: null,
      watermark: null,
      seen: {},
      observations: {},
    }
  }

  function turnUsageQuotaSampleValid(sample) {
    return !!(
      sample &&
      turnUsageQuotaNumber(sample.used) !== null &&
      typeof sample.sampledAt === "string" &&
      sample.sampledAt
    )
  }

  function turnUsageQuotaNormalizeWatermark(value) {
    if (!value || typeof value !== "object") return null
    const startedAt = turnUsageReadString(value.startedAt)
    if (!startedAt || !turnUsageTimestampMs(startedAt)) return null
    const keys = []
    const rawKeys = Array.isArray(value.keys) ? value.keys : []
    for (let i = 0; i < rawKeys.length && keys.length < TURN_USAGE_QUOTA_MAX_SEEN; i++) {
      const key = turnUsageReadString(rawKeys[i])
      if (key && keys.indexOf(key) === -1) keys.push(key)
    }
    const legacySessionId = turnUsageReadString(value.sessionId)
    const legacyTurnId = turnUsageReadString(value.turnId)
    const legacyKey = legacySessionId && legacyTurnId ? legacySessionId + ":" + legacyTurnId : null
    if (legacyKey && keys.length < TURN_USAGE_QUOTA_MAX_SEEN && keys.indexOf(legacyKey) === -1) {
      keys.push(legacyKey)
    }
    return { startedAt: startedAt, keys: keys }
  }

  function turnUsageQuotaAdvanceWatermark(value, roots) {
    const current = turnUsageQuotaNormalizeWatermark(value)
    let latestAt = current ? current.startedAt : null
    let latestMs = turnUsageTimestampMs(latestAt)
    let keys = current ? current.keys.slice() : []
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]
      const startedAtMs = turnUsageTimestampMs(root.startedAt)
      if (!startedAtMs || startedAtMs < latestMs) continue
      if (startedAtMs > latestMs) {
        latestAt = root.startedAt
        latestMs = startedAtMs
        keys = []
      }
      // ponytail: exact-timestamp ties share the seen-cache ceiling; raise both limits together if Codex can exceed it.
      if (keys.length < TURN_USAGE_QUOTA_MAX_SEEN && keys.indexOf(root.key) === -1) keys.push(root.key)
    }
    return latestMs ? { startedAt: latestAt, keys: keys } : null
  }

  function turnUsageQuotaRootAfterWatermark(root, watermark) {
    const rootStartedAtMs = turnUsageTimestampMs(root.startedAt)
    const watermarkStartedAtMs = turnUsageTimestampMs(watermark && watermark.startedAt)
    if (!watermarkStartedAtMs) return true
    if (rootStartedAtMs !== watermarkStartedAtMs) return rootStartedAtMs > watermarkStartedAtMs
    return !Array.isArray(watermark.keys) || watermark.keys.indexOf(root.key) === -1
  }

  function turnUsageQuotaLoadState(ctx, accountKey) {
    const path = turnUsageQuotaPath(ctx)
    const fallback = turnUsageQuotaDefaultState(accountKey)
    try {
      if (!ctx.host.fs.exists(path)) return { path: path, state: fallback, initialized: false }
      const parsed = JSON.parse(ctx.host.fs.readText(path))
      const migrating = !!(parsed && TURN_USAGE_QUOTA_STATE_VERSION === 3 && parsed.version === 2)
      if (!parsed || (parsed.version !== TURN_USAGE_QUOTA_STATE_VERSION && !migrating)) {
        return { path: path, state: fallback, initialized: false }
      }
      if (parsed.accountKey && parsed.accountKey !== accountKey) {
        return { path: path, state: fallback, initialized: false }
      }
      const state = turnUsageQuotaDefaultState(accountKey)
      state.baseline = !migrating && turnUsageQuotaSampleValid(parsed.baseline) ? parsed.baseline : null
      state.lastSample = !migrating && turnUsageQuotaSampleValid(parsed.lastSample) ? parsed.lastSample : null
      state.trackingStartedAt = migrating ? null : turnUsageReadString(parsed.trackingStartedAt)
      state.watermark = migrating ? null : turnUsageQuotaNormalizeWatermark(parsed.watermark)
      const seen = parsed.seen && typeof parsed.seen === "object" ? parsed.seen : {}
      const observations = parsed.observations && typeof parsed.observations === "object"
        ? parsed.observations
        : {}
      const seenKeys = Object.keys(seen)
      for (let i = 0; i < seenKeys.length; i++) {
        const key = seenKeys[i]
        const item = seen[key]
        if (!item || typeof item !== "object") continue
        const sessionId = turnUsageReadString(item.sessionId)
        const turnId = turnUsageReadString(item.turnId)
        if (!sessionId || !turnId) continue
        if (migrating && turnId.indexOf("#pending-") !== -1) continue
        state.seen[key] = {
          sessionId: sessionId.slice(0, 240),
          turnId: turnId.slice(0, 240),
          startedAt: turnUsageReadString(item.startedAt),
          completedAt: turnUsageReadString(item.completedAt),
          seenAt: turnUsageReadString(item.seenAt),
          subagentCount: Number.isFinite(Number(item.subagentCount))
            ? Math.min(100, Math.max(0, Math.floor(Number(item.subagentCount))))
            : 0,
        }
      }
      const observationKeys = Object.keys(observations)
      for (let i = 0; i < observationKeys.length; i++) {
        const key = observationKeys[i]
        if (!state.seen[key]) continue
        state.observations[key] = turnUsageQuotaObservation(observations[key], state.seen[key].subagentCount)
        const raw = observations[key]
        if (raw && typeof raw === "object" && Number.isFinite(Number(raw._stableCount))) {
          state.observations[key]._stableCount = Math.max(0, Math.min(2, Math.floor(Number(raw._stableCount))))
        }
      }
      turnUsageQuotaTrimState(state)
      if (migrating) ctx.host.log.info("weekly quota state migrated from version 2 to 3")
      return { path: path, state: state, initialized: true }
    } catch (e) {
      ctx.host.log.warn("weekly quota state read failed: " + String(e))
      return { path: path, state: fallback, initialized: false }
    }
  }

  function turnUsageQuotaTrimState(state) {
    const seenKeys = Object.keys(state.seen || {})
    seenKeys.sort(function (a, b) {
      return turnUsageTimestampMs(state.seen[b].seenAt) - turnUsageTimestampMs(state.seen[a].seenAt)
    })
    for (let i = TURN_USAGE_QUOTA_MAX_SEEN; i < seenKeys.length; i++) {
      delete state.seen[seenKeys[i]]
      delete state.observations[seenKeys[i]]
    }

    const observationKeys = Object.keys(state.observations || {})
    observationKeys.sort(function (a, b) {
      return turnUsageTimestampMs(state.seen[b] && state.seen[b].seenAt) -
        turnUsageTimestampMs(state.seen[a] && state.seen[a].seenAt)
    })
    for (let i = TURN_USAGE_QUOTA_MAX_OBSERVATIONS; i < observationKeys.length; i++) {
      delete state.observations[observationKeys[i]]
    }
  }

  function turnUsageQuotaWriteState(ctx, loaded) {
    const state = loaded.state
    turnUsageQuotaTrimState(state)
    try {
      if (ctx.host.fs && typeof ctx.host.fs.writeText === "function") {
        ctx.host.fs.writeText(loaded.path, JSON.stringify(state))
      }
    } catch (e) {
      ctx.host.log.warn("weekly quota state write failed: " + String(e))
    }
  }

  function turnUsageQuotaReadExisting(ctx, groups) {
    const byKey = {}
    try {
      const path = turnUsageQuotaPath(ctx)
      if (!ctx.host.fs.exists(path)) return byKey
      const parsed = JSON.parse(ctx.host.fs.readText(path))
      const readableLegacy = !!(parsed && TURN_USAGE_QUOTA_STATE_VERSION === 3 && parsed.version === 2)
      if (!parsed || (parsed.version !== TURN_USAGE_QUOTA_STATE_VERSION && !readableLegacy) || !parsed.observations) return byKey
      const roots = turnUsageQuotaRootPrompts(groups)
      for (let i = 0; i < roots.length; i++) {
        const root = roots[i]
        const observation = parsed.observations[root.key]
        if (observation) byKey[root.key] = turnUsageQuotaObservation(observation, root.subagentCount)
      }
    } catch (e) {
      ctx.host.log.warn("weekly quota state read failed: " + String(e))
    }
    return byKey
  }

  function turnUsageQuotaRootPrompts(groups) {
    const roots = []
    for (let i = 0; i < groups.length; i++) {
      const sessions = Array.isArray(groups[i].sessions) ? groups[i].sessions : []
      for (let j = 0; j < sessions.length; j++) {
        const session = sessions[j]
        const prompts = Array.isArray(session.prompts) ? session.prompts : []
        for (let k = 0; k < prompts.length; k++) {
          const prompt = prompts[k]
          const sessionId = turnUsageReadString(session.id)
          const turnId = turnUsageReadString(prompt.id)
          if (!sessionId || !turnId) continue
          let subagentCount = 0
          const agents = Array.isArray(prompt.agents) ? prompt.agents : []
          for (let n = 0; n < agents.length; n++) {
            if (agents[n] && agents[n].kind === "subagent") subagentCount += 1
          }
          roots.push({
            key: sessionId + ":" + turnId,
            sessionId: sessionId,
            turnId: turnId,
            startedAt: prompt.startedAt || null,
            completedAt: prompt.completedAt || null,
            subagentCount: subagentCount,
            agentCount: agents.length,
          })
        }
      }
    }
    return roots
  }

  function turnUsageQuotaIntervalsOverlap(first, second) {
    const firstStart = turnUsageTimestampMs(first.startedAt)
    const secondStart = turnUsageTimestampMs(second.startedAt)
    if (!firstStart || !secondStart) return false
    const firstEnd = turnUsageTimestampMs(first.completedAt) || Infinity
    const secondEnd = turnUsageTimestampMs(second.completedAt) || Infinity
    return firstStart < secondEnd && secondStart < firstEnd
  }

  function turnUsageQuotaResetChanged(before, after) {
    if (!before || !after) return false
    if (before.resetKey || after.resetKey) return before.resetKey !== after.resetKey
    return false
  }

  function turnUsageQuotaPrecisionFor(before, after) {
    const values = [before && before.precision, after && after.precision]
      .filter(function (value) { return Number.isFinite(value) && value > 0 })
    return values.length > 0 ? Math.min.apply(null, values) : null
  }

  function turnUsageQuotaSetObservation(state, root, observation) {
    const normalized = turnUsageQuotaObservation(observation, root.subagentCount)
    if (observation && Number.isFinite(Number(observation._stableCount))) {
      normalized._stableCount = Math.max(0, Math.min(2, Math.floor(Number(observation._stableCount))))
    }
    state.observations[root.key] = normalized
    const output = turnUsageQuotaObservation(normalized, root.subagentCount)
    return output
  }

  function turnUsageQuotaProcess(ctx, groups, sample, accountKey) {
    const loaded = turnUsageQuotaLoadState(ctx, accountKey || "unknown")
    const state = loaded.state
    const allRoots = turnUsageQuotaRootPrompts(groups)
    const publicByKey = {}
    for (let i = 0; i < allRoots.length; i++) {
      const root = allRoots[i]
      const observation = state.observations[root.key]
      if (observation) publicByKey[root.key] = turnUsageQuotaObservation(observation, root.subagentCount)
    }
    const sampleIsValid = turnUsageQuotaSampleValid(sample)
    const previousSample = turnUsageQuotaSampleValid(state.lastSample) ? state.lastSample : null
    const baselineExists = turnUsageQuotaSampleValid(state.baseline)

    // The first observation is intentionally a baseline and watermark. It
    // never creates historical measurements for prompts already in the logs.
    if (!baselineExists) {
      state.baseline = sampleIsValid ? sample : null
      state.lastSample = sampleIsValid ? sample : null
      const sampledAtMs = turnUsageTimestampMs(sampleIsValid ? sample.sampledAt : turnUsageQuotaNowIso())
      let latestRootStartedAtMs = 0
      if (allRoots.length > 0) {
        const latest = allRoots.slice().sort(function (a, b) {
          return turnUsageTimestampMs(b.startedAt) - turnUsageTimestampMs(a.startedAt)
        })[0]
        latestRootStartedAtMs = turnUsageTimestampMs(latest.startedAt)
      }
      state.watermark = turnUsageQuotaAdvanceWatermark(null, allRoots)
      state.trackingStartedAt = new Date(Math.max(sampledAtMs, latestRootStartedAtMs)).toISOString()
      turnUsageQuotaWriteState(ctx, loaded)
      return publicByKey
    }

    // Only prompts that actually started after the first quota sample are
    // eligible. Historical logs must not enter the bounded `seen` cache:
    // evicted old prompts would otherwise be rediscovered as new on every
    // probe and incorrectly classified as concurrent/ambiguous work. The
    // watermark applies the same rule to post-baseline roots evicted later.
    const trackingStartedMs = turnUsageTimestampMs(state.trackingStartedAt || state.baseline.sampledAt)
    const eligibleRoots = allRoots.filter(function (root) {
      const startedAtMs = turnUsageTimestampMs(root.startedAt)
      return trackingStartedMs > 0 && startedAtMs > trackingStartedMs
    })
    const rootsAfterWatermark = eligibleRoots.filter(function (root) {
      return turnUsageQuotaRootAfterWatermark(root, state.watermark)
    })
    const rootsAfterWatermarkKeys = new Set(rootsAfterWatermark.map(function (root) { return root.key }))
    const roots = eligibleRoots.filter(function (root) {
      return !!state.seen[root.key] || rootsAfterWatermarkKeys.has(root.key)
    })

    const newRoots = []
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]
      if (!state.seen[root.key]) newRoots.push(root)
      const old = state.seen[root.key]
      state.seen[root.key] = {
        sessionId: root.sessionId,
        turnId: root.turnId,
        startedAt: root.startedAt,
        completedAt: root.completedAt,
        seenAt: old && old.seenAt ? old.seenAt : turnUsageQuotaNowIso(),
        subagentCount: root.subagentCount,
      }
    }

    const resetChanged = turnUsageQuotaResetChanged(previousSample, sample)
    const usageDecreased = !!(
      sampleIsValid && previousSample && sample.used < previousSample.used
    )
    const multipleNewRoots = newRoots.length > 1
    const overlapFor = function (root) {
      for (let i = 0; i < eligibleRoots.length; i++) {
        if (eligibleRoots[i].key === root.key) continue
        if (turnUsageQuotaIntervalsOverlap(root, eligibleRoots[i])) return true
      }
      return false
    }

    for (let i = 0; i < newRoots.length; i++) {
      const root = newRoots[i]
      let observation
      if (!sampleIsValid) {
        observation = turnUsageQuotaEmptyObservation("unavailable", "no_weekly_window", root.subagentCount)
      } else if (resetChanged || usageDecreased) {
        observation = turnUsageQuotaEmptyObservation("unavailable", resetChanged ? "weekly_reset_changed" : "usage_decreased", root.subagentCount)
        observation.resetAt = sample.resetAt
      } else if (multipleNewRoots) {
        observation = turnUsageQuotaEmptyObservation("ambiguous", "multiple_prompts_between_samples", root.subagentCount)
        observation.resetAt = sample.resetAt
      } else if (overlapFor(root)) {
        observation = turnUsageQuotaEmptyObservation("ambiguous", "overlapping_root_tasks", root.subagentCount)
        observation.resetAt = sample.resetAt
      } else if (!previousSample) {
        observation = turnUsageQuotaEmptyObservation("unavailable", "no_pre_prompt_sample", root.subagentCount)
        observation.resetAt = sample.resetAt
      } else if (!root.completedAt) {
        observation = turnUsageQuotaEmptyObservation("pending", "awaiting_completion", root.subagentCount)
        observation.usedBefore = previousSample.used
        observation.usedAfter = sample.used
        observation.precision = turnUsageQuotaPrecisionFor(previousSample, sample)
        observation.resetAt = sample.resetAt
        observation._stableCount = 0
      } else {
        observation = turnUsageQuotaEmptyObservation("pending", "awaiting_stable_sample", root.subagentCount)
        observation.usedBefore = previousSample.used
        observation.usedAfter = sample.used
        observation.precision = turnUsageQuotaPrecisionFor(previousSample, sample)
        observation.resetAt = sample.resetAt
        observation._stableCount = 0
      }
      publicByKey[root.key] = turnUsageQuotaSetObservation(state, root, observation)
    }

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]
      if (newRoots.some(function (candidate) { return candidate.key === root.key })) continue
      const current = state.observations[root.key]
      if (!current || current.status !== "pending") {
        if (current) publicByKey[root.key] = turnUsageQuotaObservation(current, root.subagentCount)
        continue
      }
      let next = turnUsageQuotaObservation(current, root.subagentCount)
      if (!sampleIsValid) {
        next = turnUsageQuotaEmptyObservation("unavailable", "no_weekly_window", root.subagentCount)
      } else if (resetChanged || (next.usedAfter !== null && sample.used < next.usedAfter)) {
        next = turnUsageQuotaEmptyObservation("unavailable", resetChanged ? "weekly_reset_changed" : "usage_decreased", root.subagentCount)
        next.resetAt = sample.resetAt
      } else if (overlapFor(root)) {
        next = turnUsageQuotaEmptyObservation("ambiguous", "overlapping_root_tasks", root.subagentCount)
        next.resetAt = sample.resetAt
      } else if (!root.completedAt) {
        next.reason = "awaiting_completion"
      } else if (current.reason === "awaiting_completion") {
        // The first sample observed after completion is the post-completion
        // value; require one more unchanged sample before settling it.
        next.usedAfter = sample.used
        next.precision = turnUsageQuotaPrecisionFor({ precision: next.precision }, sample)
        next.resetAt = sample.resetAt
        next._stableCount = 0
        next.reason = "awaiting_stable_sample"
      } else if (next.usedAfter !== null && sample.used === next.usedAfter && next.resetAt === sample.resetAt) {
        next._stableCount = Math.max(0, Number(current._stableCount) || 0) + 1
        if (next._stableCount >= 1) {
          next.delta = sample.used - next.usedBefore
          next.precision = turnUsageQuotaPrecisionFor({ precision: next.precision }, sample)
          next.usedAfter = sample.used
          next.resetAt = sample.resetAt
          if (next.delta === 0) {
            next.status = "belowPrecision"
            next.reason = "zero_delta_below_precision"
          } else {
            next.status = "measured"
            next.reason = "single_root_prompt"
          }
        } else {
          next.reason = "awaiting_stable_sample"
        }
      } else {
        next.usedAfter = sample.used
        next.precision = turnUsageQuotaPrecisionFor({ precision: next.precision }, sample)
        next.resetAt = sample.resetAt
        next._stableCount = 0
        next.reason = "awaiting_stable_sample"
      }
      publicByKey[root.key] = turnUsageQuotaSetObservation(state, root, next)
    }

    if (sampleIsValid) state.lastSample = sample
    state.watermark = turnUsageQuotaAdvanceWatermark(state.watermark, rootsAfterWatermark)
    turnUsageQuotaWriteState(ctx, loaded)
    return publicByKey
  }

  function combineCostLines(estimates) {
    if (!estimates.every(function (estimate) { return estimate && Array.isArray(estimate.costLines) })) return null
    const grouped = new Map()
    for (const estimate of estimates) {
      for (const line of estimate.costLines) {
        const key = JSON.stringify([line.model, line.rates, line.estimationStatus, line.observedAt, line.issues])
        const previous = grouped.get(key)
        if (!previous) {
          grouped.set(key, { ...line, tokens: { ...line.tokens }, fees: { ...line.fees } })
          continue
        }
        for (const category of Object.keys(line.tokens)) previous.tokens[category] += line.tokens[category]
        for (const category of Object.keys(line.fees)) previous.fees[category] += line.fees[category]
        previous.costUsd = previous.costUsd == null || line.costUsd == null ? null : previous.costUsd + line.costUsd
      }
    }
    return Array.from(grouped.values())
  }

  function combineCostEstimates(estimates) {
    if (!Array.isArray(estimates) || estimates.length === 0) {
      return { costUsd: null, costBreakdown: null, estimationStatus: "unknown", observedAt: null, costLines: null }
    }
    const costBreakdown = { inputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, outputUsd: 0 }
    const costLines = combineCostLines(estimates)
    let estimationStatus = "historical_rate"
    let observedAt = null
    let hasPricedEstimate = false
    let hasUnpricedEstimate = false
    for (let i = 0; i < estimates.length; i++) {
      const estimate = estimates[i]
      if (!estimate || estimate.costUsd == null || estimate.estimationStatus === "unknown") {
        hasUnpricedEstimate = true
        continue
      }
      hasPricedEstimate = true
      for (const key of Object.keys(costBreakdown)) costBreakdown[key] += estimate.costBreakdown[key]
      if (estimate.estimationStatus === "partial_rate") hasUnpricedEstimate = true
      if (estimate.estimationStatus === "current_rate") estimationStatus = "current_rate"
      observedAt = observedAt || estimate.observedAt
    }
    if (!hasPricedEstimate) return { costUsd: null, costBreakdown: null, estimationStatus: "unknown", observedAt: null, costLines: costLines }
    if (hasUnpricedEstimate) estimationStatus = "partial_rate"
    return { costUsd: Object.values(costBreakdown).reduce(function (sum, value) { return sum + value }, 0), costBreakdown: costBreakdown, estimationStatus: estimationStatus, observedAt: observedAt, costLines: costLines }
  }

  function turnUsageEstimatePromptCost(ctx, prompt) {
    const agents = Array.isArray(prompt && prompt.agents) ? prompt.agents : []
    return combineCostEstimates(agents.map(function (agent) {
      return estimateModelsCost(ctx, agent.models, prompt.startedAt, true)
    }))
  }

  function turnUsageEstimateSessionCost(ctx, session) {
    const prompts = Array.isArray(session && session.prompts) ? session.prompts : []
    return combineCostEstimates(prompts.map(function (prompt) {
      return turnUsageEstimatePromptCost(ctx, prompt)
    }))
  }

  function turnUsagePushSessionLines(lines, ctx, session, quotaByKey) {
    const sessionEstimate = turnUsageEstimateSessionCost(ctx, session)
    lines.push(ctx.line.text({
      label: "Session",
      value: session.title,
      subtitle: turnUsageJson({
        id: session.id,
        createdAt: session.createdAt || null,
        descendantThreadIds: session.descendantThreadIds || [],
        latestAt: session.latestAt,
        promptCount: session.promptCount,
        isActive: !!session.isActive,
        isDelegated: !!session.isDelegated,
        relatedSourceId: session.relatedSourceId || null,
        relatedSourceTitle: session.relatedSourceTitle || null,
        relatedTaskCount: Number.isFinite(session.relatedTaskCount) ? session.relatedTaskCount : 0,
        relatedTasks: Array.isArray(session.relatedTasks) ? session.relatedTasks : [],
        codexOrder: Number.isFinite(session.codexOrder) ? session.codexOrder : null,
        costUsd: sessionEstimate.costUsd,
        costBreakdown: sessionEstimate.costBreakdown,
        costLines: sessionEstimate.costLines,
        estimationStatus: sessionEstimate.estimationStatus,
      }),
    }))
    for (let i = 0; i < session.prompts.length; i++) {
      const prompt = session.prompts[i]
      const normalizedPrompt = turnUsageNormalizePrompt(prompt.prompt)
      const promptEstimate = turnUsageEstimatePromptCost(ctx, prompt)
      const promptMeta = {
        id: prompt.id,
        startedAt: prompt.startedAt,
        completedAt: prompt.completedAt || null,
        retriedFromStartedAt: prompt.retriedFromStartedAt || null,
        isActive: !!prompt.isActive,
        interrupted: !!prompt.interrupted,
        tokenUsageRecorded: !!prompt.tokenUsageRecorded,
        sourceThreadId: prompt.sourceThreadId || null,
        isDelegated: !!prompt.isDelegated,
        outgoingTasks: Array.isArray(prompt.outgoingTasks) ? prompt.outgoingTasks : [],
        timeLabel: turnUsageDateLabel(prompt.startedAt),
        model: prompt.model || null,
        reasoningEfforts: prompt.reasoningEfforts || [],
        usage: prompt.usage,
        agentCount: prompt.agents.length,
        costUsd: promptEstimate.costUsd,
        costBreakdown: promptEstimate.costBreakdown,
        costLines: promptEstimate.costLines,
        estimationStatus: promptEstimate.estimationStatus,
      }
      const quotaObservation = quotaByKey && quotaByKey[session.id + ":" + prompt.id]
      if (quotaObservation) promptMeta.quotaObservation = quotaObservation
      lines.push(ctx.line.text({
        label: "Prompt",
        value: normalizedPrompt || "Skill invocation",
        subtitle: turnUsageJson(promptMeta),
      }))
      for (let j = 0; j < prompt.agents.length; j++) {
        const agent = prompt.agents[j]
        const agentEstimate = estimateModelsCost(ctx, agent.models, prompt.startedAt, true)
        lines.push(ctx.line.text({
          label: "Agent",
          value: agent.name,
          subtitle: turnUsageJson({
            id: agent.id,
            kind: agent.kind,
            role: agent.role,
            usage: agent.usage,
            models: agent.models,
            costUsd: agentEstimate.costUsd,
            costBreakdown: agentEstimate.costBreakdown,
            costLines: agentEstimate.costLines,
            estimationStatus: agentEstimate.estimationStatus,
          }),
        }))
      }
    }
  }

  function pushRecentPromptUsageLines(lines, ctx, quotaSample, accountKey, updateQuota) {
    try {
      const sessions = turnUsageLoadAllSessions(ctx)
      const catalog = turnUsageLoadCodexUiCatalog(ctx)
      const groups = turnUsageBuildDisplayGroups(sessions, catalog)
      const quotaByKey = updateQuota === false
        ? turnUsageQuotaReadExisting(ctx, groups)
        : turnUsageQuotaProcess(ctx, groups, quotaSample, accountKey)
      if (groups.length === 0 && updateQuota !== false) return

      let promptCount = 0
      let sessionCount = 0
      for (let i = 0; i < groups.length; i++) {
        promptCount += groups[i].promptCount
        sessionCount += groups[i].sessionCount
      }

      lines.push(ctx.line.text({
        label: "Prompt Usage",
        value: promptCount + (promptCount === 1 ? " prompt" : " prompts") + " · " +
          sessionCount + (sessionCount === 1 ? " session" : " sessions"),
        subtitle: "Attributed from local Codex session logs",
      }))

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        lines.push(ctx.line.text({
          label: "Project Group",
          value: group.name,
          subtitle: turnUsageJson({
            id: group.id,
            kind: group.kind,
            latestAt: group.latestAt,
            sessionCount: group.sessionCount,
            promptCount: group.promptCount,
            isActive: !!group.isActive,
            codexOrder: Number.isFinite(group.codexOrder) ? group.codexOrder : null,
          }),
        }))
        for (let j = 0; j < group.sessions.length; j++) {
          turnUsagePushSessionLines(lines, ctx, group.sessions[j], quotaByKey)
        }
      }

      ctx.host.log.info("prompt usage loaded: prompts=" + promptCount + " sessions=" + sessionCount)
    } catch (e) {
      ctx.host.log.warn("prompt usage parse failed: " + String(e))
      throw e
    }
  }
  // ONE_MORE_PROMPT_TURN_USAGE_PATCH_END
  function pushDayUsageLine(lines, ctx, label, dayEntry) {
    const tokens = Number(dayEntry && dayEntry.totalTokens) || 0
    const cost = estimateDayCost(ctx, dayEntry).costUsd
    if (tokens > 0) {
      lines.push(ctx.line.text({
        label: label,
        value: costAndTokensLabel({ tokens: tokens, costUSD: cost })
      }))
      return
    }

    lines.push(ctx.line.text({
      label: label,
      value: costAndTokensLabel({ tokens: 0, costUSD: 0 }, { includeZeroTokens: true })
    }))
  }

  function probeWithAuthState(ctx, initialAuthState, options = {}) {
    let authState = initialAuthState
    let auth = authState.auth

    if (auth.tokens && auth.tokens.access_token) {
      const current = reloadAuthState(ctx, authState)
      if (current.status === "error") throw current.error
      authState = current.authState
      auth = authState.auth
      let accessToken = auth.tokens.access_token
      let accountId = auth.tokens.account_id
      let resp
      try {
        resp = ctx.util.retryOnceOnAuth({
          request: token => fetchUsage(ctx, token || accessToken, accountId),
          // Codex owns shared credentials and refresh-token rotation.
          refresh: () => {
            const reload = reloadAuthState(ctx, authState)
            if (reload.status === "error") throw reload.error
            if (reload.status !== "changed") return null
            authState = reload.authState
            auth = authState.auth
            accessToken = auth.tokens.access_token
            accountId = auth.tokens.account_id
            ctx.host.log.info("usage returned 401, retrying with newer Codex sign-in")
            return accessToken
          },
        })
      } catch (e) {
        if (typeof e === "string") throw e
        ctx.host.log.error("usage request failed: " + String(e))
        throw ERR_USAGE_CONNECTION
      }

      if (ctx.util.isAuthStatus(resp.status)) {
        ctx.host.log.error("usage returned auth error after all retries: status=" + resp.status)
        throw ERR_TOKEN_EXPIRED
      }

      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.error("usage returned error: status=" + resp.status)
        throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
      }

      ctx.host.log.info("usage fetch succeeded")

      const data = ctx.util.tryParseJson(resp.bodyText)
      if (data === null) {
        throw "Usage response invalid. Try again later."
      }

      const lines = []
      const nowSec = Math.floor(Date.now() / 1000)
      const rateLimit = data.rate_limit || null
      const primaryWindow = rateLimit && rateLimit.primary_window ? rateLimit.primary_window : null
      const secondaryWindow = rateLimit && rateLimit.secondary_window ? rateLimit.secondary_window : null
      const reviewWindow =
        data.code_review_rate_limit && data.code_review_rate_limit.primary_window
          ? data.code_review_rate_limit.primary_window
          : null

      const responseHeaders = resp.headers && typeof resp.headers === "object" ? resp.headers : {}
      const headerPrimary = readPercent(responseHeaders["x-codex-primary-used-percent"])
      const headerSecondary = readPercent(responseHeaders["x-codex-secondary-used-percent"])
      const primaryMetric = codexWindowMetric(primaryWindow, "Session", PERIOD_SESSION_MS)
      const secondaryMetric = codexWindowMetric(secondaryWindow, "Weekly", PERIOD_WEEKLY_MS)
      if (headerPrimary !== null) {
        lines.push(ctx.line.progress({
          label: primaryMetric.label,
          used: headerPrimary,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: getResetsAtIso(ctx, nowSec, primaryWindow),
          periodDurationMs: primaryMetric.periodDurationMs
        }))
      }
      if (headerSecondary !== null) {
        lines.push(ctx.line.progress({
          label: secondaryMetric.label,
          used: headerSecondary,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: getResetsAtIso(ctx, nowSec, secondaryWindow),
          periodDurationMs: secondaryMetric.periodDurationMs
        }))
      }

      if (lines.length === 0 && data.rate_limit) {
        const bodyPrimary = readPercent(data.rate_limit.primary_window && data.rate_limit.primary_window.used_percent)
        const bodySecondary = readPercent(data.rate_limit.secondary_window && data.rate_limit.secondary_window.used_percent)
        if (data.rate_limit.primary_window && bodyPrimary !== null) {
          lines.push(ctx.line.progress({
            label: primaryMetric.label,
            used: bodyPrimary,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, primaryWindow),
            periodDurationMs: primaryMetric.periodDurationMs
          }))
        }
        if (data.rate_limit.secondary_window && bodySecondary !== null) {
          lines.push(ctx.line.progress({
            label: secondaryMetric.label,
            used: bodySecondary,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, secondaryWindow),
            periodDurationMs: secondaryMetric.periodDurationMs
          }))
        }
      }

      if (Array.isArray(data.additional_rate_limits)) {
        for (const entry of data.additional_rate_limits) {
          if (!entry || !entry.rate_limit) continue
          const name = typeof entry.limit_name === "string" ? entry.limit_name : ""
          let shortName = name.replace(/^GPT-[\d.]+-Codex-/, "")
          if (!shortName) shortName = name || "Model"
          const rl = entry.rate_limit
          const modelPrimary = readPercent(rl.primary_window && rl.primary_window.used_percent)
          const modelSecondary = readPercent(rl.secondary_window && rl.secondary_window.used_percent)
          if (rl.primary_window && modelPrimary !== null) {
            const primaryModelMetric = codexWindowMetric(rl.primary_window, "Session", PERIOD_SESSION_MS)
            lines.push(ctx.line.progress({
              label: codexAdditionalWindowLabel(shortName, primaryModelMetric, ""),
              used: modelPrimary,
              limit: 100,
              format: { kind: "percent" },
              resetsAt: getResetsAtIso(ctx, nowSec, rl.primary_window),
              periodDurationMs: primaryModelMetric.periodDurationMs
            }))
          }
          if (rl.secondary_window && modelSecondary !== null) {
            const secondaryModelMetric = codexWindowMetric(rl.secondary_window, "Weekly", PERIOD_WEEKLY_MS)
            lines.push(ctx.line.progress({
              label: codexAdditionalWindowLabel(shortName, secondaryModelMetric, " Weekly"),
              used: modelSecondary,
              limit: 100,
              format: { kind: "percent" },
              resetsAt: getResetsAtIso(ctx, nowSec, rl.secondary_window),
              periodDurationMs: secondaryModelMetric.periodDurationMs
            }))
          }
        }
      }

      if (reviewWindow) {
        const used = readPercent(reviewWindow.used_percent)
        if (used !== null) {
          const reviewMetric = codexWindowMetric(reviewWindow, "Weekly", PERIOD_WEEKLY_MS)
          lines.push(ctx.line.progress({
            label: "Reviews",
            used: used,
            limit: 100,
            format: { kind: "percent" },
            resetsAt: getResetsAtIso(ctx, nowSec, reviewWindow),
            periodDurationMs: reviewMetric.periodDurationMs
          }))
        }
      }

      if (options.rateLimitsOnly) {
        assertAuthUnchanged(ctx, authState)
        return { lines: lines }
      }

      const weeklyQuotaSample = turnUsageQuotaSample(data, resp, ctx, nowSec)

      const resetCreditsInfo = loadRateLimitResetCredits(
        ctx,
        auth.tokens.access_token || accessToken,
        accountId,
        data
      )
      if (resetCreditsInfo) {
        lines.push(ctx.line.text({
          label: "Rate Limit Resets",
          value: resetCreditsInfo.availableCount + " available",
          resetCredits: resetCreditsInfo.resetCredits,
          resetExpiry: resetCreditsInfo.expiryIsos.length > 0
            ? resetCreditsInfo.expiryIsos
            : null,
        }))
      }

      const creditsRemaining = readCreditsRemaining(resp, data)
      if (creditsRemaining !== null) {
        const remaining = Math.max(0, Math.floor(creditsRemaining))
        const usdValue = (remaining * CREDIT_USD_RATE).toFixed(2)
        lines.push(ctx.line.text({
          label: "Credits",
          value: "$" + usdValue + " · " + remaining + " credits",
        }))
      }

      const monthlyCreditLimit = readMonthlyCreditLimit(data)
      if (monthlyCreditLimit) {
        lines.push(ctx.line.progress({
          label: "Monthly Credit Limit",
          used: monthlyCreditLimit.used,
          limit: monthlyCreditLimit.limit,
          format: { kind: "count", suffix: "credits" },
          resetsAt: getResetsAtIso(ctx, nowSec, monthlyCreditLimit.window),
        }))
      }

      let plan = null
      if (data.plan_type) {
        const planLabel = formatCodexPlan(ctx, data.plan_type)
        if (planLabel) {
          plan = planLabel
        }
      }

      const tokenUsageResult = queryTokenUsage(ctx)
      if (tokenUsageResult.daily.status === "ok") {
        const tokenUsage = tokenUsageResult.daily.data
        const now = new Date()
        const todayKey = dayKeyFromDate(now)
        const yesterday = new Date(now.getTime())
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayKey = dayKeyFromDate(yesterday)

        let todayEntry = null
        let yesterdayEntry = null
        for (let i = 0; i < tokenUsage.daily.length; i++) {
          const usageDayKey = dayKeyFromUsageDate(tokenUsage.daily[i].date)
          if (usageDayKey === todayKey) {
            todayEntry = tokenUsage.daily[i]
            continue
          }
          if (usageDayKey === yesterdayKey) {
            yesterdayEntry = tokenUsage.daily[i]
          }
        }

        pushDayUsageLine(lines, ctx, "Today", todayEntry)
        pushDayUsageLine(lines, ctx, "Yesterday", yesterdayEntry)

        const recentSince = new Date(now.getTime())
        recentSince.setDate(recentSince.getDate() - 30)
        const recentSinceKey = dayKeyFromDate(recentSince)
        const recentDaily = tokenUsage.daily.filter((day) => {
          const key = dayKeyFromUsageDate(day && day.date)
          return key && key >= recentSinceKey && key <= todayKey
        })

        let totalTokens = 0
        let totalCostNanos = 0
        let hasCost = false
        let hasUnknownCost = false
        for (let i = 0; i < recentDaily.length; i++) {
          const day = recentDaily[i]
          const dayTokens = Number(day.totalTokens)
          if (Number.isFinite(dayTokens)) {
            totalTokens += dayTokens
          }

          const dayEstimate = estimateDayCost(ctx, day)
          const dayCost = dayEstimate.costUsd
          if (dayCost != null) {
            totalCostNanos += Math.round(dayCost * 1e9)
            hasCost = true
          } else if (dayTokens > 0) {
            hasUnknownCost = true
          }
        }

        if (totalTokens > 0) {
          lines.push(ctx.line.text({
            label: "Last 30 Days",
            value: costAndTokensLabel({
              tokens: totalTokens,
              costUSD: hasCost && !hasUnknownCost ? totalCostNanos / 1e9 : null
            })
          }))
        }

        pushUsageChartLine(lines, ctx, tokenUsage.daily)
        if (tokenUsageResult.hourly.status === "ok") {
          pushUsageHourlyChartLine(lines, ctx, tokenUsageResult.hourly.data.hourly, now)
        } else {
          ctx.host.log.error("ccusage hourly query failed: status=" + tokenUsageResult.hourly.status)
        }
        pushModelUsageLines(lines, ctx, recentDaily, now)
      } else {
        ctx.host.log.error("ccusage daily query failed: status=" + tokenUsageResult.daily.status)
        if (lines.length > 0) {
          lines.push(ctx.line.badge({ label: "Usage History", text: "Unavailable", color: "#a3a3a3" }))
        }
      }

      pushRecentPromptUsageLines(
        lines,
        ctx,
        weeklyQuotaSample,
        turnUsageQuotaAccountKey(ctx, auth.tokens.account_id || accountId)
      )

      if (lines.length === 0) {
        lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
      }

      assertAuthUnchanged(ctx, authState)
      return { plan: plan, lines: lines }
    }

    if (auth.OPENAI_API_KEY) {
      throw ERR_USAGE_API_KEY
    }

    throw ERR_NOT_LOGGED_IN
  }

  function probe(ctx) {
    const fileAuth = loadFileAuthCandidates(ctx)
    let lastAuthFallbackError = null
    for (let i = 0; i < fileAuth.candidates.length; i++) {
      const authState = fileAuth.candidates[i]
      try {
        return probeWithAuthState(ctx, authState)
      } catch (e) {
        if (!isAuthFallbackError(e)) {
          throw e
        }
        lastAuthFallbackError = e
        ctx.host.log.warn("auth failed for file " + authState.authPath + ", trying next auth source: " + String(e))
      }
    }

    const keychainAuth = loadAuthFromKeychain(ctx, fileAuth.fileStates)
    if (keychainAuth) {
      try {
        return probeWithAuthState(ctx, keychainAuth)
      } catch (e) {
        if (!isAuthFallbackError(e)) throw e
        lastAuthFallbackError = e
        ctx.host.log.warn("keychain auth failed: " + String(e))
      }
    }

    if (lastAuthFallbackError) throw lastAuthFallbackError

    for (const authPath of fileAuth.missingPaths) {
      ctx.host.log.warn("auth file not found: " + authPath)
    }

    ctx.host.log.error("probe failed: not logged in")
    throw ERR_NOT_LOGGED_IN
  }

  function probeActive(ctx) {
    const fileAuth = loadFileAuthCandidates(ctx)
    let lastAuthFallbackError = null
    for (let i = 0; i < fileAuth.candidates.length; i++) {
      const authState = fileAuth.candidates[i]
      try {
        return probeWithAuthState(ctx, authState, { rateLimitsOnly: true })
      } catch (e) {
        if (!isAuthFallbackError(e)) throw e
        lastAuthFallbackError = e
        ctx.host.log.warn("auth failed for file " + authState.authPath + ", trying next auth source: " + String(e))
      }
    }

    const keychainAuth = loadAuthFromKeychain(ctx, fileAuth.fileStates)
    if (keychainAuth) {
      try {
        return probeWithAuthState(ctx, keychainAuth, { rateLimitsOnly: true })
      } catch (e) {
        if (!isAuthFallbackError(e)) throw e
        lastAuthFallbackError = e
        ctx.host.log.warn("keychain auth failed: " + String(e))
      }
    }

    if (lastAuthFallbackError) throw lastAuthFallbackError

    for (const authPath of fileAuth.missingPaths) {
      ctx.host.log.warn("auth file not found: " + authPath)
    }

    ctx.host.log.error("active probe failed: not logged in")
    throw ERR_NOT_LOGGED_IN
  }

  function probePromptUsage(ctx) {
    const lines = []
    pushRecentPromptUsageLines(lines, ctx, null, null, false)
    return { lines: lines }
  }

  globalThis.__one_more_prompt_plugin = { id: "codex", probe, probeActive, probePromptUsage }
})()
