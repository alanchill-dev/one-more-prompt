import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import type { SessionQuotaRequest, SessionQuotaResponse } from "@/bindings"
import type { PromptUsageSession } from "@/lib/prompt-usage"

export type SessionQuotaState = {
  response: SessionQuotaResponse | null
  loading: boolean
  error: boolean
}

/** Only query the selected project's complete sessions, never date-filtered turns. */
export function useSessionQuota(sessions: PromptUsageSession[], active: boolean): SessionQuotaState {
  const requestKey = JSON.stringify(sessions.flatMap(session => session.createdAt ? [{
    threadId: session.id,
    createdAt: session.createdAt,
    descendantThreadIds: session.descendantThreadIds ?? [],
  }] : []).sort((a, b) => a.threadId.localeCompare(b.threadId)))
  const [state, setState] = useState<SessionQuotaState & { key: string }>({ key: "", response: null, loading: true, error: false })

  useEffect(() => {
    const threads = JSON.parse(requestKey) as SessionQuotaRequest[]
    let disposed = false
    let generation = 0
    let running = false
    const clear = (loading: boolean) => setState({ key: requestKey, response: null, loading, error: false })
    const refresh = async () => {
      if (!active || document.visibilityState === "hidden" || running) return
      const current = ++generation
      running = true
      clear(threads.length > 0)
      try {
        const response = threads.length ? await invoke<SessionQuotaResponse>("query_session_quota", { threads }) : null
        if (!disposed && current === generation) setState({ key: requestKey, response, loading: false, error: false })
      } catch (error) {
        console.error("Session quota query failed", error)
        if (!disposed && current === generation) setState({ key: requestKey, response: null, loading: false, error: true })
      } finally {
        running = false
        if (!disposed && current !== generation && !document.hidden) void refresh()
      }
    }
    const visibility = () => {
      if (document.visibilityState === "hidden") { generation++; clear(false) }
      else void refresh()
    }
    if (active) void refresh()
    else clear(false)
    const interval = window.setInterval(() => void refresh(), 60_000)
    document.addEventListener("visibilitychange", visibility)
    window.addEventListener("focus", refresh)
    return () => {
      disposed = true
      generation++
      clearInterval(interval)
      document.removeEventListener("visibilitychange", visibility)
      window.removeEventListener("focus", refresh)
    }
  }, [requestKey, active])

  return active && state.key === requestKey ? state : { response: null, loading: active, error: false }
}
