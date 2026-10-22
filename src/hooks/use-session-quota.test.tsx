import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoke } from "@tauri-apps/api/core"
import { useSessionQuota } from "./use-session-quota"
import type { PromptUsageSession } from "@/lib/prompt-usage"
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
const session = (id: string, createdAt: string | null = "2026-08-28T00:00:00Z") => ({ id, createdAt, descendantThreadIds: [], turns: [] } as unknown as PromptUsageSession)
const result = (id: string) => ({ dataAsOf: "2026-09-22T08:00:00Z", entries: [{ threadId: id, status: "available", weeklyPercent: 10 }] })
beforeEach(() => { vi.mocked(invoke).mockReset(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }) })
describe("Session quota loading", () => {
  it("retains a successful response without a data timestamp", async () => {
    const response = { dataAsOf: null, entries: [{ threadId: "a", status: "unavailable", weeklyPercent: null }] }
    vi.mocked(invoke).mockResolvedValueOnce(response)
    const view = renderHook(() => useSessionQuota([session("a")], true))
    await waitFor(() => expect(view.result.current.loading).toBe(false))
    expect(view.result.current.error).toBe(false)
    expect(view.result.current.response).toEqual(response)
  })
  it("does not invent creation dates or query inactive pages", async () => {
    const { result, rerender } = renderHook(({ active }) => useSessionQuota([session('a', null)], active), { initialProps: { active: false } })
    expect(invoke).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(invoke).not.toHaveBeenCalled()
  })
  it("ignores an old project response that resolves after switching projects", async () => {
    let finishOld!: (value: unknown) => void
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve })).mockResolvedValueOnce(result('b'))
    const view = renderHook(({ id }) => useSessionQuota([session(id)], true), { initialProps: { id: 'a' } })
    view.rerender({ id: 'b' })
    await waitFor(() => expect(view.result.current.response?.entries[0].threadId).toBe('b'))
    await act(async () => finishOld(result('a')))
    expect(view.result.current.response?.entries[0].threadId).toBe('b')
  })
  it("clears previous values before refresh, and surfaces failures instead of keeping them", async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(invoke).mockResolvedValueOnce(result('a')).mockRejectedValueOnce(new Error('HTTP 401'))
    const view = renderHook(() => useSessionQuota([session('a')], true))
    await waitFor(() => expect(view.result.current.response).not.toBeNull())
    act(() => window.dispatchEvent(new Event('focus')))
    expect(view.result.current.response).toBeNull()
    await waitFor(() => expect(view.result.current.error).toBe(true))
    expect(log).toHaveBeenCalled()
  })
})
