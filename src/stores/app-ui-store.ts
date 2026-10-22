import { create } from "zustand"
import { isActiveView, type ActiveView } from "@/components/side-nav"
import { DEFAULT_PROMPT_USAGE_TIME_SCOPE, type UsageTimeScope } from "@/lib/time-scope"
import { readUiStorage } from "@/lib/brand-migration"

const ACTIVE_VIEW_STORAGE_KEY = "one-more-prompt.ui.active-view.v1"
const PROMPT_USAGE_PINS_STORAGE_KEY = "one-more-prompt.ui.prompt-usage-pins.v1"
const PROMPT_USAGE_PROJECT_PINS_STORAGE_KEY = "one-more-prompt.ui.prompt-usage-project-pins.v1"

export type UiRect = { left: number; top: number; width: number; height: number }

export type PromptUsageDrilldownTransition = {
  destination?: PromptUsageViewMode
  scope?: UsageTimeScope
  sourceCardRect: UiRect
  sourceActionRect: UiRect
  destinationSurfaceRect: UiRect | null
  destinationFilterRect: UiRect | null
  phase: "departing" | "arriving"
} | null

export type PromptUsageViewMode = "hierarchy" | "timeline"

type AppUiStore = {
  activeView: ActiveView
  showAbout: boolean
  promptUsageTimeScope: UsageTimeScope
  promptUsageViewMode: PromptUsageViewMode
  promptUsagePinnedSessionIds: string[]
  promptUsagePinnedProjectIds: string[]
  promptUsageDrilldownTransition: PromptUsageDrilldownTransition
  setActiveView: (view: ActiveView) => void
  setShowAbout: (value: boolean) => void
  setPromptUsageTimeScope: (scope: UsageTimeScope) => void
  setPromptUsageViewMode: (mode: PromptUsageViewMode) => void
  togglePromptUsageSessionPin: (id: string) => void
  reorderPromptUsageSessionPin: (id: string, targetId: string) => void
  togglePromptUsageProjectPin: (id: string) => void
  reorderPromptUsageProjectPin: (id: string, targetId: string) => void
  setPromptUsageDrilldownTransition: (transition: PromptUsageDrilldownTransition) => void
  resetState: () => void
}

function readActiveView(): ActiveView {
  if (typeof window === "undefined") return "home"

  try {
    const stored = readUiStorage(ACTIVE_VIEW_STORAGE_KEY)
    return isActiveView(stored) ? stored : "home"
  } catch (error) {
    console.error("Failed to restore the last active view:", error)
    return "home"
  }
}

function writeActiveView(view: ActiveView) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view)
  } catch (error) {
    console.error("Failed to save the active view:", error)
  }
}

function clearActiveView() {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear the saved active view:", error)
  }
}

function readPromptUsagePins(key: string): string[] {
  if (typeof window === "undefined") return []

  try {
    const stored = readUiStorage(key)
    if (stored === null) return []
    const ids: unknown = JSON.parse(stored)
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
      throw new Error("Saved prompt usage pins must be unique nonempty session IDs")
    }
    return ids
  } catch (error) {
    console.error("Failed to restore prompt usage pins:", error)
    return []
  }
}

function writePromptUsagePins(key: string, ids: string[] | null) {
  if (typeof window === "undefined") return

  try {
    if (ids === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(ids))
  } catch (error) {
    console.error("Failed to save prompt usage pins:", error)
  }
}

const initialState = {
  activeView: readActiveView(),
  showAbout: false,
  promptUsageTimeScope: DEFAULT_PROMPT_USAGE_TIME_SCOPE,
  promptUsageViewMode: "hierarchy" as PromptUsageViewMode,
  promptUsagePinnedSessionIds: readPromptUsagePins(PROMPT_USAGE_PINS_STORAGE_KEY),
  promptUsagePinnedProjectIds: readPromptUsagePins(PROMPT_USAGE_PROJECT_PINS_STORAGE_KEY),
  promptUsageDrilldownTransition: null,
}

export const useAppUiStore = create<AppUiStore>((set) => ({
  ...initialState,
  setActiveView: (view) => {
    writeActiveView(view)
    set({ activeView: view })
  },
  setShowAbout: (value) => set({ showAbout: value }),
  setPromptUsageTimeScope: (scope) => set({ promptUsageTimeScope: scope }),
  setPromptUsageViewMode: (mode) => set({ promptUsageViewMode: mode }),
  togglePromptUsageSessionPin: (id) => set((state) => {
    const ids = state.promptUsagePinnedSessionIds.includes(id)
      ? state.promptUsagePinnedSessionIds.filter((pinnedId) => pinnedId !== id)
      : [id, ...state.promptUsagePinnedSessionIds]
    writePromptUsagePins(PROMPT_USAGE_PINS_STORAGE_KEY, ids)
    return { promptUsagePinnedSessionIds: ids }
  }),
  reorderPromptUsageSessionPin: (id, targetId) => set((state) => {
    const ids = [...state.promptUsagePinnedSessionIds]
    const from = ids.indexOf(id)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0 || from === to) return state
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    writePromptUsagePins(PROMPT_USAGE_PINS_STORAGE_KEY, ids)
    return { promptUsagePinnedSessionIds: ids }
  }),
  togglePromptUsageProjectPin: (id) => set((state) => {
    const ids = state.promptUsagePinnedProjectIds.includes(id)
      ? state.promptUsagePinnedProjectIds.filter(pinnedId => pinnedId !== id)
      : [id, ...state.promptUsagePinnedProjectIds]
    writePromptUsagePins(PROMPT_USAGE_PROJECT_PINS_STORAGE_KEY, ids)
    return { promptUsagePinnedProjectIds: ids }
  }),
  reorderPromptUsageProjectPin: (id, targetId) => set((state) => {
    const ids = [...state.promptUsagePinnedProjectIds]
    const from = ids.indexOf(id)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0 || from === to) return state
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    writePromptUsagePins(PROMPT_USAGE_PROJECT_PINS_STORAGE_KEY, ids)
    return { promptUsagePinnedProjectIds: ids }
  }),
  setPromptUsageDrilldownTransition: (transition) => set({ promptUsageDrilldownTransition: transition }),
  resetState: () => {
    clearActiveView()
    writePromptUsagePins(PROMPT_USAGE_PINS_STORAGE_KEY, null)
    writePromptUsagePins(PROMPT_USAGE_PROJECT_PINS_STORAGE_KEY, null)
    set({ activeView: "home", showAbout: false, promptUsageTimeScope: DEFAULT_PROMPT_USAGE_TIME_SCOPE, promptUsageViewMode: "hierarchy", promptUsagePinnedSessionIds: [], promptUsagePinnedProjectIds: [], promptUsageDrilldownTransition: null })
  },
}))
