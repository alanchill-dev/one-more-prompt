import { beforeEach, describe, expect, it, vi } from "vitest"

const STORAGE_KEY = "one-more-prompt.ui.active-view.v1"
const PINS_STORAGE_KEY = "one-more-prompt.ui.prompt-usage-pins.v1"
const PROJECT_PINS_STORAGE_KEY = "one-more-prompt.ui.prompt-usage-project-pins.v1"

describe("useAppUiStore", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it("restores the last top-level view when the app is reopened", async () => {
    window.localStorage.setItem(STORAGE_KEY, "prompt-usage")

    const { useAppUiStore } = await import("@/stores/app-ui-store")

    expect(useAppUiStore.getState().activeView).toBe("prompt-usage")
  }, 10_000)

  it("persists each view change immediately", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")

    useAppUiStore.getState().setActiveView("settings")

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("settings")
  })

  it("falls back safely when an old provider view is stored", async () => {
    window.localStorage.setItem(STORAGE_KEY, "codex")

    const { useAppUiStore } = await import("@/stores/app-ui-store")

    expect(useAppUiStore.getState().activeView).toBe("home")
  })

  it("holds the Prompt Usage time scope for chart drill-downs", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")

    useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" })

    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: "2026-09-04" })
  })

  it("holds the persistent drill-down geometry across the top-level page switch", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    const transition = {
      sourceCardRect: { left: 10, top: 20, width: 240, height: 260 },
      sourceActionRect: { left: 20, top: 220, width: 220, height: 56 },
      destinationSurfaceRect: null,
      destinationFilterRect: null,
      phase: "departing" as const,
    }

    useAppUiStore.getState().setPromptUsageDrilldownTransition(transition)
    useAppUiStore.getState().setActiveView("prompt-usage")

    expect(useAppUiStore.getState().promptUsageDrilldownTransition).toEqual(transition)
  })

  it("preserves the chosen workspace and time scope across navigation", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")

    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" })
    useAppUiStore.getState().setActiveView("settings")
    useAppUiStore.getState().setActiveView("prompt-usage")

    expect(useAppUiStore.getState().promptUsageViewMode).toBe("timeline")
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "day", dateKey: "2026-09-04" })
  })

  it("clears the saved view when application state is reset", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    useAppUiStore.getState().setActiveView("settings")
    useAppUiStore.getState().togglePromptUsageSessionPin("session-a")

    useAppUiStore.getState().resetState()

    expect(useAppUiStore.getState().activeView).toBe("home")
    expect(useAppUiStore.getState().showAbout).toBe(false)
    expect(useAppUiStore.getState().promptUsageTimeScope).toEqual({ type: "lastDays", days: 30 })
    expect(useAppUiStore.getState().promptUsageDrilldownTransition).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual([])
    expect(window.localStorage.getItem(PINS_STORAGE_KEY)).toBeNull()
  })

  it("prepends multiple pins and persists unpinning without changing the remaining order", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    const toggle = useAppUiStore.getState().togglePromptUsageSessionPin
    toggle("session-a")
    toggle("session-b")
    toggle("session-c")
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["session-c", "session-b", "session-a"])
    toggle("session-b")
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["session-c", "session-a"])
    expect(JSON.parse(window.localStorage.getItem(PINS_STORAGE_KEY)!)).toEqual(["session-c", "session-a"])
  })

  it("persists reordered pins while preserving every other pin and rejects unpinned IDs", async () => {
    window.localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(["a", "hidden-1", "b", "hidden-2", "c"]))
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    const reorder = useAppUiStore.getState().reorderPromptUsageSessionPin
    reorder("a", "c")
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["hidden-1", "b", "hidden-2", "c", "a"])
    reorder("untracked", "a")
    reorder("a", "untracked")
    expect(JSON.parse(window.localStorage.getItem(PINS_STORAGE_KEY)!)).toEqual(["hidden-1", "b", "hidden-2", "c", "a"])
    vi.resetModules()
    const reopened = await import("@/stores/app-ui-store")
    expect(reopened.useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["hidden-1", "b", "hidden-2", "c", "a"])
  })

  it("preserves pins across views, time scopes, and reopening the app", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    useAppUiStore.getState().togglePromptUsageSessionPin("session-outside-range")
    useAppUiStore.getState().setPromptUsageViewMode("timeline")
    useAppUiStore.getState().setPromptUsageTimeScope({ type: "day", dateKey: "2026-09-04" })
    useAppUiStore.getState().setActiveView("settings")
    useAppUiStore.getState().setActiveView("prompt-usage")
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["session-outside-range"])

    vi.resetModules()
    const reopened = await import("@/stores/app-ui-store")
    expect(reopened.useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["session-outside-range"])
  })

  it("saves and reorders Project pins independently of Session pins across dates and reopening", async () => {
    const { useAppUiStore } = await import("@/stores/app-ui-store")
    const store = useAppUiStore.getState()
    store.togglePromptUsageSessionPin("session")
    store.togglePromptUsageProjectPin("project-a")
    store.togglePromptUsageProjectPin("project-b")
    expect(useAppUiStore.getState().promptUsagePinnedProjectIds).toEqual(["project-b", "project-a"])
    store.reorderPromptUsageProjectPin("project-a", "project-b")
    store.setPromptUsageTimeScope({ type: "day", dateKey: "2026-04-28" })
    store.setPromptUsageViewMode("timeline")
    expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual(["session"])
    expect(JSON.parse(localStorage.getItem(PROJECT_PINS_STORAGE_KEY)!)).toEqual(["project-a", "project-b"])
    vi.resetModules()
    const reopened = await import("@/stores/app-ui-store")
    expect(reopened.useAppUiStore.getState().promptUsagePinnedProjectIds).toEqual(["project-a", "project-b"])
    reopened.useAppUiStore.getState().togglePromptUsageProjectPin("project-a")
    expect(reopened.useAppUiStore.getState().promptUsagePinnedProjectIds).toEqual(["project-b"])
    reopened.useAppUiStore.getState().resetState()
    expect(localStorage.getItem(PROJECT_PINS_STORAGE_KEY)).toBeNull()
  })

  it.each(["invalid-json", "{}", '["a", 2]', '["a", ""]', '[" "]', '["a", "a"]'])("reports invalid persisted pins and starts empty: %s", async (stored) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    window.localStorage.setItem(PINS_STORAGE_KEY, stored)
    try {
      const { useAppUiStore } = await import("@/stores/app-ui-store")
      expect(useAppUiStore.getState().promptUsagePinnedSessionIds).toEqual([])
      expect(error).toHaveBeenCalledWith("Failed to restore prompt usage pins:", expect.any(Error))
    } finally {
      error.mockRestore()
    }
  })
})
