import { useEffect, useRef } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type { PromptUsageUpdated } from "@/bindings"
import type { CachedUsageSnapshot } from "@/hooks/app/use-probe-state"

type UseUsageSyncArgs = {
  applyCachedSnapshots: (snapshots: CachedUsageSnapshot[]) => void
  onNextUpdateAt: (nextUpdateAt: number | null) => void
}

/** Read the latest cache on mount, native updates, and panel reopening.
 * Burst updates share one request, with one pending read for changes received
 * during that request. This bounds full-history IPC allocations and keeps the
 * last native update from being lost.
 */
export function useUsageSync(callbacks: UseUsageSyncArgs) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  useEffect(() => {
    let cancelled = false
    let running = false
    let pending = false
    const unlisteners: Array<() => void> = []

    const hydrate = async () => {
      if (cancelled || !isTauri()) return
      if (running) {
        pending = true
        return
      }
      running = true
      try {
        do {
          pending = false
          try {
            const [snapshots, nextUpdateAt] = await Promise.allSettled([
              invoke<CachedUsageSnapshot[]>("get_cached_usage"),
              invoke<number | null>("get_next_update_at"),
            ])
            if (cancelled) return
            if (snapshots.status === "rejected") throw snapshots.reason
            if (nextUpdateAt.status === "rejected") throw nextUpdateAt.reason
            callbacksRef.current.applyCachedSnapshots(snapshots.value)
            callbacksRef.current.onNextUpdateAt(typeof nextUpdateAt.value === "number" ? nextUpdateAt.value : null)
          } catch (error) {
            if (!cancelled) console.error("Failed to hydrate cached usage:", error)
          }
        } while (pending && !cancelled)
      } finally {
        running = false
      }
    }

    void hydrate()

    if (isTauri()) {
      const retainListener = (fn: () => void) => {
        if (cancelled) fn()
        else unlisteners.push(fn)
      }
      listen("usage:updated", () => { void hydrate() })
        .then(retainListener)
        .catch((error) => console.error("Failed to listen for usage:updated:", error))
      listen<PromptUsageUpdated>("prompt-usage:updated", () => { void hydrate() })
        .then(retainListener)
        .catch((error) => console.error("Failed to listen for prompt-usage:updated:", error))
    }

    const handleVisibility = () => {
      if (!document.hidden) void hydrate()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      cancelled = true
      unlisteners.forEach((unlisten) => unlisten())
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])
}
