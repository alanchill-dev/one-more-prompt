import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const path = "~/.codex/auth.json"
const auth = (token, account = "sample-account") => JSON.stringify({
  tokens: { access_token: token, refresh_token: `${token}-refresh`, account_id: account },
  last_refresh: "2000-01-01T00:00:00.000Z",
})
const ok = () => ({ status: 200, headers: {}, bodyText: "{}" })
const unauthorized = () => ({ status: 401, headers: {}, bodyText: "" })
const load = async () => {
  await import("./plugin.js")
  return globalThis.__one_more_prompt_plugin
}

describe("Codex credential ownership", () => {
  beforeEach(() => {
    delete globalThis.__one_more_prompt_plugin
    vi.resetModules()
  })

  it.each(["probe", "probeActive"])("%s never refreshes or rewrites Codex credentials", async method => {
    const ctx = makeCtx(), original = auth("existing")
    ctx.host.fs.writeText(path, original)
    ctx.host.fs.writeText.mockClear()
    ctx.host.http.request.mockImplementation(request => {
      expect(request.url).not.toContain("oauth/token")
      expect(request.method).toBe("GET")
      return ok()
    })
    const plugin = await load()
    plugin[method](ctx)
    expect(ctx.host.fs.readText(path)).toBe(original)
    expect(ctx.host.fs.writeText.mock.calls.filter(([target]) => target === path)).toEqual([])
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it.each(["probe", "probeActive"])("%s preserves a new login that arrives during the request", async method => {
    const ctx = makeCtx(), newer = auth("new-login", "new-account")
    ctx.host.fs.writeText(path, auth("old"))
    let changed = false
    ctx.host.http.request.mockImplementation(() => {
      if (!changed) { changed = true; ctx.host.fs.writeText(path, newer) }
      return ok()
    })
    const plugin = await load()
    expect(() => plugin[method](ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.readText(path)).toBe(newer)
    expect(ctx.host.http.request.mock.calls.every(([r]) => r.method === "GET")).toBe(true)
  })

  it.each(["probe", "probeActive"])("%s discards a result after same-account token rotation", async method => {
    const ctx = makeCtx(), newer = auth("rotated")
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.http.request.mockImplementation(() => { ctx.host.fs.writeText(path, newer); return ok() })
    const plugin = await load()
    expect(() => plugin[method](ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.readText(path)).toBe(newer)
  })

  it("retries a 401 with the newer Codex token without writing it", async () => {
    const ctx = makeCtx(), newer = auth("rotated")
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.http.request.mockImplementation(request => {
      expect(request.method).toBe("GET")
      if (request.headers.Authorization === "Bearer old") {
        ctx.host.fs.writeText(path, newer)
        return unauthorized()
      }
      expect(request.headers.Authorization).toBe("Bearer rotated")
      return ok()
    })
    const plugin = await load()
    expect(plugin.probeActive(ctx).lines).toBeDefined()
    expect(ctx.host.fs.readText(path)).toBe(newer)
    expect(ctx.host.fs.writeText.mock.calls.filter(([target]) => target === path)).toHaveLength(2)
  })

  it("reports expired sign-in when Codex has not replaced the unauthorized token", async () => {
    const ctx = makeCtx(), original = auth("expired")
    ctx.host.fs.writeText(path, original)
    ctx.host.http.request.mockImplementation(request => { expect(request.method).toBe("GET"); return unauthorized() })
    const plugin = await load()
    expect(() => plugin.probeActive(ctx)).toThrow("Codex sign-in expired")
    expect(ctx.host.fs.readText(path)).toBe(original)
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  })

  it("does not recreate credentials removed while a request is in flight", async () => {
    const ctx = makeCtx(), originalRead = ctx.host.fs.readText
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.fs.writeText.mockClear()
    ctx.host.http.request.mockImplementation(() => {
      ctx.host.fs.readText = target => target === path ? undefined : originalRead(target)
      return ok()
    })
    const plugin = await load()
    expect(() => plugin.probeActive(ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.writeText.mock.calls.filter(([target]) => target === path)).toEqual([])
  })

  it("rejects a success whose credential source can no longer be read", async () => {
    const ctx = makeCtx(), originalRead = ctx.host.fs.readText
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.http.request.mockImplementation(() => {
      ctx.host.fs.readText = target => {
        if (target === path) throw new Error("synthetic permission failure")
        return originalRead(target)
      }
      return ok()
    })
    const plugin = await load()
    expect(() => plugin.probeActive(ctx)).toThrow("Codex sign-in changed")
  })

  it.each(["probe", "probeActive"])("%s never rewrites a changed keychain login", async method => {
    const ctx = makeCtx(), newer = auth("new-keychain", "new-account")
    let value = auth("old-keychain")
    ctx.host.keychain.readGenericPassword.mockImplementation(() => value)
    ctx.host.keychain.writeGenericPassword.mockImplementation((_service, next) => { value = next })
    ctx.host.http.request.mockImplementation(() => { value = newer; return ok() })
    const plugin = await load()
    expect(() => plugin[method](ctx)).toThrow("Codex sign-in changed")
    expect(value).toBe(newer)
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("does not fall back to another account after a concurrent account switch", async () => {
    const ctx = makeCtx(), newer = auth("new", "new-account")
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.keychain.readGenericPassword.mockReturnValue(auth("other", "other-account"))
    ctx.host.http.request.mockImplementation(() => { ctx.host.fs.writeText(path, newer); return unauthorized() })
    const plugin = await load()
    expect(() => plugin.probeActive(ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
    expect(ctx.host.fs.readText(path)).toBe(newer)
  })

  it("does not return a full snapshot after sign-in changes during reset-credit loading", async () => {
    const ctx = makeCtx(), newer = auth("new", "new-account")
    ctx.host.fs.writeText(path, auth("old"))
    ctx.host.http.request.mockImplementation(request => {
      if (request.url.includes("rate-limit-reset-credits")) ctx.host.fs.writeText(path, newer)
      return ok()
    })
    const plugin = await load()
    expect(() => plugin.probe(ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.readText(path)).toBe(newer)
  })

  it.each(["probe", "probeActive"])("%s rejects a file login appearing during a keychain request", async method => {
    const ctx = makeCtx(), newer = auth("new-file", "new-account")
    ctx.host.keychain.readGenericPassword.mockReturnValue(auth("keychain"))
    ctx.host.http.request.mockImplementation(() => { ctx.host.fs.writeText(path, newer); return ok() })
    const plugin = await load()
    expect(() => plugin[method](ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.readText(path)).toBe(newer)
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it.each(["probe", "probeActive"])("%s rejects a new higher-priority file login", async method => {
    const ctx = makeCtx(), higherPath = "~/.config/codex/auth.json"
    ctx.host.fs.writeText(path, auth("existing"))
    ctx.host.fs.writeText(higherPath, "invalid-json")
    ctx.host.http.request.mockImplementation(() => { ctx.host.fs.writeText(higherPath, auth("new", "new-account")); return ok() })
    const plugin = await load()
    expect(() => plugin[method](ctx)).toThrow("Codex sign-in changed")
    expect(ctx.host.fs.readText(path)).toBe(auth("existing"))
  })
})
