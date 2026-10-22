import { useEffect } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { APP_UPDATE_INTERVAL_MS, useAppUpdateStore } from "@/stores/app-update-store"

export function useAppUpdate() {
  useEffect(() => {
    if (!isTauri()) return

    let timer: number | undefined
    let disposed = false
    const checkIfDue = () => {
      window.clearTimeout(timer)
      if (disposed || document.hidden) return
      const { lastCheckedAt, check } = useAppUpdateStore.getState()
      const remaining = lastCheckedAt === null ? 0 : Math.max(0, APP_UPDATE_INTERVAL_MS - (Date.now() - lastCheckedAt))
      if (remaining === 0) {
        void check().then(checkIfDue)
      } else {
        timer = window.setTimeout(checkIfDue, remaining)
      }
    }
    checkIfDue()
    const unsubscribe = useAppUpdateStore.subscribe((state, previous) => {
      if (state.lastCheckedAt !== previous.lastCheckedAt) checkIfDue()
    })
    document.addEventListener("visibilitychange", checkIfDue)
    window.addEventListener("focus", checkIfDue)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      unsubscribe()
      document.removeEventListener("visibilitychange", checkIfDue)
      window.removeEventListener("focus", checkIfDue)
    }
  }, [])
}
