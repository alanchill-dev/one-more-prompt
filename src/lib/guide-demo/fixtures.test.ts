import { describe, expect, it } from "vitest"
import { fixturePoint } from "./fixture-trend"
import {
  DEMO_DAY_KEY,
  DEMO_NOW,
  FEATURED_PROMPT_ID,
  FEATURED_SESSION_ID,
  fixtureStats,
  hourlyPoints,
  projects,
  quotaFixture,
  trendPoints,
} from "./fixtures"

const sessions = projects.flatMap(project => project.sessions)
const turns = sessions.flatMap(session => session.turns)

describe("isolated guide practice history", () => {
  it("preserves the approved scale and varied, realistic work", () => {
    expect(fixtureStats.projects).toBe(7)
    expect(fixtureStats.sessions).toBeGreaterThanOrEqual(42)
    expect(fixtureStats.prompts).toBeGreaterThan(300)
    expect(fixtureStats.agents).toBeGreaterThan(fixtureStats.prompts)
    expect(fixtureStats.activeDays).toBeGreaterThanOrEqual(24)
    expect(fixtureStats.missingDurations).toBeGreaterThan(0)
    expect(new Set(turns.map(turn => turn.prompt)).size).toBeGreaterThan(250)
    expect(turns.some(turn => turn.interrupted)).toBe(true)
    expect(fixtureStats.last30Tokens).toBeGreaterThan(fixtureStats.last7Tokens * 2)
    expect(new Set(sessions.map(session => session.promptCount)).size).toBeGreaterThan(3)
  })

  it("keeps the same discoverable peak, Session, and 18M Prompt", () => {
    expect(fixtureStats.peakDay).toBe(DEMO_DAY_KEY)
    expect(fixtureStats.featuredDaySessions).toBeGreaterThanOrEqual(9)
    const peakIndex = trendPoints.findIndex(point => point.value === fixtureStats.peakTokens)
    expect(peakIndex).toBe(18)
    const costPeak = trendPoints.reduce((peak, point) => point.costUsd! > peak.costUsd! ? point : peak)
    expect(trendPoints.indexOf(costPeak)).toBe(18)
    expect(sessions.find(session => session.id === "story-checkout")!.turns.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0)).toBe(4_900_000)
    expect(trendPoints.slice(peakIndex + 1).filter(point => point.value! > 0).length).toBeGreaterThanOrEqual(7)
    const featured = sessions.find(session => session.id === FEATURED_SESSION_ID)!
    expect(featured.title).toBe("首頁改版")
    expect(featured.turns).toHaveLength(10)
    const prompt = featured.turns.find(turn => turn.id === FEATURED_PROMPT_ID)!
    expect(prompt.prompt).toMatch(/^請完成首頁的響應式版面/)
    expect(prompt.tokens.totalTokens).toBe(18_000_000)
    expect(prompt.agents.map(agent => agent.tokens.totalTokens / prompt.tokens.totalTokens)).toEqual([0.55, 0.25, 0.2])
    expect(featured.turns.indexOf(prompt)).toBe(5)
    expect(new Date(prompt.startedAt!).getDate()).toBe(new Date(trendPoints[peakIndex].startAt!).getDate())
    expect(fixtureStats.featuredPromptNewestIndex).toBe(4)
  })

  it("fills Today with varied hourly work and reconciles every hour with its actual Prompts", () => {
    expect(new Date(DEMO_NOW).getHours()).toBe(17)
    expect(new Date(DEMO_NOW).getMinutes()).toBe(40)
    expect(hourlyPoints).toHaveLength(24)
    const todayKey = (date: Date) => date.toLocaleDateString("en-CA")
    const todayTurns = turns.filter(turn => todayKey(new Date(turn.startedAt!)) === todayKey(new Date(DEMO_NOW)))
    const todayProjects = projects.filter(project => project.sessions.some(session => session.turns.some(turn => todayTurns.includes(turn))))
    expect(todayProjects.length).toBeGreaterThanOrEqual(5)
    expect(todayTurns.length).toBeGreaterThanOrEqual(35)
    expect(hourlyPoints.filter(point => point.value! > 0).length).toBeGreaterThanOrEqual(12)
    expect(new Set(todayTurns.flatMap(turn => turn.agents.map(agent => agent.models[0].name))).size).toBe(3)
    expect(todayTurns.every(turn => Date.parse(turn.completedAt ?? turn.startedAt!) <= DEMO_NOW)).toBe(true)
    for (const [hour, point] of hourlyPoints.entries()) {
      expect(new Date(point.startAt!).getHours()).toBe(hour)
      const matching = todayTurns.filter(turn => new Date(turn.startedAt!).getHours() === hour)
      expect(point.value).toBe(matching.reduce((sum, turn) => sum + turn.tokens.totalTokens, 0))
      expect(point.costUsd).toBeCloseTo(matching.reduce((sum, turn) => sum + turn.costUsd!, 0), 8)
      expect(point.value).toBe(point.modelUsage!.reduce((sum, model) => sum + model.tokens!, 0))
      expect(point.costUsd).toBeCloseTo(point.modelUsage!.reduce((sum, model) => sum + model.costUsd!, 0), 8)
    }
    const today = trendPoints.at(-1)!
    expect(hourlyPoints.reduce((sum, point) => sum + point.value!, 0)).toBe(today.value)
    expect(hourlyPoints.reduce((sum, point) => sum + point.costUsd!, 0)).toBeCloseTo(today.costUsd!, 8)
  })

  it("keeps every hour of the Timeline practice day explorable with actual, varied work", () => {
    const day = trendPoints[18]
    const start = Date.parse(day.startAt!)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const practiceTurns = turns.filter(turn => Date.parse(turn.startedAt!) >= start && Date.parse(turn.startedAt!) < end.getTime())
    const workSessions = sessions.filter(session => session.turns.some(turn => practiceTurns.includes(turn)))
    expect(projects.filter(project => project.sessions.some(session => workSessions.includes(session))).length).toBe(7)
    expect(workSessions.filter(session => {
      const hours = session.turns.map(turn => new Date(turn.startedAt!).getHours())
      return hours.some(hour => hour < 12) && hours.some(hour => hour >= 12 && hour < 18) && hours.some(hour => hour >= 18)
    }).length).toBeGreaterThanOrEqual(6)
    expect(practiceTurns.every(turn => Date.parse(turn.completedAt ?? turn.startedAt!) < end.getTime())).toBe(true)
    expect(workSessions.every(session => session.turns.every((turn, index) => index === 0 || turn.startedAt! > session.turns[index - 1].startedAt!))).toBe(true)
    const hours = Array.from({ length: 24 }, (_, hour) => {
      const hourStart = new Date(start)
      hourStart.setHours(hour)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hour + 1)
      const matching = practiceTurns.filter(turn => Date.parse(turn.startedAt!) >= hourStart.getTime() && Date.parse(turn.startedAt!) < hourEnd.getTime())
      expect(matching.length, `Timeline hour ${hour} must contain selectable Prompts`).toBeGreaterThan(0)
      return fixturePoint(hourStart, matching, String(hour))
    })
    expect(hours.reduce((sum, point) => sum + point.value!, 0)).toBe(day.value)
    expect(hours.reduce((sum, point) => sum + point.costUsd!, 0)).toBeCloseTo(day.costUsd!, 8)
    for (const model of day.modelUsage!) {
      expect(hours.flatMap(point => point.modelUsage!).filter(item => item.name === model.name).reduce((sum, item) => sum + item.tokens!, 0)).toBe(model.tokens)
      expect(hours.flatMap(point => point.modelUsage!).filter(item => item.name === model.name).reduce((sum, item) => sum + item.costUsd!, 0)).toBeCloseTo(model.costUsd!, 8)
    }
  })

  it("reconciles prompts, agents, model colors, costs, and chart totals", () => {
    for (const turn of turns) {
      expect(turn.tokens.totalTokens).toBe(turn.tokens.inputTokens + turn.tokens.outputTokens)
      expect(turn.tokens.totalTokens).toBe(turn.agents.reduce((sum, agent) => sum + agent.tokens.totalTokens, 0))
      expect(turn.costUsd).toBeCloseTo(turn.agents.reduce((sum, agent) => sum + agent.costUsd!, 0), 8)
      expect(turn.costUsd).toBeCloseTo(Object.values(turn.costBreakdown!).reduce((sum, amount) => sum + amount, 0), 8)
      for (const agent of turn.agents) {
        expect(agent.tokens.cachedInputTokens).toBeLessThanOrEqual(agent.tokens.inputTokens)
        const cost = agent.costLines![0]
        expect(cost.tokens.input + cost.tokens.cacheRead + cost.tokens.output).toBe(agent.tokens.totalTokens)
        expect(cost.costUsd).toBeCloseTo(cost.tokens.input / 1e6 * cost.rates!.input! + cost.tokens.cacheRead / 1e6 * cost.rates!.cacheRead! + cost.tokens.output / 1e6 * cost.rates!.output!, 8)
      }
    }
    expect(trendPoints.reduce((sum, point) => sum + point.value!, 0)).toBe(fixtureStats.totalTokens)
    for (const point of trendPoints) expect(point.value).toBe(point.modelUsage!.reduce((sum, model) => sum + model.tokens!, 0))
    expect(new Set(turns.map(turn => turn.id)).size).toBe(turns.length)
    expect(quotaFixture.entries).toHaveLength(sessions.length)
    expect(quotaFixture.entries.some(entry => entry.status === "unavailable")).toBe(true)
    expect(quotaFixture.entries.some(entry => entry.status === "partial")).toBe(true)
  })
})
