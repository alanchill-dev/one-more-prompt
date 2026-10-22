import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CachedUsageSnapshot } from "@/hooks/app/use-probe-state"
import { useUsageSync } from "@/hooks/app/use-usage-sync"

const { invokeMock, listenMock, isTauriMock, handlers } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  isTauriMock: vi.fn(),
  handlers: new Map<string, () => void>(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock, isTauri: isTauriMock }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function hydration() {
  return { cache: deferred<CachedUsageSnapshot[]>(), next: deferred<number | null>() }
}

type Hydration = ReturnType<typeof hydration>
let cacheRequests: Hydration["cache"][]
let nextRequests: Hydration["next"][]

function queueHydration() {
  const request = hydration()
  cacheRequests.push(request.cache)
  nextRequests.push(request.next)
  return request
}

function cacheSnapshot(fetchedAt: string): CachedUsageSnapshot[] {
  return [{ providerId: "codex", displayName: "Codex", plan: null, lines: [], fetchedAt }]
}

function callbacks() {
  return { applyCachedSnapshots: vi.fn(), onNextUpdateAt: vi.fn() }
}

function calls(command: string) {
  return invokeMock.mock.calls.filter(([name]) => name === command).length
}

function emit(event = "usage:updated") {
  act(() => handlers.get(event)!())
}

async function settle(request: Hydration, snapshots: CachedUsageSnapshot[] = [], nextUpdateAt: number | null = 123) {
  await act(async () => {
    request.cache.resolve(snapshots)
    request.next.resolve(nextUpdateAt)
  })
}

describe("useUsageSync", () => {
  beforeEach(() => {
    cacheRequests = []
    nextRequests = []
    handlers.clear()
    isTauriMock.mockReset().mockReturnValue(true)
    invokeMock.mockReset().mockImplementation((command: string) => {
      if (command === "get_cached_usage") return cacheRequests.shift()!.promise
      if (command === "get_next_update_at") return nextRequests.shift()!.promise
      throw new Error("Unexpected command: " + command)
    })
    listenMock.mockReset().mockImplementation(async (event: string, handler: () => void) => {
      handlers.set(event, handler)
      return vi.fn()
    })
    vi.spyOn(document, "hidden", "get").mockReturnValue(false)
  })

  afterEach(() => vi.restoreAllMocks())

  it("keeps one hydration in flight and coalesces a burst into one latest cache read", async () => {
    const first = queueHydration()
    const latest = queueHydration()
    const handlers = callbacks()
    renderHook(() => useUsageSync(handlers))

    for (let index = 0; index < 20; index += 1) {
      emit(index % 2 === 0 ? "usage:updated" : "prompt-usage:updated")
    }
    expect(calls("get_cached_usage")).toBe(1)
    expect(calls("get_next_update_at")).toBe(1)
    expect(handlers.applyCachedSnapshots).not.toHaveBeenCalled()

    const firstSnapshots = cacheSnapshot("2026-10-02T00:00:00Z")
    await settle(first, firstSnapshots, 1)
    expect(calls("get_cached_usage")).toBe(2)
    expect(calls("get_next_update_at")).toBe(2)

    const latestSnapshots = cacheSnapshot("2026-10-02T00:01:00Z")
    await settle(latest, latestSnapshots, 2)
    expect(handlers.applyCachedSnapshots.mock.calls).toEqual([[firstSnapshots], [latestSnapshots]])
    expect(handlers.onNextUpdateAt.mock.calls).toEqual([[1], [2]])
    expect(calls("get_cached_usage")).toBe(2)
  })

  it("waits for a slow cache even when the other IPC rejects before running a queued read", async () => {
    const first = queueHydration()
    const latest = queueHydration()
    const handlers = callbacks()
    const error = new Error("next update unavailable")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    renderHook(() => useUsageSync(handlers))
    emit()

    await act(async () => { first.next.reject(error) })
    expect(calls("get_cached_usage")).toBe(1)
    expect(handlers.applyCachedSnapshots).not.toHaveBeenCalled()

    await act(async () => { first.cache.resolve([]) })
    expect(calls("get_cached_usage")).toBe(2)
    expect(log).toHaveBeenCalledWith("Failed to hydrate cached usage:", error)
    await settle(latest)
    expect(handlers.applyCachedSnapshots).toHaveBeenCalledTimes(1)
  })

  it("recovers from a failed cache on the next native event", async () => {
    const failed = queueHydration()
    const handlers = callbacks()
    const error = new Error("cache unavailable")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    renderHook(() => useUsageSync(handlers))

    await act(async () => {
      failed.cache.reject(error)
      failed.next.resolve(123)
    })
    expect(log).toHaveBeenCalledWith("Failed to hydrate cached usage:", error)
    expect(handlers.applyCachedSnapshots).not.toHaveBeenCalled()

    const recovered = queueHydration()
    emit("prompt-usage:updated")
    await settle(recovered)
    expect(handlers.applyCachedSnapshots).toHaveBeenCalledTimes(1)
    expect(calls("get_cached_usage")).toBe(2)
  })

  it("suppresses completed callbacks and queued reads after unmount", async () => {
    const request = queueHydration()
    const handlers = callbacks()
    const { unmount } = renderHook(() => useUsageSync(handlers))
    emit()
    unmount()
    await settle(request)

    expect(handlers.applyCachedSnapshots).not.toHaveBeenCalled()
    expect(handlers.onNextUpdateAt).not.toHaveBeenCalled()
    expect(calls("get_cached_usage")).toBe(1)
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(calls("get_cached_usage")).toBe(1)
  })

  it("releases listeners whose async registration completes after unmount", async () => {
    const request = queueHydration()
    const firstListener = deferred<() => void>()
    const secondListener = deferred<() => void>()
    listenMock.mockImplementationOnce(() => firstListener.promise).mockImplementationOnce(() => secondListener.promise)
    const firstUnlisten = vi.fn()
    const secondUnlisten = vi.fn()
    const { unmount } = renderHook(() => useUsageSync(callbacks()))
    unmount()

    await act(async () => {
      firstListener.resolve(firstUnlisten)
      secondListener.resolve(secondUnlisten)
    })
    await settle(request)
    expect(firstUnlisten).toHaveBeenCalledTimes(1)
    expect(secondUnlisten).toHaveBeenCalledTimes(1)
  })

  it("releases already registered listeners on unmount", async () => {
    const request = queueHydration()
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const { unmount } = renderHook(() => useUsageSync(callbacks()))
    await settle(request)
    unmount()

    expect(unlisten).toHaveBeenCalledTimes(2)
  })

  it("uses the latest callbacks after rerender without creating another hydration", async () => {
    const request = queueHydration()
    const original = callbacks()
    const latest = callbacks()
    const { rerender } = renderHook((handlers) => useUsageSync(handlers), { initialProps: original })
    rerender(latest)
    await settle(request, [], null)

    expect(original.applyCachedSnapshots).not.toHaveBeenCalled()
    expect(original.onNextUpdateAt).not.toHaveBeenCalled()
    expect(latest.applyCachedSnapshots).toHaveBeenCalledTimes(1)
    expect(latest.onNextUpdateAt).toHaveBeenCalledWith(null)
    expect(calls("get_cached_usage")).toBe(1)
    expect(listenMock).toHaveBeenCalledTimes(2)
  })

  it("ignores hidden visibility changes and hydrates when the panel becomes visible", async () => {
    const first = queueHydration()
    renderHook(() => useUsageSync(callbacks()))
    await settle(first)
    vi.spyOn(document, "hidden", "get").mockReturnValue(true)
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(calls("get_cached_usage")).toBe(1)

    const visible = queueHydration()
    vi.spyOn(document, "hidden", "get").mockReturnValue(false)
    act(() => document.dispatchEvent(new Event("visibilitychange")))
    expect(calls("get_cached_usage")).toBe(2)
    await settle(visible)
  })

  it("does not invoke native APIs outside Tauri", () => {
    isTauriMock.mockReturnValue(false)
    renderHook(() => useUsageSync(callbacks()))

    expect(invokeMock).not.toHaveBeenCalled()
    expect(listenMock).not.toHaveBeenCalled()
  })
})
