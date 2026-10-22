import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useProbe } from "@/hooks/app/use-probe"
import type { CachedUsageSnapshot } from "@/hooks/app/use-probe-state"
import type { PluginOutput } from "@/lib/plugin-types"

const { invokeMock, listenMock, handlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
}))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: () => true }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

const fetchedAt = "2026-10-01T00:00:00.000Z"
const original: CachedUsageSnapshot = {
  providerId: "codex", displayName: "Codex", plan: "Plus", fetchedAt,
  lines: [{ type: "progress", label: "Session", used: 20, limit: 100, format: { kind: "percent" } }],
}
const failure: PluginOutput = {
  providerId: "codex", displayName: "Codex", iconUrl: "",
  lines: [{ type: "badge", label: "Error", text: "Open Codex and sign in again.", color: "#ff5429" }],
}
let snapshots: CachedUsageSnapshot[]

async function emit(name: string, payload: unknown = {}) {
  await act(async () => { handlers.get(name)!({ payload }) })
}
async function mount() {
  const hook = renderHook(() => useProbe({
    pluginSettings: { order: ["codex"], disabled: [] }, autoUpdateInterval: 5,
  }))
  await waitFor(() => expect(hook.result.current.pluginStates.codex?.data).toBeTruthy())
  await waitFor(() => expect(handlers.has("probe:batch-complete")).toBe(true))
  return hook
}
async function manualFailure(hook: Awaited<ReturnType<typeof mount>>) {
  await act(async () => { hook.result.current.handleRetryPlugin("codex") })
  const call = invokeMock.mock.calls.find(([command]) => command === "start_probe_batch")!
  await emit("probe:result", { batchId: call[1].batchId, background: false, output: failure })
  return call[1].batchId
}

beforeEach(() => {
  snapshots = [original]
  handlers.clear()
  listenMock.mockImplementation(async (name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return () => handlers.delete(name)
  })
  invokeMock.mockImplementation(async (command: string, args: { batchId: string }) => {
    if (command === "get_cached_usage") return snapshots
    if (command === "get_next_update_at") return Date.now() + 300000
    if (command === "start_probe_batch") return { batchId: args.batchId, pluginIds: ["codex"] }
    throw new Error("Unexpected command " + command)
  })
})

describe("Refresh failures across native events and cache hydration", () => {
  it("shows a scheduler failure and keeps the last good data through its completion hydration", async () => {
    const hook = await mount()
    await emit("probe:result", { batchId: "native-full-refresh", background: true, output: failure })
    await emit("usage:updated")
    expect(hook.result.current.pluginStates.codex.error).toBe(failure.lines[0].type === "badge" ? failure.lines[0].text : "")
    expect(hook.result.current.pluginStates.codex.data?.lines[0]).toMatchObject({ used: 20 })
    expect(hook.result.current.pluginStates.codex.lastUpdatedAt).toBe(Date.parse(fetchedAt))
  })

  it("preserves a manual failure when unrelated history updates rehydrate the older cache", async () => {
    const hook = await mount()
    await manualFailure(hook)
    expect(hook.result.current.pluginStates.codex.error).toBe("Open Codex and sign in again.")
    await emit("prompt-usage:updated")
    expect(hook.result.current.pluginStates.codex.error).toBe("Open Codex and sign in again.")
  })

  it("clears a failure when a newer successful snapshot arrives", async () => {
    const hook = await mount()
    await manualFailure(hook)
    snapshots = [{ ...original, fetchedAt: new Date(Date.now() + 1000).toISOString() }]
    await emit("usage:updated")
    expect(hook.result.current.pluginStates.codex.error).toBeNull()
  })

  it("keeps a pending manual batch owned by that batch when a background failure arrives", async () => {
    const hook = await mount()
    await act(async () => { hook.result.current.handleRetryPlugin("codex") })
    const call = invokeMock.mock.calls.find(([command]) => command === "start_probe_batch")!
    await emit("probe:result", { batchId: "native-active-refresh", background: true, output: failure })
    expect(hook.result.current.pluginStates.codex.loading).toBe(true)
    expect(hook.result.current.pluginStates.codex.error).toBe("Open Codex and sign in again.")
    await emit("probe:result", { batchId: call[1].batchId, background: false,
      output: { ...failure, lines: original.lines } })
    expect(hook.result.current.pluginStates.codex.loading).toBe(false)
    expect(hook.result.current.pluginStates.codex.error).toBeNull()
    expect(hook.result.current.pluginStates.codex.lastManualRefreshAt).not.toBeNull()
  })
})
