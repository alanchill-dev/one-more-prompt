import { create } from "zustand"
import type { PromptUsageProject } from "@/lib/prompt-usage"
import { readUiStorage } from "@/lib/brand-migration"

const STORAGE_KEY = "one-more-prompt.ui.prompt-usage-unread.v1"
type UnreadState = { activeKeys: string[]; unreadKeys: string[] }
type PromptUsageUnreadStore = UnreadState & {
  observeProjects: (projects: PromptUsageProject[]) => void
  markRead: (sessionId: string, turnId: string) => void
  markAllRead: () => string[]
  restoreUnread: (keys: readonly string[]) => void
  resetState: () => void
}

// Undo belongs to the captured completions, never a later run of the same prompt.
let undoableKeys = new Set<string>()

export function promptUnreadKey(sessionId: string, turnId: string): string {
  return JSON.stringify([sessionId, turnId])
}

function validKeys(value: unknown): value is string[] {
  return Array.isArray(value) && new Set(value).size === value.length && value.every((key) => {
    if (typeof key !== "string") return false
    const parts: unknown = JSON.parse(key)
    return Array.isArray(parts) && parts.length === 2
      && parts.every((part) => typeof part === "string" && part.trim().length > 0)
      && JSON.stringify(parts) === key
  })
}

function readState(): UnreadState {
  const empty = { activeKeys: [], unreadKeys: [] }
  if (typeof window === "undefined") return empty
  try {
    const stored = readUiStorage(STORAGE_KEY)
    if (stored === null) return empty
    const value = JSON.parse(stored)
    if (!value || !validKeys(value.activeKeys) || !validKeys(value.unreadKeys)
      || value.activeKeys.some((key: string) => value.unreadKeys.includes(key))) {
      throw new Error("Saved prompt unread state must contain unique, disjoint session/turn keys")
    }
    return { activeKeys: value.activeKeys, unreadKeys: value.unreadKeys }
  } catch (error) {
    console.error("Failed to restore prompt unread state:", error)
    return empty
  }
}

function writeState(state: UnreadState | null) {
  if (typeof window === "undefined") return
  try {
    if (state === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error("Failed to save prompt unread state:", error)
  }
}

export const usePromptUsageUnreadStore = create<PromptUsageUnreadStore>((set) => ({
  ...readState(),
  observeProjects: (projects) => set((state) => {
    const active = new Set(state.activeKeys)
    const unread = new Set(state.unreadKeys)
    let changed = false
    for (const project of projects) {
      for (const session of project.sessions) {
        for (const turn of session.turns) {
          const key = promptUnreadKey(session.id, turn.id)
          if (turn.isActive) {
            undoableKeys.delete(key)
            if (!active.has(key)) { active.add(key); changed = true }
            if (unread.delete(key)) changed = true
          } else if (active.delete(key)) {
            unread.add(key)
            changed = true
          }
        }
      }
    }
    if (!changed) return state
    const next = { activeKeys: [...active], unreadKeys: [...unread] }
    writeState(next)
    return next
  }),
  markRead: (sessionId, turnId) => set((state) => {
    const key = promptUnreadKey(sessionId, turnId)
    if (!state.unreadKeys.includes(key)) return state
    const next = { activeKeys: state.activeKeys, unreadKeys: state.unreadKeys.filter((item) => item !== key) }
    writeState(next)
    return next
  }),
  markAllRead: () => {
    let cleared: string[] = []
    set((state) => {
      if (state.unreadKeys.length === 0) return state
      cleared = [...state.unreadKeys]
      undoableKeys = new Set(cleared)
      const next = { activeKeys: state.activeKeys, unreadKeys: [] }
      writeState(next)
      return next
    })
    return cleared
  },
  restoreUnread: (keys) => set((state) => {
    const restored = keys.filter((key) => undoableKeys.has(key) && !state.activeKeys.includes(key))
    undoableKeys.clear()
    const unreadKeys = [...new Set([...state.unreadKeys, ...restored])]
    if (unreadKeys.length === state.unreadKeys.length) return state
    const next = { activeKeys: state.activeKeys, unreadKeys }
    writeState(next)
    return next
  }),
  resetState: () => {
    undoableKeys.clear()
    writeState(null)
    set({ activeKeys: [], unreadKeys: [] })
  },
}))
