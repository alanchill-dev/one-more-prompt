import codexManifest from "../../../plugins/codex/plugin.json"
import type { ResetCredits } from "@/bindings"
import type { PluginDisplayState } from "@/lib/plugin-types"
import { hourlyPoints, trendPoints } from "./fixtures"

export function makeGuideOverviewPlugin(demoAccount: string, now: number): PluginDisplayState {
  const day = 86400000
  const at = (days: number) => new Date(now + days * day).toISOString()
  const resetCredits: ResetCredits = {
    availableCount: 2,
    credits: [
      { id: "demo-reset-2", grantedAt: at(-9), expiresAt: at(21) },
      { id: "demo-reset-3", grantedAt: at(-3), expiresAt: at(27) },
    ],
    history: [
      { id: "demo-reset-grant-1", kind: "granted", occurredAt: at(-20) },
      { id: "demo-reset-used-1", kind: "used", occurredAt: at(-12) },
      { id: "demo-reset-grant-2", kind: "granted", occurredAt: at(-9) },
      { id: "demo-reset-grant-3", kind: "granted", occurredAt: at(-3) },
    ],
    historyState: "ready",
    historyWindowStart: at(-30),
    historyAsOf: at(0),
  }

  return {
    meta: {
      id: "codex", name: demoAccount, lines: [], links: codexManifest.links, iconUrl: "",
      brandColor: "#f5572f", primaryCandidates: ["Session", "Weekly"], weeklyCandidate: "Weekly",
      multiTrayLines: [], trayPrimaryLabel: "Session", detected: true,
    },
    loading: false, error: null, lastManualRefreshAt: null, lastUpdatedAt: now,
    data: {
      providerId: "codex", displayName: demoAccount, iconUrl: "", plan: "Plus",
      lines: [
        { type: "barChart", label: "Usage Trend", points: trendPoints, granularity: "daily", note: null, color: null },
        { type: "barChart", label: "Usage Trend", points: hourlyPoints, granularity: "hourly", note: null, color: null },
        { type: "progress", label: "Session", used: 26, limit: 100, format: { kind: "percent" }, resetsAt: new Date(now + 3 * 3600000 + 12 * 60000).toISOString(), periodDurationMs: 5 * 3600000, color: null },
        { type: "progress", label: "Weekly", used: 42, limit: 100, format: { kind: "percent" }, resetsAt: new Date(now + 2 * day + 7 * 3600000).toISOString(), periodDurationMs: 7 * day, color: null },
        { type: "text", label: "Rate Limit Resets", value: "2 available", color: null, subtitle: null, resetExpiry: resetCredits.credits!.map(credit => credit.expiresAt!), resetCredits },
        { type: "text", label: "Credits", value: "$12.40 · 310 credits", color: null, subtitle: null, resetExpiry: null },
      ],
    },
  }
}
