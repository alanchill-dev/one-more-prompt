import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type { AppUpdateCheck } from "@/bindings"

export const APP_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1_000

type AppUpdateState = {
  result: AppUpdateCheck | null
  checking: boolean
  error: string | null
  lastCheckedAt: number | null
  check: () => Promise<void>
}

let pendingCheck: Promise<void> | null = null

export const useAppUpdateStore = create<AppUpdateState>((set) => ({
  result: null,
  checking: false,
  error: null,
  lastCheckedAt: null,
  check: () => {
    if (pendingCheck) return pendingCheck
    set({ checking: true, error: null })
    pendingCheck = invoke<AppUpdateCheck>("check_app_update")
      .then((result) => set({ result }))
      .catch((error: unknown) => {
        console.error("Failed to check for app updates:", error)
        set({ error: String(error) })
      })
      .finally(() => {
        set({ checking: false, lastCheckedAt: Date.now() })
        pendingCheck = null
      })
    return pendingCheck
  },
}))
