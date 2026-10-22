import type { BarChartPoint, BarChartModelUsage } from "@/bindings"
import type { PromptUsageTurn } from "@/lib/prompt-usage"

// Separate check-ins across the practice day keep every Timeline hour explorable.
export const fixtureWorkdayMinutes: Record<string, number[]> = {
  "story-checkout": [37, 264, 517, 766, 1004, 1250],
  "story-accessibility": [74, 295, 482, 682, 879, 1104, 1300],
  "story-photo-upload": [153, 320, 501, 694, 880, 1051, 1244, 1400],
  "story-photo-duplicates": [84, 371, 689, 980, 1300],
  "story-thermal": [126, 431, 720, 1057, 1350],
  "story-funnel": [99, 245, 459, 617, 785, 946, 1110, 1300],
  "story-build": [72, 387, 674, 934, 1170],
  "story-travel": [45, 209, 365, 551, 716, 887, 1050, 1200],
  "story-chart": [18, 366, 693, 1037, 1400],
}

export function fixturePoint(start: Date, turns: PromptUsageTurn[], label: string): BarChartPoint {
  const models = new Map<string, BarChartModelUsage>()
  for (const turn of turns) for (const agent of turn.agents) {
    const name = agent.models[0].name
    const previous = models.get(name)
    models.set(name, { name, tokens: (previous?.tokens ?? 0) + agent.tokens.totalTokens,
      costUsd: (previous?.costUsd ?? 0) + agent.costUsd!, estimationStatus: "current_rate" })
  }
  return { label, startAt: start.toISOString(), valueLabel: null,
    value: turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0), modelUsage: [...models.values()],
    costUsd: turns.reduce((sum, turn) => sum + turn.costUsd!, 0), estimationStatus: "current_rate" }
}
