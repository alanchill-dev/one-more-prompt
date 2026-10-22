import { afterEach, describe, expect, it } from "vitest"
import { useAppUiStore } from "@/stores/app-ui-store"
import { FEATURED_SESSION_ID } from "@/lib/guide-demo/fixtures"
import { GUIDE_STAGE_SIZES, GUIDE_STEPS } from "./steps"
import { target } from "./runtime"

afterEach(() => { document.body.replaceChildren(); useAppUiStore.getState().resetState() })

describe("Guide lesson flow", () => {
  it("teaches the monthly palette after Today, then API mode, page orientation and separate details", () => {
    expect(GUIDE_STAGE_SIZES).toEqual([7, 8, 5])
    expect(GUIDE_STEPS.map(s => s.id)).toEqual([
      "chart-intro", "quota-intro", "month", "model-palette", "api-estimate", "peak", "drill",
      "project-intro", "session", "summary", "prompt", "prompt-original", "prompt-timing", "prompt-usage", "prompt-agents",
      "timeline-entry", "timeline-intro", "pan", "zoom", "event",
    ])
    expect(GUIDE_STEPS.find(s => s.id === "peak")?.type).toBe("read")
  })

  it("never reassigns the completed Projects CTA lesson to an unrelated Session after navigation", () => {
    const session = document.createElement("button")
    session.dataset.testid = `prompt-usage-session-${FEATURED_SESSION_ID}`
    session.getBoundingClientRect = () => new DOMRect(10, 300, 280, 60)
    document.body.append(session)
    useAppUiStore.setState({ activeView: "prompt-usage", promptUsageViewMode: "hierarchy" })
    const drill = GUIDE_STEPS.findIndex(s => s.id === "drill") + 1
    expect(target(drill)).toBeNull()
  })
})
