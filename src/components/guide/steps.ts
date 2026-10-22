export type GuideStep = {
  id: string
  stage: 1 | 2 | 3
  type: "read" | "do"
}

export const GUIDE_STAGE_SIZES = [7, 8, 5] as const
export const GUIDE_STAGE_FIRST_STEPS = [1, 8, 16] as const
export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: "chart-intro", stage: 1, type: "read" },
  { id: "quota-intro", stage: 1, type: "read" },
  { id: "month", stage: 1, type: "do" },
  { id: "model-palette", stage: 1, type: "do" },
  { id: "api-estimate", stage: 1, type: "do" },
  { id: "peak", stage: 1, type: "read" },
  { id: "drill", stage: 1, type: "do" },
  { id: "project-intro", stage: 2, type: "read" },
  { id: "session", stage: 2, type: "do" },
  { id: "summary", stage: 2, type: "read" },
  { id: "prompt", stage: 2, type: "do" },
  { id: "prompt-original", stage: 2, type: "read" },
  { id: "prompt-timing", stage: 2, type: "read" },
  { id: "prompt-usage", stage: 2, type: "read" },
  { id: "prompt-agents", stage: 2, type: "read" },
  { id: "timeline-entry", stage: 3, type: "do" },
  { id: "timeline-intro", stage: 3, type: "read" },
  { id: "pan", stage: 3, type: "do" },
  { id: "zoom", stage: 3, type: "do" },
  { id: "event", stage: 3, type: "do" },
]
