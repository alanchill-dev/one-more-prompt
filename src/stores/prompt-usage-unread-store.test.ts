import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PromptUsageProject } from "@/lib/prompt-usage"

const STORAGE_KEY = "one-more-prompt.ui.prompt-usage-unread.v1"
function projects(isActive: boolean, sessionId = "session", turnId = "turn"): PromptUsageProject[] {
  return [{ sessions: [{ id: sessionId, turns: [{ id: turnId, isActive, prompt: "Private body" }] }] }] as PromptUsageProject[]
}

async function store() {
  const module = await import("./prompt-usage-unread-store")
  return { state: () => module.usePromptUsageUnreadStore.getState(), key: module.promptUnreadKey }
}

describe("prompt completion unread state", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("marks observed running prompts unread on completion, without marking old history", async () => {
    const { state, key } = await store()
    state().observeProjects(projects(false, "old"))
    expect(state().unreadKeys).toEqual([])
    state().observeProjects(projects(true))
    state().observeProjects(projects(false))
    expect(state().activeKeys).toEqual([])
    expect(state().unreadKeys).toEqual([key("session", "turn")])
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("Private body")
  })

  it("does not infer completion from loading or partial snapshots", async () => {
    const { state, key } = await store()
    state().observeProjects(projects(true))
    state().observeProjects([])
    state().observeProjects(projects(false, "other"))
    expect(state().activeKeys).toEqual([key("session", "turn")])
    expect(state().unreadKeys).toEqual([])
    state().observeProjects(projects(false))
    expect(state().unreadKeys).toEqual([key("session", "turn")])
  })

  it("clears only the opened completion and does not pre-consume a running result", async () => {
    const { state, key } = await store()
    state().observeProjects([...projects(true), ...projects(true, "other")])
    state().markRead("session", "turn")
    state().observeProjects([...projects(false), ...projects(false, "other")])
    expect(state().unreadKeys).toHaveLength(2)
    state().markRead("session", "turn")
    expect(state().unreadKeys).toEqual([key("other", "turn")])
  })

  it("restores both unread completions and active observations after reopening", async () => {
    const { state, key } = await store()
    state().observeProjects([...projects(true), ...projects(true, "other")])
    state().observeProjects(projects(false))
    vi.resetModules()
    const reopened = await store()
    expect(reopened.state().unreadKeys).toEqual([key("session", "turn")])
    expect(reopened.state().activeKeys).toEqual([key("other", "turn")])
    reopened.state().observeProjects(projects(false, "other"))
    expect(reopened.state().unreadKeys).toHaveLength(2)
  })

  it("clears unread when the same prompt runs again and marks its next completion", async () => {
    const { state, key } = await store()
    state().observeProjects(projects(true))
    state().observeProjects(projects(false))
    state().observeProjects(projects(true))
    expect(state().unreadKeys).toEqual([])
    expect(state().activeKeys).toEqual([key("session", "turn")])
    state().observeProjects(projects(false))
    expect(state().unreadKeys).toEqual([key("session", "turn")])
  })

  it("does not write or notify subscribers for unchanged observations", async () => {
    const { state } = await store()
    state().observeProjects(projects(true))
    const previous = state()
    const write = vi.spyOn(Storage.prototype, "setItem")
    state().observeProjects(projects(true))
    state().observeProjects([])
    state().markRead("unknown", "unknown")
    expect(state()).toBe(previous)
    expect(write).not.toHaveBeenCalled()
  })

  it("atomically clears all projects while preserving active observations and future completions", async () => {
    const { state, key } = await store()
    state().observeProjects([...projects(true, "one"), ...projects(true, "two"), ...projects(true, "running")])
    state().observeProjects([...projects(false, "one"), ...projects(false, "two")])
    const activeKeys = state().activeKeys
    const write = vi.spyOn(Storage.prototype, "setItem")
    const { usePromptUsageUnreadStore } = await import("./prompt-usage-unread-store")
    const notify = vi.fn()
    const unsubscribe = usePromptUsageUnreadStore.subscribe(notify)
    const cleared = state().markAllRead()
    expect(cleared).toEqual([key("one", "turn"), key("two", "turn")])
    expect(state().unreadKeys).toEqual([])
    expect(state().activeKeys).toBe(activeKeys)
    expect(write).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({ activeKeys, unreadKeys: [] })
    state().observeProjects(projects(false, "running"))
    expect(state().unreadKeys).toEqual([key("running", "turn")])
    state().observeProjects(projects(false, "historical"))
    expect(state().unreadKeys).toEqual([key("running", "turn")])
    unsubscribe()
  })

  it("does not persist empty bulk actions or restore keys outside the captured snapshot", async () => {
    const { state, key } = await store()
    const previous = state()
    const write = vi.spyOn(Storage.prototype, "setItem")
    expect(state().markAllRead()).toEqual([])
    state().restoreUnread([key("unknown", "turn")])
    expect(state()).toBe(previous)
    expect(write).not.toHaveBeenCalled()
  })

  it("undo merges captured completions with new unread results in one persisted update", async () => {
    const { state, key } = await store()
    state().observeProjects(projects(true, "old"))
    state().observeProjects(projects(false, "old"))
    const cleared = state().markAllRead()
    state().observeProjects(projects(true, "new"))
    state().observeProjects(projects(false, "new"))
    const write = vi.spyOn(Storage.prototype, "setItem")
    state().restoreUnread([...cleared, key("uncaptured", "turn")])
    expect(new Set(state().unreadKeys)).toEqual(new Set([key("old", "turn"), key("new", "turn")]))
    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).unreadKeys).toEqual(state().unreadKeys)
    state().restoreUnread(cleared)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("undo never restores a currently running retry or a stale result after that retry was read", async () => {
    const { state, key } = await store()
    state().observeProjects([...projects(true, "still"), ...projects(true, "retry"), ...projects(true, "read")])
    state().observeProjects([...projects(false, "still"), ...projects(false, "retry"), ...projects(false, "read")])
    const cleared = state().markAllRead()
    state().observeProjects([...projects(true, "retry"), ...projects(true, "read")])
    state().observeProjects(projects(false, "read"))
    state().markRead("read", "turn")
    state().restoreUnread(cleared)
    expect(state().unreadKeys).toEqual([key("still", "turn")])
    expect(state().activeKeys).toEqual([key("retry", "turn")])
    state().observeProjects(projects(false, "retry"))
    expect(state().unreadKeys).toEqual([key("still", "turn"), key("retry", "turn")])
  })

  it("reset invalidates an old Undo snapshot", async () => {
    const { state } = await store()
    state().observeProjects(projects(true))
    state().observeProjects(projects(false))
    const cleared = state().markAllRead()
    state().resetState()
    state().restoreUnread(cleared)
    expect(state().unreadKeys).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it.each([
    "invalid JSON",
    JSON.stringify({ activeKeys: ["not a tuple"], unreadKeys: [] }),
    JSON.stringify({ activeKeys: [], unreadKeys: [JSON.stringify(["", "turn"])] }),
    JSON.stringify({ activeKeys: ['["s","t"]'], unreadKeys: ['["s","t"]'] }),
    JSON.stringify({ activeKeys: [], unreadKeys: ['["s","t"]', '["s","t"]'] }),
  ])("logs malformed persisted state and restores an empty state: %s", async (saved) => {
    window.localStorage.setItem(STORAGE_KEY, saved)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const { state } = await store()
    expect(state().activeKeys).toEqual([])
    expect(state().unreadKeys).toEqual([])
    expect(log).toHaveBeenCalledWith("Failed to restore prompt unread state:", expect.any(Error))
  })

  it("reset clears both state and persisted keys", async () => {
    const { state } = await store()
    state().observeProjects(projects(true))
    state().observeProjects(projects(false))
    state().resetState()
    expect(state().activeKeys).toEqual([])
    expect(state().unreadKeys).toEqual([])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
