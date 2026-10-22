import { act, renderHook } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { invoke, isTauri } from "@tauri-apps/api/core"
import type { AppUpdateCheck } from "@/bindings"
import { APP_UPDATE_INTERVAL_MS, useAppUpdateStore } from "@/stores/app-update-store"
import { useAppUpdate } from "./use-app-update"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn() }))

const published: AppUpdateCheck = {
  status: "available", currentVersion: "1.0.0", latestVersion: "1.0.1",
  downloadUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/download/v1.0.1/One-More-Prompt-1.0.1.dmg",
  releaseUrl: "https://github.com/alanchill-dev/one-more-prompt/releases/tag/v1.0.1",
  publishedAt: "2026-10-22T00:00:00Z",
}

describe("app update checking", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-21T00:00:00Z"))
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue(published)
    useAppUpdateStore.setState({ result: null, checking: false, error: null, lastCheckedAt: null })
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("deduplicates simultaneous checks and preserves the native result", async () => {
    let resolve!: (value: AppUpdateCheck) => void
    vi.mocked(invoke).mockImplementation(() => new Promise<AppUpdateCheck>((done) => { resolve = done }))
    const first = useAppUpdateStore.getState().check()
    const second = useAppUpdateStore.getState().check()
    expect(first).toBe(second)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(useAppUpdateStore.getState().checking).toBe(true)
    resolve(published)
    await first
    expect(useAppUpdateStore.getState()).toMatchObject({ result: published, checking: false, error: null, lastCheckedAt: Date.now() })
  })

  it("keeps a previously discovered update visible after a failed refresh and allows retry", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    await useAppUpdateStore.getState().check()
    vi.mocked(invoke).mockRejectedValueOnce("GitHub unavailable")
    await useAppUpdateStore.getState().check()
    expect(useAppUpdateStore.getState()).toMatchObject({ result: published, error: "GitHub unavailable", checking: false })
    expect(errorLog).toHaveBeenCalledWith("Failed to check for app updates:", "GitHub unavailable")
    await useAppUpdateStore.getState().check()
    expect(useAppUpdateStore.getState().error).toBeNull()
  })

  it("checks on startup and after six hours without opening a modal", async () => {
    renderHook(useAppUpdate)
    await act(async () => { await Promise.resolve() })
    expect(invoke).toHaveBeenCalledWith("check_app_update")
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS - 1) })
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it("defers hidden-window checks until returning to the foreground and cleans up", async () => {
    const { unmount } = renderHook(useAppUpdate)
    await act(async () => { await Promise.resolve() })
    Object.defineProperty(document, "hidden", { configurable: true, value: true })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS)
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, "hidden", { configurable: true, value: false })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("focus"))
    })
    expect(invoke).toHaveBeenCalledTimes(2)
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS) })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it("reschedules automatic checking after a manual check", async () => {
    renderHook(useAppUpdate)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS / 2) })
    await act(async () => { await useAppUpdateStore.getState().check() })
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS / 2) })
    expect(invoke).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(APP_UPDATE_INTERVAL_MS / 2) })
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it("does not run automatic native checks in a browser preview", () => {
    vi.mocked(isTauri).mockReturnValue(false)
    renderHook(useAppUpdate)
    expect(invoke).not.toHaveBeenCalled()
  })
})
